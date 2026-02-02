/**
 * Lead Interactions Hooks
 * Story 4.3: Lead Detail View & Interaction History
 *
 * AC: #3 - Interaction history section
 * AC: #4 - Add interaction note
 */

"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  LeadInteraction,
  CreateInteractionInput,
} from "@/types/interaction";
import type { APISuccessResponse, APIErrorResponse } from "@/types/api";
import { isAPIError } from "@/types/api";

const INTERACTIONS_QUERY_KEY = "lead-interactions";

/**
 * Fetch interactions for a lead
 */
async function fetchInteractions(leadId: string): Promise<LeadInteraction[]> {
  const response = await fetch(`/api/leads/${leadId}/interactions`);

  const result = (await response.json()) as
    | APISuccessResponse<LeadInteraction[]>
    | APIErrorResponse;

  if (isAPIError(result)) {
    throw new Error(result.error.message);
  }

  return result.data;
}

/**
 * Create a new interaction
 */
async function createInteraction(
  leadId: string,
  input: CreateInteractionInput
): Promise<LeadInteraction> {
  const response = await fetch(`/api/leads/${leadId}/interactions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  const result = (await response.json()) as
    | APISuccessResponse<LeadInteraction>
    | APIErrorResponse;

  if (isAPIError(result)) {
    throw new Error(result.error.message);
  }

  return result.data;
}

/**
 * Hook for fetching lead interactions
 * AC: #3 - Returns interactions ordered by most recent first
 *
 * @param leadId - The lead ID to fetch interactions for
 * @param options - Query options
 */
export function useLeadInteractions(
  leadId: string | null,
  options?: { enabled?: boolean }
) {
  const {
    data,
    isLoading,
    isFetching,
    error: queryError,
    refetch,
  } = useQuery({
    queryKey: [INTERACTIONS_QUERY_KEY, leadId],
    queryFn: () => fetchInteractions(leadId!),
    enabled: !!leadId && (options?.enabled ?? true),
    staleTime: 30 * 1000, // 30 seconds
  });

  return {
    data: data ?? [],
    isLoading,
    isFetching,
    error: queryError instanceof Error ? queryError.message : null,
    refetch,
  };
}

/**
 * Hook for creating a new interaction
 * AC: #4 - Add interaction note
 *
 * @param leadId - The lead ID to create interaction for
 */
export function useCreateInteraction(leadId: string | null) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (input: CreateInteractionInput) => {
      if (!leadId) {
        throw new Error("Lead ID is required");
      }
      return createInteraction(leadId, input);
    },
    onSuccess: () => {
      // Invalidate and refetch interactions for this lead
      queryClient.invalidateQueries({
        queryKey: [INTERACTIONS_QUERY_KEY, leadId],
      });
    },
  });

  return {
    createInteraction: mutation.mutate,
    createInteractionAsync: mutation.mutateAsync,
    isLoading: mutation.isPending,
    error: mutation.error instanceof Error ? mutation.error.message : null,
    reset: mutation.reset,
  };
}
