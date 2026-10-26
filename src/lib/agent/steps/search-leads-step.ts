/**
 * SearchLeadsStep - Busca leads (contatos) nas empresas via Apollo
 * Story 17.2 - AC: #1, #2, #3
 *
 * Extracts domains from previous step output (SearchCompaniesStep),
 * combines with briefing jobTitles, and searches Apollo for leads.
 */

import { BaseStep } from "./base-step";
import { ApolloService } from "@/lib/services/apollo";
import { getInjectableServiceApiKey } from "@/lib/agent/service-keys";
import {
  buildAccountSearchFilters,
  buildDirectSearchFilters,
  locationFiltersForScope,
  resolveLocationScope,
  resolveSearchLocations,
} from "@/lib/agent/search-defaults";
import {
  findContactedLeads,
  isReviewEligible,
  orderByScreening,
  screenLeads,
  summarizeScreening,
  suppressedLeadsMessage,
} from "@/lib/agent/lead-screening";
import {
  formatSuppressedAccountsShort,
  isAccountListMode,
  resolvedAccountDomains,
} from "@/lib/agent/target-accounts";
import {
  ALL_ACCOUNTS_SUPPRESSED_MESSAGE,
  findSuppressedAccounts,
  withAccountNames,
} from "@/lib/agent/account-suppression";
import { diagnoseEmptySearch } from "@/lib/agent/empty-search-diagnosis";
import {
  buildLookalikeExclusion,
  isLookalikeMode,
  similarityReason,
} from "@/lib/agent/reference-accounts";
import { readSuppressedDomains } from "@/lib/agent/reference-suppression";
import { resolveLeadCount, resolveLeadsPerPage } from "@/lib/agent/agent-pricing";
import { logAgentUsage } from "@/lib/agent/agent-usage";
import { scoreLeads, type ScoreLeadsResult } from "@/lib/agent/fit-scorer";
import { countFitGrades, sortByFitGrade, truncateFitReason } from "@/lib/agent/fit-score-rules";
import { readTenantICP } from "@/lib/agent/contextual-suggestions";
import { EMPTY_TENANT_ICP, type TenantICP } from "@/lib/agent/icp-briefing";
import type {
  StepInput,
  StepOutput,
  StepType,
  SearchLeadResult,
  ExecutionMode,
  ParsedBriefing,
  SuppressedAccount,
} from "@/types/agent";
import type { LeadRow } from "@/types/lead";
import type { SupabaseClient } from "@supabase/supabase-js";

// ==============================================
// CONSTANTS
// ==============================================

const CREDITS_PER_LEAD = 1;

/** Story 24.18: aviso quando clientes ou contas suprimidas sairam do resultado. */
export function lookalikeExcludedMessage(count: number): string {
  return `Removi da busca ${count} ${count === 1 ? "lead" : "leads"} de clientes ou contas suprimidas.`;
}

/** Story 24.15: mensagem quando o cargo exato trouxe pouco e a busca ampliou. */
export const SIMILAR_TITLES_FALLBACK_MESSAGE =
  "Poucos resultados com o cargo exato; ampliei para cargos parecidos.";

type PeopleSearchFilters = Parameters<ApolloService["searchPeople"]>[0];
type PeopleSearchResult = Awaited<ReturnType<ApolloService["searchPeople"]>>;

/**
 * Story 22.14 (AC6): mensagem do autopilot quando a busca volta vazia.
 *
 * No autopilot nao existe gate — nao ha onde mostrar o empty-state. Antes desta story o
 * step devolvia sucesso com `leads: []`, o `useAutoTrigger` disparava `create_campaign` e
 * a execucao morria com "Lista de leads do step anterior e obrigatoria...", um erro de
 * plumbing que nao dizia NADA ao usuario. Falhar aqui, com o motivo real, e o menor
 * movimento honesto: o orchestrator ja converte a excecao em `paused` + mensagem de erro.
 *
 * Sem acentos por convencao das strings do agente (ver 22.6).
 */
export const EMPTY_LEAD_SEARCH_MESSAGE =
  "A busca nao encontrou nenhum lead com esses filtros. Ajuste o briefing e tente novamente.";

