/**
 * SignalHire Service
 * Story: 2.3 - Integration Connection Testing
 * Story: 4.4 - SignalHire Integration Service
 *
 * SignalHire API integration for contact enrichment and phone lookup.
 * Uses async processing model (POST → poll until 200).
 *
 * AC: #1 - Retrieves and uses tenant's encrypted API key
 * AC: #3 - Portuguese error messages
 * AC: #4 - Timeout 10s, 1x retry on timeout/network error
 * AC: #5 - Follows ExternalService base class pattern
 * AC: #7 - Phone lookup with credits info
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
  SignalHirePersonResponse,
  SignalHireItemResult,
  SignalHireLookupResult,
  SignalHirePerson,
} from "@/types/signalhire";
import { extractPrimaryPhone } from "@/types/signalhire";

// ==============================================
// CONSTANTS (CONFIRMED via Research)
// ==============================================

const SIGNALHIRE_API_BASE = "https://www.signalhire.com/api";
const SIGNALHIRE_PERSON_ENDPOINT = "/v1/candidate/search";
const SIGNALHIRE_CREDITS_ENDPOINT = "/v1/credits";
const API_KEY_HEADER = "apikey";

// Polling configuration
const POLL_INTERVAL_MS = 2000; // 2 seconds between polls
const MAX_POLL_ATTEMPTS = 15; // 30 seconds max wait (15 * 2s)
const REQUEST_TIMEOUT_MS = 10000; // 10 seconds timeout (AC #4)
const MAX_RETRIES = 1; // 1 retry on timeout/network error (AC #4)

// ==============================================
// ERROR MESSAGES (Portuguese) - AC: #3
// ==============================================

const SIGNALHIRE_ERROR_MESSAGES = {
  API_KEY_NOT_CONFIGURED:
    "API key do SignalHire não configurada. Configure em Configurações > Integrações.",
  INVALID_KEY: "API key do SignalHire inválida ou expirada.",
  FORBIDDEN:
    "Acesso negado ao SignalHire. Verifique as permissões da sua API key.",
  NOT_FOUND: "Contato não encontrado no SignalHire.",
  RATE_LIMITED:
    "Limite de requisições do SignalHire atingido (600/min). Aguarde e tente novamente.",
  LIMIT_EXCEEDED: "Limite de 100 items por requisição excedido.",
  INVALID_REQUEST: "Parâmetros de requisição inválidos.",
  TIMEOUT:
    "Tempo limite excedido ao conectar com SignalHire. Tente novamente.",
  GENERIC: "Erro ao comunicar com SignalHire. Tente novamente.",
  DECRYPT_ERROR: "Erro ao descriptografar API key. Reconfigure a chave.",
  POLL_TIMEOUT:
    "Tempo limite excedido aguardando resposta do SignalHire. A busca pode ainda estar processando.",
  NO_PHONE_FOUND: "Telefone não encontrado para este contato.",
  CREDITS_EXHAUSTED: "Créditos do SignalHire esgotados.",
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
 * Story 4.4: Extended with lookupPhone() and tenant-based API key retrieval
 */
export class SignalHireService extends ExternalService {
  readonly name = "signalhire";
  private apiKey: string | null = null;
  private tenantId: string | null = null;

  /**
   * Create a new SignalHireService instance
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
   * Handle and translate SignalHire-specific errors
   * AC: #3 - Portuguese error messages
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
        SIGNALHIRE_ERROR_MESSAGES.INVALID_KEY,
        error
      );
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
   * AC: #6 - Uses credits endpoint to verify API key validity
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
   * Lookup phone number for a contact
   * AC: #7 - Uses Person API with LinkedIn URL or email
   *
   * SignalHire API is async:
   * 1. POST /v1/candidate/search → returns 201 with requestId
   * 2. Poll GET /v1/candidate/search/{requestId} until 200
   *
   * @param identifier - LinkedIn URL, email address, or phone (E164)
   * @returns Phone number and credits info
   */
  async lookupPhone(identifier: string): Promise<SignalHireLookupResult> {
    const apiKey = await this.getApiKey();

    // Build request body
    const body: SignalHirePersonRequest = {
      items: [identifier],
      withoutContacts: false, // We need contact details
    };

    // Make initial request
    const initialResponse = await this.makeInitialRequest(apiKey, body);

    // If we got immediate result (200), process it
    if (initialResponse.data && initialResponse.data.length > 0) {
      return this.processResult(initialResponse.data[0], null);
    }

    // Otherwise, poll for result
    if (!initialResponse.requestId) {
      throw new ExternalServiceError(
        this.name,
        500,
        SIGNALHIRE_ERROR_MESSAGES.GENERIC
      );
    }

    const pollResult = await this.pollForResult(
      initialResponse.requestId,
      apiKey
    );
    return this.processResult(pollResult.data[0], pollResult.creditsRemaining ?? null);
  }

