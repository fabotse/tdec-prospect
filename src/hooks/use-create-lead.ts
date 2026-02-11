/**
 * Hook for creating a lead manually
 * Quick Dev: Manual Lead Creation
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Lead, CreateLeadInput } from "@/types/lead";

async function createLead(input: CreateLeadInput): Promise<Lead> {
  const response = await fetch("/api/leads/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.error?.message || "Erro ao criar lead");
  }
  return result.data;
}

export function useCreateLead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createLead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-leads"] });
      queryClient.invalidateQueries({ queryKey: ["interested-count"] });
    },
  });
}
