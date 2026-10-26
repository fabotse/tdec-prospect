"use client";

/**
 * Suppression List Hook
 * Story: 23.5 - Lista de supressão: cadastro e import
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getSuppressionEntries,
  addSuppressionEntry,
  removeSuppressionEntry,
  importSuppressionEntries,
} from "@/actions/suppression";
import type { ActionResult } from "@/types/knowledge-base";
import type {
  SuppressionEntry,
  SuppressionEntryInput,
  SuppressionImportReport,
  SuppressionImportRow,
} from "@/types/suppression";

export const SUPPRESSION_QUERY_KEY = ["suppression-list"];

export function useSuppressionList() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: SUPPRESSION_QUERY_KEY,
    queryFn: async () => {
      const result = await getSuppressionEntries();
      if (!result.success) {
        throw new Error(result.error);
      }
      return result.data ?? [];
    },
    staleTime: 60 * 1000,
    retry: 1,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: SUPPRESSION_QUERY_KEY });

  const addMutation = useMutation({
    mutationFn: (
      input: SuppressionEntryInput
    ): Promise<ActionResult<{ duplicate: boolean; entry?: SuppressionEntry }>> =>
      addSuppressionEntry(input),
    onSuccess: (result) => {
      // Duplicado também: outro admin pode ter acabado de adicionar.
      if (result.success) invalidate();
    },
  });

  const removeMutation = useMutation({
    mutationFn: (id: string): Promise<ActionResult<void>> => removeSuppressionEntry(id),
    onSuccess: (result, id) => {
      if (result.success) {
        queryClient.setQueryData<SuppressionEntry[]>(SUPPRESSION_QUERY_KEY, (old) =>
          old?.filter((e) => e.id !== id) ?? []
        );
        invalidate();
      }
    },
  });

  const importMutation = useMutation({
    mutationFn: (rows: SuppressionImportRow[]): Promise<ActionResult<SuppressionImportReport>> =>
      importSuppressionEntries(rows),
    // Sempre: um import parcial (chunk falhou depois de outros gravados) muda a tabela.
    onSettled: () => {
      invalidate();
    },
  });

  return {
    entries: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error?.message ?? null,
    refetch: query.refetch,
    addEntry: addMutation.mutateAsync,
    removeEntry: removeMutation.mutateAsync,
    importEntries: importMutation.mutateAsync,
    isAdding: addMutation.isPending,
    isRemoving: removeMutation.isPending,
    isImporting: importMutation.isPending,
  };
}
