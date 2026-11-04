/**
 * ResearchAccountsStep - Pesquisa das contas (dossie com fontes)
 * Story: 24.19 - Dossie da conta
 *
 * Roda entre o gate de leads (`search_leads`) e o `create_campaign`. Para cada conta
 * aprovada monta um dossie de fatos `{fato, fonte_url, data, confianca}`:
 * - site: `treg.web.extract` de `https://<dominio>`;
 * - noticias e vagas: `exa.web.search` via Treg (data + Brasil);
 * - tecnologias: o que o `search_companies` (TheirStack) ja trouxe;
 * - posts: do proprio lead (Apify), so com o toggle de LinkedIn ligado, filtrados pelo
 *   `relevance-classifier`.
 *
 * FAIL-OPEN, SEMPRE: o step nunca lanca para o pipeline. Sem chave, Treg fora do ar,
 * timeout, teto de custo/tempo, erro de banco ou excecao inesperada terminam `completed`
 * com o dossie vazio/parcial e sinalizado em `output.flags`/`failedSources`. Isso vale
 * para o CICLO INTEIRO do step (`run` proprio): falha ao gravar o `running`, o checkpoint
 * ou o log do step nao vira `STEP_PERSISTENCE_ERROR` nem pausa o pipeline, desde que
 * ALGUMA transicao final (`completed` completo, minimo ou so o status) seja gravada. Duas
 * excecoes: `STEP_ALREADY_RUNNING` (outro executor ja tem a posse; nada rodou) e
 * `STEP_PERSISTENCE_ERROR` quando NENHUMA transicao final foi gravada (2a revisao Codex):
 * devolver sucesso ai deixaria a linha `pending`/`running` e travaria o pipeline em
 * silencio. E o mesmo contrato dos outros steps com o banco indisponivel.
 *
 * PRAZO DURO EFETIVO: toda espera (Treg, Apify, banco, log de uso, classificador,
 * mensagens) corre contra `DOSSIER_CONFIG.hardDeadlineMs`; o fechamento (resumo,
 * checkpoint, log) tem orcamento proprio (`finalizeBudgetMs`). O step sempre devolve o
 * controle bem antes dos 300 s da rota, e o `create_campaign` e disparado em seguida.
 *
 * NADA do dossie chega ao `create_campaign`: o orchestrator ignora linhas
 * `research_accounts` ao resolver o step anterior, entao o `create_campaign` recebe o
 * mesmo output do `search_leads` de antes. O dossie nao entra no Instantly, nos prompts
 * nem na selecao de leads (isso e da 24.21).
 *
 * Unica excecao (FEL-57): os posts BRUTOS do Apify buscados aqui com o toggle de LinkedIn
 * vao em `output.icebreakerPosts`, e o icebreaker premium do `create_campaign` os usa em
 * vez de buscar o mesmo perfil de novo (ver `dossier/icebreaker-posts.ts`). Sem eles, o
 * `create_campaign` busca como sempre.
 */

import { createHash } from "node:crypto";
import { BaseStep } from "./base-step";
import { readServiceApiKey, getServiceApiKeyOrNull } from "@/lib/agent/service-keys";
import { logAgentUsage } from "@/lib/agent/agent-usage";
import { TregService, TREG_ENDPOINTS, type TregEndpointId } from "@/lib/services/treg";
import { ApifyService } from "@/lib/services/apify";
import { classifyPostRelevance } from "@/lib/utils/relevance-classifier";
import { loadKBContext } from "@/lib/utils/monitoring-processor";
import { normalizeDomain } from "@/lib/agent/target-accounts";
import { DOSSIER_CONFIG, WHY_NOW_CONFIG } from "@/lib/agent/dossier/config";
import { CostBudget } from "@/lib/agent/dossier/budget";
import {
  corporateEmailDomain,
  domainBrand,
  dossierStatus,
  isOwnPost,
  isValidFact,
  isoDate,
  jobFacts,
  newsFacts,
  normalizeCompanyKey,
  pickSiteDomain,
  postFacts,
  recentPosts,
  siteFact,
  technologyFacts,
  type DossierFact,
} from "@/lib/agent/dossier/facts";
import {
  findPostLeadIdentifiers,
  findReusableDossier,
  insertFacts,
  linkLeads,
  readDossierFacts,
  saveDossier,
} from "@/lib/agent/dossier/repository";
import {
  planAccountCall,
  selectWhyNowForAccount,
  type AccountCallPlan,
  type SelectWhyNowResult,
  type WhyNowClientFactory,
  type WhyNowLeadResult,
} from "@/lib/agent/dossier/why-now";
import { readTenantICP } from "@/lib/agent/contextual-suggestions";
import { EMPTY_TENANT_ICP, type TenantICP } from "@/lib/agent/icp-briefing";
import {
  buildReusableEntry,
  type IcebreakerAttemptOutcome,
  type IcebreakerAttemptsByUrl,
  type ReusablePostsByUrl,
} from "@/lib/agent/dossier/icebreaker-posts";
import type {
  DossierFailureReason,
  LeadWhyNow,
  PipelineError,
  DossierSkipReason,
  DossierSource,
  ResearchAccountsFlags,
  ResearchAccountsOutput,
  ResearchedAccount,
  SearchLeadResult,
  StepInput,
  StepOutput,
  StepType,
  WhyNowFlags,
  WhyNowNoTriggerReason,
  WhyNowOutput,
} from "@/types/agent";
import type { KBContextForClassification } from "@/lib/utils/relevance-classifier";
import type { LinkedInPost } from "@/types/apify";
import type { SupabaseClient } from "@supabase/supabase-js";

// ==============================================
// HELPERS
// ==============================================

/** `Idempotency-Key` deterministica: sha256 de `executionId|endpoint|JSON(body)`. */
export function buildIdempotencyKey(
  executionId: string,
  endpoint: string,
  body: Record<string, unknown>
): string {
  return createHash("sha256")
    .update(`${executionId}|${endpoint}|${JSON.stringify(body)}`)
    .digest("hex");
}

/** Pool simples de concorrencia. `fn` nao deve lancar. */
async function runPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

export type Settled<T> =
  | { ok: true; value: T }
  | { ok: false; timedOut: true }
  | { ok: false; timedOut: false; error: unknown };

/**
 * Espera `op()` por no maximo `ms`. NUNCA lanca (nem se `op` lancar sincronamente).
 * Nao cancela a operacao em voo: so para de esperar por ela.
 */
