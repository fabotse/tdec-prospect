"use client";

/**
 * Tone of Voice Hook
 * Story: 2.5 - Knowledge Base Editor - Tone & Examples
 *
 * AC: #2 - Save tone settings with success feedback
 * AC: #3 - Load previously saved tone settings
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getToneOfVoice, saveToneOfVoice } from "@/actions/knowledge-base";
import type { ToneOfVoiceInput, ActionResult } from "@/types/knowledge-base";

const QUERY_KEY = ["knowledge-base", "tone"];

/**
 * Hook for managing tone of voice settings
 * Uses TanStack Query for fetching and mutations
 */
export function useToneOfVoice() {
  const queryClient = useQueryClient();

  // Fetch tone of voice settings
  const {
    data: queryData,
    isLoading,
    error: queryError,
  } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const result = await getToneOfVoice();
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
    mutationFn: async (data: ToneOfVoiceInput): Promise<ActionResult<void>> => {
      return saveToneOfVoice(data);
    },
    onSuccess: (result, variables) => {
      if (result.success) {
        // Update cache with new data
        queryClient.setQueryData(QUERY_KEY, variables);
        // Story 6.9 FIX: Invalidate KB context cache so AI generation uses updated tone
        // This ensures Campaign Builder fetches fresh tone settings after saving
        queryClient.invalidateQueries({ queryKey: ["knowledge-base", "context"] });
      }
    },
  });

  // Wrapper function for saving that returns the result
  const saveTone = async (
    data: ToneOfVoiceInput
  ): Promise<ActionResult<void>> => {
    return saveMutation.mutateAsync(data);
  };

  return {
    data: queryData ?? null,
    isLoading,
    error: queryError?.message ?? null,
    saveTone,
    isSaving: saveMutation.isPending,
  };
}
