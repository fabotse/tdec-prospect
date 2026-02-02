/**
 * Segments Hook
 * Story 4.1: Lead Segments/Lists
 *
 * AC: #1 - Create segment
 * AC: #2 - Add leads to segment
 * AC: #4 - View segment list
 * AC: #5 - Delete segment
 *
 * TanStack Query hooks for managing segments server state.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { SegmentWithCount, SegmentInsert, LeadDataForSegment } from "@/types/segment";

const QUERY_KEY = ["segments"];

async function fetchSegments(): Promise<SegmentWithCount[]> {
  const response = await fetch("/api/segments");
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || "Erro ao buscar segmentos");
  }
  const result = await response.json();
  return result.data;
}

async function createSegment(data: SegmentInsert): Promise<SegmentWithCount> {
  const response = await fetch("/api/segments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || "Erro ao criar segmento");
  }
  const result = await response.json();
  return result.data;
}

async function deleteSegment(segmentId: string): Promise<void> {
  const response = await fetch(`/api/segments/${segmentId}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || "Erro ao remover segmento");
  }
}

/**
 * Add leads to segment
 * Sends full lead data to API which upserts leads before creating associations
 */
async function addLeadsToSegment(
  segmentId: string,
  leads: LeadDataForSegment[]
): Promise<{ added: number }> {
  const response = await fetch(`/api/segments/${segmentId}/leads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ leads }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || "Erro ao adicionar leads ao segmento");
  }
  const result = await response.json();
  return result.data;
}

async function removeLeadsFromSegment(
  segmentId: string,
  leadIds: string[]
): Promise<{ removed: number }> {
  const response = await fetch(`/api/segments/${segmentId}/leads`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ leadIds }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || "Erro ao remover leads do segmento");
  }
  const result = await response.json();
  return result.data;
}

async function fetchSegmentLeadIds(segmentId: string): Promise<string[]> {
  const response = await fetch(`/api/segments/${segmentId}/leads`);
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || "Erro ao buscar leads do segmento");
  }
  const result = await response.json();
  return result.data.leadIds;
}

/**
 * Hook to fetch segments with lead counts
 * AC: #4 - View segment list ordered alphabetically
 */
export function useSegments() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchSegments,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Hook to fetch lead IDs in a specific segment
 * AC: #3 - For filtering leads by segment
 */
export function useSegmentLeadIds(segmentId: string | null) {
  return useQuery({
    queryKey: [...QUERY_KEY, segmentId, "leads"],
    queryFn: () => (segmentId ? fetchSegmentLeadIds(segmentId) : Promise.resolve([])),
    enabled: !!segmentId,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}

/**
 * Hook to create a segment
 * AC: #1 - Create segment with name and description
 */
export function useCreateSegment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createSegment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}

/**
 * Hook to delete a segment
 * AC: #5 - Delete segment
 */
export function useDeleteSegment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteSegment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}

/**
 * Hook to add leads to a segment
 * AC: #2 - Add leads to segment
 * Now accepts full lead data for upsert before association
 */
export function useAddLeadsToSegment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ segmentId, leads }: { segmentId: string; leads: LeadDataForSegment[] }) =>
      addLeadsToSegment(segmentId, leads),
    onSuccess: (_data, variables) => {
      // Invalidate segments list (for lead count updates)
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      // Invalidate specific segment's lead IDs (for filtering)
      queryClient.invalidateQueries({ queryKey: [...QUERY_KEY, variables.segmentId, "leads"] });
    },
  });
}

/**
 * Hook to remove leads from a segment
 */
export function useRemoveLeadsFromSegment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ segmentId, leadIds }: { segmentId: string; leadIds: string[] }) =>
      removeLeadsFromSegment(segmentId, leadIds),
    onSuccess: (_data, variables) => {
      // Invalidate segments list (for lead count updates)
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      // Invalidate specific segment's lead IDs (for filtering)
      queryClient.invalidateQueries({ queryKey: [...QUERY_KEY, variables.segmentId, "leads"] });
    },
  });
}
