/**
 * Snov.io Service
 * Story: 2.3 - Integration Connection Testing
 * Story 7.3: Snov.io Integration Service - Gestão de Campanhas
 *
 * Snov.io API integration for email verification, list management, and prospect handling.
 * Uses OAuth 2.0 for authentication - requires client_id:client_secret format.
 * Provides: testConnection, createProspectList, addProspectToList, addProspectsToList,
 *           getUserCampaigns, getUserLists
 *
 * API Docs: https://snov.io/api
 */

import {
  ExternalService,
  ExternalServiceError,
  type TestConnectionResult,
} from "./base-service";
import type {
  SnovioTokenResponse,
  CreateListParams,
  CreateListResult,
  CreateListResponse,
  AddProspectParams,
  AddProspectResult,
  AddProspectRequest,
  AddProspectResponse,
  AddProspectsParams,
  AddProspectsResult,
  GetCampaignsParams,
  GetCampaignsResult,
  GetUserCampaignsResponse,
  GetListsParams,
  GetListsResult,
  GetUserListsResponse,
} from "@/types/snovio";

// ==============================================
// CONSTANTS
// ==============================================

const SNOVIO_API_BASE = "https://api.snov.io";
const SNOVIO_TOKEN_ENDPOINT = "/v1/oauth/access_token";
const SNOVIO_BALANCE_ENDPOINT = "/v1/get-balance";
const SNOVIO_ADD_LIST_ENDPOINT = "/v1/add-list";
const SNOVIO_ADD_PROSPECT_ENDPOINT = "/v1/add-prospect-to-list";
const SNOVIO_GET_CAMPAIGNS_ENDPOINT = "/v1/get-user-campaigns";
const SNOVIO_GET_LISTS_ENDPOINT = "/v1/get-user-lists";

export const RATE_LIMIT_DELAY_MS = 1100;
const TOKEN_SAFETY_MARGIN_MS = 5 * 60 * 1000; // 5 minutes

// ==============================================
// HELPERS
// ==============================================

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ==============================================
// SNOVIO SERVICE
// ==============================================

/**
 * Snov.io API service
 * Used for email verification, list management, and prospect handling
 *
 * Authentication: OAuth 2.0 client_credentials flow
 * - User provides credentials in format: client_id:client_secret
 * - Service exchanges for access token (cached 1h, renews proactively at < 5 min)
 * - Token used in body or query params depending on endpoint
 */
export class SnovioService extends ExternalService {
  readonly name = "snovio";

