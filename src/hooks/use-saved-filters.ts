/**
 * Saved Filters Hook
 * Story 3.7: Saved Filters / Favorites
 *
 * AC: #1 - Create saved filter
 * AC: #2 - List saved filters
 * AC: #4 - Delete saved filter
 *
 * TanStack Query hooks for managing saved filter server state.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { SavedFilter, SavedFilterInsert } from "@/types/saved-filter";

const QUERY_KEY = ["saved-filters"];

async function fetchSavedFilters(): Promise<SavedFilter[]> {
  const response = await fetch("/api/filters/saved");
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || "Erro ao buscar filtros salvos");
  }
  const result = await response.json();
  return result.data;
}

async function createSavedFilter(data: SavedFilterInsert): Promise<SavedFilter> {
  const response = await fetch("/api/filters/saved", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || "Erro ao salvar filtro");
  }
  const result = await response.json();
  return result.data;
}

async function deleteSavedFilter(filterId: string): Promise<void> {
  const response = await fetch(`/api/filters/saved/${filterId}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || "Erro ao remover filtro");
  }
}

/**
 * Hook to fetch saved filters
 * AC: #2 - List saved filters ordered by created_at
 */
export function useSavedFilters() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchSavedFilters,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Hook to create a saved filter
 * AC: #1 - Save filter configuration with name
 */
export function useCreateSavedFilter() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createSavedFilter,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}

/**
 * Hook to delete a saved filter
 * AC: #4 - Delete saved filter
 */
export function useDeleteSavedFilter() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteSavedFilter,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}