  /**
   * Make initial POST request to start the lookup
   * AC #4: Uses 10s timeout and 1 retry on timeout/network error
   */
  private async makeInitialRequest(
    apiKey: string,
    body: SignalHirePersonRequest
  ): Promise<{
    status: number;
    requestId?: string;
    data?: SignalHireItemResult[];
  }> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

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

        // Get request ID from header
        const requestId = response.headers.get("Request-Id") || undefined;

        // Handle different status codes
        if (response.status === 200) {
          // Immediate result available
          const data = (await response.json()) as SignalHireItemResult[];
          return { status: 200, data, requestId };
        }

        if (response.status === 201) {
          // Accepted, need to poll
          return { status: 201, requestId };
        }

        // Handle error status codes
        if (!response.ok) {
          throw this.handleError(new Error(`HTTP ${response.status}`));
        }

        return { status: response.status, requestId };
      } catch (error) {
        clearTimeout(timeoutId);
        lastError = error as Error;

        // Check if retryable (timeout or network error)
        const isTimeout = error instanceof Error && error.name === "AbortError";
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

  /**
   * Poll for result until 200 or timeout
   * AC #4: Each poll request has 10s timeout
   * AC #7: Handles async processing (201 → 204 → 200)
   */
  private async pollForResult(
    requestId: string,
    apiKey: string
  ): Promise<SignalHirePersonResponse> {
    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
      await this.sleep(POLL_INTERVAL_MS);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      try {
        const response = await fetch(
          `${SIGNALHIRE_API_BASE}${SIGNALHIRE_PERSON_ENDPOINT}/${requestId}`,
          {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
              [API_KEY_HEADER]: apiKey,
            },
            signal: controller.signal,
          }
        );

        clearTimeout(timeoutId);

        const creditsLeft = response.headers.get("X-Credits-Left");
        const creditsRemaining = creditsLeft ? parseInt(creditsLeft, 10) : null;

        if (response.status === 200) {
          // Result ready
          const data = (await response.json()) as SignalHireItemResult[];
          return { data, creditsRemaining };
        }

        if (response.status === 204) {
          // Still processing, continue polling
          continue;
        }

        // Unexpected status
        if (!response.ok) {
          throw this.handleError(new Error(`HTTP ${response.status}`));
        }
      } catch (error) {
        clearTimeout(timeoutId);

        // On timeout during polling, continue to next attempt
        if (error instanceof Error && error.name === "AbortError") {
          continue;
        }

        throw this.handleError(error);
      }
    }

    // Timeout after max attempts
    throw new ExternalServiceError(
      this.name,
      408,
      SIGNALHIRE_ERROR_MESSAGES.POLL_TIMEOUT
    );
  }

  /**
   * Process result from SignalHire API
   * Extracts phone and handles various status codes
   */
  private processResult(
    result: SignalHireItemResult,
    creditsRemaining: number | null | undefined
  ): SignalHireLookupResult {
    // Handle different status values
    switch (result.status) {
      case "success":
        return this.extractPhoneFromPerson(result.person, creditsRemaining);

      case "failed":
        throw new ExternalServiceError(
          this.name,
          404,
          result.error || SIGNALHIRE_ERROR_MESSAGES.PROCESSING_FAILED
        );

      case "credits_are_over":
        throw new ExternalServiceError(
          this.name,
          402,
          SIGNALHIRE_ERROR_MESSAGES.CREDITS_EXHAUSTED
        );

      case "timeout_exceeded":
        throw new ExternalServiceError(
          this.name,
          408,
          SIGNALHIRE_ERROR_MESSAGES.POLL_TIMEOUT
        );

      case "duplicate_query":
        throw new ExternalServiceError(
          this.name,
          409,
          SIGNALHIRE_ERROR_MESSAGES.DUPLICATE_QUERY
        );

      default:
        throw new ExternalServiceError(
          this.name,
          500,
          SIGNALHIRE_ERROR_MESSAGES.GENERIC
        );
    }
  }

  /**
   * Extract phone number from person data
   */
  private extractPhoneFromPerson(
    person: SignalHirePerson | undefined,
    creditsRemaining: number | null | undefined
  ): SignalHireLookupResult {
    if (!person) {
      throw new ExternalServiceError(
        this.name,
        404,
        SIGNALHIRE_ERROR_MESSAGES.NOT_FOUND
      );
    }

    const phone = extractPrimaryPhone(person);

    if (!phone) {
      throw new ExternalServiceError(
        this.name,
        404,
        SIGNALHIRE_ERROR_MESSAGES.NO_PHONE_FOUND
      );
    }

    return {
      phone,
      phones: person.phones,
      creditsUsed: 1,
      creditsRemaining: creditsRemaining ?? null,
      person,
    };
  }

  /**
   * Sleep utility for polling
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
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
