/**
 * useCreateTechLeads Hook
 * Story 15.5: Criacao de Leads e Integracao com Pipeline
 *
 * AC: #2 - Batch create leads from technographic prospecting
 * AC: #3 - Source metadata passed to API
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { LeadDataForImport } from "@/types/lead";

interface CreateTechLeadsParams {
  leads: LeadDataForImport[];
  source: string;
  sourceTechnology: string;
}

interface CreateTechLeadsResponse {
  created: number;
  skipped: number;
  duplicateEmails: string[];
}

async function createTechLeads(
  params: CreateTechLeadsParams
): Promise<CreateTechLeadsResponse> {
  const response = await fetch("/api/leads/create-batch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || "Erro ao criar leads");
  }

  const result = await response.json();
  return result.data;
}

export function useCreateTechLeads() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: createTechLeads,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
    },
  });

  return {
    createLeads: mutation.mutate,
    isLoading: mutation.isPending,
    error: mutation.error,
    data: mutation.data,
    reset: mutation.reset,
  };
}
