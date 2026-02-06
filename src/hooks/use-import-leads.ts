/**
 * Lead Import Hook
 * Story 4.2.1: Lead Import Mechanism
 *
 * AC: #1 - Import leads from Apollo search results
 * AC: #4 - Bulk import with correct count
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { LeadDataForImport } from "@/types/lead";

// Re-export for backwards compatibility with existing imports
export type { LeadDataForImport };

interface ImportLeadsResponse {
  data: {
    imported: number;
    existing: number;
    leads?: Array<{
      id: string;
      apollo_id: string;
      [key: string]: unknown;
    }>;
  };
  message: string;
}

/**
 * Import leads from Apollo to database
 */
async function importLeads(
  leads: LeadDataForImport[]
): Promise<ImportLeadsResponse> {
  const response = await fetch("/api/leads/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ leads }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || "Erro ao importar leads");
  }

  return response.json();
}

/**
 * useImportLeads - Hook for importing leads to database
 *
 * Usage:
 * ```tsx
 * const { mutate, isPending } = useImportLeads();
 * mutate(selectedLeads);
 * ```
 */
export function useImportLeads() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: importLeads,
    onSuccess: (result) => {
      toast.success(result.message);
      // Invalidate queries to refresh lead data with DB IDs
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["searchLeads"] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}
