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
const LEADS_PER_PAGE = 25;

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

    const service = new ApolloService(this.tenantId);
    let domains: string[] = [];

    if (isDirectEntry) {
      // Story 17.10: Direct entry — search open market by briefing filters
      const filters = {
        titles: jobTitles,
        perPage: LEADS_PER_PAGE,
        page: 1,
        ...(briefing.location ? { locations: [briefing.location] } : {}),
        ...(briefing.industry ? { industries: [briefing.industry] } : {}),
        ...(briefing.companySize ? { companySizes: [briefing.companySize] } : {}),
      };

      const result = await service.searchPeople(filters);
      return this.buildSearchOutput(result, jobTitles, []);
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

    const filters = {
      domains,
      titles: jobTitles,
      perPage: LEADS_PER_PAGE,
      page: 1,
    };

    const result = await service.searchPeople(filters);
    return this.buildSearchOutput(result, jobTitles, domains);
  }

  /**
   * Map Apollo result to StepOutput format.
   * Shared between normal flow and direct entry (Story 17.10).
   */
  private buildSearchOutput(
    result: { leads: LeadRow[]; pagination: { totalEntries: number } },
    jobTitles: string[],
    domainsSearched: string[]
  ): StepOutput {
    const leads: SearchLeadResult[] = result.leads.map((lead: LeadRow) => ({
      name: [lead.first_name, lead.last_name].filter(Boolean).join(" "),
      title: lead.title,
      companyName: lead.company_name,
      email: lead.email,
      linkedinUrl: lead.linkedin_url,
      apolloId: lead.apollo_id,
    }));

    return {
      success: true,
      data: { leads, totalFound: result.pagination.totalEntries, jobTitles, domainsSearched },
      cost: { apollo_search: leads.length * CREDITS_PER_LEAD },
    };
  }
}
