/**
 * Instantly Service
 * Story: 2.3 - Integration Connection Testing
 *
 * Instantly API V2 integration for email campaign automation.
 * Uses /api/v2/accounts endpoint for connection testing.
 *
 * API Docs: https://developer.instantly.ai/getting-started/authorization
 */

import {
  ExternalService,
  ExternalServiceError,
  type TestConnectionResult,
} from "./base-service";

// ==============================================
// CONSTANTS
// ==============================================

const INSTANTLY_API_BASE = "https://api.instantly.ai";
const INSTANTLY_ACCOUNTS_ENDPOINT = "/api/v2/accounts";

// ==============================================
// INSTANTLY SERVICE
// ==============================================

/**
 * Instantly API V2 service
 * Used for email campaign deployment and management
 *
 * Authentication: Bearer token in Authorization header
 * Note: V1 API is deprecated, using V2 with Bearer token
 */
export class InstantlyService extends ExternalService {
  readonly name = "instantly";

  /**
   * Test connection to Instantly API V2
   * Uses the accounts endpoint to verify API key validity
   *
   * @param apiKey - Instantly V2 API key
   * @returns TestConnectionResult with success/failure and latency
   */
  async testConnection(apiKey: string): Promise<TestConnectionResult> {
    const start = Date.now();

    try {
      // V2 API uses Bearer token authentication
      const url = `${INSTANTLY_API_BASE}${INSTANTLY_ACCOUNTS_ENDPOINT}?limit=1`;

      await this.request<InstantlyAccountsResponse>(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
      });

      return this.createSuccessResult(Date.now() - start);
    } catch (error) {
      if (error instanceof ExternalServiceError) {
        return this.createErrorResult(error);
      }

      return this.createErrorResult(
        new Error("Erro desconhecido ao conectar com Instantly")
      );
    }
  }
}

// ==============================================
// INSTANTLY API TYPES
// ==============================================

interface InstantlyAccount {
  email: string;
  first_name?: string;
  last_name?: string;
}

interface InstantlyAccountsResponse {
  items: InstantlyAccount[];
  total_count: number;
}
