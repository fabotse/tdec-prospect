/**
 * theirStack API Types
 * Story: 15.1 - Integracao theirStack: Configuracao, Teste e Credits
 * Story: 15.2 - Busca Technografica: Autocomplete e Filtros
 *
 * Types validated with real API calls (2026-03-24 spike).
 */

// ==============================================
// CREDIT BALANCE TYPES
// ==============================================

/**
 * Response from GET /v0/billing/credit-balance
 * Validated via spike — all fields are number.
 */
export interface TheirStackCreditsResponse {
  ui_credits: number;
  used_ui_credits: number;
  api_credits: number;
  used_api_credits: number;
}

/**
 * Parsed credits for internal use
 */
export interface TheirStackCredits {
  apiCredits: number;
  usedApiCredits: number;
  uiCredits: number;
  usedUiCredits: number;
}

// ==============================================
// CATALOG / KEYWORD TYPES (Story 15.2 - AC #1)
// ==============================================

/**
 * Single keyword from GET /v0/catalog/keywords
 * include_metadata=true returns company_count and category
 */
export interface KeywordAggregated {
  name: string;
  slug: string;
  category: string | null;
  company_count: number;
}

/**
 * Response from GET /v0/catalog/keywords?name_pattern=<query>&limit=15&include_metadata=true
 * Cost: 0 credits (free)
 */
export interface CatalogKeywordsResponse {
  data: KeywordAggregated[];
  metadata: {
    total_results: number;
    page: number;
    limit: number;
  };
}

// ==============================================
// COMPANY SEARCH TYPES (Story 15.2 - AC #2, #3)
// ==============================================

/**
 * Technology found in a company result
 * confidence is per-company, NOT filterable via API
 */
export interface TechnologyFound {
  technology: {
    name: string;
    slug: string;
  };
  confidence: "high" | "medium" | "low";
  theirstack_score: number;
}

/**
 * Single company from POST /v1/companies/search
 * Fields like country, city, apollo_id can be null — typeof guards required
 */
export interface TheirStackCompany {
  name: string;
  domain: string;
  url: string | null;
  country: string | null;
  country_code: string | null;
  city: string | null;
  industry: string | null;
  employee_count_range: string | null;
  apollo_id: string | null;
  annual_revenue_usd: number | null;
  founded_year: number | null;
  linkedin_url: string | null;
  technologies_found: TechnologyFound[];
  has_blurred_data: boolean;
}

/**
 * Request body for POST /v1/companies/search
 * Cost: 3 credits per company returned
 */
export interface CompanySearchRequest {
  company_technology_slug_or: string[];
  company_country_code_or?: string[];
  min_employee_count?: number;
  max_employee_count?: number;
  industry_id_or?: number[];
  limit?: number;
  page?: number;
  include_total_results: boolean;
}

/**
 * Response from POST /v1/companies/search
 */
export interface CompanySearchResponse {
  metadata: {
    total_results: number;
    total_companies: number;
  };
  data: TheirStackCompany[];
}

// ==============================================
// FRONTEND FILTER TYPES (Story 15.2 - AC #2)
// ==============================================

/**
 * Frontend-friendly filters (camelCase) for technographic search
 * Mapped to snake_case CompanySearchRequest before API call
 */
export interface TheirStackSearchFilters {
  technologySlugs: string[];
  countryCodes?: string[];
  minEmployeeCount?: number;
  maxEmployeeCount?: number;
  industryIds?: number[];
  page?: number;
  limit?: number;
}
