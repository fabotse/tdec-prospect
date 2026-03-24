/**
 * theirStack Service
 * Story: 15.1 - Integracao theirStack: Configuracao, Teste e Credits
 *
 * theirStack API integration for technographic prospecting.
 * Uses GET /v0/billing/credit-balance for connection testing and credits.
 *
 * AC: #1 - API key stored encrypted via Supabase Vault
 * AC: #2 - testConnection validates key via credit-balance endpoint
 * AC: #3 - getCredits returns api_credits usage
 * AC: #4 - Portuguese error messages for invalid/expired keys
 */

import {
  ExternalService,
  ExternalServiceError,
  type TestConnectionResult,
} from "./base-service";
import type {
  TheirStackCreditsResponse,
  TheirStackCredits,
  CatalogKeywordsResponse,
  KeywordAggregated,
  CompanySearchResponse,
  CompanySearchRequest,
  TheirStackCompany,
  TechnologyFound,
  TheirStackSearchFilters,
} from "@/types/theirstack";

// ==============================================
// CONSTANTS
// ==============================================

const THEIRSTACK_API_BASE = "https://api.theirstack.com";
const THEIRSTACK_CREDITS_ENDPOINT = "/v0/billing/credit-balance";
const THEIRSTACK_CATALOG_KEYWORDS_ENDPOINT = "/v0/catalog/keywords";
const THEIRSTACK_COMPANIES_SEARCH_ENDPOINT = "/v1/companies/search";

// ==============================================
// ERROR MESSAGES (Portuguese)
// ==============================================

const THEIRSTACK_ERROR_MESSAGES = {
  INVALID_KEY: "API key do theirStack inválida ou expirada.",
  FORBIDDEN:
    "Acesso negado ao theirStack. Verifique as permissões da sua API key.",
  RATE_LIMITED:
    "Limite de requisições do theirStack atingido. Aguarde e tente novamente.",
  CREDITS_EXHAUSTED: "Credits API do theirStack esgotados.",
  TIMEOUT: "Tempo limite excedido ao conectar com theirStack. Tente novamente.",
  GENERIC: "Erro ao comunicar com theirStack. Tente novamente.",
};

// ==============================================
// THEIRSTACK SERVICE
// ==============================================

export class TheirStackService extends ExternalService {
  readonly name = "theirstack";

  /**
   * Handle and translate theirStack-specific errors
   * AC: #4 - Portuguese error messages
   */
  protected override handleError(error: unknown): ExternalServiceError {
    if (error instanceof ExternalServiceError) return error;

    // Detect 402 (credits exhausted) before delegating to base — base class doesn't handle 402
    const errorMessage = error instanceof Error ? error.message : "";
    if (errorMessage.includes("402")) {
      return new ExternalServiceError(
        this.name,
        402,
        THEIRSTACK_ERROR_MESSAGES.CREDITS_EXHAUSTED,
        error
      );
    }

    const baseError = super.handleError(error);

    const messageMap: Record<number, string | undefined> = {
      401: THEIRSTACK_ERROR_MESSAGES.INVALID_KEY,
      403: THEIRSTACK_ERROR_MESSAGES.FORBIDDEN,
      408: THEIRSTACK_ERROR_MESSAGES.TIMEOUT,
      429: THEIRSTACK_ERROR_MESSAGES.RATE_LIMITED,
    };

    return new ExternalServiceError(
      this.name,
      baseError.statusCode,
      messageMap[baseError.statusCode] ?? THEIRSTACK_ERROR_MESSAGES.GENERIC,
      baseError.details
    );
  }

  /**
   * Test connection to theirStack API
   * Uses GET /v0/billing/credit-balance — validates key + returns credits (cost: 0)
   * AC: #2 - testConnection validates key
   */
  async testConnection(apiKey: string): Promise<TestConnectionResult> {
    const start = Date.now();

    try {
      await this.request<TheirStackCreditsResponse>(
        `${THEIRSTACK_API_BASE}${THEIRSTACK_CREDITS_ENDPOINT}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
        }
      );

      return this.createSuccessResult(Date.now() - start);
    } catch (error) {
      if (error instanceof ExternalServiceError) {
        return this.createErrorResult(error);
      }

      return this.createErrorResult(this.handleError(error));
    }
  }

  /**
   * Search technology keywords with autocomplete
   * GET /v0/catalog/keywords?name_pattern=<query>&limit=<limit>&include_metadata=true
   * Cost: 0 credits (free)
   * AC: #1 - Autocomplete suggestions
   */
  async searchTechnologies(
    apiKey: string,
    query: string,
    limit = 15
  ): Promise<KeywordAggregated[]> {
    const params = new URLSearchParams({
      name_pattern: query,
      limit: String(limit),
      include_metadata: "true",
    });

    const response = await this.request<CatalogKeywordsResponse>(
      `${THEIRSTACK_API_BASE}${THEIRSTACK_CATALOG_KEYWORDS_ENDPOINT}?${params}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      }
    );

    const data = Array.isArray(response.data) ? response.data : [];

    return data.map((item) => ({
      name: typeof item.name === "string" ? item.name : "",
      slug: typeof item.slug === "string" ? item.slug : "",
      category: typeof item.category === "string" ? item.category : null,
      company_count:
        typeof item.company_count === "number" ? item.company_count : 0,
    }));
  }

