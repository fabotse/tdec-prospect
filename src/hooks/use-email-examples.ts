"use client";

/**
 * Email Examples Hook
 * Story: 2.5 - Knowledge Base Editor - Tone & Examples
 *
 * AC: #5 - CRUD operations for email examples
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getEmailExamples,
  createEmailExample,
  updateEmailExample,
  deleteEmailExample,
} from "@/actions/knowledge-base";
import type {
  EmailExample,
  EmailExampleInput,
  ActionResult,
} from "@/types/knowledge-base";

const QUERY_KEY = ["knowledge-base", "examples"];

/**
 * Hook for managing email examples
 * Uses TanStack Query for fetching and CRUD mutations
 */
export function useEmailExamples() {
  const queryClient = useQueryClient();

  // Fetch email examples
  const {
    data: queryData,
    isLoading,
    error: queryError,
  } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const result = await getEmailExamples();
      if (!result.success) {
        throw new Error(result.error);
      }
      return result.data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (
      data: EmailExampleInput
    ): Promise<ActionResult<EmailExample>> => {
      return createEmailExample(data);
    },
    onSuccess: (result) => {
      if (result.success) {
        // Invalidate and refetch the list
        queryClient.invalidateQueries({ queryKey: QUERY_KEY });
        // Story 6.9 FIX: Invalidate KB context cache so AI generation uses updated examples
        queryClient.invalidateQueries({ queryKey: ["knowledge-base", "context"] });
      }
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: EmailExampleInput;
    }): Promise<ActionResult<EmailExample>> => {
      return updateEmailExample(id, data);
    },
    onSuccess: (result) => {
      if (result.success) {
        // Invalidate and refetch the list
        queryClient.invalidateQueries({ queryKey: QUERY_KEY });
        // Story 6.9 FIX: Invalidate KB context cache so AI generation uses updated examples
        queryClient.invalidateQueries({ queryKey: ["knowledge-base", "context"] });
      }
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string): Promise<ActionResult<void>> => {
      return deleteEmailExample(id);
    },
    onSuccess: (result, deletedId) => {
      if (result.success) {
        // Optimistically remove from cache
        queryClient.setQueryData<EmailExample[]>(QUERY_KEY, (old) =>
          old?.filter((example) => example.id !== deletedId) ?? []
        );
        // Story 6.9 FIX: Invalidate KB context cache so AI generation uses updated examples
        queryClient.invalidateQueries({ queryKey: ["knowledge-base", "context"] });
      }
    },
  });

  // Wrapper functions
  const create = async (
    data: EmailExampleInput
  ): Promise<ActionResult<EmailExample>> => {
    return createMutation.mutateAsync(data);
  };

  const update = async (
    id: string,
    data: EmailExampleInput
  ): Promise<ActionResult<EmailExample>> => {
    return updateMutation.mutateAsync({ id, data });
  };

  const remove = async (id: string): Promise<ActionResult<void>> => {
    return deleteMutation.mutateAsync(id);
  };

  return {
    examples: queryData ?? [],
    isLoading,
    error: queryError?.message ?? null,
    createExample: create,
    updateExample: update,
    deleteExample: remove,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}
