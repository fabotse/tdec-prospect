/**
 * Company Search Hook
 * Story: 15.2 - Busca Technografica: Autocomplete e Filtros
 *
 * useMutation for on-demand company search (not automatic).
 * AC: #3 - Returns data + pagination + isLoading + error
 */

"use client";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import type {
  TheirStackSearchFilters,
  TheirStackCompany,
} from "@/types/theirstack";

interface CompanySearchApiResponse {
  data: TheirStackCompany[];
  meta: {
    total_results: number;
    total_companies: number;
  };
}

export interface CompanySearchResult {
  companies: TheirStackCompany[];
  totalResults: number;
  totalCompanies: number;
}

async function searchCompanies(
  filters: TheirStackSearchFilters
): Promise<CompanySearchResult> {
  const response = await fetch(
    "/api/integrations/theirstack/search/companies",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(filters),
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      (error as { error?: string }).error || "Erro ao buscar empresas"
    );
  }

  const result: CompanySearchApiResponse = await response.json();
  return {
    companies: result.data,
    totalResults: result.meta.total_results,
    totalCompanies: result.meta.total_companies,
  };
}

export function useCompanySearch() {
  const [page, setPage] = useState(0);

  const mutation = useMutation({
    mutationFn: searchCompanies,
  });

  return {
    search: mutation.mutate,
    searchAsync: mutation.mutateAsync,
    data: mutation.data ?? null,
    isLoading: mutation.isPending,
    error: mutation.error,
    reset: mutation.reset,
    page,
    setPage,
  };
}
