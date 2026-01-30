/**
 * External Service Base Class
 * Story: 2.3 - Integration Connection Testing
 *
 * Abstract base class for all external API integrations.
 * Provides: timeout (10s), retry (1 on timeout), Portuguese error messages.
 *
 * AC: #1 - Test connection functionality
 * AC: #2 - Status tracking per service
 */

// ==============================================
// ERROR MESSAGES (PORTUGUESE)
// ==============================================

export const ERROR_MESSAGES: Record<string, string> = {
  // Generic
  TIMEOUT: "Tempo limite excedido. Tente novamente.",
  NETWORK_ERROR: "Erro de conexão. Verifique sua internet.",
  INTERNAL_ERROR: "Erro interno. Tente novamente.",

  // Auth errors
  UNAUTHORIZED: "API key inválida ou expirada.",
  FORBIDDEN: "Acesso negado. Verifique as permissões da API key.",

  // Rate limiting
  RATE_LIMITED: "Limite de requisições atingido. Aguarde e tente novamente.",

  // Service-specific
  APOLLO_ERROR: "Erro na comunicação com Apollo.",
  SIGNALHIRE_ERROR: "Erro na comunicação com SignalHire.",
  SNOVIO_ERROR: "Erro na comunicação com Snov.io.",
  INSTANTLY_ERROR: "Erro na comunicação com Instantly.",

  // Success
  SUCCESS: "Conexão estabelecida com sucesso",
};

// ==============================================
// TYPES
// ==============================================

/**
 * Result of a connection test
 */
export interface TestConnectionResult {
  success: boolean;
  message: string;
  testedAt: string;
  latencyMs?: number;
}

// ==============================================
// CUSTOM ERROR
// ==============================================

/**
 * Error thrown by external service calls
 * Contains service name and HTTP status code for debugging
 */
export class ExternalServiceError extends Error {
  readonly name = "ExternalServiceError";
  readonly serviceName: string;
  readonly statusCode: number;

  constructor(serviceName: string, statusCode: number, message?: string) {
    const errorMessage = message ?? getErrorMessageByStatus(statusCode);
    super(errorMessage);
    this.serviceName = serviceName;
    this.statusCode = statusCode;
  }
}

/**
 * Get Portuguese error message based on HTTP status code
 */
function getErrorMessageByStatus(status: number): string {
  switch (status) {
    case 401:
      return ERROR_MESSAGES.UNAUTHORIZED;
    case 403:
      return ERROR_MESSAGES.FORBIDDEN;
    case 408:
      return ERROR_MESSAGES.TIMEOUT;
    case 429:
      return ERROR_MESSAGES.RATE_LIMITED;
    default:
      return ERROR_MESSAGES.INTERNAL_ERROR;
  }
}

// ==============================================
// CONSTANTS
// ==============================================

const DEFAULT_TIMEOUT_MS = 10000; // 10 seconds
const MAX_RETRIES = 1; // 1 retry on timeout

// ==============================================
// ABSTRACT BASE CLASS
// ==============================================

/**
 * Abstract base class for external API services
 *
 * All external integrations (Apollo, SignalHire, Snov.io, Instantly)
 * must extend this class and implement testConnection().
 */
export abstract class ExternalService {
  /**
   * Service name for error reporting
   */
  abstract readonly name: string;

  /**
   * Test the connection using the provided API key
   * Each service implementation defines the appropriate endpoint
   */
  abstract testConnection(apiKey: string): Promise<TestConnectionResult>;

  /**
   * Make an HTTP request with timeout and retry handling
   *
   * @param url - The URL to fetch
   * @param options - Fetch options (headers, method, body)
   * @returns Parsed JSON response
   * @throws ExternalServiceError on failure
   */
  protected async request<T>(url: string, options: RequestInit): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await this.executeRequest<T>(url, options);
      } catch (error) {
        lastError = error as Error;

        // Only retry on timeout
        const isTimeout =
          error instanceof ExternalServiceError && error.statusCode === 408;

        if (!isTimeout || attempt === MAX_RETRIES) {
          throw error;
        }

        // Retry on timeout
      }
    }

    // Should not reach here, but TypeScript requires it
    throw lastError ?? new ExternalServiceError(this.name, 500);
  }

  /**
   * Execute a single request with timeout
   */
  private async executeRequest<T>(
    url: string,
    options: RequestInit
  ): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new ExternalServiceError(this.name, response.status);
      }

      return await response.json();
    } catch (error) {
      // Handle abort (timeout)
      if (error instanceof Error && error.name === "AbortError") {
        throw new ExternalServiceError(
          this.name,
          408,
          ERROR_MESSAGES.TIMEOUT
        );
      }

      // Handle network errors
      if (error instanceof TypeError) {
        throw new ExternalServiceError(
          this.name,
          0,
          ERROR_MESSAGES.NETWORK_ERROR
        );
      }

      // Re-throw ExternalServiceError as-is
      if (error instanceof ExternalServiceError) {
        throw error;
      }

      // Unknown error
      throw new ExternalServiceError(this.name, 500, ERROR_MESSAGES.INTERNAL_ERROR);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Create a successful test result
   */
  protected createSuccessResult(latencyMs: number): TestConnectionResult {
    return {
      success: true,
      message: ERROR_MESSAGES.SUCCESS,
      testedAt: new Date().toISOString(),
      latencyMs,
    };
  }

  /**
   * Create a failed test result
   */
  protected createErrorResult(error: Error): TestConnectionResult {
    const message =
      error instanceof ExternalServiceError
        ? error.message
        : ERROR_MESSAGES.INTERNAL_ERROR;

    return {
      success: false,
      message,
      testedAt: new Date().toISOString(),
    };
  }
}