// ==============================================
// UTILITY: Lead row mapping (exported for reuse in fetch-leads endpoint)
// ==============================================

export function mapLeadRowToSearchLeadResult(lead: LeadRow): SearchLeadResult {
  return {
    name: [lead.first_name, lead.last_name].filter(Boolean).join(" "),
    title: lead.title,
    companyName: lead.company_name,
    email: lead.email,
    linkedinUrl: lead.linkedin_url,
    apolloId: lead.apollo_id,
  };
}

// ==============================================
// SEARCH LEADS STEP
// ==============================================

export class SearchLeadsStep extends BaseStep {
  private readonly tenantId: string;

  constructor(stepNumber: number, supabase: SupabaseClient, tenantId: string) {
    super(stepNumber, "search_leads" as StepType, supabase);
    this.tenantId = tenantId;
  }

  /**
   * Execute lead search with dual flow:
   * - Normal: previousStepOutput with companies → search by domains
   * - Direct entry (Story 17.10): previousStepOutput undefined → search open market by briefing filters
   */
  protected async executeInternal(input: StepInput): Promise<StepOutput> {
    const { briefing, previousStepOutput } = input;

    // Validate jobTitles (required for both flows)
    if (!briefing.jobTitles || briefing.jobTitles.length === 0) {
      throw new Error("Cargos (jobTitles) sao obrigatorios para busca de leads");
    }

    const jobTitles = briefing.jobTitles;
    const titlesLabel = jobTitles.join(", ");
    const isDirectEntry = !previousStepOutput;
    // Story 24.17: modo lista de contas — vem ANTES dos ramos atuais.
    const accountListMode = isAccountListMode(briefing);
    // Story 24.18: modo contas parecidas (busca direta com o perfil dos clientes).
    const lookalikeMode = !accountListMode && isDirectEntry && isLookalikeMode(briefing);

    // Count active (non-skipped) steps for progress message
    const { data: allSteps } = await this.supabase
      .from("agent_steps")
      .select("status")
      .eq("execution_id", input.executionId);
    const activeSteps = allSteps?.filter((s) => s.status !== "skipped").length ?? 5;

    // Story 24.17: re-supressao sobre os dominios da lista (cobre contas vindas do chip).
    let accountDomains: string[] = [];
    let suppressedAccounts: SuppressedAccount[] = [];
    if (accountListMode) {
      const listDomains = resolvedAccountDomains(briefing.targetAccounts);
      const newlySuppressed = withAccountNames(
        await findSuppressedAccounts(this.supabase, this.tenantId, listDomains),
        briefing.targetAccounts
      );
      const suppressedDomains = new Set(newlySuppressed.map((a) => a.domain));
      accountDomains = listDomains.filter((d) => !suppressedDomains.has(d));

      const previous = (briefing.suppressedAccounts ?? []).filter(
        (a) => !suppressedDomains.has(a.domain)
      );
      suppressedAccounts = [...previous, ...newlySuppressed];

      if (newlySuppressed.length > 0) {
        await this.supabase.from("agent_messages").insert({
          execution_id: input.executionId,
          role: "system",
          content: `Removi da busca: ${formatSuppressedAccountsShort(newlySuppressed)}.`,
          metadata: { stepNumber: this.stepNumber, messageType: "text" },
        });
      }

      if (accountDomains.length === 0) {
        throw new Error(ALL_ACCOUNTS_SUPPRESSED_MESSAGE);
      }
    }

    // Send progress message
    if (accountListMode) {
      await this.supabase.from("agent_messages").insert({
        execution_id: input.executionId,
        role: "system",
        content: `Etapa ${this.stepNumber}/${activeSteps}: Buscando leads (${titlesLabel}) ${
          accountDomains.length === 1 ? "na 1 conta" : `nas ${accountDomains.length} contas`
        } da sua lista...`,
        metadata: { stepNumber: this.stepNumber, messageType: "progress" },
      });
    } else if (lookalikeMode) {
      await this.supabase.from("agent_messages").insert({
        execution_id: input.executionId,
        role: "system",
        content: `Etapa ${this.stepNumber}/${activeSteps}: Buscando leads (${titlesLabel}) em empresas parecidas com seus clientes...`,
        metadata: { stepNumber: this.stepNumber, messageType: "progress" },
      });
    } else if (isDirectEntry) {
      await this.supabase.from("agent_messages").insert({
        execution_id: input.executionId,
        role: "system",
        content: `Etapa ${this.stepNumber}/${activeSteps}: Buscando leads (${titlesLabel}) no mercado aberto...`,
        metadata: { stepNumber: this.stepNumber, messageType: "progress" },
      });
    } else {
      const prevCompanies = (previousStepOutput?.companies as Array<Record<string, unknown>> | undefined) ?? [];
      await this.supabase.from("agent_messages").insert({
        execution_id: input.executionId,
        role: "system",
        content: `Etapa ${this.stepNumber}/${activeSteps}: Buscando leads (${titlesLabel}) nas ${prevCompanies.length} empresas...`,
        metadata: { stepNumber: this.stepNumber, messageType: "progress" },
      });
    }

    // Story 22.9: a chave do Apollo e lida via SERVICE-ROLE e injetada no service.
    // A leitura interna do ApolloService usa o client de sessao (RLS admin-only) —
    // sem isso, o step morre com "API key nao configurada" para um `sdr`. Chave
    // ausente -> `undefined` -> o service cai na leitura de hoje (mesmo erro de hoje);
    // chave presente mas nao decriptavel -> LANCA (nao vira "nao configurada").
    const apolloApiKey = await getInjectableServiceApiKey(this.tenantId, "apollo", "Apollo");
    const service = new ApolloService(this.tenantId, apolloApiKey);
    let domains: string[] = [];

    if (accountListMode) {
      // Story 24.17: busca por dominio nas contas restantes, com os cargos do briefing (ou do
      // ICP, ja resolvidos no parse). Porte, industria e local do ICP nao entram. Mesmo
      // universo da 24.16 e mesmo `buildSearchOutput` (Fit Score, ordem, corte do autopilot).
      const filters = {
        ...buildAccountSearchFilters(briefing, resolveLeadsPerPage(briefing)),
        domains: accountDomains,
      };
      const search = await this.searchWithTitleFallback(service, filters, briefing, input.executionId);
      return this.buildSearchOutput(
        search.result,
        jobTitles,
        accountDomains,
        search.filters,
        briefing,
        input.mode,
        input.executionId,
        { suppressedAccounts, ...search.extraData }
      );
    }

    if (isDirectEntry) {
      // Story 17.10: Direct entry — search open market by briefing filters.
      // Story 22.6 (FR12): aplica o piso de qualidade de tamanho de empresa quando o
      // usuario nao informou tamanho (companySizes SEMPRE presente na busca direta);
      // se informou, o valor dele sobrescreve totalmente (AC2). Fonte unica: search-defaults.
      // Story 22.14: os filtros vem do SSOT `buildDirectSearchFilters` — a contagem de
      // viabilidade pre-execucao (AC7) usa a MESMA funcao, so mudando o `perPage`.
      // Story 24.16: pagina = universo de 3-5x N (teto 100) — sem N, 25 (fonte unica em agent-pricing).
      const filters = buildDirectSearchFilters(briefing, resolveLeadsPerPage(briefing));

      const search = await this.searchWithTitleFallback(service, filters, briefing, input.executionId);
      if (lookalikeMode) {
        return this.buildLookalikeOutput(search, jobTitles, briefing, input.mode, input.executionId);
      }
      return this.buildSearchOutput(
        search.result,
        jobTitles,
        [],
        search.filters,
        briefing,
        input.mode,
        input.executionId,
        search.extraData
      );
    }

    // Normal flow: extract domains from previous step companies
    const companies = previousStepOutput.companies as
      | Array<{ domain?: string | null }>
      | undefined;

    if (!companies || !Array.isArray(companies) || companies.length === 0) {
      throw new Error(
        "Lista de empresas do step anterior e obrigatoria para busca de leads"
      );
    }

    domains = companies
      .map((c) => c.domain)
      .filter((d): d is string => Boolean(d));

    if (domains.length === 0) {
      throw new Error(
        "Nenhuma empresa com dominio valido encontrada no step anterior"
      );
    }

    const domainLocations = resolveSearchLocations(briefing).locations;
    const filters = {
      domains,
      titles: jobTitles,
      // Story 24.14: local do usuario, senao os do ICP (mesma fonte da busca direta).
      // Story 24.15: mesma regra de escopo da busca direta (sede da empresa por padrao).
      ...locationFiltersForScope(domainLocations, resolveLocationScope(briefing)),
      includeSimilarTitles: false,
      perPage: resolveLeadsPerPage(briefing),
      page: 1,
    };

    const search = await this.searchWithTitleFallback(service, filters, briefing, input.executionId);
    return this.buildSearchOutput(
      search.result,
      jobTitles,
      domains,
      search.filters,
      briefing,
      input.mode,
      input.executionId,
      search.extraData
    );
  }

