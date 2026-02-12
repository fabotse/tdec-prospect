/**
 * Lead CSV Import Hook
 * Story 12.2: Import Leads via CSV
 *
 * AC: #6 - Processing and lead creation
 * AC: #7 - Import summary
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ImportLeadRow, ImportLeadsResponse } from "@/types/lead-import";

interface ImportLeadsCsvParams {
  leads: ImportLeadRow[];
  segmentId?: string | null;
}

async function importLeadsCsv(
  params: ImportLeadsCsvParams
): Promise<ImportLeadsResponse> {
  const response = await fetch("/api/leads/import-csv", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || "Erro ao importar leads");
  }

  const result = await response.json();
  return result.data;
}

/**
 * useImportLeadsCsv - Hook for importing leads from CSV
 *
 * AC: #6 - Calls /api/leads/import-csv
 * AC: #7 - Shows toast with singular/plural counts
 */
export function useImportLeadsCsv() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: importLeadsCsv,
    onSuccess: (result) => {
      const { imported } = result;
      const word = imported === 1 ? "lead importado" : "leads importados";
      toast.success(`${imported} ${word} com sucesso`);

      queryClient.invalidateQueries({ queryKey: ["myLeads"] });
      queryClient.invalidateQueries({ queryKey: ["segments"] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}
