/**
 * SignalHire Service
 * Story: 2.3 - Integration Connection Testing
 * Story: 4.4 - SignalHire Integration Service
 * Story: 4.4.2 - SignalHire Callback Architecture
 *
 * SignalHire API integration for contact enrichment and phone lookup.
 *
 * ARQUITETURA CORRIGIDA (4.4.2):
 * - callbackUrl é OBRIGATÓRIO na API SignalHire
 * - Não existe modo de polling na API (código anterior estava errado)
 * - Fluxo: POST → SignalHire processa → callback para Edge Function → poll nossa DB
 *
 * AC 4.4.2 #3 - Iniciar Lookup com Callback URL
 * AC 4.4.2 #4 - Polling do Resultado (via signalhire_lookups table)
 *
 * API Docs: https://www.signalhire.com/api
 */

import {
  ExternalService,
  ExternalServiceError,
  type TestConnectionResult,
} from "./base-service";
import { createClient } from "@/lib/supabase/server";
import { decryptApiKey } from "@/lib/crypto/encryption";
import type {
  SignalHirePersonRequest,
  SignalHireLookupInitResponse,
  SignalHireLookupStatus,
  SignalHireLookupRow,
} from "@/types/signalhire";

// ==============================================
// CONSTANTS
// ==============================================

const SIGNALHIRE_API_BASE = "https://www.signalhire.com/api";
const SIGNALHIRE_PERSON_ENDPOINT = "/v1/candidate/search";
const SIGNALHIRE_CREDITS_ENDPOINT = "/v1/credits";
const API_KEY_HEADER = "apikey";

// Request configuration
const REQUEST_TIMEOUT_MS = 10000; // 10 seconds timeout (AC #4)
const MAX_RETRIES = 1; // 1 retry on timeout/network error (AC #4)

// ==============================================
// ERROR MESSAGES (Portuguese)
// ==============================================

const SIGNALHIRE_ERROR_MESSAGES = {
  API_KEY_NOT_CONFIGURED:
    "API key do SignalHire não configurada. Configure em Configurações > Integrações.",
  CALLBACK_URL_NOT_CONFIGURED:
    "URL de callback do SignalHire não configurada. Configure a variável SIGNALHIRE_CALLBACK_URL.",
  INVALID_KEY: "API key do SignalHire inválida ou expirada.",
  FORBIDDEN:
    "Acesso negado ao SignalHire. Verifique as permissões da sua API key.",
  NOT_FOUND: "Contato não encontrado no SignalHire.",
  LOOKUP_NOT_FOUND: "Lookup não encontrado.",
  RATE_LIMITED:
    "Limite de requisições do SignalHire atingido (600/min). Aguarde e tente novamente.",
  LIMIT_EXCEEDED: "Limite de 100 items por requisição excedido.",
  INVALID_REQUEST: "Parâmetros de requisição inválidos.",
  TIMEOUT:
    "Tempo limite excedido ao conectar com SignalHire. Tente novamente.",
  GENERIC: "Erro ao comunicar com SignalHire. Tente novamente.",
  DECRYPT_ERROR: "Erro ao descriptografar API key. Reconfigure a chave.",
  DB_INSERT_ERROR: "Erro ao criar registro de lookup.",
  DB_UPDATE_ERROR: "Erro ao atualizar registro de lookup.",
  CREDITS_EXHAUSTED: "Créditos do SignalHire esgotados.",
  API_USAGE_LIMITED:
    "Uso da API SignalHire limitado. Verifique seu plano ou entre em contato com o suporte SignalHire.",
  DUPLICATE_QUERY: "Esta consulta já foi feita recentemente.",
  PROCESSING_FAILED: "Falha no processamento da consulta no SignalHire.",
};

// ==============================================
// SIGNALHIRE SERVICE
// ==============================================

/**
 * SignalHire API service
 * Used for contact information enrichment and phone lookup
 *
 * Story 4.4.2: Refatorado para usar callback architecture
 *
 * FLUXO:
 * 1. lookupPhone() → cria registro em signalhire_lookups
 * 2. Envia POST para SignalHire com callbackUrl
 * 3. SignalHire processa e envia resultado para Edge Function
 * 4. Edge Function atualiza signalhire_lookups
 * 5. Frontend faz polling em getLookupStatus()
 */
export class SignalHireService extends ExternalService {
  readonly name = "signalhire";
  private apiKey: string | null = null;
  private tenantId: string | null = null;

  /**
   * Create a new SignalHireService instance
   * @param tenantId - Tenant ID for API key retrieval and lookup isolation
   */
  constructor(tenantId?: string) {
    super();
    this.tenantId = tenantId ?? null;
  }

  /**
   * Get the tenant ID
   */
  getTenantId(): string | null {
    return this.tenantId;
  }

