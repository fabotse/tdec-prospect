/**
 * Apify Service
 * Story: 6.5.1 - Apify Integration Configuration
 *
 * Apify API integration for LinkedIn post extraction (icebreaker generation).
 * Uses /acts/{actorId} endpoint for connection testing.
 *
 * API Docs: https://docs.apify.com/api/v2
 */

import {
  ExternalService,
  ExternalServiceError,
  type TestConnectionResult,
} from "./base-service";

// ==============================================
// CONSTANTS
// ==============================================

const APIFY_API_BASE = "https://api.apify.com/v2";
const APIFY_LINKEDIN_ACTOR_ID = "Wpp1BZ6yGWjySadk3"; // supreme_coder/linkedin-post

// ==============================================
// APIFY SERVICE
// ==============================================

/**
 * Apify API service
 * Used for LinkedIn post extraction for icebreaker generation
 *
 * Authentication: Token parameter in query string or Bearer token
 */
export class ApifyService extends ExternalService {
  readonly name = "apify";

  /**
   * Test connection to Apify API
   * Uses the actor info endpoint to verify API token validity
   *
   * @param apiKey - Apify API token
   * @returns TestConnectionResult with success/failure and latency
   */
  async testConnection(apiKey: string): Promise<TestConnectionResult> {
    const start = Date.now();

    try {
      // Apify API uses token in query string
      const url = `${APIFY_API_BASE}/acts/${APIFY_LINKEDIN_ACTOR_ID}?token=${encodeURIComponent(apiKey)}`;

      await this.request<ApifyActorResponse>(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      return this.createSuccessResult(Date.now() - start);
    } catch (error) {
      if (error instanceof ExternalServiceError) {
        return this.createErrorResult(error);
      }

      return this.createErrorResult(
        new Error("Erro desconhecido ao conectar com Apify")
      );
    }
  }
}

// ==============================================
// APIFY API TYPES
// ==============================================

/**
 * Response from Apify Actor Info endpoint
 * Used for connection testing and will be reused in Story 6.5.2 for post fetching
 */
export interface ApifyActorResponse {
  data: {
    id: string;
    name: string;
    isPublic: boolean;
    title?: string;
    description?: string;
  };
}
