/**
 * Delete Leads Hook
 * Story 12.5: Deleção de Leads (Individual e em Massa)
 *
 * AC: #6 - Toast de sucesso com contagem
 * AC: #7 - Toast de erro em caso de falha
 * AC: #8 - Invalidação de queries após deleção
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

async function deleteLeads(leadIds: string[]): Promise<{ deleted: number }> {
  const response = await fetch("/api/leads/bulk-delete", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ leadIds }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || "Erro ao excluir leads");
  }
  const result = await response.json();
  return result.data;
}

/**
 * Hook to delete multiple leads at once
 * AC: #6 - Success toast with count
 * AC: #7 - Error toast on failure
 * AC: #8 - Invalidates lead queries on success
 */
export function useDeleteLeads() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (leadIds: string[]) => deleteLeads(leadIds),
    onSuccess: (result) => {
      const count = result.deleted;
      toast.success(
        count === 1
          ? "1 lead excluído com sucesso"
          : `${count} leads excluídos com sucesso`
      );
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["my-leads"] });
      queryClient.invalidateQueries({ queryKey: ["searchLeads"] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}
