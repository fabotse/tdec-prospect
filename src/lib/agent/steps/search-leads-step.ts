/**
 * SearchLeadsStep - Busca leads (contatos) nas empresas via Apollo
 * Story 17.2 - AC: #1, #2, #3
 *
 * Extracts domains from previous step output (SearchCompaniesStep),
 * combines with briefing jobTitles, and searches Apollo for leads.
 */

import { BaseStep } from "./base-step";
import { ApolloService } from "@/lib/services/apollo";
import type {
  StepInput,
  StepOutput,
  StepType,
  SearchLeadResult,
} from "@/types/agent";
import type { LeadRow } from "@/types/lead";
import type { SupabaseClient } from "@supabase/supabase-js";

// ==============================================
// CONSTANTS
// ==============================================

const CREDITS_PER_LEAD = 1;

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
   * Execute lead search:
   * 1. Validate input (jobTitles + previousStepOutput with companies)
   * 2. Extract domains from previous step companies
   * 3. Build ApolloSearchFilters
   * 4. Call ApolloService.searchPeople()
   * 5. Transform LeadRow[] -> SearchLeadResult[]
   * 6. Calculate cost
   * 7. Return StepOutput
   * (2.1 - 2.10)
   */
  protected async executeInternal(input: StepInput): Promise<StepOutput> {
    const { briefing, previousStepOutput } = input;

    // AC #1 - Send progress message before execution
    const prevCompanies = (previousStepOutput?.companies as Array<Record<string, unknown>> | undefined) ?? [];
    const companiesCount = prevCompanies.length;
    const titlesLabel = briefing.jobTitles.join(", ");
    await this.supabase.from("agent_messages").insert({
      execution_id: input.executionId,
      role: "system",
      content: `Etapa ${this.stepNumber}/5: Buscando leads (${titlesLabel}) nas ${companiesCount} empresas...`,
      metadata: {
        stepNumber: this.stepNumber,
        messageType: "progress",
      },
    });

    // 2.5 - Validate input
    if (!briefing.jobTitles || briefing.jobTitles.length === 0) {
      throw new Error("Cargos (jobTitles) sao obrigatorios para busca de leads");
    }

    if (!previousStepOutput) {
      throw new Error("Output do step anterior e obrigatorio para busca de leads");
    }

    // 2.3 - Extract domains from previous step companies
    const companies = previousStepOutput.companies as
      | Array<{ domain?: string | null }>
      | undefined;

    if (!companies || !Array.isArray(companies) || companies.length === 0) {
      throw new Error(
        "Lista de empresas do step anterior e obrigatoria para busca de leads"
      );
    }

    const domains = companies
      .map((c) => c.domain)
      .filter((d): d is string => Boolean(d));

    if (domains.length === 0) {
      throw new Error(
        "Nenhuma empresa com dominio valido encontrada no step anterior"
      );
    }

    // 2.4 - Extract job titles from briefing
    const jobTitles = briefing.jobTitles;

    // 2.6 - Build ApolloSearchFilters
    const filters = {
      domains,
      titles: jobTitles,
      perPage: 25,
      page: 1,
    };

    // 2.7 - Call ApolloService.searchPeople()
    const service = new ApolloService(this.tenantId);
    const result = await service.searchPeople(filters);

    // 2.8 - Transform LeadRow[] -> SearchLeadResult[]
    const leads: SearchLeadResult[] = result.leads.map((lead: LeadRow) => ({
      name: [lead.first_name, lead.last_name].filter(Boolean).join(" "),
      title: lead.title,
      companyName: lead.company_name,
      email: lead.email,
      linkedinUrl: lead.linkedin_url,
      apolloId: lead.apollo_id,
    }));

    // 2.10 - Calculate cost (enrichment moved to CreateCampaignStep — only enrich approved leads)
    const cost = { apollo_search: leads.length * CREDITS_PER_LEAD };

    // 2.9 - Return StepOutput
    return {
      success: true,
      data: {
        leads,
        totalFound: result.pagination.totalEntries,
        jobTitles,
        domainsSearched: domains,
      },
      cost,
    };
  }
}
