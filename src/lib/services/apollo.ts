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
import type { LeadRow } from "@/types/lead";
import type {
  ApolloSearchFilters,
  ApolloSearchResponse,
} from "@/types/apollo";
import { transformApolloToLeadRow } from "@/types/apollo";

// ==============================================
// CONSTANTS
// ==============================================

const APOLLO_API_BASE = "https://api.apollo.io";
const APOLLO_HEALTH_ENDPOINT = "/v1/auth/health";
const APOLLO_SEARCH_ENDPOINT = "/v1/mixed_people/api_search";

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
   * AC: #6 - Transforms filters and returns LeadRow format
   *
   * @param filters - Search filters in frontend format
   * @returns Array of leads in LeadRow format
   */
  async searchPeople(filters: ApolloSearchFilters): Promise<LeadRow[]> {
    const apiKey = await this.getApiKey();
    const queryString = this.buildQueryString(filters);

    const response = await this.request<ApolloSearchResponse>(
      `${APOLLO_API_BASE}${APOLLO_SEARCH_ENDPOINT}?${queryString}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache",
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

    return response.people.map((person) =>
      transformApolloToLeadRow(person, this.tenantId!)
    );
  }

  /**
   * Build query string for Apollo API
   * Apollo uses array notation: param[]=value1&param[]=value2
   */
  private buildQueryString(filters: ApolloSearchFilters): string {
    const params = new URLSearchParams();

    // Pagination
    params.append("page", String(filters.page ?? 1));
    params.append("per_page", String(filters.perPage ?? 25));

    // Array parameters use [] notation
    if (filters.titles?.length) {
      filters.titles.forEach((title) =>
        params.append("person_titles[]", title)
      );
    }

    if (filters.locations?.length) {
      filters.locations.forEach((loc) => {
        params.append("person_locations[]", loc);
        params.append("organization_locations[]", loc);
      });
    }

    if (filters.companySizes?.length) {
      // Transform "11-50" to "11,50" format
      filters.companySizes.forEach((size) =>
        params.append(
          "organization_num_employees_ranges[]",
          size.replace("-", ",")
        )
      );
    }

    if (filters.domains?.length) {
      filters.domains.forEach((domain) =>
        params.append("q_organization_domains_list[]", domain)
      );
    }

    if (filters.keywords) {
      params.append("q_keywords", filters.keywords);
    }

    return params.toString();
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
