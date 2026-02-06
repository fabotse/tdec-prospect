/**
 * Apollo.io Service
 * Story: 2.3 - Integration Connection Testing
 * Story: 3.2 - Apollo API Integration Service
 *
 * Apollo API integration for lead enrichment and discovery.
 * Uses /v1/auth/health endpoint for connection testing.
 * Uses /v1/mixed_people/api_search for lead search (prospecting endpoint).
 *
 * AC: #1 - Retrieves and uses tenant's encrypted API key
 * AC: #3 - Timeout 10s, 1x retry on timeout/network error
 * AC: #4 - Portuguese error messages
 * AC: #5 - Follows ExternalService base class pattern
 * AC: #6 - searchPeople() returns LeadRow format
 *
 * API Docs: https://docs.apollo.io/reference/authentication
 */

import {
  ExternalService,
  ExternalServiceError,
  type TestConnectionResult,
} from "./base-service";
import { createClient } from "@/lib/supabase/server";
import { decryptApiKey } from "@/lib/crypto/encryption";
import type {
  ApolloSearchFilters,
  ApolloSearchResponse,
  ApolloSearchResult,
  EnrichmentOptions,
  ApolloEnrichmentRequest,
  ApolloEnrichmentResponse,
  ApolloBulkEnrichmentRequest,
  ApolloBulkEnrichmentResponse,
  ApolloEnrichedPerson,
} from "@/types/apollo";
import { transformApolloToLeadRow } from "@/types/apollo";

// ==============================================
// CONSTANTS
// ==============================================

const APOLLO_API_BASE = "https://api.apollo.io";
const APOLLO_HEALTH_ENDPOINT = "/v1/auth/health";
const APOLLO_SEARCH_ENDPOINT = "/v1/mixed_people/api_search";
const APOLLO_ENRICH_ENDPOINT = "/v1/people/match";
const APOLLO_BULK_ENRICH_ENDPOINT = "/v1/people/bulk_match";
const APOLLO_BULK_LIMIT = 10;
const APOLLO_MAX_PAGES = 500; // Story 3.8: Apollo API maximum pages limit

// ==============================================
// APOLLO ERROR MESSAGES (Portuguese)
// ==============================================

const APOLLO_ERROR_MESSAGES = {
  API_KEY_NOT_CONFIGURED:
    "API key do Apollo não configurada. Configure em Configurações > Integrações.",
  INVALID_KEY: "API key do Apollo inválida ou expirada.",
  FORBIDDEN:
    "Acesso negado ao Apollo. Verifique as permissões da sua API key.",
  RATE_LIMITED:
    "Limite de requisições do Apollo atingido. Tente novamente em alguns minutos.",
  TIMEOUT: "Tempo limite excedido ao conectar com Apollo. Tente novamente.",
  GENERIC: "Erro ao comunicar com Apollo. Tente novamente.",
  DECRYPT_ERROR: "Erro ao descriptografar API key. Reconfigure a chave.",
  // Enrichment-specific errors (Story 3.2.1)
  ENRICHMENT_NOT_FOUND: "Pessoa não encontrada no Apollo para enriquecimento.",
  ENRICHMENT_GDPR:
    "Email pessoal não disponível devido a regulamentações GDPR.",
  BULK_LIMIT_EXCEEDED:
    "Máximo de 10 leads por requisição de enriquecimento em lote.",
  WEBHOOK_REQUIRED: "Webhook URL obrigatória para obter telefone.",
  CREDITS_INSUFFICIENT: "Créditos insuficientes no Apollo para enriquecimento.",
};

// ==============================================
// APOLLO SERVICE
// ==============================================

/**
 * Apollo.io API service
 * Used for lead discovery and enrichment
 *
 * Story 3.2: Extended with searchPeople() and tenant-based API key retrieval
 */
export class ApolloService extends ExternalService {
  readonly name = "apollo";
  private apiKey: string | null = null;
  private tenantId: string | null = null;

  /**
   * Create a new ApolloService instance
   * @param tenantId - Optional tenant ID for API key retrieval
   */
  constructor(tenantId?: string) {
    super();
    this.tenantId = tenantId ?? null;
  }

