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
import { buildDirectSearchFilters, resolveSearchLocations } from "@/lib/agent/search-defaults";
import { diagnoseEmptySearch } from "@/lib/agent/empty-search-diagnosis";
import { resolveLeadCount, resolveLeadsPerPage } from "@/lib/agent/agent-pricing";
import { logAgentUsage } from "@/lib/agent/agent-usage";
import { scoreLeads, type ScoreLeadsResult } from "@/lib/agent/fit-scorer";
import { countFitGrades, sortByFitGrade } from "@/lib/agent/fit-score-rules";
import { readTenantICP } from "@/lib/agent/contextual-suggestions";
import { EMPTY_TENANT_ICP, type TenantICP } from "@/lib/agent/icp-briefing";
import type {
  StepInput,
  StepOutput,
  StepType,
  SearchLeadResult,
  ExecutionMode,
  ParsedBriefing,
} from "@/types/agent";
import type { LeadRow } from "@/types/lead";
import type { SupabaseClient } from "@supabase/supabase-js";

// ==============================================
// CONSTANTS
// ==============================================

const CREDITS_PER_LEAD = 1;

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

    // Count active (non-skipped) steps for progress message
    const { data: allSteps } = await this.supabase
      .from("agent_steps")
      .select("status")
      .eq("execution_id", input.executionId);
    const activeSteps = allSteps?.filter((s) => s.status !== "skipped").length ?? 5;

    // Send progress message
    if (isDirectEntry) {
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

    if (isDirectEntry) {
      // Story 17.10: Direct entry — search open market by briefing filters.
      // Story 22.6 (FR12): aplica o piso de qualidade de tamanho de empresa quando o
      // usuario nao informou tamanho (companySizes SEMPRE presente na busca direta);
      // se informou, o valor dele sobrescreve totalmente (AC2). Fonte unica: search-defaults.
      // Story 22.14: os filtros vem do SSOT `buildDirectSearchFilters` — a contagem de
      // viabilidade pre-execucao (AC7) usa a MESMA funcao, so mudando o `perPage`.
      // Story 24.16: pagina = universo de 3-5x N (teto 100) — sem N, 25 (fonte unica em agent-pricing).
      const filters = buildDirectSearchFilters(briefing, resolveLeadsPerPage(briefing));

      const result = await this.searchPeopleLogged(service, filters, input.executionId);
      return this.buildSearchOutput(result, jobTitles, [], filters, briefing, input.mode, input.executionId);
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
      ...(domainLocations.length > 0 ? { locations: domainLocations } : {}),
      perPage: resolveLeadsPerPage(briefing),
      page: 1,
    };

    const result = await this.searchPeopleLogged(service, filters, input.executionId);
    return this.buildSearchOutput(
      result,
      jobTitles,
      domains,
      filters,
      briefing,
      input.mode,
      input.executionId
    );
  }

  /**
   * Story 24.10: `searchPeople` + 1 linha `people_search` em `api_usage_logs` (a busca
   * nao consome credito; o log e para rastrear o volume). O log nunca lanca e a chamada
   * em si nao muda.
   */
  private async searchPeopleLogged(
    service: ApolloService,
    filters: Parameters<ApolloService["searchPeople"]>[0],
    executionId: string
  ): Promise<Awaited<ReturnType<ApolloService["searchPeople"]>>> {
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
    executionId: string
  ): Promise<StepOutput> {
    const leads: SearchLeadResult[] = result.leads.map((lead: LeadRow) => mapLeadRowToSearchLeadResult(lead));
    const totalFound = result.pagination.totalEntries;

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
        },
        cost: { apollo_search: 0 },
      };
    }

    // Story 24.16: Fit Score (regras + 1 chamada de LLM, fail-open). O score casa com o
    // `LeadRow` pelo indice, antes de qualquer reordenacao.
    const scoring = await this.scoreSearchLeads(result.leads, briefing, executionId);
    const scoredLeads = sortByFitGrade(
      leads.map((lead, i) => ({
        ...lead,
        fitScore: scoring.results[i].fitScore,
        fitReason: scoring.results[i].fitReason,
      }))
    );

    // Story 24.13: N vai no output (o previewData do gate e o proprio data, entao a
    // revisao pre-seleciona N). Sem gate (modo != guided), o create_campaign enriquece
    // TODOS os leads do output — corta nos N primeiros para o custo bater com o pedido.
    // Story 24.16: o corte roda DEPOIS da ordenacao, entao leva os N melhores.
    const leadCount = resolveLeadCount(briefing);
    const outputLeads =
      mode !== "guided" && leadCount !== null ? scoredLeads.slice(0, leadCount) : scoredLeads;

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
