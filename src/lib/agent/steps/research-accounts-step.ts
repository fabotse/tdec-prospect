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
 * com o dossie vazio/parcial e sinalizado em `output.flags`/`failedSources`.
 *
 * NADA daqui chega ao `create_campaign`: o orchestrator ignora linhas `research_accounts`
 * ao resolver o step anterior, entao o `create_campaign` recebe o mesmo output do
 * `search_leads` de antes. O dossie nao entra no Instantly, nos prompts nem na selecao
 * de leads (isso e da 24.21).
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
import { DOSSIER_CONFIG } from "@/lib/agent/dossier/config";
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
  saveDossier,
} from "@/lib/agent/dossier/repository";
import type {
  DossierFailureReason,
  DossierSkipReason,
  DossierSource,
  ResearchAccountsFlags,
  ResearchAccountsOutput,
  ResearchedAccount,
  SearchLeadResult,
  StepInput,
  StepOutput,
  StepType,
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

const DEADLINE = Symbol("deadline");

/** Resolve com `DEADLINE` se `promise` nao terminar em `ms`. */
async function raceDeadline<T>(promise: Promise<T>, ms: number): Promise<T | typeof DEADLINE> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<typeof DEADLINE>((resolve) => {
        timer = setTimeout(() => resolve(DEADLINE), Math.max(0, ms));
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
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
  apifyCalls: number;
  openaiRelevanceCalls: number;
  /** Linhas efetivamente gravadas em `account_dossier_leads`. */
  leadsLinked: number;
}

export interface ResearchAccountsDeps {
  treg?: TregService;
  apify?: ApifyService;
  /** Relogio (ms) — injetavel nos testes de teto de tempo. */
  clock?: () => number;
}

// ==============================================
// STEP
// ==============================================

export class ResearchAccountsStep extends BaseStep {
  private readonly tenantId: string;
  private readonly treg: TregService;
  private readonly apify: ApifyService;
  private readonly clock: () => number;

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
  }

  /** Informativo: nao ha o que aprovar. O pipeline segue direto para o `create_campaign`. */
  override requiresPostApproval(): boolean {
    return false;
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
    const startedAt = this.clock();
    const flags: ResearchAccountsFlags = {};
    let accounts: ResearchedAccount[] = [];
    let state: RunState | null = null;

    try {
      const leads = ResearchAccountsStep.readLeads(input);
      const groups = ResearchAccountsStep.groupLeads(leads);

      if (groups.length === 0) {
        await this.sendMessage(input.executionId, "Pesquisa das contas pulada: nenhum lead para pesquisar. A campanha segue normalmente.", "text");
        return this.buildResult([], flags, null);
      }

      const lookup = await readServiceApiKey(this.tenantId, "treg");
      if (lookup.status !== "ok") {
        flags.tregUnavailable = lookup.status;
        accounts = groups.map((group) => this.skippedAccount(group, null, "treg_unavailable"));
        const reason =
          lookup.status === "missing"
            ? "a chave do Treg nao esta configurada em Configuracoes > Integracoes"
            : "nao foi possivel ler a chave do Treg (reconfigure em Configuracoes > Integracoes)";
        await this.sendMessage(input.executionId, `Pesquisa das contas pulada: ${reason}. A campanha segue normalmente.`, "text");
        return this.buildResult(accounts, flags, null);
      }

      const premium = input.briefing.premiumIcebreakers === true;
      const nowDate = new Date(startedAt);
      state = {
        executionId: input.executionId,
        tregKey: lookup.apiKey,
        apifyKey: premium ? await getServiceApiKeyOrNull(this.tenantId, "apify") : null,
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
        apifyCalls: 0,
        openaiRelevanceCalls: 0,
        leadsLinked: 0,
      };
      if (state.premium && state.apifyKey) {
        state.openaiKey = await getServiceApiKeyOrNull(this.tenantId, "openai");
        state.kbContext = await this.safeLoadKBContext();
      }

      await this.sendMessage(
        input.executionId,
        `Pesquisando ${plural(groups.length, "conta", "contas")} (site, noticias e vagas) para o dossie. Isso nao altera a campanha.`,
        "progress"
      );

      const { companies, completedAt } = await this.readSearchCompanies(input.executionId);
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
    } catch (error) {
      // Rede de seguranca: nenhuma excecao chega ao pipeline.
      console.error(
        `[ResearchAccountsStep] Excecao inesperada (execution=${input.executionId}); o step termina completed:`,
        errorMessage(error)
      );
      flags.unexpectedError = true;
    }

    const result = this.buildResult(accounts, flags, state);
    await this.sendMessage(input.executionId, ResearchAccountsStep.summaryText(result.data as unknown as ResearchAccountsOutput), "text");
    return result;
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

  /** Tempo (ms) ate o prazo duro do step. */
  private remainingMs(state: RunState): number {
    return state.startedAt + DOSSIER_CONFIG.hardDeadlineMs - this.clock();
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
      return await this.researchAccount(state, account);
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
    const reuse = await findReusableDossier(this.supabase, this.tenantId, domain, state.now);
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
      if (posts.facts.length > 0) {
        const inserted = await insertFacts(this.supabase, this.tenantId, dossierId, posts.facts);
        if (inserted.error) state.flags.persistFailed = true;
        else factsCount += posts.facts.length;
      }
      await this.link(state, dossierId, account);
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

    const saved = await saveDossier(this.supabase, {
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
    });
    if (saved.error) {
      console.error(`[ResearchAccountsStep] Falha ao gravar o dossie (dominio=${domain}):`, saved.error);
      state.flags.persistFailed = true;
    }
    if (saved.dossierId) await this.link(state, saved.dossierId, account);

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
    const linked = await linkLeads(this.supabase, {
      tenantId: this.tenantId,
      executionId: state.executionId,
      dossierId,
      leads: account.leads.map((lead) => ({ apolloId: lead.apolloId ?? null, email: lead.email ?? null })),
    });
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
   * acerta o custo real e loga 1 linha em `api_usage_logs`. Nunca lanca.
   */
  private async callTreg(
    state: RunState,
    endpoint: TregEndpointId,
    body: Record<string, unknown>,
    source: DossierSource | "domain",
    cost: { usd: number } | null
  ): Promise<TregOutcome> {
    const remaining = this.remainingMs(state);
    if (remaining < DOSSIER_CONFIG.minCallMs) {
      state.flags.timeBudgetExhausted = true;
      return { ok: false, reason: "timeout" };
    }
    const reserve = DOSSIER_CONFIG.maxCostUsdPerCall;
    if (!state.budget.tryReserve(reserve)) {
      state.flags.budgetExhausted = true;
      return { ok: false, reason: "budget" };
    }

    let costUsd = 0;
    try {
      const result = await this.treg.call(state.tregKey, endpoint, body, {
        maxCostUsd: reserve,
        idempotencyKey: buildIdempotencyKey(state.executionId, endpoint, body),
        meta: `feature=dossie-24-19,tenant=${this.tenantId},execution=${state.executionId}`,
        timeoutMs: Math.min(DOSSIER_CONFIG.callTimeoutMs, remaining),
      });
      costUsd = Math.max(0, result.costMicro) / 1_000_000;
      state.tregCalls++;
      state.tregUsd += costUsd;
      if (cost) cost.usd += costUsd;

      await logAgentUsage({
        tenantId: this.tenantId,
        executionId: state.executionId,
        stepType: "research_accounts",
        serviceName: "treg",
        requestType: endpoint,
        status: result.ok ? "success" : "failed",
        calls: 1,
        durationMs: result.durationMs,
        errorMessage: result.ok ? undefined : result.error,
        metadata: {
          costUsd,
          costMicro: result.costMicro,
          httpStatus: result.status,
          source,
        },
      });

      if (result.ok) return { ok: true, json: result.json };
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
      const remaining = this.remainingMs(state);
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
        const result = await raceDeadline(
          this.apify.fetchLinkedInPosts(apifyKey, linkedinUrl, DOSSIER_CONFIG.maxPostsPerLead),
          remaining
        );
        if (result === DEADLINE) {
          state.flags.timeBudgetExhausted = true;
          failure = failure ?? "timeout";
          await logAgentUsage({
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
        await logAgentUsage({
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
          continue;
        }
        posts = result.posts ?? [];
      } catch (error) {
        console.error("[ResearchAccountsStep] Falha no Apify:", errorMessage(error));
        failure = failure ?? "error";
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
        if (this.timeExceeded(state) || this.remainingMs(state) < DOSSIER_CONFIG.minCallMs) {
          state.flags.timeBudgetExhausted = true;
          failure = failure ?? "timeout";
          break;
        }
        if (state.kbContext && state.openaiKey && post.text.trim().length >= 10) {
          state.openaiRelevanceCalls++;
        }
        try {
          const classification = await classifyPostRelevance(
            post.text,
            post.postUrl,
            state.kbContext,
            state.openaiKey,
            this.supabase,
            this.tenantId
          );
          if (classification.isRelevant) relevant.push(post);
        } catch {
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
   * Reuso: so busca posts de leads que ainda NAO tem post no dossie (sem duplicar nem
   * cobrar de novo). Sem conseguir ler o que ja existe, nao busca posts.
   */
  private async collectPostsForReused(
    state: RunState,
    account: ResolvedAccount,
    dossierId: string
  ): Promise<SourceResult> {
    if (!state.premium || !state.apifyKey) return { facts: [] };
    const existing = await findPostLeadIdentifiers(this.supabase, this.tenantId, dossierId);
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
    return {
      success: true,
      data: output as unknown as Record<string, unknown>,
      cost: {
        treg_usd: Number((state?.tregUsd ?? 0).toFixed(6)),
        treg_calls: state?.tregCalls ?? 0,
        apify: state?.apifyCalls ?? 0,
        openai_relevance: state?.openaiRelevanceCalls ?? 0,
      },
    };
  }

  static summaryText(output: ResearchAccountsOutput): string {
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

  /** Mensagem no chat. Nunca lanca. */
  private async sendMessage(executionId: string, content: string, messageType: "progress" | "text"): Promise<void> {
    try {
      const { error } = await this.supabase.from("agent_messages").insert({
        execution_id: executionId,
        role: messageType === "progress" ? "system" : "agent",
        content,
        metadata: { stepNumber: this.stepNumber, messageType },
      });
      if (error) {
        console.error("[ResearchAccountsStep] Falha ao gravar mensagem:", error.message ?? error);
      }
    } catch (error) {
      console.error("[ResearchAccountsStep] Falha ao gravar mensagem:", errorMessage(error));
    }
  }
}
