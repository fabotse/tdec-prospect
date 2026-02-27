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
import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
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

const ALL_LEADS_PER_PAGE = 100;

/**
 * Hook for fetching ALL leads with infinite query support
 * Story 12.7: Carregamento completo de leads no dialog de adicionar à campanha
 *
 * Uses useInfiniteQuery to progressively load all pages (per_page=100).
 * If total <= 100, everything loads in a single page (no infinite scroll needed).
 * If total > 100, exposes fetchNextPage for infinite scroll and fetchAllPages for "select all".
 *
 * AC: #1 - All leads available for selection
 * AC: #5 - Search works on the complete set
 */
export function useAllLeads(options?: {
  search?: string;
  segmentId?: string | null;
}) {
  const debouncedSearch = useDebounce(options?.search ?? "", 300);

  const queryFilters = useMemo<MyLeadsFilters>(
    () => ({
      search: debouncedSearch || undefined,
      segmentId: options?.segmentId,
    }),
    [debouncedSearch, options?.segmentId]
  );

  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    error: queryError,
  } = useInfiniteQuery({
    queryKey: ["all-leads", queryFilters],
    queryFn: ({ pageParam }) =>
      fetchMyLeads(queryFilters, pageParam, ALL_LEADS_PER_PAGE),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      if (allPages.length < lastPage.pagination.totalPages) {
        return allPages.length + 1;
      }
      return undefined;
    },
    staleTime: 30 * 1000,
  });

  // Consolidated array of all loaded leads
  const leads = useMemo(
    () => data?.pages.flatMap((page) => page.leads) ?? [],
    [data]
  );

  // Total count from API (first page's meta.total with count: exact)
  const total = data?.pages[0]?.pagination.total ?? 0;

  // Fetch all remaining pages (for "Select all" functionality)
  // Returns the complete leads array from all pages after fetching
  const fetchAllPages = useCallback(async (): Promise<Lead[]> => {
    const totalPages = data?.pages[0]?.pagination.totalPages ?? 1;
    const loadedPages = data?.pages.length ?? 0;
    let allLeads: Lead[] = data?.pages.flatMap((p) => p.leads) ?? [];
    for (let i = loadedPages + 1; i <= totalPages; i++) {
      const result = await fetchNextPage();
      allLeads = result.data?.pages.flatMap((p) => p.leads) ?? allLeads;
    }
    return allLeads;
  }, [data, fetchNextPage]);

  return {
    leads,
    total,
    isLoading,
    isFetchingNextPage,
    hasNextPage: !!hasNextPage,
    fetchNextPage,
    fetchAllPages,
    error: queryError instanceof Error ? queryError.message : null,
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