  /**
   * Get API key from database for the tenant
   * AC: #1 - Retrieves tenant's encrypted API key from api_configs
   * AC: #1 - API key is decrypted server-side only
   */
  private async getApiKey(): Promise<string> {
    if (this.apiKey) return this.apiKey;

    if (!this.tenantId) {
      throw new ExternalServiceError(
        this.name,
        401,
        APOLLO_ERROR_MESSAGES.API_KEY_NOT_CONFIGURED
      );
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("api_configs")
      .select("encrypted_key")
      .eq("tenant_id", this.tenantId)
      .eq("service_name", "apollo")
      .single();

    if (error || !data) {
      throw new ExternalServiceError(
        this.name,
        401,
        APOLLO_ERROR_MESSAGES.API_KEY_NOT_CONFIGURED
      );
    }

    try {
      this.apiKey = decryptApiKey(data.encrypted_key);
      return this.apiKey;
    } catch {
      throw new ExternalServiceError(
        this.name,
        500,
        APOLLO_ERROR_MESSAGES.DECRYPT_ERROR
      );
    }
  }

  /**
   * Handle and translate Apollo-specific errors
   * AC: #4 - Portuguese error messages
   * AC: #5 - handleError() implementation
   */
  protected override handleError(error: unknown): ExternalServiceError {
    if (error instanceof ExternalServiceError) return error;

    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    // Map common errors to Portuguese messages
    if (errorMessage.includes("401")) {
      return new ExternalServiceError(
        this.name,
        401,
        APOLLO_ERROR_MESSAGES.INVALID_KEY,
        error
      );
    }
    if (errorMessage.includes("403")) {
      return new ExternalServiceError(
        this.name,
        403,
        APOLLO_ERROR_MESSAGES.FORBIDDEN,
        error
      );
    }
    if (errorMessage.includes("429")) {
      return new ExternalServiceError(
        this.name,
        429,
        APOLLO_ERROR_MESSAGES.RATE_LIMITED,
        error
      );
    }
    if (
      error instanceof Error &&
      (error.name === "AbortError" || errorMessage.includes("timeout"))
    ) {
      return new ExternalServiceError(
        this.name,
        408,
        APOLLO_ERROR_MESSAGES.TIMEOUT,
        error
      );
    }

    return new ExternalServiceError(
      this.name,
      500,
      APOLLO_ERROR_MESSAGES.GENERIC,
      error
    );
  }

  /**
   * Test connection to Apollo API
   * Uses the /v1/auth/health endpoint to verify API key validity
   *
   * @param apiKey - Apollo API key
   * @returns TestConnectionResult with success/failure and latency
   */
  async testConnection(apiKey: string): Promise<TestConnectionResult> {
    const start = Date.now();

    try {
      await this.request<ApolloHealthResponse>(
        `${APOLLO_API_BASE}${APOLLO_HEALTH_ENDPOINT}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-cache",
            "x-api-key": apiKey,
          },
        }
      );

      return this.createSuccessResult(Date.now() - start);
    } catch (error) {
      if (error instanceof ExternalServiceError) {
        return this.createErrorResult(error);
      }

      return this.createErrorResult(
        new Error("Erro desconhecido ao conectar com Apollo")
      );
    }
  }

  /**
   * Search for people using Apollo API
   * Story 3.8: Returns leads with pagination metadata
   * AC: #6 - Transforms filters and returns LeadRow format
   * AC: #4 - Respects Apollo API limits (100/page, 500 pages max)
   *
   * @param filters - Search filters in frontend format
   * @returns Object with leads array and pagination metadata
   */
  async searchPeople(filters: ApolloSearchFilters): Promise<ApolloSearchResult> {
    const apiKey = await this.getApiKey();
    const queryString = this.buildQueryString(filters);
    const url = `${APOLLO_API_BASE}${APOLLO_SEARCH_ENDPOINT}?${queryString}`;

    const response = await this.request<ApolloSearchResponse>(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache",
          accept: "application/json",
          "x-api-key": apiKey,
        },
      }
    );

    if (!this.tenantId) {
      throw new ExternalServiceError(
        this.name,
        500,
        "Tenant ID não configurado"
      );
    }

    const leads = response.people.map((person) =>
      transformApolloToLeadRow(person, this.tenantId!)
    );

    // Story 3.8: Calculate pagination metadata
    const page = filters.page ?? 1;
    const perPage = filters.perPage ?? 25;
    const totalEntries = response.total_entries;
    // Cap totalPages at APOLLO_MAX_PAGES (500) per Apollo API limits
    const calculatedPages = Math.ceil(totalEntries / perPage);
    const totalPages = Math.min(calculatedPages, APOLLO_MAX_PAGES);

    return {
      leads,
      pagination: {
        totalEntries,
        page,
        perPage,
        totalPages,
      },
    };
  }

  /**
   * Build query string for Apollo API with literal [] notation
   * Apollo requires literal [] in URL (NOT %5B%5D encoded)
   * Uses encodeURIComponent for values (%20 for spaces, %2C for commas)
   * Story 3.5.1: Added contact_email_status[] parameter
   */
  private buildQueryString(filters: ApolloSearchFilters): string {
    const parts: string[] = [];

    const addParam = (key: string, value: string) => {
      parts.push(`${key}=${encodeURIComponent(value)}`);
    };

    const addArrayParam = (key: string, values: string[]) => {
      values.forEach((v) => parts.push(`${key}[]=${encodeURIComponent(v)}`));
    };

    // Pagination
    addParam("page", String(filters.page ?? 1));
    addParam("per_page", String(filters.perPage ?? 25));

    if (filters.titles?.length) {
      addArrayParam("person_titles", filters.titles);
      addParam("include_similar_titles", "true");
    }

    if (filters.locations?.length) {
      addArrayParam("person_locations", filters.locations);
    }

    if (filters.companySizes?.length) {
      // Transform "11-50" to "11,50" format
      addArrayParam(
        "organization_num_employees_ranges",
        filters.companySizes.map((size) => size.replace("-", ","))
      );
    }

    if (filters.domains?.length) {
      addArrayParam("q_organization_domains_list", filters.domains);
    }

    // Keywords: combine user keywords with industries (Apollo doesn't have direct industry filter)
    const keywordParts: string[] = [];
    if (filters.keywords) {
      keywordParts.push(filters.keywords);
    }
    if (filters.industries?.length) {
      keywordParts.push(...filters.industries);
    }
    if (keywordParts.length > 0) {
      addParam("q_keywords", keywordParts.join(" "));
    }

    // Story 3.5.1: AC #4 - Email status filter
    if (filters.contactEmailStatuses?.length) {
      addArrayParam("contact_email_status", filters.contactEmailStatuses);
    }

    return parts.join("&");
  }

  // ==============================================
  // PEOPLE ENRICHMENT METHODS (Story 3.2.1)
  // ==============================================

  /**
   * Enrich a single person with complete data
   * AC: #1 - Calls People Enrichment API with apollo_id
   * AC: #2 - Handles reveal_personal_emails flag
   * AC: #3 - Handles reveal_phone_number flag and webhook_url
   *
   * @param apolloId - Apollo person ID from api_search
   * @param options - Enrichment options (emails, phone, webhook)
   * @returns Enriched person data or null if not found
   */
  async enrichPerson(
    apolloId: string,
    options?: EnrichmentOptions
  ): Promise<ApolloEnrichmentResponse> {
    const apiKey = await this.getApiKey();

    // Validate webhook requirement for phone
    if (options?.revealPhoneNumber && !options?.webhookUrl) {
      throw new ExternalServiceError(
        this.name,
        400,
        APOLLO_ERROR_MESSAGES.WEBHOOK_REQUIRED
      );
    }

    const body: ApolloEnrichmentRequest = {
      id: apolloId,
      reveal_personal_emails: options?.revealPersonalEmails ?? false,
      reveal_phone_number: options?.revealPhoneNumber ?? false,
    };

    if (options?.webhookUrl) {
      body.webhook_url = options.webhookUrl;
    }

    const response = await this.request<ApolloEnrichmentResponse>(
      `${APOLLO_API_BASE}${APOLLO_ENRICH_ENDPOINT}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache",
          "x-api-key": apiKey,
        },
        body: JSON.stringify(body),
      }
    );

    // Handle not found case
    if (!response.person) {
      throw new ExternalServiceError(
        this.name,
        404,
        APOLLO_ERROR_MESSAGES.ENRICHMENT_NOT_FOUND
      );
    }

    return response;
  }