export async function settleWithin<T>(op: () => Promise<T>, ms: number): Promise<Settled<T>> {
  let promise: Promise<T>;
  try {
    promise = Promise.resolve(op());
  } catch (error) {
    return { ok: false, timedOut: false, error };
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race<Settled<T>>([
      promise.then(
        (value) => ({ ok: true, value }),
        (error: unknown) => ({ ok: false, timedOut: false, error })
      ),
      new Promise<Settled<T>>((resolve) => {
        timer = setTimeout(() => resolve({ ok: false, timedOut: true }), Math.max(0, ms));
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function isAlreadyRunning(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "STEP_ALREADY_RUNNING"
  );
}

function hasExtractPages(json: unknown): boolean {
  return Array.isArray((json as { output?: { pages?: unknown } } | null)?.output?.pages);
}

function hasExaResults(json: unknown): boolean {
  return Array.isArray((json as { results?: unknown } | null)?.results);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? "erro desconhecido");
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

// ==============================================
// TYPES
// ==============================================

interface AccountGroup {
  key: string;
  companyName: string | null;
  leads: SearchLeadResult[];
  emailDomains: string[];
}

interface ResolvedAccount extends AccountGroup {
  domain: string | null;
  technologies: unknown;
  skippedReason?: DossierSkipReason;
}

interface CompanyRow {
  name?: unknown;
  domain?: unknown;
  technologies_found?: unknown;
}

type TregOutcome =
  | { ok: true; json: unknown }
  | { ok: false; reason: DossierFailureReason };

interface SourceResult {
  facts: DossierFact[];
  failure?: DossierFailureReason;
}

/** Estado de UMA execucao do step (custo, flags, chaves). */
interface RunState {
  executionId: string;
  tregKey: string;
  apifyKey: string | null;
  openaiKey: string | null;
  kbContext: KBContextForClassification | null;
  premium: boolean;
  /** Teto do Treg (US$). */
  budget: CostBudget;
  /** Teto proprio do Apify (US$): posts nunca consomem o teto da pesquisa web. */
  apifyBudget: CostBudget;
  flags: ResearchAccountsFlags;
  startedAt: number;
  now: Date;
  techDate: string;
  tregUsd: number;
  tregCalls: number;
  /** Chamadas sem resposta (custo desconhecido), contadas pelo teto reservado. */
  tregEstimatedCalls: number;
  tregEstimatedUsd: number;
  apifyCalls: number;
  openaiRelevanceCalls: number;
  /** Linhas efetivamente gravadas em `account_dossier_leads`. */
  leadsLinked: number;
  /** FEL-57: posts brutos por `linkedinUrl` para o icebreaker premium do `create_campaign`. */
  icebreakerPosts: ReusablePostsByUrl;
  /** FEL-77: perfis tentados no Apify sem posts reaproveitaveis (o create nao busca de novo). */
  icebreakerAttempts: IcebreakerAttemptsByUrl;
  /**
   * Story 24.20: fatos por conta pesquisada (para o gatilho). `facts: null` = fatos
   * indisponiveis (dossie nao gravado ou leitura do reaproveitado falhou).
   */
  accountFacts: AccountFactsEntry[];
}

/** Story 24.20: fatos de UMA conta pesquisada nesta execucao. */
interface AccountFactsEntry {
  domain: string;
  companyName: string | null;
  dossierId: string | null;
  facts: DossierFact[] | null;
  leads: SearchLeadResult[];
  /**
   * Revisao Codex 1: dossie reaproveitado cujos fatos ainda vao ser lidos NA FASE (com o
   * prazo da fase), nunca no pool da pesquisa. `savedPosts` = posts gravados agora.
   */
  pendingRead?: { savedPosts: DossierFact[] };
}

/** Story 24.20: conta a avaliar na fase; `plan: null` = fatos ainda a ler (reuso). */
interface WhyNowTask {
  entry: AccountFactsEntry;
  plan: AccountCallPlan | null;
}

/** Story 24.20: estado da fase "motivo para abordar agora" de UMA execucao. */
interface WhyNowRun {
  started: boolean;
  finished: boolean;
  /** Resultado por indice de lead (`readLeads`). */
  results: Map<number, LeadWhyNow>;
  /** Motivo dos leads ainda nao avaliados quando o output e montado. */
  pendingReason: WhyNowNoTriggerReason;
  llmCalls: number;
  llmFailedCalls: number;
  kbPainsAvailable: boolean;
  flags: WhyNowFlags;
}

function newWhyNowRun(): WhyNowRun {
  return {
    started: false,
    finished: false,
    results: new Map(),
    pendingReason: "time_budget",
    llmCalls: 0,
    llmFailedCalls: 0,
    kbPainsAvailable: false,
    flags: {},
  };
}

function sourceHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export interface ResearchAccountsDeps {
  treg?: TregService;
  apify?: ApifyService;
  /** Relogio (ms) — injetavel nos testes de teto de tempo. */
  clock?: () => number;
  /** Story 24.20: client OpenAI do gatilho (padrao: SDK `openai`). Injetavel nos testes. */
  whyNowClient?: WhyNowClientFactory;
  /** Story 24.20: leitura do ICP da KB (padrao: `readTenantICP`, service-role, fail-open). */
  readIcp?: (tenantId: string) => Promise<TenantICP>;
}

// ==============================================
// STEP
// ==============================================

export class ResearchAccountsStep extends BaseStep {
  private readonly tenantId: string;
  private readonly treg: TregService;
  private readonly apify: ApifyService;
  private readonly clock: () => number;
  private readonly whyNowClient: WhyNowClientFactory | undefined;
  private readonly readIcp: (tenantId: string) => Promise<TenantICP>;

  // Estado da execucao corrente (zerado a cada `run`).
  /** Instante (clock) do prazo duro da pesquisa. */
  private deadlineAt = 0;
  private runStartedAt: number | null = null;
  private runFlags: ResearchAccountsFlags = {};
  private runState: RunState | null = null;
  /** Contas ja concluidas — o que sobra se o backstop do prazo disparar. */
  private doneAccounts: ResearchedAccount[] = [];
  /** O caminho de "pulada" ja mandou a propria mensagem; o `run` nao manda o resumo. */
  private summarySent = false;
  /** Story 24.20: leads da execucao (`readLeads`), para o `whyNow` e o resumo. */
  private runLeads: SearchLeadResult[] = [];
  /** Story 24.20: indices (`readLeads`) de cada lead, por identidade do objeto. */
  private leadIndexes = new Map<SearchLeadResult, number[]>();
  private whyNowRun: WhyNowRun = newWhyNowRun();

  constructor(
    stepNumber: number,
    supabase: SupabaseClient,
    tenantId: string,
    deps: ResearchAccountsDeps = {}
  ) {
    super(stepNumber, "research_accounts" as StepType, supabase);
    this.tenantId = tenantId;
    this.treg = deps.treg ?? new TregService();
    this.apify = deps.apify ?? new ApifyService();
    this.clock = deps.clock ?? (() => Date.now());
    this.whyNowClient = deps.whyNowClient;
    this.readIcp = deps.readIcp ?? readTenantICP;
  }

  /** Informativo: nao ha o que aprovar. O pipeline segue direto para o `create_campaign`. */
  override requiresPostApproval(): boolean {
    return false;
  }

  /**
   * Ciclo de vida PROPRIO (fail-open), no lugar do `BaseStep.run`. Os outros steps
   * continuam com o ciclo da base, intacto.
   *
   * - claim `running` (CAS da base): so o `STEP_ALREADY_RUNNING` sobe; qualquer outra
   *   falha/espera longa e logada e a pesquisa segue;
   * - pesquisa limitada pelo prazo duro (cada espera + backstop do todo);
   * - resumo, checkpoint `completed` (com fallback minimo) e log do step, cada um com
   *   tempo limitado e sem nunca lancar. Nada aqui pausa o pipeline.
   */
  override async run(input: StepInput): Promise<StepOutput> {
    const db = this.supabase;
    const startedAt = this.clock();
    this.deadlineAt = startedAt + DOSSIER_CONFIG.hardDeadlineMs;
    this.runStartedAt = startedAt;
    this.runFlags = {};
    this.runState = null;
    this.doneAccounts = [];
    this.summarySent = false;
    this.setRunLeads([]);
    this.whyNowRun = newWhyNowRun();

    const claim = await settleWithin(
      () => this.updateStepStatus(db, input.executionId, "running"),
      Math.min(DOSSIER_CONFIG.finalizeBudgetMs, this.remainingToDeadline())
    );
    if (!claim.ok) {
      if (!claim.timedOut && isAlreadyRunning(claim.error)) throw claim.error;
      console.error(
        `[ResearchAccountsStep] Nao consegui marcar o step ${this.stepNumber} como running (execution=${input.executionId}); a pesquisa segue (fail-open):`,
        claim.timedOut ? "tempo esgotado" : errorMessage(claim.error)
      );
    }

    // Backstop: mesmo que alguma espera escape do limite, o step para no prazo.
    const work = await settleWithin(() => this.executeInternal(input), this.remainingToDeadline() + 1_000);
    let result: StepOutput;
    if (work.ok) {
      result = work.value;
    } else {
      const flags = { ...this.runFlags };
      if (work.timedOut) flags.timeBudgetExhausted = true;
      else flags.unexpectedError = true;
      console.error(
        `[ResearchAccountsStep] Pesquisa interrompida (execution=${input.executionId}); o step termina completed:`,
        work.timedOut ? "prazo duro esgotado" : errorMessage(work.error)
      );
      result = this.buildResult([...this.doneAccounts], flags, this.runState);
    }

    const persisted = await this.finalize(input, result);
    if (!persisted) {
      // Nenhuma transicao final foi gravada: a linha pode ter ficado `pending` (o claim
      // tambem falhou; o sweeper so trata `running`) ou `running`. Devolver sucesso aqui
      // seria travar o pipeline EM SILENCIO. Mesmo contrato dos outros steps
      // (`BaseStep.saveCheckpoint`): STEP_PERSISTENCE_ERROR, o orchestrator pausa a
      // execucao com a bolha de erro e o "Tentar novamente" reexecuta o research.
      throw this.persistenceFailure();
    }
    return result;
  }

  private persistenceFailure(): PipelineError {
    return {
      code: "STEP_PERSISTENCE_ERROR",
      message: "Nao foi possivel salvar o resultado da etapa",
      stepNumber: this.stepNumber,
      stepType: this.stepType,
      isRetryable: true,
    };
  }

  /**
   * Checkpoint + resumo + log, dentro de `finalizeBudgetMs`. Nunca lanca.
   *
   * A transicao final e gravada em 3 niveis, cada um com o retry curto da base e SEM
   * filtro de status (vale para a linha `pending` de um claim que falhou e para a
   * `running`):
   * 1. checkpoint `completed` completo;
   * 2. checkpoint minimo (sem a lista de contas);
   * 3. so `status: completed` + `completed_at` (sem output).
   * Qualquer um deles deixa a linha `completed`, que o auto-trigger trata como elegivel
   * nos dois modos e dispara o `create_campaign` sozinho. `completed` (e nao `failed`)
   * tambem porque um claim atrasado (CAS em `pending`/`failed`/`awaiting_approval`) nao
   * consegue sobrescreve-lo.
   *
   * @returns `true` se algum nivel gravou; `false` se nenhuma transicao foi persistida.
   */
  private async finalize(input: StepInput, result: StepOutput): Promise<boolean> {
    const db = this.supabase;
    const executionId = input.executionId;
    const budget = DOSSIER_CONFIG.finalizeBudgetMs;
    const until = this.clock() + budget;
    const left = (share: number) => Math.max(0, Math.min(budget * share, until - this.clock()));

    const completedAt = new Date().toISOString();
    const write = async (label: string, update: Record<string, unknown>, share: number) => {
      const outcome = await settleWithin(
        () => this.persistStepUpdate(db, executionId, label, update),
        left(share)
      );
      return outcome.ok && outcome.value;
    };

    const data = result.data as unknown as ResearchAccountsOutput;
    // Fallback minimo sem a lista de contas e sem os posts (o que mais pesa). FEL-77: os
    // perfis cujos posts ficaram de fora viram "ja tentados" (registro pequeno), para o
    // `create_campaign` nao chamar o Apify uma segunda vez (cai no icebreaker padrao).
    // Story 24.20: o fallback minimo tambem tira o `whyNow` (como ja faz com as contas).
    const { icebreakerPosts: droppedPosts, whyNow: droppedWhyNow, ...minimalData } = data;
    void droppedWhyNow;
    if (droppedPosts && Object.keys(droppedPosts).length > 0) {
      const attempted: IcebreakerAttemptsByUrl = { ...(minimalData.icebreakerPostsAttempted ?? {}) };
      for (const [url, entry] of Object.entries(droppedPosts)) {
        if (!Object.prototype.hasOwnProperty.call(attempted, url)) {
          attempted[url] = { attemptedAt: entry.fetchedAt, outcome: "not_saved" };
        }
      }
      minimalData.icebreakerPostsAttempted = attempted;
    }
    const persisted =
      (await write(
        "checkpoint",
        { output: result.data, status: "completed", completed_at: completedAt, cost: result.cost ?? null },
        0.3
      )) ||
      // Fallback minimo: sem a lista de contas (o que mais pesa).
      (await write(
        "checkpoint minimo",
        {
          output: { ...minimalData, accounts: [], flags: { ...data.flags, persistFailed: true } },
          status: "completed",
          completed_at: completedAt,
          cost: result.cost ?? null,
        },
        0.25
      )) ||
      // Ultimo recurso: so o status. E o que o auto-trigger precisa.
      (await write("conclusao (so status)", { status: "completed", completed_at: completedAt }, 0.2));

    if (!persisted) {
      console.error(
        `[ResearchAccountsStep] NAO consegui gravar a conclusao do step ${this.stepNumber} (execution=${executionId}) em nenhum dos 3 niveis; o step devolve STEP_PERSISTENCE_ERROR (mesmo contrato dos outros steps).`
      );
      return false;
    }

    // Resumo depois da transicao: sem conclusao gravada, nao se anuncia "concluida".
    if (!this.summarySent) {
      await this.sendMessage(
        executionId,
        ResearchAccountsStep.summaryText(result.data as unknown as ResearchAccountsOutput, this.runLeads),
        "text",
        left(0.15)
      );
    }

    const logged = await settleWithin(() => this.logStep(db, executionId, input, result), left(0.1));
    if (!logged.ok) {
      console.error(
        `[ResearchAccountsStep] Falha ao registrar a conclusao do step ${this.stepNumber} (execution=${executionId}):`,
        logged.timedOut ? "tempo esgotado" : errorMessage(logged.error)
      );
    }
    return true;
  }

  private remainingToDeadline(): number {
    return this.deadlineAt - this.clock();
  }

  /**
   * Espera `op` no maximo ate o prazo duro. Timeout ou excecao -> `fallback`. Nunca lanca.
   * Timeout marca `timeBudgetExhausted`.
   */
  private async bounded<T>(label: string, op: () => Promise<T>, fallback: T): Promise<T> {
    const outcome = await settleWithin(op, this.remainingToDeadline());
    if (outcome.ok) return outcome.value;
    if (outcome.timedOut) {
      this.runFlags.timeBudgetExhausted = true;
      console.error(`[ResearchAccountsStep] ${label}: sem resposta antes do prazo do step`);
    } else {
      console.error(`[ResearchAccountsStep] ${label}:`, errorMessage(outcome.error));
    }
    return fallback;
  }

  /** `logAgentUsage` limitado pelo prazo. Nunca lanca. */
  private logUsage(params: Parameters<typeof logAgentUsage>[0]): Promise<void> {
    return this.bounded("log de uso", () => logAgentUsage(params), undefined);
  }

  /** Mesma regra do `create_campaign` para achar os leads. */
  static readLeads(input: StepInput): SearchLeadResult[] {
    const { briefing, previousStepOutput } = input;
    const isImportedLeadsFlow =
      briefing.skipSteps?.includes("search_companies") &&
      briefing.skipSteps?.includes("search_leads");
    if (isImportedLeadsFlow && Array.isArray(briefing.importedLeads) && briefing.importedLeads.length > 0) {
      return briefing.importedLeads;
    }
    const prevLeads = previousStepOutput?.leads;
    return Array.isArray(prevLeads) ? (prevLeads as SearchLeadResult[]) : [];
  }

  /** Agrupa os leads por empresa (nome normalizado, senao dominio corporativo do e-mail). */
  static groupLeads(leads: SearchLeadResult[]): AccountGroup[] {
    const groups = new Map<string, AccountGroup>();
    leads.forEach((lead, index) => {
      const emailDomain = corporateEmailDomain(lead.email);
      const key =
        normalizeCompanyKey(lead.companyName) ||
        (emailDomain ? `domain:${emailDomain}` : `lead:${lead.apolloId ?? lead.email ?? index}`);
      const group = groups.get(key) ?? {
        key,
        companyName: lead.companyName?.trim() || null,
        leads: [],
        emailDomains: [],
      };
      group.leads.push(lead);
      if (emailDomain && !group.emailDomains.includes(emailDomain)) group.emailDomains.push(emailDomain);
      if (!group.companyName && lead.companyName?.trim()) group.companyName = lead.companyName.trim();
      groups.set(key, group);
    });
    return [...groups.values()];
  }

  protected async executeInternal(input: StepInput): Promise<StepOutput> {
    const startedAt = this.runStartedAt ?? this.clock();
    if (this.runStartedAt === null) this.deadlineAt = startedAt + DOSSIER_CONFIG.hardDeadlineMs;
    this.runStartedAt = null;
    const flags: ResearchAccountsFlags = {};
    this.runFlags = flags;
    let accounts: ResearchedAccount[] = [];
    let state: RunState | null = null;

    try {
      const leads = ResearchAccountsStep.readLeads(input);
      this.setRunLeads(leads);
      const groups = ResearchAccountsStep.groupLeads(leads);

      if (groups.length === 0) {
        await this.sendMessage(input.executionId, "Pesquisa das contas pulada: nenhum lead para pesquisar. A campanha segue normalmente.", "text");
        this.summarySent = true;
        return this.buildResult([], flags, null);
      }

      const lookup = await this.bounded("leitura da chave do Treg", () => readServiceApiKey(this.tenantId, "treg"), null);
      if (!lookup) {
        flags.unexpectedError = true;
        accounts = groups.map((group) => this.skippedAccount(group, null, "error"));
        await this.sendMessage(input.executionId, "Pesquisa das contas pulada: nao consegui ler a chave do Treg a tempo. A campanha segue normalmente.", "text");
        this.summarySent = true;
        return this.buildResult(accounts, flags, null);
      }
      if (lookup.status !== "ok") {
        flags.tregUnavailable = lookup.status;
        accounts = groups.map((group) => this.skippedAccount(group, null, "treg_unavailable"));
        const reason =
          lookup.status === "missing"
            ? "a chave do Treg nao esta configurada em Configuracoes > Integracoes"
            : "nao foi possivel ler a chave do Treg (reconfigure em Configuracoes > Integracoes)";
        await this.sendMessage(input.executionId, `Pesquisa das contas pulada: ${reason}. A campanha segue normalmente.`, "text");
        this.summarySent = true;
        return this.buildResult(accounts, flags, null);
      }

      const premium = input.briefing.premiumIcebreakers === true;
      const nowDate = new Date(startedAt);
      state = {
        executionId: input.executionId,
        tregKey: lookup.apiKey,
        apifyKey: premium
          ? await this.bounded("leitura da chave do Apify", () => getServiceApiKeyOrNull(this.tenantId, "apify"), null)
          : null,
        openaiKey: null,
        kbContext: null,
        premium,
        budget: new CostBudget(DOSSIER_CONFIG.maxCostUsdPerExecution),
        apifyBudget: new CostBudget(DOSSIER_CONFIG.maxCostUsdPerExecution),
        flags,
        startedAt,
        now: nowDate,
        techDate: isoDate(nowDate),
        tregUsd: 0,
        tregCalls: 0,
        tregEstimatedCalls: 0,
        tregEstimatedUsd: 0,
        apifyCalls: 0,
        openaiRelevanceCalls: 0,
        leadsLinked: 0,
        icebreakerPosts: {},
        icebreakerAttempts: {},
        accountFacts: [],
      };
      this.runState = state;
      if (state.premium && state.apifyKey) {
        state.openaiKey = await this.bounded("leitura da chave da OpenAI", () => getServiceApiKeyOrNull(this.tenantId, "openai"), null);
        state.kbContext = await this.bounded("leitura da base de conhecimento", () => this.safeLoadKBContext(), null);
      }

      await this.sendMessage(
        input.executionId,
        `Pesquisando ${plural(groups.length, "conta", "contas")} (site, noticias e vagas) para o dossie. Isso nao altera a campanha.`,
        "progress"
      );

      const { companies, completedAt } = await this.bounded(
        "leitura do search_companies",
        () => this.readSearchCompanies(input.executionId),
        { companies: [] as CompanyRow[], completedAt: null as string | null }
      );
      if (completedAt && !Number.isNaN(Date.parse(completedAt))) {
        state.techDate = isoDate(new Date(completedAt));
      }

      const runState = state;
      const resolved = await runPool(groups, DOSSIER_CONFIG.accountConcurrency, (group) =>
        this.resolveAccount(runState, group, input, companies)
      );
      const merged = ResearchAccountsStep.mergeByDomain(resolved);

      accounts = await runPool(merged, DOSSIER_CONFIG.accountConcurrency, (account) =>
        this.researchAccountSafe(runState, account)
      );

      // Story 24.20: fase final, fail-open (nunca lanca nem muda o resto do output).
      await this.evaluateWhyNowSafe(runState);
    } catch (error) {
      // Rede de seguranca: nenhuma excecao chega ao pipeline.
      console.error(
        `[ResearchAccountsStep] Excecao inesperada (execution=${input.executionId}); o step termina completed:`,
        errorMessage(error)
      );
      flags.unexpectedError = true;
    }

    // O resumo vai no fechamento (`run`), com orcamento proprio.
    return this.buildResult(accounts, flags, state);
  }

  // ==============================================
  // DOMAIN RESOLUTION
  // ==============================================

  /** Le o output do `search_companies` desta execucao (tecnologias e dominios). */
  private async readSearchCompanies(
    executionId: string
  ): Promise<{ companies: CompanyRow[]; completedAt: string | null }> {
    try {
      const { data, error } = await this.supabase
        .from("agent_steps")
        .select("output, completed_at")
        .eq("execution_id", executionId)
        .eq("step_type", "search_companies")
        .limit(1);
      if (error) return { companies: [], completedAt: null };
      const row = (Array.isArray(data) ? data[0] : data) as
        | { output?: { companies?: unknown } | null; completed_at?: unknown }
        | null
        | undefined;
      const companies = row?.output?.companies;
      return {
        companies: Array.isArray(companies) ? (companies as CompanyRow[]) : [],
        completedAt: typeof row?.completed_at === "string" ? row.completed_at : null,
      };
    } catch {
      return { companies: [], completedAt: null };
    }
  }

  private static matchesEmailDomain(group: AccountGroup, domain: string): boolean {
    return group.emailDomains.some((d) => d === domain || d.endsWith(`.${domain}`));
  }

  /**
   * Dominio da conta: `targetAccounts` → `companies` do `search_companies` →
   * `treg.web.search "<empresa> site oficial"` → dominio corporativo do e-mail.
   */
  private async resolveAccount(
    state: RunState,
    group: AccountGroup,
    input: StepInput,
    companies: CompanyRow[]
  ): Promise<ResolvedAccount> {
    try {
      const company = companies.find((c) => {
        const domain = normalizeDomain(c.domain);
        return (
          (group.companyName && normalizeCompanyKey(c.name) === group.key) ||
          (domain !== null && ResearchAccountsStep.matchesEmailDomain(group, domain))
        );
      });
      const technologies = company?.technologies_found ?? [];

      const target = (input.briefing.targetAccounts ?? []).find((account) => {
        const domain = normalizeDomain(account.domain);
        if (!domain) return false;
        return (
          (group.companyName && normalizeCompanyKey(account.name) === group.key) ||
          ResearchAccountsStep.matchesEmailDomain(group, domain)
        );
      });
      const targetDomain = normalizeDomain(target?.domain);
      if (targetDomain) return { ...group, domain: targetDomain, technologies };

      const companyDomain = normalizeDomain(company?.domain);
      if (companyDomain) return { ...group, domain: companyDomain, technologies };

      if (this.timeExceeded(state)) {
        state.flags.timeBudgetExhausted = true;
        return { ...group, domain: null, technologies, skippedReason: "time_budget" };
      }

      const emailDomain = group.emailDomains[0] ?? null;
      if (group.companyName) {
        const body = { q: `${group.companyName} site oficial`, limit: 10 };
        const outcome = await this.callTreg(state, TREG_ENDPOINTS.webSearch, body, "domain", null);
        const results = outcome.ok
          ? (outcome.json as { output?: { results?: unknown } } | null)?.output?.results
          : undefined;
        if (Array.isArray(results)) {
          const picked = pickSiteDomain(results, emailDomain, group.companyName);
          if (picked) return { ...group, domain: picked, technologies };
        }
      }

      if (emailDomain) return { ...group, domain: emailDomain, technologies };
      return { ...group, domain: null, technologies, skippedReason: "no_domain" };
    } catch (error) {
      console.error(`[ResearchAccountsStep] Falha ao resolver o dominio de "${group.companyName ?? group.key}":`, errorMessage(error));
      return { ...group, domain: null, technologies: [], skippedReason: "error" };
    }
  }

  /** Contas diferentes que caem no mesmo dominio viram uma so. */
  static mergeByDomain(accounts: ResolvedAccount[]): ResolvedAccount[] {
    const out: ResolvedAccount[] = [];
    const byDomain = new Map<string, ResolvedAccount>();
    for (const account of accounts) {
      if (!account.domain || account.skippedReason) {
        out.push(account);
        continue;
      }
      const existing = byDomain.get(account.domain);
      if (!existing) {
        const copy = { ...account, leads: [...account.leads], emailDomains: [...account.emailDomains] };
        byDomain.set(account.domain, copy);
        out.push(copy);
        continue;
      }
      existing.leads.push(...account.leads);
      for (const d of account.emailDomains) if (!existing.emailDomains.includes(d)) existing.emailDomains.push(d);
      if (!existing.companyName) existing.companyName = account.companyName;
      if (!Array.isArray(existing.technologies) || existing.technologies.length === 0) {
        existing.technologies = account.technologies;
      }
    }
    return out;
  }

  // ==============================================
  // RESEARCH
  // ==============================================

  private timeExceeded(state: RunState): boolean {
    return this.clock() - state.startedAt > DOSSIER_CONFIG.timeBudgetMs;
  }

  private skippedAccount(
    group: AccountGroup,
    domain: string | null,
    reason: DossierSkipReason
  ): ResearchedAccount {
    return {
      companyName: group.companyName,
      domain,
      dossierId: null,
      status: "skipped",
      reused: false,
      factsCount: 0,
      failedSources: [],
      skippedReason: reason,
      leadCount: group.leads.length,
    };
  }

  private async researchAccountSafe(state: RunState, account: ResolvedAccount): Promise<ResearchedAccount> {
    try {
      const researched = await this.researchAccount(state, account);
      this.doneAccounts.push(researched);
      return researched;
    } catch (error) {
      console.error(
        `[ResearchAccountsStep] Falha ao pesquisar "${account.domain ?? account.key}" (execution=${state.executionId}):`,
        errorMessage(error)
      );
      state.flags.unexpectedError = true;
      return this.skippedAccount(account, account.domain, "error");
    }
  }

  private async researchAccount(state: RunState, account: ResolvedAccount): Promise<ResearchedAccount> {
    if (account.skippedReason || !account.domain) {
      return this.skippedAccount(account, account.domain, account.skippedReason ?? "no_domain");
    }
    const domain = account.domain;

    // Reuso (gratis) vem antes dos tetos de tempo e custo, que so valem para a pesquisa paga.: dossie `complete` e nao expirado do mesmo tenant + dominio.
    const reuse = await this.bounded(
      "leitura de dossies",
      () => findReusableDossier(this.supabase, this.tenantId, domain, state.now),
      { dossier: null, error: "sem resposta antes do prazo do step" }
    );
    if (reuse.error) {
      // Sem leitura (ex.: migration nao aplicada) nao ha onde gravar: nao gasta com a conta.
      console.error(`[ResearchAccountsStep] Falha ao ler dossies (dominio=${domain}):`, reuse.error);
      state.flags.persistFailed = true;
      return this.skippedAccount(account, domain, "error");
    }
    if (reuse.dossier) {
      const dossierId = reuse.dossier.id;
      const posts = await this.collectPostsForReused(state, account, dossierId);
      let factsCount = reuse.dossier.factsCount;
      let postsSaved = false;
      if (posts.facts.length > 0) {
        const inserted = await this.bounded(
          "gravacao de posts no dossie",
          () => insertFacts(this.supabase, this.tenantId, dossierId, posts.facts),
          { error: "sem resposta antes do prazo do step" }
        );
        if (inserted.error) state.flags.persistFailed = true;
        else {
          factsCount += posts.facts.length;
          postsSaved = true;
        }
      }
      await this.link(state, dossierId, account);
      // Story 24.20: so marca a conta; a leitura dos fatos e da fase (fora deste pool).
      this.rememberReusedFacts(state, account, domain, dossierId, postsSaved ? posts.facts : []);
      return {
        companyName: account.companyName ?? reuse.dossier.companyName,
        domain,
        dossierId,
        status: posts.failure ? "partial" : "complete",
        reused: true,
        factsCount,
        failedSources: posts.failure ? ["posts"] : [],
        ...(posts.failure ? { failureReasons: { posts: posts.failure } } : {}),
        leadCount: account.leads.length,
      };
    }

    if (this.timeExceeded(state)) {
      state.flags.timeBudgetExhausted = true;
      return this.skippedAccount(account, domain, "time_budget");
    }
    // Pula a conta so quando nem uma chamada cabe AGORA (reservas em voo sao liberadas
    // no settle; uma recusa antiga nao condena as contas seguintes).
    if (!state.budget.canReserve(DOSSIER_CONFIG.maxCostUsdPerCall)) {
      state.flags.budgetExhausted = true;
      return this.skippedAccount(account, domain, "budget");
    }

    const cost = { usd: 0 };
    const name = account.companyName || domainBrand(domain) || domain;
    const since = isoDate(new Date(state.now.getTime() - DOSSIER_CONFIG.windowDays * 86_400_000));
    const factCtx = {
      companyName: account.companyName,
      domain,
      now: state.now,
      windowDays: DOSSIER_CONFIG.windowDays,
    };

    const [site, news, jobs, posts] = await Promise.all([
      this.collectSource(state, cost, "site", TREG_ENDPOINTS.webExtract, { url: `https://${domain}` }, hasExtractPages, (json) => {
        const fact = siteFact(json, `https://${domain}`, state.now, DOSSIER_CONFIG.siteSummaryMaxChars);
        return fact ? [fact] : [];
      }),
      this.collectSource(
        state,
        cost,
        "news",
        TREG_ENDPOINTS.exaSearch,
        {
          query: `noticias sobre a empresa ${name}`,
          numResults: 10,
          userLocation: "BR",
          startPublishedDate: `${since}T00:00:00.000Z`,
        },
        hasExaResults,
        (json) => newsFacts(json, factCtx, DOSSIER_CONFIG.maxNewsPerAccount)
      ),
      this.collectSource(
        state,
        cost,
        "jobs",
        TREG_ENDPOINTS.exaSearch,
        {
          query: `vaga seguranca da informacao ou infraestrutura na ${name}`,
          numResults: 10,
          userLocation: "BR",
          startPublishedDate: `${since}T00:00:00.000Z`,
        },
        hasExaResults,
        (json) => jobFacts(json, factCtx, DOSSIER_CONFIG.maxJobsPerAccount)
      ),
      this.collectPosts(state, account.leads),
    ]);
    const tech = technologyFacts(account.technologies, state.techDate, DOSSIER_CONFIG.maxTechPerAccount);

    const facts = [...site.facts, ...news.facts, ...jobs.facts, ...tech, ...posts.facts].filter(isValidFact);
    const failureReasons: Partial<Record<DossierSource, DossierFailureReason>> = {};
    if (site.failure) failureReasons.site = site.failure;
    if (news.failure) failureReasons.news = news.failure;
    if (jobs.failure) failureReasons.jobs = jobs.failure;
    if (posts.failure) failureReasons.posts = posts.failure;
    const failedSources = Object.keys(failureReasons) as DossierSource[];
    const status = dossierStatus(facts, failedSources);

    const saved = await this.bounded(
      "gravacao do dossie",
      () =>
        saveDossier(this.supabase, {
          tenantId: this.tenantId,
          executionId: state.executionId,
          domain,
          companyName: account.companyName,
          status,
          failedSources,
          costUsd: cost.usd,
          facts,
          researchedAt: state.now,
          reuseDays: DOSSIER_CONFIG.reuseDays,
        }),
      { dossierId: null, error: "sem resposta antes do prazo do step" }
    );
    if (saved.error) {
      console.error(`[ResearchAccountsStep] Falha ao gravar o dossie (dominio=${domain}):`, saved.error);
      state.flags.persistFailed = true;
    }
    if (saved.dossierId) await this.link(state, saved.dossierId, account);
    // Story 24.20: fato nao gravado nao vira gatilho.
    this.rememberAccountFacts(state, account, domain, saved.dossierId, saved.dossierId && !saved.error ? facts : null);

    return {
      companyName: account.companyName,
      domain,
      dossierId: saved.dossierId,
      status,
      reused: false,
      factsCount: facts.length,
      failedSources,
      ...(failedSources.length > 0 ? { failureReasons } : {}),
      leadCount: account.leads.length,
    };
  }

  private async link(state: RunState, dossierId: string, account: ResolvedAccount): Promise<void> {
    const linked = await this.bounded(
      "ligacao dos leads ao dossie",
      () =>
        linkLeads(this.supabase, {
          tenantId: this.tenantId,
          executionId: state.executionId,
          dossierId,
          leads: account.leads.map((lead) => ({ apolloId: lead.apolloId ?? null, email: lead.email ?? null })),
        }),
      { linked: 0, error: "sem resposta antes do prazo do step" }
    );
    state.leadsLinked += linked.linked;
    if (linked.error) {
      console.error(`[ResearchAccountsStep] Falha ao ligar leads ao dossie ${dossierId}:`, linked.error);
      state.flags.persistFailed = true;
    }
  }

  private async collectSource(
    state: RunState,
    cost: { usd: number },
    source: DossierSource,
    endpoint: TregEndpointId,
    body: Record<string, unknown>,
    hasExpectedShape: (json: unknown) => boolean,
    extract: (json: unknown) => DossierFact[]
  ): Promise<SourceResult> {
    const outcome = await this.callTreg(state, endpoint, body, source, cost);
    if (!outcome.ok) return { facts: [], failure: outcome.reason };
    // 200 sem o formato esperado (corpo ilegivel, sem o array) e FALHA: senao o dossie
    // sairia `complete` sem a fonte e seria reaproveitado por 30 dias.
    if (!hasExpectedShape(outcome.json)) {
      console.error(`[ResearchAccountsStep] Resposta do Treg sem o formato esperado (${source})`);
      return { facts: [], failure: "error" };
    }
    try {
      return { facts: extract(outcome.json) };
    } catch (error) {
      console.error(`[ResearchAccountsStep] Resposta inesperada do Treg (${source}):`, errorMessage(error));
      return { facts: [], failure: "error" };
    }
  }

  /**
   * Uma chamada ao Treg: reserva o teto da chamada, chama com os headers obrigatorios,
   * acerta o custo e loga 1 linha em `api_usage_logs` (`treg`). Nunca lanca.
   *
   * TODA chamada iniciada entra em `tregCalls`/`tregUsd` e no log, inclusive a que nao
   * respondeu (timeout do servico, timeout do prazo do step, rede, excecao). Sem resposta
   * o custo real e desconhecido (o Treg pode ter cobrado): conta-se o TETO reservado da
   * chamada, a reserva fica consumida (nao e liberada) e o log marca `costEstimated`.
   */
  private async callTreg(
    state: RunState,
    endpoint: TregEndpointId,
    body: Record<string, unknown>,
    source: DossierSource | "domain",
    cost: { usd: number } | null
  ): Promise<TregOutcome> {
    const remaining = this.remainingToDeadline();
    if (remaining < DOSSIER_CONFIG.minCallMs) {
      state.flags.timeBudgetExhausted = true;
      return { ok: false, reason: "timeout" };
    }
    const reserve = DOSSIER_CONFIG.maxCostUsdPerCall;
    if (!state.budget.tryReserve(reserve)) {
      state.flags.budgetExhausted = true;
      return { ok: false, reason: "budget" };
    }

    // Conservador ate prova em contrario: se algo escapar, o teto da chamada fica gasto.
    let costUsd: number = reserve;
    const startedAt = this.clock();
    try {
      const call = await settleWithin(
        () =>
          this.treg.call(state.tregKey, endpoint, body, {
            maxCostUsd: reserve,
            idempotencyKey: buildIdempotencyKey(state.executionId, endpoint, body),
            meta: `feature=dossie-24-19,tenant=${this.tenantId},execution=${state.executionId}`,
            timeoutMs: Math.min(DOSSIER_CONFIG.callTimeoutMs, remaining),
          }),
        // O timeout do proprio TregService e a 1a linha; esta e a garantia do prazo.
        Math.min(DOSSIER_CONFIG.callTimeoutMs, remaining) + 1_000
      );

      const result = call.ok ? call.value : null;
      let failureMessage: string | undefined;
      if (!call.ok) {
        if (call.timedOut) {
          state.flags.timeBudgetExhausted = true;
          failureMessage = "sem resposta antes do prazo do step";
        } else {
          failureMessage = errorMessage(call.error);
        }
        console.error(`[ResearchAccountsStep] Chamada ${endpoint} sem resposta:`, failureMessage);
      } else if (result && !result.ok) {
        failureMessage = result.error;
      }

      // Status 0 = sem resposta HTTP (timeout/rede): custo desconhecido, mesmo sem a marca.
      const costEstimated = !result || result.costUnknown === true || result.status === 0;
      costUsd = costEstimated ? reserve : Math.max(0, result.costMicro) / 1_000_000;
      state.tregCalls++;
      state.tregUsd += costUsd;
      if (costEstimated) {
        state.tregEstimatedCalls++;
        state.tregEstimatedUsd += costUsd;
      }
      if (cost) cost.usd += costUsd;

      await this.logUsage({
        tenantId: this.tenantId,
        executionId: state.executionId,
        stepType: "research_accounts",
        serviceName: "treg",
        requestType: endpoint,
        status: result?.ok ? "success" : "failed",
        calls: 1,
        durationMs: result?.durationMs ?? Math.max(0, this.clock() - startedAt),
        errorMessage: result?.ok ? undefined : failureMessage,
        // FEL-57: US$ na coluna, como o Apify (`calculateApifyCost`); antes so no metadata.
        estimatedCost: costUsd,
        metadata: {
          costUsd,
          costMicro: costEstimated ? null : result.costMicro,
          // Sem resposta: custo DESCONHECIDO, contabilizado pelo teto reservado.
          costEstimated,
          ...(costEstimated ? { costBasis: "reserved_cap", reservedUsd: reserve } : {}),
          httpStatus: result?.status ?? 0,
          source,
        },
      });

      if (result?.ok) return { ok: true, json: result.json };
      if (!result) return { ok: false, reason: call.ok || !call.timedOut ? "error" : "timeout" };
      const reason: DossierFailureReason =
        result.status === 0 ? (result.error?.startsWith("timeout") ? "timeout" : "error") : "http";
      return { ok: false, reason };
    } catch (error) {
      console.error(`[ResearchAccountsStep] Falha na chamada ${endpoint}:`, errorMessage(error));
      return { ok: false, reason: "error" };
    } finally {
      state.budget.settle(reserve, costUsd);
    }
  }

  /**
   * Posts da propria pessoa do lead (Apify), so com o toggle de LinkedIn (22.2) ligado e
   * chave Apify. Mantidos se o `relevance-classifier` (fail-open) disser relevante.
   */
  private async collectPosts(state: RunState, leads: SearchLeadResult[]): Promise<SourceResult> {
    if (!state.premium || !state.apifyKey) return { facts: [] };
    const apifyKey = state.apifyKey;
    const facts: DossierFact[] = [];
    let failure: DossierFailureReason | undefined;

    for (const lead of leads) {
      const linkedinUrl = lead.linkedinUrl;
      if (!linkedinUrl || !/^https?:\/\//i.test(linkedinUrl)) continue;
      // Cada perfil pode levar ~60 s no Apify: depois do teto de tempo nao inicia outro
      // (a rota tem 300 s; estourar deixaria o step `running` e travaria o pipeline).
      const remaining = this.remainingToDeadline();
      if (this.timeExceeded(state) || remaining < DOSSIER_CONFIG.minCallMs) {
        state.flags.timeBudgetExhausted = true;
        failure = failure ?? "timeout";
        break;
      }
      const reserve = DOSSIER_CONFIG.apifyUsdPerProfile;
      if (!state.apifyBudget.tryReserve(reserve)) {
        state.flags.budgetExhausted = true;
        failure = "budget";
        break;
      }
      const start = this.clock();
      let posts: LinkedInPost[] = [];
      try {
        state.apifyCalls++;
        // Corrida contra o prazo duro: o step nao espera o Apify alem dele.
        const fetched = await settleWithin(
          () => this.apify.fetchLinkedInPosts(apifyKey, linkedinUrl, DOSSIER_CONFIG.maxPostsPerLead),
          remaining
        );
        if (!fetched.ok && !fetched.timedOut) throw fetched.error;
        if (!fetched.ok) {
          state.flags.timeBudgetExhausted = true;
          failure = failure ?? "timeout";
          this.rememberIcebreakerAttempt(state, linkedinUrl, "timeout");
          await this.logUsage({
            tenantId: this.tenantId,
            executionId: state.executionId,
            stepType: "research_accounts",
            serviceName: "apify",
            requestType: "linkedin_posts_dossier",
            status: "failed",
            calls: 1,
            durationMs: this.clock() - start,
            errorMessage: "prazo do step esgotado",
          });
          break;
        }
        const result = fetched.value;
        await this.logUsage({
          tenantId: this.tenantId,
          executionId: state.executionId,
          stepType: "research_accounts",
          serviceName: "apify",
          requestType: "linkedin_posts_dossier",
          status: result.success ? "success" : "failed",
          calls: 1,
          durationMs: this.clock() - start,
          errorMessage: result.success ? undefined : result.error,
          postsFetched: result.posts?.length ?? 0,
        });
        if (!result.success) {
          failure = failure ?? "error";
          this.rememberIcebreakerAttempt(state, linkedinUrl, "failed");
          continue;
        }
        posts = result.posts ?? [];
        // FEL-57: posts BRUTOS (antes dos filtros abaixo) para o icebreaker premium.
        this.rememberIcebreakerPosts(state, linkedinUrl, posts, result.rawIndexes, result.fetchedAt);
        // FEL-77: busca feita sem posts reaproveitaveis -> registrada como tentada.
        this.rememberIcebreakerAttempt(state, linkedinUrl, posts.length === 0 ? "empty" : "unusable");
      } catch (error) {
        console.error("[ResearchAccountsStep] Falha no Apify:", errorMessage(error));
        failure = failure ?? "error";
        this.rememberIcebreakerAttempt(state, linkedinUrl, "failed");
        continue;
      } finally {
        state.apifyBudget.settle(reserve, reserve);
      }

      // So posts da propria pessoa do lead (repost/post de terceiro fica de fora).
      const recent = recentPosts<LinkedInPost>(posts, state.now, DOSSIER_CONFIG.windowDays, DOSSIER_CONFIG.maxPostsPerLead).filter(
        (post) => isOwnPost(post, lead.name)
      );
      const relevant: LinkedInPost[] = [];
      for (const post of recent) {
        // Sem tempo para classificar: o post nao entra (nunca grava sem o filtro).
        if (this.timeExceeded(state) || this.remainingToDeadline() < DOSSIER_CONFIG.minCallMs) {
          state.flags.timeBudgetExhausted = true;
          failure = failure ?? "timeout";
          break;
        }
        if (state.kbContext && state.openaiKey && post.text.trim().length >= 10) {
          state.openaiRelevanceCalls++;
        }
        const classification = await settleWithin(
          () =>
            classifyPostRelevance(
              post.text,
              post.postUrl,
              state.kbContext,
              state.openaiKey,
              this.supabase,
              this.tenantId
            ),
          this.remainingToDeadline()
        );
        if (classification.ok) {
          if (classification.value.isRelevant) relevant.push(post);
        } else if (classification.timedOut) {
          // Sem resposta antes do prazo: o post nao entra (nunca grava sem o filtro).
          state.flags.timeBudgetExhausted = true;
          failure = failure ?? "timeout";
          break;
        } else {
          // O classificador ja e fail-open; qualquer excecao residual mantem o post.
          relevant.push(post);
        }
      }
      facts.push(
        ...postFacts(relevant, { apolloId: lead.apolloId ?? null, email: lead.email ?? null }, state.now, DOSSIER_CONFIG.windowDays)
      );
    }

    return failure ? { facts, failure } : { facts };
  }

  /**
   * FEL-57: guarda, de uma busca BEM-SUCEDIDA, os posts que a busca de hoje do
   * `create_campaign` (limite 3) produziria, para ele nao buscar o mesmo perfil de novo.
   * Sem equivalencia garantida ou sem post, nada e guardado. O primeiro resultado do
   * perfil vale. Nunca lanca: sem a entrada, o `create_campaign` so busca como hoje.
   */
  private rememberIcebreakerPosts(
    state: RunState,
    linkedinUrl: string,
    posts: LinkedInPost[],
    rawIndexes: number[] | undefined,
    fetchedAt: unknown
  ): void {
    try {
      if (Object.prototype.hasOwnProperty.call(state.icebreakerPosts, linkedinUrl)) return;
      const at =
        typeof fetchedAt === "string" && !Number.isNaN(Date.parse(fetchedAt))
          ? fetchedAt
          : new Date().toISOString();
      const entry = buildReusableEntry(posts, rawIndexes, at, DOSSIER_CONFIG.maxPostsPerLead);
      if (entry) state.icebreakerPosts[linkedinUrl] = entry;
    } catch (error) {
      console.error("[ResearchAccountsStep] Falha ao guardar posts para o icebreaker:", errorMessage(error));
    }
  }

  /**
   * FEL-77: registra que o research JA chamou o Apify para o perfil e nao deixou posts
   * reaproveitaveis, para o `create_campaign` nao chamar de novo (cai no padrao). Perfil
   * com posts guardados nao e registrado (os posts valem). A primeira tentativa vale.
   * Nunca lanca: sem o registro, o `create_campaign` so busca como hoje.
   */
  private rememberIcebreakerAttempt(state: RunState, linkedinUrl: string, outcome: IcebreakerAttemptOutcome): void {
    try {
      const has = (record: object) => Object.prototype.hasOwnProperty.call(record, linkedinUrl);
      if (has(state.icebreakerPosts) || has(state.icebreakerAttempts)) return;
      state.icebreakerAttempts[linkedinUrl] = { attemptedAt: new Date().toISOString(), outcome };
    } catch (error) {
      console.error("[ResearchAccountsStep] Falha ao registrar tentativa do icebreaker:", errorMessage(error));
    }
  }

  /**
   * Reuso: so busca posts de leads que ainda NAO tem post no dossie (sem duplicar nem
   * cobrar de novo). Sem conseguir ler o que ja existe, nao busca posts.
   */
  private async collectPostsForReused(
    state: RunState,
    account: ResolvedAccount,
    dossierId: string
  ): Promise<SourceResult> {
    if (!state.premium || !state.apifyKey) return { facts: [] };
    const existing = await this.bounded(
      "leitura dos posts do dossie",
      () => findPostLeadIdentifiers(this.supabase, this.tenantId, dossierId),
      { apolloIds: new Set<string>(), emails: new Set<string>(), error: "sem resposta antes do prazo do step" }
    );
    if (existing.error) {
      console.error(`[ResearchAccountsStep] Falha ao ler posts do dossie ${dossierId}; posts pulados:`, existing.error);
      return { facts: [] };
    }
    const pending = account.leads.filter(
      (lead) =>
        !(lead.apolloId && existing.apolloIds.has(lead.apolloId)) &&
        !(lead.email && existing.emails.has(lead.email.trim().toLowerCase()))
    );
    return this.collectPosts(state, pending);
  }

  private async safeLoadKBContext(): Promise<KBContextForClassification | null> {
    try {
      return await loadKBContext(this.supabase, this.tenantId);
    } catch {
      return null;
    }
  }

  // ==============================================
  // WHY NOW (Story 24.20)
  // ==============================================

  private setRunLeads(leads: SearchLeadResult[]): void {
    this.runLeads = leads;
    this.leadIndexes = new Map();
    leads.forEach((lead, index) => {
      const list = this.leadIndexes.get(lead) ?? [];
      list.push(index);
      this.leadIndexes.set(lead, list);
    });
  }

  /**
   * Como `bounded`, mas SEM tocar nas flags da pesquisa (a fase do gatilho nunca muda o
   * output da 24.19). Espera no maximo `ms` e nunca passa do prazo duro. Nunca lanca.
   */
  private async quietBounded<T>(label: string, op: () => Promise<T>, fallback: T, ms?: number): Promise<T> {
    const limit = Math.max(0, Math.min(ms ?? Number.POSITIVE_INFINITY, this.remainingToDeadline()));
    const outcome = await settleWithin(op, limit);
    if (outcome.ok) return outcome.value;
    console.error(
      `[ResearchAccountsStep] ${label}:`,
      outcome.timedOut ? "sem resposta antes do prazo" : errorMessage(outcome.error)
    );
    return fallback;
  }

  private rememberAccountFacts(
    state: RunState,
    account: ResolvedAccount,
    domain: string,
    dossierId: string | null,
    facts: DossierFact[] | null
  ): void {
    if (!WHY_NOW_CONFIG.enabled) return;
    state.accountFacts.push({ domain, companyName: account.companyName, dossierId, facts, leads: account.leads });
  }

  /**
   * Reuso: so registra a conta como "fatos a ler". A leitura (`readDossierFacts`) roda na
   * fase do gatilho, com o prazo da fase, para nunca ocupar um worker da pesquisa nem
   * mudar nada do output da 24.19 (revisao Codex 1). Sincrono, nao espera nada.
   */
  private rememberReusedFacts(
    state: RunState,
    account: ResolvedAccount,
    domain: string,
    dossierId: string,
    savedPosts: DossierFact[]
  ): void {
    if (!WHY_NOW_CONFIG.enabled) return;
    state.accountFacts.push({
      domain,
      companyName: account.companyName,
      dossierId,
      facts: null,
      leads: account.leads,
      pendingRead: { savedPosts },
    });
  }

  /** Le os fatos de um dossie reaproveitado dentro do prazo da fase. Nunca lanca. */
  private async readReusedFacts(entry: AccountFactsEntry, waitMs: number): Promise<void> {
    const dossierId = entry.dossierId;
    const savedPosts = entry.pendingRead?.savedPosts ?? [];
    entry.pendingRead = undefined;
    if (!dossierId) return;
    const stored = await this.quietBounded(
      "leitura dos fatos do dossie (motivo para abordar agora)",
      () => readDossierFacts(this.supabase, this.tenantId, dossierId),
      { facts: [] as DossierFact[], error: "sem resposta antes do prazo da fase" },
      waitMs
    );
    if (stored.error) {
      console.error(`[ResearchAccountsStep] Fatos do dossie ${dossierId} indisponiveis para o gatilho:`, stored.error);
      entry.facts = null;
      return;
    }
    entry.facts = [...stored.facts, ...savedPosts];
  }

  private setLeadWhyNow(
    lead: SearchLeadResult,
    entry: AccountFactsEntry | null,
    result: WhyNowLeadResult
  ): void {
    for (const leadIndex of this.leadIndexes.get(lead) ?? []) {
      const base = {
        leadIndex,
        apolloId: lead.apolloId ?? null,
        email: lead.email?.trim().toLowerCase() || null,
        companyDomain: entry?.domain ?? null,
        dossierId: entry?.dossierId ?? null,
      };
      this.whyNowRun.results.set(
        leadIndex,
        result.trigger
          ? { ...base, status: "trigger", trigger: result.trigger }
          : { ...base, status: "no_trigger", reason: result.reason }
      );
    }
  }

  private setLeadsWhyNow(
    entry: AccountFactsEntry,
    indexes: number[],
    reason: WhyNowNoTriggerReason
  ): void {
    for (const i of indexes) this.setLeadWhyNow(entry.leads[i], entry, { reason });
  }

  /** Rede de seguranca da fase: nenhuma excecao sai daqui. */
  private async evaluateWhyNowSafe(state: RunState): Promise<void> {
    try {
      await this.evaluateWhyNow(state);
    } catch (error) {
      console.error(
        `[ResearchAccountsStep] Excecao inesperada no motivo para abordar agora (execution=${state.executionId}); o step segue:`,
        errorMessage(error)
      );
      this.whyNowRun.flags.unexpectedError = true;
      this.whyNowRun.pendingReason = "llm_error";
    } finally {
      this.whyNowRun.finished = true;
    }
  }

  /**
   * Gatilho por lead (1 chamada de LLM por conta com fato elegivel), com tetos de
   * chamadas, custo reservado e tempo (fase + prazo duro). Nunca muda contas, resumo,
   * flags, custo nem os posts da 24.19, e nunca pausa o pipeline.
   */
  private async evaluateWhyNow(state: RunState): Promise<void> {
    const run = this.whyNowRun;
    run.started = true;
    if (!WHY_NOW_CONFIG.enabled) return;

    const entries = state.accountFacts;
    // Leads de contas nao pesquisadas (puladas, sem dominio...): `not_researched`.
    const inEntries = new Set(entries.flatMap((entry) => entry.leads));
    this.runLeads.forEach((lead) => {
      if (!inEntries.has(lead)) this.setLeadWhyNow(lead, null, { reason: "not_researched" });
    });
    const allLeads = (entry: AccountFactsEntry) => entry.leads.map((_, i) => i);
    for (const entry of entries) {
      if (entry.facts === null && !entry.pendingRead) this.setLeadsWhyNow(entry, allLeads(entry), "facts_unavailable");
    }

    // Contas com fatos ja em memoria viram tarefa com plano; reaproveitadas, tarefa com
    // leitura pendente (lida DENTRO da fase, em paralelo com as outras chamadas).
    const tasks: WhyNowTask[] = [];
    for (const entry of entries) {
      if (entry.pendingRead) continue;
      if (entry.facts === null) continue;
      const plan = this.planWhyNowEntry(entry);
      if (plan) tasks.push({ entry, plan });
    }
    for (const entry of entries) if (entry.pendingRead) tasks.push({ entry, plan: null });
    if (tasks.length === 0) return;

    const markTasks = (reason: WhyNowNoTriggerReason) => {
      for (const task of tasks) {
        if (task.plan) this.setLeadsWhyNow(task.entry, task.plan.callLeads, reason);
        else {
          task.entry.pendingRead = undefined;
          this.setLeadsWhyNow(task.entry, allLeads(task.entry), reason);
        }
      }
    };
    if (this.remainingToDeadline() < WHY_NOW_CONFIG.minPhaseMs) {
      run.flags.timeBudgetExhausted = true;
      markTasks("time_budget");
      return;
    }
    return this.runWhyNowCalls(state, tasks, this.phaseClock(), markTasks);
  }

  /** Plano de UMA conta com fatos: marca sem fato / alem do limite; `null` = sem chamada. */
  private planWhyNowEntry(entry: AccountFactsEntry): AccountCallPlan | null {
    const plan = planAccountCall(
      entry.facts ?? [],
      entry.leads.map((lead) => ({ apolloId: lead.apolloId ?? null, email: lead.email ?? null }))
    );
    this.setLeadsWhyNow(entry, plan.noEligible, "no_eligible_facts");
    if (plan.overLimit.length > 0) {
      this.whyNowRun.flags.callLimitReached = true;
      this.setLeadsWhyNow(entry, plan.overLimit, "call_limit");
    }
    return plan.callLeads.length > 0 ? plan : null;
  }

  /** Prazo da fase: `min(agora + phaseBudgetMs, prazo duro)`. */
  private phaseClock(): { left: () => number } {
    const phaseDeadline = Math.min(this.clock() + WHY_NOW_CONFIG.phaseBudgetMs, this.deadlineAt);
    return { left: () => Math.max(0, phaseDeadline - this.clock()) };
  }

  /**
   * Chave, ICP, leituras pendentes e chamadas, todos dentro do prazo da fase. Nunca lanca.
   * Sem chave OpenAI, contas com leitura pendente nem sao lidas: todos os leads delas
   * ficam `no_openai_key` (nao ha como haver gatilho).
   */
  private async runWhyNowCalls(
    state: RunState,
    tasks: WhyNowTask[],
    phase: { left: () => number },
    markTasks: (reason: WhyNowNoTriggerReason) => void
  ): Promise<void> {
    const run = this.whyNowRun;
    const phaseLeft = phase.left;

    const apiKey = await this.quietBounded(
      "leitura da chave da OpenAI (motivo para abordar agora)",
      () => getServiceApiKeyOrNull(this.tenantId, "openai"),
      null,
      phaseLeft()
    );
    if (!apiKey) {
      run.flags.noOpenaiKey = true;
      markTasks("no_openai_key");
      return;
    }
    const icp = await this.quietBounded(
      "leitura do ICP (motivo para abordar agora)",
      () => this.readIcp(this.tenantId),
      EMPTY_TENANT_ICP,
      phaseLeft()
    );
    const painPoints = typeof icp?.painPoints === "string" ? icp.painPoints.trim() : "";
    run.kbPainsAvailable = painPoints.length > 0;

    const budget = new CostBudget(WHY_NOW_CONFIG.maxCostUsdPerExecution);
    let callsStarted = 0;

    await runPool(tasks, WHY_NOW_CONFIG.concurrency, async (task) => {
      const entry = task.entry;
      let plan = task.plan;
      if (!plan) {
        // Revisao Codex 1: leitura do dossie reaproveitado com o prazo da fase; erro ou
        // espera -> sem gatilho para esta conta (as outras seguem).
        await this.readReusedFacts(entry, phaseLeft());
        if (entry.facts === null) {
          this.setLeadsWhyNow(entry, entry.leads.map((_, i) => i), "facts_unavailable");
          return;
        }
        plan = this.planWhyNowEntry(entry);
        if (!plan) return;
      }
      const callLeads = plan.callLeads;
      if (callsStarted >= WHY_NOW_CONFIG.maxCallsPerExecution) {
        run.flags.callLimitReached = true;
        this.setLeadsWhyNow(entry, callLeads, "call_limit");
        return;
      }
      const left = phaseLeft();
      if (left < WHY_NOW_CONFIG.minCallMs) {
        run.flags.timeBudgetExhausted = true;
        this.setLeadsWhyNow(entry, callLeads, "time_budget");
        return;
      }
      const reserve = WHY_NOW_CONFIG.reservedUsdPerCall;
      if (!budget.tryReserve(reserve)) {
        run.flags.budgetExhausted = true;
        this.setLeadsWhyNow(entry, callLeads, "budget");
        return;
      }
      callsStarted++;
      run.llmCalls++;

      const timeoutMs = Math.min(WHY_NOW_CONFIG.callTimeoutMs, left);
      const startedAt = this.clock();
      let outcome: SelectWhyNowResult;
      try {
        const call = await settleWithin(
          () =>
            selectWhyNowForAccount({
              apiKey,
              companyName: entry.companyName,
              domain: entry.domain,
              plan,
              leads: callLeads.map((i) => ({
                cargo: entry.leads[i].title ?? null,
                empresa: entry.leads[i].companyName ?? entry.companyName,
              })),
              painPoints,
              timeoutMs,
              createClient: this.whyNowClient,
              clock: this.clock,
            }),
          // O AbortController da chamada e a 1a linha; esta e a garantia do prazo da fase
          // (e do prazo duro).
          Math.max(0, Math.min(timeoutMs + 1_000, phaseLeft(), this.remainingToDeadline()))
        );
        if (call.ok) {
          outcome = call.value;
        } else {
          const reason: WhyNowNoTriggerReason = call.timedOut ? "timeout" : "llm_error";
          outcome = {
            results: callLeads.map(() => ({ reason })),
            attempted: true,
            succeeded: false,
            usage: {
              model: "",
              promptTokens: 0,
              completionTokens: 0,
              durationMs: Math.max(0, this.clock() - startedAt),
              errorMessage: call.timedOut ? "sem resposta antes do prazo" : errorMessage(call.error),
            },
          };
        }
      } finally {
        // Custo real em US$ desconhecido aqui: conta o reservado (conservador).
        budget.settle(reserve, reserve);
      }

      if (!outcome.succeeded) run.llmFailedCalls++;
      callLeads.forEach((i, j) => {
        this.setLeadWhyNow(entry.leads[i], entry, outcome.results[j] ?? { reason: "invalid_response" });
      });

      await this.quietBounded(
        "log de uso (motivo para abordar agora)",
        () =>
          logAgentUsage({
            tenantId: this.tenantId,
            executionId: state.executionId,
            stepType: "research_accounts",
            serviceName: "openai",
            requestType: "why_now_trigger",
            status: outcome.succeeded ? "success" : "failed",
            calls: 1,
            durationMs: outcome.usage.durationMs,
            errorMessage: outcome.succeeded ? undefined : outcome.usage.errorMessage,
            metadata: {
              model: outcome.usage.model || undefined,
              promptTokens: outcome.usage.promptTokens,
              completionTokens: outcome.usage.completionTokens,
              leads: callLeads.length,
              eligibleFacts: plan.eligible.length,
              triggers: outcome.results.filter((r) => r.trigger).length,
            },
          }),
        undefined,
        // Revisao Codex 1: o log tambem respeita o prazo da fase (a gravacao segue em
        // segundo plano; so a fase nao espera por ela).
        phaseLeft()
      );
    });
  }

  /** `output.whyNow` (sempre que houver leads); leads nao avaliados levam o motivo pendente. */
  private buildWhyNow(): WhyNowOutput | undefined {
    if (this.runLeads.length === 0) return undefined;
    const run = this.whyNowRun;
    const flags: WhyNowFlags = { ...run.flags };
    let fallback: WhyNowNoTriggerReason;
    if (!WHY_NOW_CONFIG.enabled) {
      flags.disabled = true;
      fallback = "disabled";
    } else if (!run.started) {
      fallback = "not_researched";
    } else {
      fallback = run.pendingReason;
    }

    const leads: LeadWhyNow[] = this.runLeads.map((lead, leadIndex) => {
      const done = WHY_NOW_CONFIG.enabled ? run.results.get(leadIndex) : undefined;
      if (done) return { ...done };
      // Interrompido no meio da fase (backstop do prazo): os pendentes sao "tempo".
      if (fallback === "time_budget") flags.timeBudgetExhausted = true;
      return {
        leadIndex,
        apolloId: lead.apolloId ?? null,
        email: lead.email?.trim().toLowerCase() || null,
        companyDomain: null,
        dossierId: null,
        status: "no_trigger",
        reason: fallback,
      };
    });
    const withTrigger = leads.filter((l) => l.status === "trigger").length;
    return {
      leads,
      summary: {
        withTrigger,
        withoutTrigger: leads.length - withTrigger,
        llmCalls: run.llmCalls,
        llmFailedCalls: run.llmFailedCalls,
      },
      kbPainsAvailable: run.kbPainsAvailable,
      flags,
    };
  }

  /** Bloco do resumo no chat. Nome e cargo vem dos leads em memoria (nunca do output). */
  static whyNowSummaryText(whyNow: WhyNowOutput | undefined, leads: SearchLeadResult[] = []): string | null {
    if (!whyNow || whyNow.flags.disabled || whyNow.leads.length === 0) return null;
    const total = whyNow.leads.length;
    const withTrigger = whyNow.leads.filter((l) => l.status === "trigger");
    const ordered = [...withTrigger, ...whyNow.leads.filter((l) => l.status !== "trigger")];
    const shown = ordered.slice(0, WHY_NOW_CONFIG.summaryMaxLeads);

    const lines = [`Motivo para abordar agora: ${withTrigger.length} de ${plural(total, "lead", "leads")} com gatilho.`];
    for (const entry of shown) {
      const lead = leads[entry.leadIndex];
      const name = lead?.name?.trim() || "Lead";
      const company = lead?.companyName?.trim() || entry.companyDomain || "";
      if (entry.status === "trigger" && entry.trigger) {
        const who = [lead?.title?.trim(), company].filter(Boolean).join(", ");
        const source = entry.trigger.fatoOrigem;
        lines.push(
          `- ${name}${who ? ` (${who})` : ""}: ${entry.trigger.gatilho} (fonte: ${sourceHost(source.fonte_url)}, ${source.data}, confianca ${entry.trigger.confianca})`
        );
      } else {
        lines.push(`- ${name}${company ? ` (${company})` : ""}: sem gatilho, segue a copy padrao.`);
      }
    }
    if (ordered.length > shown.length) {
      lines.push(`... e mais ${plural(ordered.length - shown.length, "lead", "leads")}.`);
    }
    return lines.join("\n");
  }

  // ==============================================
  // OUTPUT
  // ==============================================

  private buildResult(
    accounts: ResearchedAccount[],
    flags: ResearchAccountsFlags,
    state: RunState | null
  ): StepOutput {
    const researched = accounts.filter((a) => a.status !== "skipped");
    const output: ResearchAccountsOutput = {
      accounts,
      summary: {
        accounts: accounts.length,
        researched: researched.length,
        reused: accounts.filter((a) => a.reused).length,
        skipped: accounts.length - researched.length,
        facts: accounts.reduce((sum, a) => sum + a.factsCount, 0),
        leadsLinked: state?.leadsLinked ?? 0,
      },
      flags,
      costUsd: Number(((state?.budget.spentUsd ?? 0) + (state?.apifyBudget.spentUsd ?? 0)).toFixed(6)),
    };
    if (state && Object.keys(state.icebreakerPosts).length > 0) {
      output.icebreakerPosts = { ...state.icebreakerPosts };
    }
    if (state && Object.keys(state.icebreakerAttempts).length > 0) {
      output.icebreakerPostsAttempted = { ...state.icebreakerAttempts };
    }
    const whyNow = this.buildWhyNow();
    if (whyNow) output.whyNow = whyNow;
    return {
      success: true,
      data: output as unknown as Record<string, unknown>,
      cost: {
        treg_usd: Number((state?.tregUsd ?? 0).toFixed(6)),
        treg_calls: state?.tregCalls ?? 0,
        // Parte de `treg_usd` estimada pelo teto (chamadas sem resposta, custo desconhecido).
        treg_usd_estimated: Number((state?.tregEstimatedUsd ?? 0).toFixed(6)),
        treg_calls_estimated: state?.tregEstimatedCalls ?? 0,
        apify: state?.apifyCalls ?? 0,
        openai_relevance: state?.openaiRelevanceCalls ?? 0,
        // Story 24.20: chamadas de IA tentadas do motivo para abordar agora.
        openai_why_now: this.whyNowRun.llmCalls,
      },
    };
  }

  static summaryText(output: ResearchAccountsOutput, leads: SearchLeadResult[] = []): string {
    const base = ResearchAccountsStep.researchSummaryText(output);
    // Story 24.20: bloco de gatilhos por lead (ausente sem `whyNow` ou com o kill switch).
    const whyNow = ResearchAccountsStep.whyNowSummaryText(output.whyNow, leads);
    return whyNow ? `${base}\n\n${whyNow}` : base;
  }

  private static researchSummaryText(output: ResearchAccountsOutput): string {
    const { summary, flags } = output;
    if (flags.unexpectedError && summary.researched === 0) {
      return "Nao consegui concluir a pesquisa das contas. A campanha segue normalmente, sem dossie.";
    }
    const parts = [
      `Pesquisa das contas concluida: ${summary.researched} de ${plural(summary.accounts, "conta", "contas")} com dossie` +
        (summary.reused > 0 ? ` (${plural(summary.reused, "reaproveitada", "reaproveitadas")})` : "") +
        `, ${plural(summary.facts, "fato", "fatos")} com fonte.`,
    ];
    if (output.accounts.some((a) => a.failedSources.length > 0)) {
      parts.push("Algumas fontes falharam e os dossies ficaram parciais.");
    }
    if (flags.budgetExhausted) parts.push("O teto de custo da pesquisa foi atingido.");
    if (flags.timeBudgetExhausted) parts.push("O tempo da pesquisa acabou antes de todas as contas.");
    if (flags.persistFailed) parts.push("Nao consegui gravar parte do dossie.");
    parts.push("A campanha segue normalmente.");
    return parts.join(" ");
  }

  /**
   * Mensagem no chat. Nunca lanca. Espera no maximo `waitMs` (padrao: ate o prazo duro).
   */
  private async sendMessage(
    executionId: string,
    content: string,
    messageType: "progress" | "text",
    waitMs: number = this.remainingToDeadline()
  ): Promise<void> {
    const outcome = await settleWithin(
      async () =>
        this.supabase.from("agent_messages").insert({
          execution_id: executionId,
          role: messageType === "progress" ? "system" : "agent",
          content,
          metadata: { stepNumber: this.stepNumber, messageType },
        }),
      waitMs
    );
    if (!outcome.ok) {
      console.error(
        "[ResearchAccountsStep] Falha ao gravar mensagem:",
        outcome.timedOut ? "sem resposta a tempo" : errorMessage(outcome.error)
      );
      return;
    }
    const error = (outcome.value as { error?: { message?: string } | null }).error;
    if (error) {
      console.error("[ResearchAccountsStep] Falha ao gravar mensagem:", error.message ?? error);
    }
  }
}
