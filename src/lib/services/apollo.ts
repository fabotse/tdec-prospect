/**
 * Apollo.io Service
 * Story: 2.3 - Integration Connection Testing
 *
 * Apollo API integration for lead enrichment and discovery.
 * Uses /v1/auth/health endpoint for connection testing.
 *
 * API Docs: https://docs.apollo.io/reference/authentication
 */

import {
  ExternalService,
  ExternalServiceError,
  type TestConnectionResult,
} from "./base-service";

// ==============================================
// CONSTANTS
// ==============================================

const APOLLO_API_BASE = "https://api.apollo.io";
const APOLLO_HEALTH_ENDPOINT = "/v1/auth/health";

// ==============================================
// APOLLO SERVICE
// ==============================================

/**
 * Apollo.io API service
 * Used for lead discovery and enrichment
 */
export class ApolloService extends ExternalService {
  readonly name = "apollo";

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
}

// ==============================================
// APOLLO API TYPES
// ==============================================

/**
 * Response from Apollo /v1/auth/health endpoint
 */
interface ApolloHealthResponse {
  is_logged_in: boolean;
}
