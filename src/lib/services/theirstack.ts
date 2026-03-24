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
} from "@/types/theirstack";

// ==============================================
// CONSTANTS
// ==============================================

const THEIRSTACK_API_BASE = "https://api.theirstack.com";
const THEIRSTACK_CREDITS_ENDPOINT = "/v0/billing/credit-balance";

// ==============================================
// ERROR MESSAGES (Portuguese)
// ==============================================

const THEIRSTACK_ERROR_MESSAGES = {
  INVALID_KEY: "API key do theirStack inválida ou expirada.",
  FORBIDDEN:
    "Acesso negado ao theirStack. Verifique as permissões da sua API key.",
  RATE_LIMITED:
    "Limite de requisições do theirStack atingido. Aguarde e tente novamente.",
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