  /**
   * Get API key from database for the tenant
   * AC 4.4 #1 - Retrieves tenant's encrypted API key from api_configs
   */
  private async getApiKey(): Promise<string> {
    if (this.apiKey) return this.apiKey;

    if (!this.tenantId) {
      throw new ExternalServiceError(
        this.name,
        401,
        SIGNALHIRE_ERROR_MESSAGES.API_KEY_NOT_CONFIGURED
      );
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("api_configs")
      .select("encrypted_key")
      .eq("tenant_id", this.tenantId)
      .eq("service_name", "signalhire")
      .single();

    if (error || !data) {
      throw new ExternalServiceError(
        this.name,
        401,
        SIGNALHIRE_ERROR_MESSAGES.API_KEY_NOT_CONFIGURED
      );
    }

    try {
      this.apiKey = decryptApiKey(data.encrypted_key);
      return this.apiKey;
    } catch {
      throw new ExternalServiceError(
        this.name,
        500,
        SIGNALHIRE_ERROR_MESSAGES.DECRYPT_ERROR
      );
    }
  }

  /**
   * Get callback URL from environment
   */
  private getCallbackUrl(): string {
    const callbackUrl = process.env.SIGNALHIRE_CALLBACK_URL;
    if (!callbackUrl) {
      throw new ExternalServiceError(
        this.name,
        500,
        SIGNALHIRE_ERROR_MESSAGES.CALLBACK_URL_NOT_CONFIGURED
      );
    }
    return callbackUrl;
  }

  /**
   * Handle and translate SignalHire-specific errors
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
        SIGNALHIRE_ERROR_MESSAGES.INVALID_KEY,
        error
      );
    }
    if (errorMessage.includes("402")) {
      // Check for specific API usage limit error
      const message = errorMessage.toLowerCase().includes("api usage is limited")
        ? SIGNALHIRE_ERROR_MESSAGES.API_USAGE_LIMITED
        : SIGNALHIRE_ERROR_MESSAGES.CREDITS_EXHAUSTED;
      return new ExternalServiceError(this.name, 402, message, error);
    }
    if (errorMessage.includes("403")) {
      return new ExternalServiceError(
        this.name,
        403,
        SIGNALHIRE_ERROR_MESSAGES.FORBIDDEN,
        error
      );
    }
    if (errorMessage.includes("404")) {
      return new ExternalServiceError(
        this.name,
        404,
        SIGNALHIRE_ERROR_MESSAGES.NOT_FOUND,
        error
      );
    }
    if (errorMessage.includes("406")) {
      return new ExternalServiceError(
        this.name,
        406,
        SIGNALHIRE_ERROR_MESSAGES.LIMIT_EXCEEDED,
        error
      );
    }
    if (errorMessage.includes("422")) {
      return new ExternalServiceError(
        this.name,
        422,
        SIGNALHIRE_ERROR_MESSAGES.INVALID_REQUEST,
        error
      );
    }
    if (errorMessage.includes("429")) {
      return new ExternalServiceError(
        this.name,
        429,
        SIGNALHIRE_ERROR_MESSAGES.RATE_LIMITED,
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
        SIGNALHIRE_ERROR_MESSAGES.TIMEOUT,
        error
      );
    }

    return new ExternalServiceError(
      this.name,
      500,
      SIGNALHIRE_ERROR_MESSAGES.GENERIC,
      error
    );
  }

  /**
   * Test connection to SignalHire API
   * Uses credits endpoint to verify API key validity
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
            [API_KEY_HEADER]: apiKey,
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

  /**
   * Initiate phone number lookup
   * AC 4.4.2 #3 - Iniciar Lookup com Callback URL
   *
   * NOVO FLUXO (4.4.2):
   * 1. Cria registro em signalhire_lookups com status 'pending'
   * 2. Envia requisição para SignalHire com callbackUrl
   * 3. Atualiza registro com request_id e status 'processing'
   * 4. Retorna lookupId para o caller fazer polling
   *
   * O resultado virá via callback para a Edge Function, que
   * atualiza o registro. O frontend faz polling em getLookupStatus().
   *
   * @param identifier - LinkedIn URL ou email
   * @param leadId - ID do lead (opcional, para associar o lookup)
   * @returns lookupId e requestId
   */
  async lookupPhone(
    identifier: string,
    leadId?: string
  ): Promise<SignalHireLookupInitResponse> {
    if (!this.tenantId) {
      throw new ExternalServiceError(
        this.name,
        401,
        SIGNALHIRE_ERROR_MESSAGES.API_KEY_NOT_CONFIGURED
      );
    }

    const apiKey = await this.getApiKey();
    const callbackUrl = this.getCallbackUrl();

    const supabase = await createClient();

    // 1. Criar registro de lookup na tabela (AC #3)
    const { data: lookup, error: insertError } = await supabase
      .from("signalhire_lookups")
      .insert({
        tenant_id: this.tenantId,
        lead_id: leadId || null,
        identifier,
        status: "pending",
      })
      .select()
      .single();

    if (insertError || !lookup) {
      throw new ExternalServiceError(
        this.name,
        500,
        SIGNALHIRE_ERROR_MESSAGES.DB_INSERT_ERROR
      );
    }

    // 2. Enviar requisição para SignalHire com callbackUrl
    const body: SignalHirePersonRequest = {
      items: [identifier],
      callbackUrl,
      withoutContacts: false,
    };

    try {
      const response = await this.makeRequest(apiKey, body);

      // 3. Atualizar registro com request_id e status
      const requestId = response.requestId || "";
      const { error: updateError } = await supabase
        .from("signalhire_lookups")
        .update({
          request_id: requestId,
          status: "processing",
        })
        .eq("id", lookup.id);

      if (updateError) {
        throw new ExternalServiceError(
          this.name,
          500,
          SIGNALHIRE_ERROR_MESSAGES.DB_UPDATE_ERROR
        );
      }

      // 4. Retornar IDs para polling
      return {
        lookupId: lookup.id,
        requestId,
      };
    } catch (error) {
      // Atualizar registro com erro
      await supabase
        .from("signalhire_lookups")
        .update({
          status: "failed",
          error_message:
            error instanceof Error ? error.message : "Erro desconhecido",
        })
        .eq("id", lookup.id);

      throw this.handleError(error);
    }
  }

  /**
   * Get lookup status from database
   * AC 4.4.2 #4 - Polling do Resultado
   *
   * @param lookupId - ID do registro de lookup
   * @returns Status atual do lookup
   */
  async getLookupStatus(lookupId: string): Promise<SignalHireLookupStatus> {
    if (!this.tenantId) {
      throw new ExternalServiceError(
        this.name,
        401,
        SIGNALHIRE_ERROR_MESSAGES.API_KEY_NOT_CONFIGURED
      );
    }

    const supabase = await createClient();

    const { data, error } = await supabase
      .from("signalhire_lookups")
      .select("*")
      .eq("id", lookupId)
      .eq("tenant_id", this.tenantId)
      .single();

    if (error || !data) {
      throw new ExternalServiceError(
        this.name,
        404,
        SIGNALHIRE_ERROR_MESSAGES.LOOKUP_NOT_FOUND
      );
    }

    const row = data as SignalHireLookupRow;

    return {
      id: row.id,
      status: row.status,
      phone: row.phone,
      errorMessage: row.error_message,
      createdAt: row.created_at,
    };
  }

  /**
   * Make POST request to SignalHire API
   * AC #4: Uses 10s timeout and 1 retry on timeout/network error
   *
   * IMPORTANTE: O SignalHire retorna o requestId no BODY da resposta (201),
   * NÃO no header. O formato é: { "requestId": 12345 }
   */
  private async makeRequest(
    apiKey: string,
    body: SignalHirePersonRequest
  ): Promise<{ status: number; requestId?: string }> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        REQUEST_TIMEOUT_MS
      );

