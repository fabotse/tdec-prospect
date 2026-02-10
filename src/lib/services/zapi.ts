/**
 * Z-API Integration Service
 * Story: 11.1 - Z-API Integration Service + Config
 *
 * Provides connection testing for Z-API WhatsApp messaging service.
 * Uses 3 credentials: Instance ID, Instance Token, Security Token.
 *
 * AC: #4 - testConnection with retry and timeout from ExternalService
 * AC: #6 - Credentials stored as JSON, parsed here
 */

import {
  ExternalService,
  ExternalServiceError,
  type TestConnectionResult,
} from "./base-service";

// ==============================================
// CONSTANTS
// ==============================================

const ZAPI_API_BASE = "https://api.z-api.io";

// ==============================================
// TYPES
// ==============================================

export interface ZApiCredentials {
  instanceId: string;
  instanceToken: string;
  securityToken: string;
}

/**
 * Result from Z-API send-text endpoint
 * Story 11.4 AC#1
 */
export interface ZApiSendResult {
  zaapId: string;
  messageId: string;
}

// ==============================================
// HELPERS
// ==============================================

/**
 * Parse Z-API credentials from JSON string
 * The credentials are stored as a JSON object in api_configs.encrypted_key
 *
 * @throws ExternalServiceError if JSON is invalid or fields are missing
 */
export function parseZApiCredentials(apiKey: string): ZApiCredentials {
  try {
    const parsed = JSON.parse(apiKey);
    const { instanceId, instanceToken, securityToken } = parsed;

    if (!instanceId || !instanceToken || !securityToken) {
      throw new Error("Missing required fields");
    }

    return { instanceId, instanceToken, securityToken };
  } catch (error) {
    if (error instanceof ExternalServiceError) {
      throw error;
    }
    throw new ExternalServiceError(
      "zapi",
      400,
      "Credenciais Z-API inválidas. Reconfigure a integração."
    );
  }
}

/**
 * Build Z-API URL with instance credentials in path
 */
export function buildZApiUrl(
  instanceId: string,
  instanceToken: string,
  path: string
): string {
  return `${ZAPI_API_BASE}/instances/${encodeURIComponent(instanceId)}/token/${encodeURIComponent(instanceToken)}${path}`;
}

/**
 * Build Z-API headers with security token
 */
export function buildZApiHeaders(
  securityToken: string
): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "Client-Token": securityToken,
  };
}

// ==============================================
// ZAPI SERVICE
// ==============================================

export class ZApiService extends ExternalService {
  readonly name = "zapi";

  /**
   * Send a text message via Z-API
   * Story 11.4 AC#1 — POST /send-text with phone + message
   * Uses delayTyping: 3 for natural typing simulation
   *
   * @throws ExternalServiceError on failure (Portuguese messages via base class)
   */
  async sendText(apiKey: string, phone: string, message: string): Promise<ZApiSendResult> {
    const { instanceId, instanceToken, securityToken } = parseZApiCredentials(apiKey);
    const url = buildZApiUrl(instanceId, instanceToken, "/send-text");

    return this.request<ZApiSendResult>(url, {
      method: "POST",
      headers: buildZApiHeaders(securityToken),
      body: JSON.stringify({ phone, message, delayTyping: 3 }),
    });
  }

  /**
   * Test connection to Z-API
   * Parses JSON credentials and makes a lightweight API call
   */
  async testConnection(apiKey: string): Promise<TestConnectionResult> {
    const start = Date.now();

    try {
      const { instanceId, instanceToken, securityToken } =
        parseZApiCredentials(apiKey);

      const url = buildZApiUrl(instanceId, instanceToken, "/status");

      await this.request(url, {
        method: "GET",
        headers: buildZApiHeaders(securityToken),
      });

      return this.createSuccessResult(Date.now() - start);
    } catch (error) {
      if (error instanceof ExternalServiceError) {
        return this.createErrorResult(error);
      }

      return this.createErrorResult(
        new Error("Erro desconhecido ao conectar com Z-API")
      );
    }
  }
}