  /**
   * Search companies by technology and filters
   * POST /v1/companies/search
   * Cost: 3 credits per company returned
   * AC: #3 - Company search with filters
   * AC: #4 - Error handling with retry (via base class)
   * AC: #5 - Credits/rate limit error messages
   */
  async searchCompanies(
    apiKey: string,
    filters: TheirStackSearchFilters
  ): Promise<CompanySearchResponse> {
    const body = this.mapFiltersToRequest(filters);

    const response = await this.request<CompanySearchResponse>(
      `${THEIRSTACK_API_BASE}${THEIRSTACK_COMPANIES_SEARCH_ENDPOINT}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }
    );

    return {
      metadata: {
        total_results:
          typeof response.metadata?.total_results === "number"
            ? response.metadata.total_results
            : 0,
        total_companies:
          typeof response.metadata?.total_companies === "number"
            ? response.metadata.total_companies
            : 0,
      },
      data: Array.isArray(response.data)
        ? response.data.map((company) => this.guardCompany(company))
        : [],
    };
  }

  /**
   * Map frontend camelCase filters to API snake_case request body
   * Task 2.4
   */
  private mapFiltersToRequest(
    filters: TheirStackSearchFilters
  ): CompanySearchRequest {
    const request: CompanySearchRequest = {
      company_technology_slug_or: filters.technologySlugs,
      include_total_results: true,
      limit: filters.limit ?? 10,
      page: filters.page ?? 0,
    };

    if (filters.countryCodes && filters.countryCodes.length > 0) {
      request.company_country_code_or = filters.countryCodes;
    }
    if (typeof filters.minEmployeeCount === "number") {
      request.min_employee_count = filters.minEmployeeCount;
    }
    if (typeof filters.maxEmployeeCount === "number") {
      request.max_employee_count = filters.maxEmployeeCount;
    }
    if (filters.industryIds && filters.industryIds.length > 0) {
      request.industry_id_or = filters.industryIds;
    }

    return request;
  }

  /**
   * typeof guards for all nullable company fields
   * Task 2.3
   */
  private guardCompany(company: TheirStackCompany): TheirStackCompany {
    return {
      name: typeof company.name === "string" ? company.name : "",
      domain: typeof company.domain === "string" ? company.domain : "",
      url: typeof company.url === "string" ? company.url : null,
      country: typeof company.country === "string" ? company.country : null,
      country_code:
        typeof company.country_code === "string"
          ? company.country_code
          : null,
      city: typeof company.city === "string" ? company.city : null,
      industry: typeof company.industry === "string" ? company.industry : null,
      employee_count_range:
        typeof company.employee_count_range === "string"
          ? company.employee_count_range
          : null,
      apollo_id:
        typeof company.apollo_id === "string" ? company.apollo_id : null,
      annual_revenue_usd:
        typeof company.annual_revenue_usd === "number"
          ? company.annual_revenue_usd
          : null,
      founded_year:
        typeof company.founded_year === "number"
          ? company.founded_year
          : null,
      linkedin_url:
        typeof company.linkedin_url === "string"
          ? company.linkedin_url
          : null,
      technologies_found: Array.isArray(company.technologies_found)
        ? company.technologies_found.map((tf) => this.guardTechnologyFound(tf))
        : [],
      has_blurred_data:
        typeof company.has_blurred_data === "boolean"
          ? company.has_blurred_data
          : false,
    };
  }

  /**
   * typeof guards for TechnologyFound fields
   */
  private guardTechnologyFound(tf: TechnologyFound): TechnologyFound {
    const validConfidences = ["high", "medium", "low"] as const;
    const confidence =
      typeof tf.confidence === "string" &&
      validConfidences.includes(tf.confidence as (typeof validConfidences)[number])
        ? (tf.confidence as TechnologyFound["confidence"])
        : "low";

    return {
      technology: {
        name:
          typeof tf.technology?.name === "string" ? tf.technology.name : "",
        slug:
          typeof tf.technology?.slug === "string" ? tf.technology.slug : "",
      },
      confidence,
      theirstack_score:
        typeof tf.theirstack_score === "number" ? tf.theirstack_score : 0,
    };
  }

  /**
   * Get credit balance from theirStack
   * AC: #3 - Returns apiCredits usage with typeof guards
   */
  async getCredits(apiKey: string): Promise<TheirStackCredits> {
    const response = await this.request<TheirStackCreditsResponse>(
      `${THEIRSTACK_API_BASE}${THEIRSTACK_CREDITS_ENDPOINT}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      }
    );

    // typeof guards — ensure all fields are numbers (spike lesson from Epic 14)
    const apiCredits =
      typeof response.api_credits === "number" ? response.api_credits : 0;
    const usedApiCredits =
      typeof response.used_api_credits === "number"
        ? response.used_api_credits
        : 0;
    const uiCredits =
      typeof response.ui_credits === "number" ? response.ui_credits : 0;
    const usedUiCredits =
      typeof response.used_ui_credits === "number"
        ? response.used_ui_credits
        : 0;

    return {
      apiCredits,
      usedApiCredits,
      uiCredits,
      usedUiCredits,
    };
  }
}
