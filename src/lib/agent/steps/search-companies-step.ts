/**
 * SearchCompaniesStep - Busca empresas por tecnologia via TheirStack
 * Story 17.1 - AC: #1, #3
 *
 * Resolves briefing parameters to TheirStack filters and executes search.
 */

import { BaseStep } from "./base-step";
import { TheirStackService } from "@/lib/services/theirstack";
import type { StepInput, StepOutput, StepType } from "@/types/agent";
import type { TheirStackSearchFilters } from "@/types/theirstack";
import type { SupabaseClient } from "@supabase/supabase-js";

// ==============================================
// STATIC MAPS
// ==============================================

const COUNTRY_MAP: Record<string, string> = {
  brasil: "BR",
  brazil: "BR",
  eua: "US",
  usa: "US",
  "estados unidos": "US",
  "united states": "US",
  portugal: "PT",
  "reino unido": "GB",
  uk: "GB",
  alemanha: "DE",
  germany: "DE",
  franca: "FR",
  france: "FR",
  canada: "CA",
  mexico: "MX",
  argentina: "AR",
  chile: "CL",
  colombia: "CO",
  india: "IN",
  australia: "AU",
  japao: "JP",
};

const INDUSTRY_MAP: Record<string, number> = {
  saas: 5,
  fintech: 14,
  ecommerce: 6,
  healthtech: 11,
  edtech: 9,
  martech: 15,
  logistica: 18,
};

const MVP_LIMIT = 50;

// ==============================================
// SEARCH COMPANIES STEP
// ==============================================

export class SearchCompaniesStep extends BaseStep {
  private readonly apiKey: string;

  constructor(stepNumber: number, supabase: SupabaseClient, apiKey: string) {
    super(stepNumber, "search_companies" as StepType, supabase);
    this.apiKey = apiKey;
  }

  /**
   * Execute company search:
   * 1. Validate input
   * 2. Resolve briefing -> TheirStack filters
   * 3. Call TheirStackService.searchCompanies
   * 4. Return StepOutput with companies, totalFound, technologySlug, filtersApplied
   * (3.1, 3.2, 3.3, 3.4, 3.5, 3.6)
   */
  protected async executeInternal(input: StepInput): Promise<StepOutput> {
    const { briefing } = input;

    // 3.6 - Validate input
    if (!briefing.technology) {
      throw new Error("Tecnologia e obrigatoria para busca de empresas");
    }

    const service = new TheirStackService();

    // 3.2 - Resolve technology -> slug
    const techs = await service.searchTechnologies(this.apiKey, briefing.technology);
    const technologySlugs = techs.length > 0 ? [techs[0].slug] : [];

    // 3.2 - Resolve location -> country code
    const countryCodes = briefing.location
      ? [COUNTRY_MAP[briefing.location.toLowerCase()] ?? briefing.location]
      : undefined;

    // 3.2 - Resolve company size -> min/max
    const sizeMatch = briefing.companySize?.match(/(\d+)\s*[-–a]\s*(\d+)/);
    const minEmployeeCount = sizeMatch ? parseInt(sizeMatch[1]) : undefined;
    const maxEmployeeCount = sizeMatch ? parseInt(sizeMatch[2]) : undefined;

    // 3.2 - Resolve industry -> industry ID
    const industryId = briefing.industry
      ? INDUSTRY_MAP[briefing.industry.toLowerCase()]
      : undefined;
    const industryIds = industryId ? [industryId] : undefined;

    // Build filters
    const filters: TheirStackSearchFilters = {
      technologySlugs,
      countryCodes,
      minEmployeeCount,
      maxEmployeeCount,
      industryIds,
      limit: MVP_LIMIT,
      page: 0,
    };

    // 3.3 - Call TheirStackService
    const result = await service.searchCompanies(this.apiKey, filters);

    // 3.5 - Calculate cost (3 credits per company)
    const CREDITS_PER_COMPANY = 3;
    const companiesCount = result.data.length;
    const cost = { theirstack_search: companiesCount * CREDITS_PER_COMPANY };

    // 3.4 - Return StepOutput
    return {
      success: true,
      data: {
        companies: result.data,
        totalFound: result.metadata.total_companies,
        technologySlug: technologySlugs[0] ?? briefing.technology,
        filtersApplied: filters,
      },
      cost,
    };
  }
}
