"use client";

/**
 * ICP Definition Hook
 * Story: 2.6 - Knowledge Base Editor - ICP Definition
 *
 * AC: #7 - Save ICP settings with success feedback
 * AC: #8 - Load previously saved ICP settings
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getICPDefinition, saveICPDefinition } from "@/actions/knowledge-base";
import type { ICPDefinitionInput, ActionResult } from "@/types/knowledge-base";

const QUERY_KEY = ["knowledge-base", "icp"];

/**
 * Hook for managing ICP definition settings
 * Uses TanStack Query for fetching and mutations
 */
export function useICPDefinition() {
  const queryClient = useQueryClient();

  // Fetch ICP definition settings
  const {
    data: queryData,
    isLoading,
    error: queryError,
  } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const result = await getICPDefinition();
      if (!result.success) {
        throw new Error(result.error);
      }
      return result.data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
  });

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async (data: ICPDefinitionInput): Promise<ActionResult<void>> => {
      return saveICPDefinition(data);
    },
    onSuccess: (result, variables) => {
      if (result.success) {
        // Update cache with new data
        queryClient.setQueryData(QUERY_KEY, variables);
        // Story 6.9 FIX: Invalidate KB context cache so AI generation uses updated ICP info
        // This ensures Campaign Builder fetches fresh settings after saving
        queryClient.invalidateQueries({ queryKey: ["knowledge-base", "context"] });
      }
    },
  });

  // Wrapper function for saving that returns the result
  const saveICP = async (
    data: ICPDefinitionInput
  ): Promise<ActionResult<void>> => {
    return saveMutation.mutateAsync(data);
  };

  return {
    data: queryData ?? null,
    isLoading,
    error: queryError?.message ?? null,
    saveICP,
    isSaving: saveMutation.isPending,
  };
}
