/**
 * Error Codes and Messages
 * Story: 3.2 - Apollo API Integration Service
 *
 * Centralized error codes and Portuguese messages for API responses.
 * AC: #4 - Error messages translated to Portuguese
 */

// ==============================================
// ERROR CODE TYPES
// ==============================================

export type ErrorCode =
  // Generic errors
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "VALIDATION_ERROR"
  | "INTERNAL_ERROR"
  | "NOT_FOUND"
  // Apollo-specific errors (Story 3.2)
  | "APOLLO_ERROR"
  | "APOLLO_RATE_LIMIT"
  | "APOLLO_INVALID_KEY"
  | "APOLLO_TIMEOUT"
  | "APOLLO_NOT_CONFIGURED";

// ==============================================
// ERROR MESSAGES (Portuguese)
// ==============================================

export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  // Generic errors
  UNAUTHORIZED: "Não autenticado",
  FORBIDDEN: "Acesso negado",
  VALIDATION_ERROR: "Dados inválidos",
  INTERNAL_ERROR: "Erro interno do servidor",
  NOT_FOUND: "Recurso não encontrado",

  // Apollo-specific errors (Story 3.2)
  APOLLO_ERROR: "Erro ao comunicar com Apollo. Tente novamente.",
  APOLLO_RATE_LIMIT:
    "Limite de requisições do Apollo atingido. Tente novamente em alguns minutos.",
  APOLLO_INVALID_KEY: "API key do Apollo inválida ou expirada.",
  APOLLO_TIMEOUT:
    "Tempo limite excedido ao conectar com Apollo. Tente novamente.",
  APOLLO_NOT_CONFIGURED:
    "API key do Apollo não configurada. Configure em Configurações > Integrações.",
};

// ==============================================
// HELPER FUNCTIONS
// ==============================================

/**
 * Get Portuguese message for an error code
 */
export function getErrorMessage(code: ErrorCode): string {
  return ERROR_MESSAGES[code] ?? ERROR_MESSAGES.INTERNAL_ERROR;
}

/**
 * Map HTTP status code to error code
 */
export function getErrorCodeFromStatus(status: number): ErrorCode {
  switch (status) {
    case 401:
      return "UNAUTHORIZED";
    case 403:
      return "FORBIDDEN";
    case 404:
      return "NOT_FOUND";
    case 408:
      return "APOLLO_TIMEOUT";
    case 429:
      return "APOLLO_RATE_LIMIT";
    default:
      return "INTERNAL_ERROR";
  }
}
