/**
 * SignalHire Service
 * Story: 2.3 - Integration Connection Testing
 *
 * SignalHire API integration for contact enrichment.
 * Uses /api/v1/credits endpoint for connection testing.
 *
 * API Docs: https://www.signalhire.com/api#Endpoints
 */

import {
  ExternalService,
  ExternalServiceError,
  type TestConnectionResult,
} from "./base-service";

// ==============================================
// CONSTANTS
// ==============================================

const SIGNALHIRE_API_BASE = "https://www.signalhire.com";
const SIGNALHIRE_CREDITS_ENDPOINT = "/api/v1/credits";

// ==============================================
// SIGNALHIRE SERVICE
// ==============================================

/**
 * SignalHire API service
 * Used for contact information enrichment
 */
export class SignalHireService extends ExternalService {
  readonly name = "signalhire";

  /**
   * Test connection to SignalHire API
   * Uses the credits endpoint to verify API key validity
   *
   * @param apiKey - SignalHire API key
   * @returns TestConnectionResult with success/failure and latency
   */
  async testConnection(apiKey: string): Promise<TestConnectionResult> {
    const start = Date.now();

    try {
      await this.request<SignalHireCreditsResponse>(
        `${SIGNALHIRE_API_BASE}${SIGNALHIRE_CREDITS_ENDPOINT}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            apikey: apiKey,
          },
        }
      );

      return this.createSuccessResult(Date.now() - start);
    } catch (error) {
      if (error instanceof ExternalServiceError) {
        return this.createErrorResult(error);
      }

      return this.createErrorResult(
        new Error("Erro desconhecido ao conectar com SignalHire")
      );
    }
  }
}

// ==============================================
// SIGNALHIRE API TYPES
// ==============================================

interface SignalHireCreditsResponse {
  credits: number;
}
