/**
 * Campaign Results Import Hook
 * Story 4.7: Import Campaign Results
 *
 * AC: #5 - Process import and update leads
 * AC: #6 - Return summary with counts
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type {
  CampaignResultRow,
  ImportCampaignResultsResponse,
} from "@/types/campaign-import";

interface ImportCampaignResultsParams {
  results: CampaignResultRow[];
  createMissingLeads?: boolean;
}

interface APIResponse {
  data: ImportCampaignResultsResponse;
  error?: { code: string; message: string };
}

/**
 * Import campaign results to update lead status
 */
async function importCampaignResults(
  params: ImportCampaignResultsParams
): Promise<ImportCampaignResultsResponse> {
  const response = await fetch("/api/leads/import-results", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  const json: APIResponse = await response.json();

  if (!response.ok) {
    throw new Error(json.error?.message || "Erro ao importar resultados");
  }

  return json.data;
}

/**
 * useImportCampaignResults - Hook for importing campaign results
 *
 * Usage:
 * ```tsx
 * const { mutate, isPending, data } = useImportCampaignResults();
 *
 * // Import results
 * mutate({
 *   results: [
 *     { email: "test@example.com", responseType: "replied" },
 *   ],
 *   createMissingLeads: false,
 * });
 * ```
 */
export function useImportCampaignResults() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: importCampaignResults,
    onSuccess: (result) => {
      // Build success message
      const parts: string[] = [];

      if (result.updated > 0) {
        parts.push(
          `${result.updated} ${result.updated === 1 ? "lead atualizado" : "leads atualizados"}`
        );
      }

      if (result.created && result.created > 0) {
        parts.push(
          `${result.created} ${result.created === 1 ? "lead criado" : "leads criados"}`
        );
      }

      if (result.unmatched.length > 0) {
        parts.push(
          `${result.unmatched.length} ${result.unmatched.length === 1 ? "nao encontrado" : "nao encontrados"}`
        );
      }

      const message =
        parts.length > 0
          ? parts.join(", ")
          : `${result.matched} ${result.matched === 1 ? "lead processado" : "leads processados"}`;

      toast.success(message);

      // Invalidate queries to refresh lead data
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["myLeads"] });
      queryClient.invalidateQueries({ queryKey: ["interactions"] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}
