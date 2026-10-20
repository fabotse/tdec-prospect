"use client";

/**
 * Knowledge Base Proofs Hook
 * Story: 24.7 - Seção de Provas na Knowledge Base
 *
 * AC: #1 - CRUD operations for proofs
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getProofs,
  createProof,
  updateProof,
  deleteProof,
} from "@/actions/knowledge-base";
import type {
  KnowledgeBaseProof,
  ProofInput,
  ActionResult,
} from "@/types/knowledge-base";

const QUERY_KEY = ["knowledge-base", "proofs"];

/**
 * Hook for managing knowledge base proofs
 * Uses TanStack Query for fetching and CRUD mutations
 */
export function useKnowledgeBaseProofs() {
  const queryClient = useQueryClient();

  // Fetch proofs
  const {
    data: queryData,
    isLoading,
    error: queryError,
  } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const result = await getProofs();
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
      data: ProofInput
    ): Promise<ActionResult<KnowledgeBaseProof>> => {
      return createProof(data);
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
      data: ProofInput;
    }): Promise<ActionResult<KnowledgeBaseProof>> => {
      return updateProof(id, data);
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
      return deleteProof(id);
    },
    onSuccess: (result, deletedId) => {
      if (result.success) {
        queryClient.setQueryData<KnowledgeBaseProof[]>(QUERY_KEY, (old) =>
          old?.filter((proof) => proof.id !== deletedId) ?? []
        );
        queryClient.invalidateQueries({ queryKey: ["knowledge-base", "context"] });
      }
    },
  });

  // Wrapper functions
  const create = async (
    data: ProofInput
  ): Promise<ActionResult<KnowledgeBaseProof>> => {
    return createMutation.mutateAsync(data);
  };

  const update = async (
    id: string,
    data: ProofInput
  ): Promise<ActionResult<KnowledgeBaseProof>> => {
    return updateMutation.mutateAsync({ id, data });
  };

  const remove = async (id: string): Promise<ActionResult<void>> => {
    return deleteMutation.mutateAsync(id);
  };

  return {
    proofs: queryData ?? [],
    isLoading,
    error: queryError?.message ?? null,
    createProof: create,
    updateProof: update,
    deleteProof: remove,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}
