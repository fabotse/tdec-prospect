/**
 * Contact Search Hook
 * Story: 15.4 - Apollo Bridge: Busca de Contatos nas Empresas
 *
 * useMutation for on-demand contact search via Apollo API.
 * AC: #2 - Search contacts by domain + title filters
 * AC: #5 - Error handling with Portuguese messages
 */

"use client";

import { useMutation } from "@tanstack/react-query";
import type { Lead } from "@/types/lead";

// ==============================================
// TYPES
// ==============================================

export interface ContactSearchParams {
  domains: string[];
  titles: string[];
}

export interface ContactSearchApiResponse {
  data: Lead[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface ContactSearchResult {
  contacts: Lead[];
  total: number;
  page: number;
  totalPages: number;
}

// ==============================================
// FETCH FUNCTION
// ==============================================

async function searchContacts(
  params: ContactSearchParams
): Promise<ContactSearchResult> {
  const response = await fetch("/api/integrations/apollo", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      domains: params.domains,
      titles: params.titles,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      (error as { error?: { message?: string } }).error?.message ||
        "Erro ao buscar contatos via Apollo"
    );
  }

  const result: ContactSearchApiResponse = await response.json();
  return {
    contacts: result.data,
    total: result.meta.total,
    page: result.meta.page,
    totalPages: result.meta.totalPages,
  };
}

// ==============================================
// HOOK
// ==============================================

export function useContactSearch() {
  const mutation = useMutation({
    mutationFn: searchContacts,
  });

  return {
    search: mutation.mutate,
    data: mutation.data ?? null,
    isLoading: mutation.isPending,
    error: mutation.error,
    reset: mutation.reset,
  };
}
