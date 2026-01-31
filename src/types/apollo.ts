/**
 * Apollo API Types
 * Story: 3.2 - Apollo API Integration Service
 * Story: 3.2.1 - People Enrichment Integration
 *
 * Types for Apollo.io API integration for lead search and enrichment.
 * AC: #6 - Filter and response type definitions
 */

import type { LeadRow } from "./lead";

// ==============================================
// FRONTEND FILTER FORMAT (camelCase)
// ==============================================

/**
 * Search filters in frontend format (camelCase)
 * Used by React components and hooks
 * Story 3.5.1: Added contactEmailStatuses for email status filter
 */
export interface ApolloSearchFilters {
  industries?: string[];
  companySizes?: string[]; // e.g., ["11-50", "51-200"]
  locations?: string[]; // e.g., ["Sao Paulo, Brazil"]
  titles?: string[]; // e.g., ["CEO", "CTO"]
  keywords?: string;
  domains?: string[]; // Company domains
  contactEmailStatuses?: string[]; // e.g., ["verified", "likely to engage"]
  page?: number;
  perPage?: number;
}

// ==============================================
// APOLLO API FORMAT
// ==============================================

/**
 * Apollo API filter format
 * Maps to Apollo's /v1/mixed_people/search request body
 * Story 3.5.1: Added contact_email_status for email availability filter
 */
export interface ApolloAPIFilters {
  q_organization_domains?: string[];
  person_titles?: string[];
  person_locations?: string[];
  organization_locations?: string[];
  organization_num_employees_ranges?: string[];
  q_keywords?: string;
  contact_email_status?: string[]; // Story 3.5.1: e.g., ["verified", "likely to engage"]
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
 * Story 3.5.1: Added contactEmailStatuses mapping
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
  // Story 3.5.1: Add email status filter
  if (filters.contactEmailStatuses?.length) {
    apolloFilters.contact_email_status = filters.contactEmailStatuses;
  }

  return apolloFilters;
}

/**
 * Transform Apollo person to LeadRow format
 * AC: #6 - Returns leads in LeadRow format (snake_case)
 * Story 3.5.1: Added has_email, has_direct_phone mapping for availability indicators
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
    // Story 3.5.1: Map availability flags for contact indicators
    has_email: person.has_email,
    has_direct_phone: person.has_direct_phone,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

// ==============================================
// PEOPLE ENRICHMENT TYPES (Story 3.2.1)
// ==============================================

/**
 * Options for enrichment API calls
 * AC: #2, #3 - Email and phone enrichment options
 */
export interface EnrichmentOptions {
  revealPersonalEmails?: boolean;
  revealPhoneNumber?: boolean;
  webhookUrl?: string; // Required if revealPhoneNumber=true
}

/**
 * Request body for Apollo People Enrichment API
 * AC: #1, #2, #3 - Enrichment request parameters
 */
export interface ApolloEnrichmentRequest {
  id?: string; // Apollo person ID (preferred)
  first_name?: string;
  last_name?: string;
  email?: string;
  linkedin_url?: string;
  domain?: string;
  organization_name?: string;
  reveal_personal_emails?: boolean;
  reveal_phone_number?: boolean;
  webhook_url?: string;
}

/**
 * Employment history entry in enrichment response
 */
export interface ApolloEmployment {
  id: string;
  organization_name: string | null;
  title: string | null;
  start_date: string | null;
  end_date: string | null;
  current: boolean;
}

/**
 * Enriched person object from People Enrichment API
 * AC: #1 - Complete lead data (email, phone, full last_name)
 */
export interface ApolloEnrichedPerson {
  id: string;
  first_name: string;
  last_name: string; // FULL last name (not obfuscated)
  email: string | null;
  email_status: "verified" | "invalid" | null;
  title: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  linkedin_url: string | null;
  photo_url: string | null;
  employment_history: ApolloEmployment[];
  phone_numbers?: Array<{
    raw_number: string;
    sanitized_number: string;
    type: string;
  }>;
}

/**
 * Enriched organization data
 */
export interface ApolloEnrichedOrganization {
  id: string;
  name: string;
  domain: string | null;
  industry: string | null;
  estimated_num_employees: number | null;
}

/**
 * Waterfall status for async phone delivery
 * AC: #3 - Webhook-based phone delivery tracking
 */
export interface ApolloWaterfallStatus {
  status: "accepted" | "pending" | "completed";
  message: string;
}

/**
 * Response from Apollo People Enrichment API
 * AC: #1, #2, #3 - Complete enrichment response
 */
export interface ApolloEnrichmentResponse {
  person: ApolloEnrichedPerson | null;
  organization: ApolloEnrichedOrganization | null;
  waterfall?: ApolloWaterfallStatus;
}

/**
 * Request body for Apollo Bulk People Enrichment API
 * AC: #4 - Bulk enrichment up to 10 leads per call
 */
export interface ApolloBulkEnrichmentRequest {
  details: ApolloEnrichmentRequest[];
  reveal_personal_emails?: boolean;
  reveal_phone_number?: boolean;
  webhook_url?: string;
}

/**
 * Response from Apollo Bulk People Enrichment API
 * AC: #4 - Bulk enrichment response
 */
export interface ApolloBulkEnrichmentResponse {
  matches: ApolloEnrichmentResponse[];
  missing: number;
}

// ==============================================
// ENRICHMENT TRANSFORM FUNCTIONS (Story 3.2.1)
// ==============================================

/**
 * Transform enriched Apollo person to partial LeadRow update
 * AC: #1 - Updates lead with complete data (email, phone, last_name, location, industry)
 *
 * Returns only the fields that can be enriched, for partial updates
 */
export function transformEnrichmentToLead(
  enrichedPerson: ApolloEnrichedPerson,
  organization: ApolloEnrichedOrganization | null
): Partial<LeadRow> {
  // Build location from city, state, country
  let location: string | null = null;
  const locationParts = [
    enrichedPerson.city,
    enrichedPerson.state,
    enrichedPerson.country,
  ].filter(Boolean);
  if (locationParts.length > 0) {
    location = locationParts.join(", ");
  }

  // Get primary phone if available
  const phone = enrichedPerson.phone_numbers?.[0]?.sanitized_number ?? null;

  // Get employee count as company_size
  let companySize: string | null = null;
  if (organization?.estimated_num_employees) {
    const count = organization.estimated_num_employees;
    if (count <= 10) companySize = "1-10";
    else if (count <= 50) companySize = "11-50";
    else if (count <= 200) companySize = "51-200";
    else if (count <= 500) companySize = "201-500";
    else if (count <= 1000) companySize = "501-1000";
    else companySize = "1000+";
  }

  return {
    last_name: enrichedPerson.last_name,
    email: enrichedPerson.email,
    phone,
    linkedin_url: enrichedPerson.linkedin_url,
    location,
    title: enrichedPerson.title,
    company_name: organization?.name ?? null,
    company_size: companySize,
    industry: organization?.industry ?? null,
    updated_at: new Date().toISOString(),
  };
}