  /**
   * Bulk enrich up to 10 people
   * AC: #4 - Up to 10 leads per API call, respects rate limits
   * AC: #6 - Follows ExternalService patterns
   *
   * @param apolloIds - Array of Apollo person IDs (max 10)
   * @param options - Enrichment options
   * @returns Array of enriched person data
   */
  async enrichPeople(
    apolloIds: string[],
    options?: EnrichmentOptions
  ): Promise<ApolloEnrichedPerson[]> {
    // Validate bulk limit
    if (apolloIds.length > APOLLO_BULK_LIMIT) {
      throw new ExternalServiceError(
        this.name,
        400,
        APOLLO_ERROR_MESSAGES.BULK_LIMIT_EXCEEDED
      );
    }

    if (apolloIds.length === 0) {
      return [];
    }

    // Validate webhook requirement for phone
    if (options?.revealPhoneNumber && !options?.webhookUrl) {
      throw new ExternalServiceError(
        this.name,
        400,
        APOLLO_ERROR_MESSAGES.WEBHOOK_REQUIRED
      );
    }

    const apiKey = await this.getApiKey();

    const body: ApolloBulkEnrichmentRequest = {
      details: apolloIds.map((id) => ({ id })),
      reveal_personal_emails: options?.revealPersonalEmails ?? false,
      reveal_phone_number: options?.revealPhoneNumber ?? false,
    };

    if (options?.webhookUrl) {
      body.webhook_url = options.webhookUrl;
    }

    const response = await this.request<ApolloBulkEnrichmentResponse>(
      `${APOLLO_API_BASE}${APOLLO_BULK_ENRICH_ENDPOINT}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache",
          "x-api-key": apiKey,
        },
        body: JSON.stringify(body),
      }
    );

    // Filter out null/undefined results and return only enriched persons
    return response.matches
      .filter((match) => match?.person != null)
      .map((match) => match.person!);
  }
}

// ==============================================
// APOLLO API TYPES (Internal)
// ==============================================

/**
 * Response from Apollo /v1/auth/health endpoint
 */
interface ApolloHealthResponse {
  is_logged_in: boolean;
}
