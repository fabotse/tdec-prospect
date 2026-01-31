/**
 * Apollo API Types
 * Story: 3.2 - Apollo API Integration Service
 *
 * Types for Apollo.io API integration for lead search.
 * AC: #6 - Filter and response type definitions
 */

import type { LeadRow } from "./lead";

// ==============================================
// FRONTEND FILTER FORMAT (camelCase)
// ==============================================

/**
 * Search filters in frontend format (camelCase)
 * Used by React components and hooks
 */
export interface ApolloSearchFilters {
  industries?: string[];
  companySizes?: string[]; // e.g., ["11-50", "51-200"]
  locations?: string[]; // e.g., ["Sao Paulo, Brazil"]
  titles?: string[]; // e.g., ["CEO", "CTO"]
  keywords?: string;
  domains?: string[]; // Company domains
  page?: number;
  perPage?: number;
}

// ==============================================
// APOLLO API FORMAT
// ==============================================

/**
 * Apollo API filter format
 * Maps to Apollo's /v1/mixed_people/search request body
 */
export interface ApolloAPIFilters {
  q_organization_domains?: string[];
  person_titles?: string[];
  person_locations?: string[];
  organization_locations?: string[];
  organization_num_employees_ranges?: string[];
  q_keywords?: string;
  page?: number;
  per_page?: number;
}

// ==============================================
// APOLLO API RESPONSE TYPES (api_search endpoint)
// ==============================================

/**
 * Organization info in Apollo api_search response
 * Note: api_search returns availability flags, not actual data
 */
export interface ApolloOrganization {
  name: string;
  has_industry: boolean;
  has_phone: boolean;
  has_city: boolean;
  has_state: boolean;
  has_country: boolean;
  has_zip_code: boolean;
  has_revenue: boolean;
  has_employee_count: boolean;
}

/**
 * Person object in Apollo api_search response
 * Note: api_search is optimized for prospecting and returns limited data
 * - last_name is obfuscated (e.g., "Hu***n")
 * - email/phone not returned (only has_email/has_direct_phone flags)
 * Use People Enrichment endpoint to get full contact details
 */
export interface ApolloPerson {
  id: string;
  first_name: string;
  last_name_obfuscated: string;
  title: string | null;
  last_refreshed_at: string;
  has_email: boolean;
  has_city: boolean;
  has_state: boolean;
  has_country: boolean;
  has_direct_phone: string; // "Yes" or "Maybe: please request..."
  organization?: ApolloOrganization;
}

/**
 * Apollo api_search response
 */
export interface ApolloSearchResponse {
  total_entries: number;
  people: ApolloPerson[];
}

// ==============================================
// TRANSFORM FUNCTIONS
// ==============================================

/**
 * Transform frontend filters to Apollo API format
 * AC: #6 - Transform frontend filters to Apollo API format
 *
 * Note: Currently ApolloService uses buildQueryString() internally for api_search endpoint.
 * This function is retained for:
 * 1. Type reference and documentation
 * 2. Future use with different Apollo endpoints that accept JSON body
 * 3. Unit testing filter transformation logic
 */
export function transformFiltersToApollo(
  filters: ApolloSearchFilters
): ApolloAPIFilters {
  const apolloFilters: ApolloAPIFilters = {
    page: filters.page ?? 1,
    per_page: filters.perPage ?? 25,
  };

  if (filters.domains?.length) {
    apolloFilters.q_organization_domains = filters.domains;
  }
  if (filters.titles?.length) {
    apolloFilters.person_titles = filters.titles;
  }
  if (filters.locations?.length) {
    apolloFilters.person_locations = filters.locations;
    apolloFilters.organization_locations = filters.locations;
  }
  if (filters.companySizes?.length) {
    // Transform "11-50" to "11,50" format for Apollo API
    apolloFilters.organization_num_employees_ranges = filters.companySizes.map(
      (size) => size.replace("-", ",")
    );
  }
  if (filters.keywords) {
    apolloFilters.q_keywords = filters.keywords;
  }

  return apolloFilters;
}

/**
 * Transform Apollo person to LeadRow format
 * AC: #6 - Returns leads in LeadRow format (snake_case)
 *
 * Note: api_search endpoint returns limited data for prospecting.
 * Fields like email, phone, full last_name require People Enrichment endpoint.
 * Availability flags (has_email, has_direct_phone) indicate if data can be enriched.
 */
export function transformApolloToLeadRow(
  person: ApolloPerson,
  tenantId: string
): LeadRow {
  return {
    id: crypto.randomUUID(),
    tenant_id: tenantId,
    apollo_id: person.id,
    first_name: person.first_name,
    // api_search returns obfuscated last name (e.g., "Hu***n")
    last_name: person.last_name_obfuscated,
    // api_search doesn't return email/phone - only availability flags
    // Use People Enrichment to get actual contact details
    email: null,
    phone: null,
    company_name: person.organization?.name ?? null,
    // api_search doesn't return employee count, only has_employee_count flag
    company_size: null,
    // api_search doesn't return industry, only has_industry flag
    industry: null,
    // api_search doesn't return location details, only has_city/state/country flags
    location: null,
    title: person.title ?? null,
    // api_search doesn't return linkedin_url
    linkedin_url: null,
    status: "novo",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}