  /**
   * Story 24.18: modo contas parecidas. Tira do resultado os leads dos clientes de referencia
   * e dos dominios da Lista de Supressao (casamento por nome — a `api_search` nao devolve o
   * dominio da empresa; leitura da lista fail-open), segue o `buildSearchOutput` de sempre e
   * prefixa a justificativa do Fit Score com a semelhanca.
   */
  private async buildLookalikeOutput(
    search: { result: PeopleSearchResult; filters: Record<string, unknown>; extraData: Record<string, unknown> },
    jobTitles: string[],
    briefing: ParsedBriefing,
    mode: ExecutionMode | undefined,
    executionId: string
  ): Promise<StepOutput> {
    const suppressedDomains = await readSuppressedDomains(this.supabase, this.tenantId);
    const isExcluded = buildLookalikeExclusion(briefing.referenceAccounts, suppressedDomains);
    const keptLeads = search.result.leads.filter((lead) => !isExcluded(lead.company_name));
    const excludedCount = search.result.leads.length - keptLeads.length;
    if (excludedCount > 0) {
      await this.supabase.from("agent_messages").insert({
        execution_id: executionId,
        role: "system",
        content: lookalikeExcludedMessage(excludedCount),
        metadata: { stepNumber: this.stepNumber, messageType: "text" },
      });
    }

    const similarity = similarityReason(briefing);
    const output = await this.buildSearchOutput(
      { ...search.result, leads: keptLeads },
      jobTitles,
      [],
      search.filters,
      briefing,
      mode,
      executionId,
      {
        ...search.extraData,
        lookalike: {
          references: briefing.referenceAccounts ?? [],
          similarity,
          excludedCount,
        },
      }
    );

    const leads = output.data.leads as SearchLeadResult[] | undefined;
    if (Array.isArray(leads)) {
      output.data.leads = leads.map((lead) => ({
        ...lead,
        fitReason: truncateFitReason(
          lead.fitReason ? `${similarity}; ${lead.fitReason}` : similarity
        ),
      }));
    }
    return output;
  }