      try {
        const response = await fetch(
          `${SIGNALHIRE_API_BASE}${SIGNALHIRE_PERSON_ENDPOINT}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [API_KEY_HEADER]: apiKey,
            },
            body: JSON.stringify(body),
            signal: controller.signal,
          }
        );

        clearTimeout(timeoutId);

        // Handle error status codes BEFORE reading body
        if (!response.ok) {
          // Read error body from SignalHire
          let errorMessage = `HTTP ${response.status}`;
          try {
            const errorBody = await response.json();
            if (errorBody.error) {
              errorMessage = `${response.status}: ${errorBody.error}`;
            }
          } catch {
            // Ignore JSON parse errors
          }
          throw this.handleError(new Error(errorMessage));
        }

        // CORREÇÃO: requestId vem no BODY da resposta, não no header
        // SignalHire retorna: { "requestId": 12345 }
        let requestId: string | undefined;
        try {
          const responseBody = await response.json();
          if (responseBody.requestId !== undefined) {
            // Convert to string (API returns number)
            requestId = String(responseBody.requestId);
          }
        } catch {
          // If we can't parse the body, continue without requestId
          // Silent fail - requestId will be empty string
        }

        // 201 = accepted, request is being processed
        return { status: response.status, requestId };
      } catch (error) {
        clearTimeout(timeoutId);
        lastError = error as Error;

        // Check if retryable (timeout or network error)
        const isTimeout =
          error instanceof Error && error.name === "AbortError";
        const isNetworkError = error instanceof TypeError;
        const isRetryable = isTimeout || isNetworkError;

        if (!isRetryable || attempt === MAX_RETRIES) {
          throw this.handleError(error);
        }
        // Retry on next iteration
      }
    }

    throw this.handleError(lastError ?? new Error("Request failed"));
  }
}

// ==============================================
// INTERNAL TYPES
// ==============================================

/**
 * Response from SignalHire /api/v1/credits endpoint
 */
interface SignalHireCreditsResponse {
  credits: number;
}
