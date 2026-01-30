/**
 * Snov.io Service
 * Story: 2.3 - Integration Connection Testing
 *
 * Snov.io API integration for email verification and outreach.
 * Uses OAuth 2.0 for authentication - requires client_id:client_secret format.
 *
 * API Docs: https://snov.io/api#Authentification
 */

import {
  ExternalService,
  ExternalServiceError,
  type TestConnectionResult,
} from "./base-service";

// ==============================================
// CONSTANTS
// ==============================================

const SNOVIO_API_BASE = "https://api.snov.io";
const SNOVIO_TOKEN_ENDPOINT = "/v1/oauth/access_token";
const SNOVIO_BALANCE_ENDPOINT = "/v1/get-balance";

// ==============================================
// SNOVIO SERVICE
// ==============================================

/**
 * Snov.io API service
 * Used for email verification and outreach automation
 *
 * Authentication: OAuth 2.0 client_credentials flow
 * - User provides credentials in format: client_id:client_secret
 * - Service exchanges for access token
 * - Token used to verify connection via balance endpoint
 */
export class SnovioService extends ExternalService {
  readonly name = "snovio";

  /**
   * Test connection to Snov.io API
   * Credentials should be in format: client_id:client_secret
   *
   * @param credentials - Snov.io credentials (client_id:client_secret)
   * @returns TestConnectionResult with success/failure and latency
   */
  async testConnection(credentials: string): Promise<TestConnectionResult> {
    const start = Date.now();

    try {
      // Parse credentials - expect format: client_id:client_secret
      const [clientId, clientSecret] = this.parseCredentials(credentials);

      if (!clientId || !clientSecret) {
        throw new ExternalServiceError(
          this.name,
          400,
          "Formato inválido. Use: client_id:client_secret"
        );
      }

      // Step 1: Get access token via OAuth
      const accessToken = await this.getAccessToken(clientId, clientSecret);

      // Step 2: Verify token by calling balance endpoint
      await this.request<SnovioBalanceResponse>(
        `${SNOVIO_API_BASE}${SNOVIO_BALANCE_ENDPOINT}?access_token=${encodeURIComponent(accessToken)}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      return this.createSuccessResult(Date.now() - start);
    } catch (error) {
      if (error instanceof ExternalServiceError) {
        return this.createErrorResult(error);
      }

      return this.createErrorResult(
        new Error("Erro desconhecido ao conectar com Snov.io")
      );
    }
  }

  /**
   * Parse credentials in format client_id:client_secret
   */
  private parseCredentials(credentials: string): [string, string] | [null, null] {
    const separatorIndex = credentials.indexOf(":");
    if (separatorIndex === -1) {
      return [null, null];
    }

    const clientId = credentials.substring(0, separatorIndex);
    const clientSecret = credentials.substring(separatorIndex + 1);

    if (!clientId || !clientSecret) {
      return [null, null];
    }

    return [clientId, clientSecret];
  }

  /**
   * Exchange client credentials for access token
   */
  private async getAccessToken(
    clientId: string,
    clientSecret: string
  ): Promise<string> {
    const params = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    });

    const response = await this.request<SnovioTokenResponse>(
      `${SNOVIO_API_BASE}${SNOVIO_TOKEN_ENDPOINT}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      }
    );

    if (!response.access_token) {
      throw new ExternalServiceError(
        this.name,
        401,
        "Falha ao obter token de acesso. Verifique suas credenciais."
      );
    }

    return response.access_token;
  }
}

// ==============================================
// SNOVIO API TYPES
// ==============================================

interface SnovioTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface SnovioBalanceResponse {
  success: boolean;
  data: {
    balance: number;
  };
}