  /**
   * Story 24.15: cargo exato primeiro (`includeSimilarTitles: false`). Se voltar menos leads
   * que N (ou nenhum, sem N), refaz UMA vez com cargos parecidos. Os filtros devolvidos sao
   * os efetivos (os da 2a chamada quando ampliou), para o "Buscar mais" seguir igual.
   */
  private async searchWithTitleFallback<F extends PeopleSearchFilters>(
    service: ApolloService,
    filters: F,
    briefing: ParsedBriefing,
    executionId: string
  ): Promise<{ result: PeopleSearchResult; filters: F; extraData: Record<string, unknown> }> {
    const exactFilters = { ...filters, includeSimilarTitles: false };
    const exact = await this.searchPeopleLogged(service, exactFilters, executionId);
    // A pagina e limitada por perPage (<= 100) e N pode ir a 500: pagina cheia nao amplia.
    const threshold = Math.min(resolveLeadCount(briefing) ?? 1, filters.perPage ?? Infinity);
    if (exact.leads.length >= threshold) {
      return { result: exact, filters: exactFilters, extraData: {} };
    }

    const broadFilters = { ...filters, includeSimilarTitles: true };
    const broad = await this.searchPeopleLogged(service, broadFilters, executionId);
    await this.supabase.from("agent_messages").insert({
      execution_id: executionId,
      role: "system",
      content: SIMILAR_TITLES_FALLBACK_MESSAGE,
      metadata: { stepNumber: this.stepNumber, messageType: "text" },
    });
    return { result: broad, filters: broadFilters, extraData: { similarTitlesFallback: true } };
  }

