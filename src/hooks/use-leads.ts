/**
 * Leads Hook
 * Story: 3.1 - Leads Page & Data Model
 * Story: 3.2 - Apollo API Integration Service
 * Story: 3.8 - Lead Table Pagination
 * Story: 4.1 - Lead Segments/Lists
 *
 * AC: #6 - TanStack Query structure for fetching leads
 * AC: #6 - Uses Apollo API via /api/integrations/apollo
 * Story 3.8: AC #2, #5, #6 - Pagination state management
 * Story 4.1: AC #3 - Segment filtering (client-side via filterLeadsBySegment)
 */

"use client";

import { useCallback, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Lead } from "@/types/lead";
import type { ApolloSearchFilters, PaginationMeta } from "@/types/apollo";
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
// PAGINATION TYPES (Story 3.8)
// ==============================================

/**
 * Result from leads fetch including pagination
 * Story 3.8: AC #1 - Returns leads with pagination metadata
 */
interface LeadsResult {
  leads: Lead[];
  pagination: PaginationMeta;
}

/**
 * Default pagination values
 */
const DEFAULT_PAGE = 1;
const DEFAULT_PER_PAGE = 25;

// ==============================================
// API FUNCTIONS
// ==============================================

/**
 * Fetch leads from Apollo API
 * Story 3.8: Now returns leads with pagination metadata
 * AC: #6 - Actual fetch call to /api/integrations/apollo
 */
async function fetchLeadsFromApollo(
  filters: ApolloSearchFilters
): Promise<LeadsResult> {
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

  // Story 3.8: Extract pagination from meta
  const pagination: PaginationMeta = {
    totalEntries: result.meta?.total ?? 0,
    page: result.meta?.page ?? DEFAULT_PAGE,
    perPage: result.meta?.limit ?? DEFAULT_PER_PAGE,
    totalPages: result.meta?.totalPages ?? 1,
  };

  return {
    leads: result.data,
    pagination,
  };
}

// ==============================================
// HOOKS
// ==============================================

/**
 * Hook for fetching leads with optional filters
 * Story 3.2: Now fetches from Apollo API
 * Story 3.8: Returns pagination metadata
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
    data: data?.leads ?? [],
    pagination: data?.pagination ?? null,
    isLoading,
    isFetching,
    error: queryError instanceof Error ? queryError.message : null,
    refetch,
  };
}

/**
 * Hook for searching leads with Apollo filters and pagination
 * Story 3.2: Provides mutation for on-demand search
 * Story 3.8: AC #2, #5, #6 - Pagination state management
 */
export function useSearchLeads() {
  const queryClient = useQueryClient();

  // Story 3.8: AC #5 - Pagination state
  const [page, setPageState] = useState(DEFAULT_PAGE);
  const [perPage, setPerPageState] = useState(DEFAULT_PER_PAGE);

  const mutation = useMutation({
    mutationFn: fetchLeadsFromApollo,
    onSuccess: (data, variables) => {
      // Cache the results
      queryClient.setQueryData([...LEADS_QUERY_KEY, variables], data);
    },
  });

  // Story 3.8: AC #2 - Set page with validation
  const setPage = useCallback((newPage: number) => {
    setPageState(Math.max(1, Math.min(newPage, 500)));
  }, []);

  // Story 3.8: AC #3, #5 - Set perPage and reset page to 1
  const setPerPage = useCallback((newPerPage: number) => {
    setPerPageState(Math.max(1, Math.min(newPerPage, 100)));
    setPageState(DEFAULT_PAGE); // Reset to page 1 when changing page size
  }, []);

  // Story 3.8: AC #5 - Reset page when searching with new filters
  // Fix: Allow explicit page/perPage override via filters to avoid race condition
  const search = useCallback(
    (filters: ApolloSearchFilters) => {
      // Include current pagination in the request
      // Explicit page/perPage in filters override internal state (for race condition fix)
      const filtersWithPagination = {
        page,
        perPage,
        ...filters, // Explicit values override defaults
      };
      mutation.mutate(filtersWithPagination);
    },
    [mutation, page, perPage]
  );

  const searchAsync = useCallback(
    async (filters: ApolloSearchFilters) => {
      // Explicit page/perPage in filters override internal state (for race condition fix)
      const filtersWithPagination = {
        page,
        perPage,
        ...filters, // Explicit values override defaults
      };
      return mutation.mutateAsync(filtersWithPagination);
    },
    [mutation, page, perPage]
  );

  // Story 3.8: AC #5 - Reset page to 1 (call when filters change)
  const resetPage = useCallback(() => {
    setPageState(DEFAULT_PAGE);
  }, []);

  return {
    search,
    searchAsync,
    data: mutation.data?.leads ?? [],
    pagination: mutation.data?.pagination ?? null,
    isLoading: mutation.isPending,
    error: mutation.error instanceof Error ? mutation.error.message : null,
    reset: mutation.reset,
    // Story 3.8: Pagination controls
    page,
    perPage,
    setPage,
    setPerPage,
    resetPage,
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
  const cachedData = queryClient.getQueryData<LeadsResult>(LEADS_QUERY_KEY);

  return {
    count: cachedData?.leads?.length ?? 0,
    totalEntries: cachedData?.pagination?.totalEntries ?? 0,
    isLoading: false,
    error: null,
  };
}

// ==============================================
// SEGMENT FILTERING UTILITIES (Story 4.1)
// ==============================================

/**
 * Filter leads by segment membership
 * Story 4.1: AC #3 - Client-side filtering for leads in a segment
 *
 * @param leads - Array of leads to filter
 * @param segmentLeadIds - Array of lead IDs that belong to the segment (from useSegmentLeadIds)
 * @returns Filtered array of leads that are in the segment
 */
export function filterLeadsBySegment(
  leads: Lead[],
  segmentLeadIds: string[] | null | undefined
): Lead[] {
  if (!segmentLeadIds || segmentLeadIds.length === 0) {
    return leads;
  }
  const segmentIdSet = new Set(segmentLeadIds);
  return leads.filter((lead) => segmentIdSet.has(lead.id));
}

/**
 * Filter leads by status
 * Story 4.2: AC #3 - Client-side filtering for leads by status
 *
 * @param leads - Array of leads to filter
 * @param statuses - Array of lead statuses to filter by
 * @returns Filtered array of leads with matching status
 */
export function filterLeadsByStatus(
  leads: Lead[],
  statuses: string[] | null | undefined
): Lead[] {
  if (!statuses || statuses.length === 0) {
    return leads;
  }
  const statusSet = new Set(statuses);
  return leads.filter((lead) => statusSet.has(lead.status));
}
