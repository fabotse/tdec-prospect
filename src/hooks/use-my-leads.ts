/**
 * My Leads Hook
 * Story 4.2.2: My Leads Page
 * Story 4.6: Interested Leads Highlighting
 *
 * Hook for fetching and managing imported leads from the database.
 * Unlike useLeads (which fetches from Apollo), this hook fetches
 * leads that have been persisted to the database.
 *
 * AC: #2, #3, #7 - Fetch imported leads with filtering and pagination
 * Story 4.6: AC #2 - useInterestedCount hook for quick filter badge
 */

"use client";

import { useState, useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useDebounce } from "./use-debounce";
import type { Lead } from "@/types/lead";
import type { APISuccessResponse, APIErrorResponse } from "@/types/api";
import { isAPIError } from "@/types/api";

const MY_LEADS_QUERY_KEY = ["my-leads"];
const DEFAULT_PAGE = 1;
const DEFAULT_PER_PAGE = 25;

/**
 * Filter options for My Leads
 */
export interface MyLeadsFilters {
  statuses?: string[];
  segmentId?: string | null;
  search?: string;
}

/**
 * Pagination metadata
 */
export interface MyLeadsPagination {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * Result from My Leads fetch
 */
interface MyLeadsResult {
  leads: Lead[];
  pagination: MyLeadsPagination;
}

/**
 * Fetch leads from database API
 */
async function fetchMyLeads(
  filters: MyLeadsFilters,
  page: number,
  perPage: number
): Promise<MyLeadsResult> {
  const params = new URLSearchParams();

  if (filters.statuses && filters.statuses.length > 0) {
    params.set("status", filters.statuses.join(","));
  }
  if (filters.segmentId) {
    params.set("segment_id", filters.segmentId);
  }
  if (filters.search) {
    params.set("search", filters.search);
  }
  params.set("page", page.toString());
  params.set("per_page", perPage.toString());

  const response = await fetch(`/api/leads?${params.toString()}`);
  const result = (await response.json()) as
    | APISuccessResponse<Lead[]>
    | APIErrorResponse;

  if (isAPIError(result)) {
    throw new Error(result.error.message);
  }

  return {
    leads: result.data,
    pagination: {
      total: result.meta?.total ?? 0,
      page: result.meta?.page ?? 1,
      limit: result.meta?.limit ?? perPage,
      totalPages: result.meta?.totalPages ?? 1,
    },
  };
}

/**
 * Hook for fetching imported leads from database
 * Story 4.2.2: AC #2, #3, #7
 *
 * @param initialFilters - Initial filter values
 * @returns Leads data, pagination, loading state, and control functions
 */
export function useMyLeads(initialFilters?: MyLeadsFilters) {
  const [filters, setFilters] = useState<MyLeadsFilters>(initialFilters ?? {});
  const [page, setPageState] = useState(DEFAULT_PAGE);
  const [perPage, setPerPageState] = useState(DEFAULT_PER_PAGE);

  // Debounce search input (300ms)
  const debouncedSearch = useDebounce(filters.search ?? "", 300);

  // Memoize query filters to prevent unnecessary refetches
  const queryFilters = useMemo(
    () => ({
      ...filters,
      search: debouncedSearch || undefined,
    }),
    [filters, debouncedSearch]
  );

  const {
    data,
    isLoading,
    isFetching,
    error: queryError,
    refetch,
  } = useQuery({
    queryKey: [...MY_LEADS_QUERY_KEY, queryFilters, page, perPage],
    queryFn: () => fetchMyLeads(queryFilters, page, perPage),
    staleTime: 30 * 1000, // 30 seconds (DB data changes more frequently than Apollo)
  });

  // Page setter with validation
  const setPage = useCallback((newPage: number) => {
    setPageState(Math.max(1, newPage));
  }, []);

  // Per page setter with validation and page reset
  const setPerPage = useCallback((newPerPage: number) => {
    setPerPageState(Math.max(1, Math.min(newPerPage, 100)));
    setPageState(DEFAULT_PAGE); // Reset to page 1
  }, []);

  // Update filters and reset page to 1
  const updateFilters = useCallback((newFilters: Partial<MyLeadsFilters>) => {
    setFilters((prev) => ({ ...prev, ...newFilters }));
    setPageState(DEFAULT_PAGE); // Reset to page 1 when filters change
  }, []);

  // Clear all filters
  const clearFilters = useCallback(() => {
    setFilters({});
    setPageState(DEFAULT_PAGE);
  }, []);

  return {
    leads: data?.leads ?? [],
    pagination: data?.pagination ?? null,
    isLoading,
    isFetching,
    error: queryError instanceof Error ? queryError.message : null,
    refetch,
    // Filters
    filters,
    updateFilters,
    clearFilters,
    // Pagination
    page,
    perPage,
    setPage,
    setPerPage,
  };
}

/**
 * Fetch count of interested leads
 * Story 4.6: AC #2, #6 - Count for quick filter badge and header
 */
async function fetchInterestedCount(): Promise<number> {
  const params = new URLSearchParams();
  params.set("status", "interessado");
  params.set("page", "1");
  params.set("per_page", "1"); // Only need the total count, not the data

  const response = await fetch(`/api/leads?${params.toString()}`);
  const result = (await response.json()) as
    | APISuccessResponse<Lead[]>
    | APIErrorResponse;

  if (isAPIError(result)) {
    throw new Error(result.error.message);
  }

  return result.meta?.total ?? 0;
}

/**
 * Hook for fetching count of interested leads
 * Story 4.6: AC #2 - Quick filter badge count
 * Story 4.6: AC #6 - Header interested count
 *
 * @returns Count of interested leads and loading state
 */
export function useInterestedCount() {
  const { data, isLoading } = useQuery({
    queryKey: ["my-leads", "interested-count"],
    queryFn: fetchInterestedCount,
    staleTime: 30 * 1000, // 30 seconds
  });

  return {
    count: data ?? 0,
    isLoading,
  };
}