  /**
   * Story 24.10: `searchPeople` + 1 linha `people_search` em `api_usage_logs` (a busca
   * nao consome credito; o log e para rastrear o volume). O log nunca lanca e a chamada
   * em si nao muda.
   */
  private async searchPeopleLogged(
    service: ApolloService,
    filters: PeopleSearchFilters,
    executionId: string
  ): Promise<PeopleSearchResult> {
    const start = Date.now();
    try {
      const result = await service.searchPeople(filters);
      await logAgentUsage({
        tenantId: this.tenantId,
        executionId,
        stepType: "search_leads",
        serviceName: "apollo",
        requestType: "people_search",
        status: "success",
        calls: 1,
        durationMs: Date.now() - start,
        metadata: { leads: result.leads.length },
      });
      return result;
    } catch (error) {
      await logAgentUsage({
        tenantId: this.tenantId,
        executionId,
        stepType: "search_leads",
        serviceName: "apollo",
        requestType: "people_search",
        status: "failed",
        calls: 1,
        durationMs: Date.now() - start,
        errorMessage: error instanceof Error ? error.message : "Erro Apollo",
      });
      throw error;
    }
  }

  /**
   * Map Apollo result to StepOutput format.
   * Shared between normal flow and direct entry (Story 17.10).
   * Story 22.14 - AC #1, #6: 0 leads deixa de ser um sucesso silencioso.
   */
  private async buildSearchOutput(
    result: { leads: LeadRow[]; pagination: { totalEntries: number } },
    jobTitles: string[],
    domainsSearched: string[],
    filters: Record<string, unknown>,
    briefing: ParsedBriefing,
    mode: ExecutionMode | undefined,
    executionId: string,
    // Story 24.17: campos extras do modo lista (ex.: `suppressedAccounts`), mesclados no `data`.
    extraData?: Record<string, unknown>
  ): Promise<StepOutput> {
    const mappedLeads: SearchLeadResult[] = result.leads.map((lead: LeadRow) => mapLeadRowToSearchLeadResult(lead));
    const totalFound = result.pagination.totalEntries;

    // Story 24.15: triagem antes do Fit Score — remove suprimidos e marca orgaos publicos e
    // ja contatados. Fail-open: leitura falha -> nada removido.
    const contactMap = await findContactedLeads(
      this.supabase,
      this.tenantId,
      mappedLeads.map((l) => l.apolloId)
    );
    const screened = screenLeads(mappedLeads, contactMap);
    const leads = screened.leads;
    const screenedRows = screened.keptIndexes.map((i) => result.leads[i]);
    const screening = summarizeScreening(leads, screened.suppressedCount);
    if (screened.suppressedCount > 0) {
      await this.supabase.from("agent_messages").insert({
        execution_id: executionId,
        role: "system",
        content: suppressedLeadsMessage(screened.suppressedCount),
        metadata: { stepNumber: this.stepNumber, messageType: "text" },
      });
    }

    // Story 22.14 (Trap #5): o gatilho e SEMPRE a lista vazia, nunca `totalFound === 0`.
    // `totalFound` vem de `pagination.totalEntries` e uma pagina alem do fim devolve
    // `leads: []` com total > 0 — o usuario continua sem nada na tela.
    if (leads.length === 0) {
      // Espelha a decisao de `BaseStep.run`: so o modo "guided" abre approval gate. Sem
      // gate nao existe empty-state para renderizar, entao a unica saida honesta e falhar.
      if (mode !== "guided") {
        throw new Error(EMPTY_LEAD_SEARCH_MESSAGE);
      }

      return {
        success: true,
        data: {
          leads,
          totalFound,
          jobTitles,
          domainsSearched,
          searchFilters: filters,
          // Consumidos pela BaseStep (mensagens honestas) e pelo card do chat
          // (empty-state + chips). JSONB no output do step: zero migration (NFR5).
          emptyResult: true,
          emptyDiagnosis: diagnoseEmptySearch(briefing, filters),
          screening,
          ...extraData,
        },
        cost: { apollo_search: 0 },
      };
    }

    // Story 24.16: Fit Score (regras + 1 chamada de LLM, fail-open). O score casa com o
    // `LeadRow` pelo indice, antes de qualquer reordenacao.
    const scoring = await this.scoreSearchLeads(screenedRows, briefing, executionId);
    // Story 24.15: elegiveis (A->B->C), depois ja contatados, depois orgaos publicos.
    const scoredLeads = orderByScreening(
      sortByFitGrade(
        leads.map((lead, i) => ({
          ...lead,
          fitScore: scoring.results[i].fitScore,
          fitReason: scoring.results[i].fitReason,
        }))
      )
    );

    // Story 24.13: N vai no output (o previewData do gate e o proprio data, entao a
    // revisao pre-seleciona N). Sem gate (modo != guided), o create_campaign enriquece
    // TODOS os leads do output — corta nos N primeiros para o custo bater com o pedido.
    // Story 24.16: o corte roda DEPOIS da ordenacao, entao leva os N melhores.
    // Story 24.15: sem gate, so os elegiveis seguem (orgaos publicos e ja contatados nao).
    const leadCount = resolveLeadCount(briefing);
    let outputLeads = scoredLeads;
    if (mode !== "guided") {
      const eligible = scoredLeads.filter(isReviewEligible);
      if (eligible.length === 0) {
        throw new Error(EMPTY_LEAD_SEARCH_MESSAGE);
      }
      outputLeads = leadCount !== null ? eligible.slice(0, leadCount) : eligible;
    }

    return {
      success: true,
      data: {
        leads: outputLeads,
        totalFound,
        jobTitles,
        domainsSearched,
        searchFilters: filters,
        leadCount,
        fitScoring: { source: scoring.source, counts: countFitGrades(outputLeads) },
        screening,
        ...extraData,
      },
      cost: {
        apollo_search: outputLeads.length * CREDITS_PER_LEAD,
        openai_fit_score: scoring.attempted ? 1 : 0,
      },
    };
  }

