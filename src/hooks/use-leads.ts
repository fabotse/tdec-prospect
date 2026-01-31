/**
 * Leads Hook
 * Story: 3.1 - Leads Page & Data Model
 * Story: 3.2 - Apollo API Integration Service
 *
 * AC: #6 - TanStack Query structure for fetching leads
 * AC: #6 - Uses Apollo API via /api/integrations/apollo
 */

"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Lead } from "@/types/lead";
import type { ApolloSearchFilters } from "@/types/apollo";
import type { APISuccessResponse, APIErrorResponse } from "@/types/api";
import { isAPIError } from "@/types/api";

const LEADS_QUERY_KEY = ["leads"];

// ==============================================
// LEGACY FILTERS (from Story 3.1)
// ==============================================

export interface LeadsFilters {
  status?: string;
  industry?: string;
  location?: string;
  search?: string;
}

// ==============================================
// API FUNCTIONS
// ==============================================

/**
 * Fetch leads from Apollo API
 * AC: #6 - Actual fetch call to /api/integrations/apollo
 */
async function fetchLeadsFromApollo(
  filters: ApolloSearchFilters
): Promise<Lead[]> {
  const response = await fetch("/api/integrations/apollo", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(filters),
  });

  const result = (await response.json()) as
    | APISuccessResponse<Lead[]>
    | APIErrorResponse;

  if (isAPIError(result)) {
    throw new Error(result.error.message);
  }

  return result.data;
}

// ==============================================
// HOOKS
// ==============================================

/**
 * Hook for fetching leads with optional filters
 * Story 3.2: Now fetches from Apollo API
 *
 * @param filters - Apollo search filters (optional)
 * @param options - Query options
 */
export function useLeads(
  filters?: ApolloSearchFilters,
  options?: { enabled?: boolean }
) {
  const {
    data,
    isLoading,
    isFetching,
    error: queryError,
    refetch,
  } = useQuery({
    queryKey: [...LEADS_QUERY_KEY, filters],
    queryFn: () => fetchLeadsFromApollo(filters ?? {}),
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled: options?.enabled ?? true,
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
 * Hook for searching leads with Apollo filters
 * Story 3.2: Provides mutation for on-demand search
 */
export function useSearchLeads() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: fetchLeadsFromApollo,
    onSuccess: (data, variables) => {
      // Cache the results
      queryClient.setQueryData([...LEADS_QUERY_KEY, variables], data);
    },
  });

  return {
    search: mutation.mutate,
    searchAsync: mutation.mutateAsync,
    data: mutation.data ?? [],
    isLoading: mutation.isPending,
    error: mutation.error instanceof Error ? mutation.error.message : null,
    reset: mutation.reset,
  };
}

/**
 * Hook for fetching leads count
 * Story 3.2: Returns count from cached search results
 *
 * Note: This hook reads from TanStack Query cache.
 * It will only have data after useLeads or useSearchLeads has fetched.
 */
export function useLeadCount() {
  const queryClient = useQueryClient();

  // Get all cached leads data (from any filter combination)
  const cachedData = queryClient.getQueryData<Lead[]>(LEADS_QUERY_KEY);

  return {
    count: cachedData?.length ?? 0,
    isLoading: false,
    error: null,
  };
}
