/**
 * Export Error Mapping
 * Story 7.8: Validacao Pre-Export e Error Handling
 * AC: #3 - Maps API errors to user-friendly PT-BR messages
 *
 * Inspects error shape (Response status, Error message, string) and returns
 * structured ExportErrorInfo with title, message, suggested action, and
 * retry/fallback flags.
 */

import type { ExportPlatform } from "@/types/export";

// ==============================================
// TYPES
// ==============================================

export interface ExportErrorInfo {
  title: string;
  message: string;
  suggestedAction: string;
  canRetry: boolean;
  canFallback: boolean;
}

// ==============================================
// PLATFORM DISPLAY NAMES
// ==============================================

const PLATFORM_NAMES: Record<ExportPlatform, string> = {
  instantly: "Instantly",
  snovio: "Snov.io",
  csv: "CSV",
  clipboard: "Clipboard",
};

// ==============================================
// ERROR PATTERNS
// ==============================================

const HTTP_STATUS_PATTERNS: Array<{ status: number; info: (platform: ExportPlatform) => ExportErrorInfo }> = [
  {
    status: 401,
    info: (platform) => ({
      title: "Erro de autenticação",
      message: `API key inválida. Verifique em Configurações > ${PLATFORM_NAMES[platform]}.`,
      suggestedAction: "Acesse Configurações e verifique sua API key.",
      canRetry: false,
      canFallback: true,
    }),
  },
  {
    status: 402,
    info: (platform) => ({
      title: "Sem créditos",
      message: `Sua conta ${PLATFORM_NAMES[platform]} está sem créditos. Verifique seu plano.`,
      suggestedAction: `Acesse ${PLATFORM_NAMES[platform]} e verifique seu plano.`,
      canRetry: false,
      canFallback: true,
    }),
  },
  {
    status: 429,
    info: () => ({
      title: "Limite de requisições",
      message: "Muitas requisições. Aguarde alguns minutos e tente novamente.",
      suggestedAction: "Aguarde alguns minutos antes de tentar novamente.",
      canRetry: true,
      canFallback: true,
    }),
  },
  {
    status: 500,
    info: (platform) => ({
      title: "Serviço indisponível",
      message: `Serviço ${PLATFORM_NAMES[platform]} temporariamente indisponível. Tente novamente em alguns minutos.`,
      suggestedAction: "Tente novamente em alguns minutos.",
      canRetry: true,
      canFallback: true,
    }),
  },
];

function isNetworkError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return (
      msg.includes("network") ||
      msg.includes("fetch failed") ||
      msg.includes("failed to fetch") ||
      msg.includes("net::") ||
      msg.includes("conexão") ||
      msg.includes("connection")
    );
  }
  return false;
}

function isTimeoutError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return msg.includes("timeout") || msg.includes("timed out") || msg.includes("aborted");
  }
  return false;
}

// ==============================================
// MAIN FUNCTION
// ==============================================

/**
 * Map an export error to a user-friendly ExportErrorInfo.
 *
 * Inspection order:
 * 1. Error with `status` property (HTTP Response-like)
 * 2. Error with message containing network patterns
 * 3. Error with message containing timeout patterns
 * 4. Generic fallback
 *
 * All results have canFallback: true — CSV/clipboard always available.
 */
export function mapExportError(
  error: unknown,
  platform: ExportPlatform
): ExportErrorInfo {
  // 1. Check HTTP status (error objects with status property)
  const status = getErrorStatus(error);
  if (status !== null) {
    const pattern = HTTP_STATUS_PATTERNS.find((p) => p.status === status);
    if (pattern) {
      return pattern.info(platform);
    }
  }

  // 2. Network error
  if (isNetworkError(error)) {
    return {
      title: "Erro de conexão",
      message: "Erro de conexão. Verifique sua internet.",
      suggestedAction: "Verifique sua conexão com a internet.",
      canRetry: true,
      canFallback: true,
    };
  }

  // 3. Timeout
  if (isTimeoutError(error)) {
    return {
      title: "Tempo esgotado",
      message: "A requisição demorou demais. Tente novamente.",
      suggestedAction: "Tente novamente. Se persistir, exporte via CSV.",
      canRetry: true,
      canFallback: true,
    };
  }

  // 4. Generic fallback
  return {
    title: "Erro no export",
    message: "Erro inesperado durante o export. Tente novamente ou exporte via CSV.",
    suggestedAction: "Tente novamente ou use a exportação manual (CSV/Clipboard).",
    canRetry: true,
    canFallback: true,
  };
}

/**
 * Extract HTTP status from various error shapes.
 */
function getErrorStatus(error: unknown): number | null {
  if (error && typeof error === "object") {
    if ("status" in error && typeof (error as Record<string, unknown>).status === "number") {
      return (error as Record<string, unknown>).status as number;
    }
  }
  return null;
}