  /**
   * Story 24.16: le o ICP (service-role, fail-open) e a chave OpenAI do tenant e pontua
   * os leads. Erro de decrypt da chave -> so regras. Loga 1 linha `fit_score` quando a
   * chamada de LLM foi tentada. Nunca lanca.
   */
  private async scoreSearchLeads(
    leads: LeadRow[],
    briefing: ParsedBriefing,
    executionId: string
  ): Promise<ScoreLeadsResult> {
    let icp: TenantICP = EMPTY_TENANT_ICP;
    try {
      icp = await readTenantICP(this.tenantId);
    } catch (error) {
      console.warn("[search-leads] ICP indisponivel para o Fit Score:", error);
    }

    let apiKey: string | undefined;
    try {
      apiKey = await getInjectableServiceApiKey(this.tenantId, "openai", "OpenAI");
    } catch (error) {
      console.warn("[search-leads] chave OpenAI indisponivel, Fit Score so por regras:", error);
    }

    const scoring = await scoreLeads({
      leads,
      briefing,
      icp,
      apiKey,
      tenantId: this.tenantId,
      executionId,
    });

    if (scoring.attempted) {
      await logAgentUsage({
        tenantId: this.tenantId,
        executionId,
        stepType: "search_leads",
        serviceName: "openai",
        requestType: "fit_score",
        status: scoring.succeeded ? "success" : "failed",
        calls: 1,
        durationMs: scoring.usage.durationMs,
        errorMessage: scoring.usage.errorMessage,
        metadata: {
          model: scoring.usage.model,
          promptTokens: scoring.usage.promptTokens,
          completionTokens: scoring.usage.completionTokens,
          leads: leads.length,
          llmScored: scoring.usage.llmScored,
          fitSource: scoring.source,
        },
      });
    }

    return scoring;
  }
}