  private cachedToken: { token: string; expiresAt: number; credentials: string } | null = null;

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
   * Create a prospect list in Snov.io
   * Story 7.3: AC #2
   *
   * @param params - Credentials and list name
   * @returns List ID and name
   */
  async createProspectList(params: CreateListParams): Promise<CreateListResult> {
    return this.withTokenRetry(params.credentials, async (accessToken) => {
      const response = await this.request<CreateListResponse>(
        `${SNOVIO_API_BASE}${SNOVIO_ADD_LIST_ENDPOINT}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            access_token: accessToken,
            name: params.name,
          }),
        }
      );

      return {
        listId: response.id,
        name: response.name,
      };
    });
  }

  /**
   * Add a single prospect to a Snov.io list
   * Story 7.3: AC #3a
   *
   * Maps internal lead fields to Snov.io format:
   * - title → position (native Snov.io field)
   * - phone → phones[] (array)
   * - icebreaker → customFields[ice_breaker] (bracket notation)
   *
   * @param params - Credentials, list ID, and lead data
   * @returns Success/added/updated flags
   */
  async addProspectToList(params: AddProspectParams): Promise<AddProspectResult> {
    return this.withTokenRetry(params.credentials, async (accessToken) => {
      const { lead } = params;

      const requestBody: AddProspectRequest = {
        access_token: accessToken,
        email: lead.email,
        listId: params.listId,
        updateContact: true,
      };

      if (lead.firstName) requestBody.firstName = lead.firstName;
      if (lead.lastName) requestBody.lastName = lead.lastName;
      if (lead.companyName) requestBody.companyName = lead.companyName;
      if (lead.title) requestBody.position = lead.title;
      if (lead.phone) requestBody.phones = [lead.phone];
      if (lead.icebreaker) requestBody["customFields[ice_breaker]"] = lead.icebreaker;

      const response = await this.request<AddProspectResponse>(
        `${SNOVIO_API_BASE}${SNOVIO_ADD_PROSPECT_ENDPOINT}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        }
      );

      return {
        success: response.success,
        added: response.added,
        updated: response.updated,
      };
    });
  }

  /**
   * Add multiple prospects to a Snov.io list sequentially
   * Story 7.3: AC #3b
   *
   * Processes 1 prospect per request with 1100ms delay (60 req/min rate limit).
   * Filters leads without email. Continues on individual errors (except fatal 401/network).
   *
   * @param params - Credentials, list ID, and leads array
   * @returns Aggregated results: added, updated, errors, totalProcessed
   */
  async addProspectsToList(params: AddProspectsParams): Promise<AddProspectsResult> {
    const { credentials, listId, leads } = params;

    // Filter leads without email
    const validLeads = leads.filter((lead) => lead.email);

    let added = 0;
    let updated = 0;
    let errors = 0;
    let totalProcessed = 0;

    for (let i = 0; i < validLeads.length; i++) {
      if (i > 0) {
        await delay(RATE_LIMIT_DELAY_MS);
      }

      try {
        const result = await this.addProspectToList({
          credentials,
          listId,
          lead: validLeads[i],
        });

        // Note: with updateContact=true, Snov.io returns added OR updated as true
        // totalProcessed counts all processed (may differ from added+updated+errors)
        totalProcessed++;
        if (result.added) added++;
        if (result.updated) updated++;
      } catch (error) {
        // Fatal errors: 401 (auth), network — stop and report partial
        if (error instanceof ExternalServiceError) {
          if (error.statusCode === 401 || error.statusCode === 0) {
            throw new ExternalServiceError(
              error.serviceName,
              error.statusCode,
              error.message,
              {
                partialResults: { added, updated, errors, totalProcessed },
                processedBeforeFailure: i,
                totalLeads: validLeads.length,
              }
            );
          }
        }

        // Non-fatal: count error and continue
        errors++;
        totalProcessed++;
      }
    }

    return { added, updated, errors, totalProcessed };
  }

  /**
   * Get user campaigns from Snov.io
   * Story 7.3: AC #4
   *
   * @param params - Credentials
   * @returns List of campaigns with id, title, status
   */
  async getUserCampaigns(params: GetCampaignsParams): Promise<GetCampaignsResult> {
    return this.withTokenRetry(params.credentials, async (accessToken) => {
      const response = await this.request<GetUserCampaignsResponse>(
        `${SNOVIO_API_BASE}${SNOVIO_GET_CAMPAIGNS_ENDPOINT}?access_token=${encodeURIComponent(accessToken)}`,
        {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        }
      );

      return {
        campaigns: response.data.map((c) => ({
          id: c.id,
          title: c.title,
          status: c.status,
        })),
      };
    });
  }

  /**
   * Get user prospect lists from Snov.io
   * Story 7.3: AC #5
   *
   * @param params - Credentials
   * @returns List of prospect lists with id, name, contacts count
   */
  async getUserLists(params: GetListsParams): Promise<GetListsResult> {
    return this.withTokenRetry(params.credentials, async (accessToken) => {
      const response = await this.request<GetUserListsResponse>(
        `${SNOVIO_API_BASE}${SNOVIO_GET_LISTS_ENDPOINT}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      return {
        lists: response.data.map((l) => ({
          id: l.id,
          name: l.name,
          contacts: l.contacts,
        })),
      };
    });
  }

  // ==============================================
  // PRIVATE: CREDENTIALS & TOKEN MANAGEMENT
  // ==============================================

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
   * Get cached token or refresh if expired/near-expiry
   * Story 7.3: AC #1 — token caching with proactive renewal
   *
   * @param credentials - client_id:client_secret format
   * @returns Valid access token
   */
  private async getOrRefreshToken(credentials: string): Promise<string> {
    const [clientId, clientSecret] = this.parseCredentials(credentials);

    if (!clientId || !clientSecret) {
      throw new ExternalServiceError(
        this.name,
        400,
        "Formato inválido. Use: client_id:client_secret"
      );
    }

    // Return cached token if still valid (with safety margin) and same credentials
    if (
      this.cachedToken &&
      this.cachedToken.credentials === credentials &&
      Date.now() < this.cachedToken.expiresAt - TOKEN_SAFETY_MARGIN_MS
    ) {
      return this.cachedToken.token;
    }

    // Get new token
    const token = await this.getAccessToken(clientId, clientSecret);

    // Cache with expiry (1 hour from now)
    this.cachedToken = {
      token,
      expiresAt: Date.now() + 3600 * 1000,
      credentials,
    };

    return token;
  }

  /**
   * Execute an operation with automatic 401 token retry
   * Story 7.3: AC #1 — renova o token se expirado (retry com novo token ao receber 401)
   *
   * On 401: invalidates cached token, gets fresh token, retries operation once
   */
  private async withTokenRetry<T>(
    credentials: string,
    operation: (accessToken: string) => Promise<T>
  ): Promise<T> {
    const accessToken = await this.getOrRefreshToken(credentials);
    try {
      return await operation(accessToken);
    } catch (error) {
      if (error instanceof ExternalServiceError && error.statusCode === 401) {
        this.cachedToken = null;
        const freshToken = await this.getOrRefreshToken(credentials);
        return await operation(freshToken);
      }
      throw error;
    }
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
// SNOVIO API TYPES (legacy — connection testing)
// ==============================================

interface SnovioBalanceResponse {
  success: boolean;
  data: {
    balance: number;
  };
}
