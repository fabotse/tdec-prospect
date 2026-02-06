"use client";

/**
 * Icebreaker Examples Hook
 * Story: 9.2 - Exemplos de Referencia para Ice Breakers no Knowledge Base
 *
 * AC: #1, #2 - CRUD operations for icebreaker examples
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getIcebreakerExamples,
  createIcebreakerExample,
  updateIcebreakerExample,
  deleteIcebreakerExample,
} from "@/actions/knowledge-base";
import type {
  IcebreakerExample,
  IcebreakerExampleInput,
  ActionResult,
} from "@/types/knowledge-base";

const QUERY_KEY = ["knowledge-base", "icebreaker-examples"];

/**
 * Hook for managing icebreaker examples
 * Uses TanStack Query for fetching and CRUD mutations
 */
export function useIcebreakerExamples() {
  const queryClient = useQueryClient();

  // Fetch icebreaker examples
  const {
    data: queryData,
    isLoading,
    error: queryError,
  } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const result = await getIcebreakerExamples();
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
      data: IcebreakerExampleInput
    ): Promise<ActionResult<IcebreakerExample>> => {
      return createIcebreakerExample(data);
    },
    onSuccess: (result) => {
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: QUERY_KEY });
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
      data: IcebreakerExampleInput;
    }): Promise<ActionResult<IcebreakerExample>> => {
      return updateIcebreakerExample(id, data);
    },
    onSuccess: (result) => {
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: QUERY_KEY });
        queryClient.invalidateQueries({ queryKey: ["knowledge-base", "context"] });
      }
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string): Promise<ActionResult<void>> => {
      return deleteIcebreakerExample(id);
    },
    onSuccess: (result, deletedId) => {
      if (result.success) {
        queryClient.setQueryData<IcebreakerExample[]>(QUERY_KEY, (old) =>
          old?.filter((example) => example.id !== deletedId) ?? []
        );
        queryClient.invalidateQueries({ queryKey: ["knowledge-base", "context"] });
      }
    },
  });

  // Wrapper functions
  const create = async (
    data: IcebreakerExampleInput
  ): Promise<ActionResult<IcebreakerExample>> => {
    return createMutation.mutateAsync(data);
  };

  const update = async (
    id: string,
    data: IcebreakerExampleInput
  ): Promise<ActionResult<IcebreakerExample>> => {
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
