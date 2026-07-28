/**
 * SearchCompaniesStep - Busca empresas por tecnologia via TheirStack
 * Story 17.1 - AC: #1, #3
 *
 * Resolves briefing parameters to TheirStack filters and executes search.
 */

import { BaseStep } from "./base-step";
import { TheirStackService } from "@/lib/services/theirstack";
import { diagnoseEmptyCompanySearch } from "@/lib/agent/empty-search-diagnosis";
import type { StepInput, StepOutput, StepType } from "@/types/agent";
import type { TheirStackSearchFilters } from "@/types/theirstack";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Story 22.14 (AC6): mensagem do autopilot quando a busca de empresas volta vazia.
 *
 * Sem gate para mostrar o diagnostico, seguir adiante com `companies: []` levava o
 * `search_leads` a lancar "Lista de empresas do step anterior e obrigatoria" — erro de
 * plumbing no lugar do motivo real. Sem acentos (convencao das strings do agente).
 */
export const EMPTY_COMPANY_SEARCH_MESSAGE =
  "A busca nao encontrou nenhuma empresa com esses filtros. Ajuste o briefing e tente novamente.";

// ==============================================
// STATIC MAPS
// ==============================================

const COUNTRY_MAP: Record<string, string> = {
  // Countries — PT-BR names
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
  // Brazilian cities & states — resolve to BR
  "sao paulo": "BR",
  "são paulo": "BR",
  "rio de janeiro": "BR",
  "belo horizonte": "BR",
  curitiba: "BR",
  "porto alegre": "BR",
  brasilia: "BR",
  "brasília": "BR",
  salvador: "BR",
  recife: "BR",
  fortaleza: "BR",
  florianopolis: "BR",
  "florianópolis": "BR",
  campinas: "BR",
  sp: "BR",
  rj: "BR",
  mg: "BR",
  pr: "BR",
  rs: "BR",
  sc: "BR",
  ba: "BR",
  df: "BR",
  // US cities
  "new york": "US",
  "san francisco": "US",
  "los angeles": "US",
  chicago: "US",
  miami: "US",
  austin: "US",
  seattle: "US",
  boston: "US",
  // UK cities
  london: "GB",
  londres: "GB",
};

/** Validate that a resolved value is a valid 2-letter ISO country code */
const ISO_CODE_REGEX = /^[A-Z]{2}$/;

const INDUSTRY_MAP: Record<string, number> = {
  saas: 5,
  fintech: 14,
  ecommerce: 6,
  healthtech: 11,
  edtech: 9,
  martech: 15,
  logistica: 18,
};

const MVP_LIMIT = 2;

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
    // Map known names/cities to ISO codes; if unknown, only use if already a valid 2-letter code
    let countryCodes: string[] | undefined;
    if (briefing.location) {
      const mapped = COUNTRY_MAP[briefing.location.toLowerCase()];
      if (mapped) {
        countryCodes = [mapped];
      } else if (ISO_CODE_REGEX.test(briefing.location.toUpperCase())) {
        countryCodes = [briefing.location.toUpperCase()];
      }
      // If neither mapped nor valid ISO code, skip filter (don't send invalid value)
    }

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

    const baseData = {
      companies: result.data,
      totalFound: result.metadata.total_companies,
      technologySlug: technologySlugs[0] ?? briefing.technology,
      filtersApplied: filters,
    };

    // Story 22.14 (AC1/AC5/AC6): 0 empresas deixa de ser um sucesso silencioso. Assim como
    // na busca de leads, o gatilho e a LISTA vazia — nunca `total_companies` (metadado da
    // API, que pode divergir da pagina devolvida).
    if (companiesCount === 0) {
      // Espelha `BaseStep.run`: sem modo guiado nao ha gate onde mostrar o diagnostico.
      if (input.mode !== "guided") {
        throw new Error(EMPTY_COMPANY_SEARCH_MESSAGE);
      }

      return {
        success: true,
        data: {
          ...baseData,
          emptyResult: true,
          emptyDiagnosis: diagnoseEmptyCompanySearch(briefing, { ...filters }),
        },
        cost,
      };
    }

    // 3.4 - Return StepOutput
    return {
      success: true,
      data: baseData,
      cost,
    };
  }
}
