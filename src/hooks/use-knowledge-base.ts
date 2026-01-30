"use client";

/**
 * Knowledge Base Hook
 * Story: 2.4 - Knowledge Base Editor - Company Profile
 *
 * AC: #3 - Save data with success feedback
 * AC: #5 - Load previously saved data
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getCompanyProfile,
  saveCompanyProfile,
} from "@/actions/knowledge-base";
import type { CompanyProfile, ActionResult } from "@/types/knowledge-base";

const QUERY_KEY = ["knowledge-base", "company"];

/**
 * Hook for managing company profile knowledge base data
 * Uses TanStack Query for fetching and mutations
 */
export function useKnowledgeBase() {
  const queryClient = useQueryClient();

  // Fetch company profile
  const {
    data: queryData,
    isLoading,
    error: queryError,
  } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const result = await getCompanyProfile();
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
    mutationFn: async (data: CompanyProfile): Promise<ActionResult<void>> => {
      return saveCompanyProfile(data);
    },
    onSuccess: (result, variables) => {
      if (result.success) {
        // Update cache with new data
        queryClient.setQueryData(QUERY_KEY, variables);
      }
    },
  });

  // Wrapper function for saving that returns the result
  const saveCompany = async (
    data: CompanyProfile
  ): Promise<ActionResult<void>> => {
    return saveMutation.mutateAsync(data);
  };

  return {
    data: queryData ?? null,
    isLoading,
    error: queryError?.message ?? null,
    saveCompany,
    isSaving: saveMutation.isPending,
  };
}
