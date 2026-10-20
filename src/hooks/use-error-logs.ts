/**
 * Error Logs Hook
 * Story 23.3: Configurações → Erros
 *
 * TanStack Query hook para GET /api/settings/errors.
 */

"use client";

import { useQuery } from "@tanstack/react-query";
import type { ErrorLog } from "@/types/error-log";

export const ERROR_LOGS_KEY = ["settings", "error-logs"];

interface ApiErrorResponse {
  error?: { code: string; message: string };
}

async function fetchErrorLogs(): Promise<ErrorLog[]> {
  const response = await fetch("/api/settings/errors");
  // Corpo nao-JSON (ex.: 504 HTML da Vercel) nao pode esconder a mensagem de erro.
  const result: unknown = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      (result as ApiErrorResponse).error?.message || "Erro ao buscar o registro de erros"
    );
  }

  return (result as { data: ErrorLog[] }).data ?? [];
}

export function useErrorLogs() {
  return useQuery({
    queryKey: ERROR_LOGS_KEY,
    queryFn: fetchErrorLogs,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
