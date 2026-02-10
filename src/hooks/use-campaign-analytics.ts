/**
 * Campaign Analytics Hook
 * Story 10.3: Instantly Analytics Service (Polling)
 *
 * AC: #1, #2, #6 — TanStack Query hooks for campaign analytics
 *
 * - useCampaignAnalytics: fetch analytics with 5min staleTime
 * - useSyncAnalytics: mutation to trigger manual sync + invalidate cache
 */

"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { CampaignAnalytics, SyncResult } from "@/types/tracking";

// ==============================================
// QUERY KEYS
// ==============================================

export const ANALYTICS_QUERY_KEY = (id: string) => ["campaign-analytics", id];

// ==============================================
// FETCH FUNCTIONS
// ==============================================

async function fetchAnalytics(campaignId: string): Promise<CampaignAnalytics> {
  const response = await fetch(`/api/campaigns/${campaignId}/analytics`);
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.error || "Erro ao buscar analytics");
  }
  return result.data;
}

async function syncAnalytics(campaignId: string): Promise<SyncResult> {
  const response = await fetch(`/api/campaigns/${campaignId}/analytics/sync`, {
    method: "POST",
  });
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.error || "Erro ao sincronizar analytics");
  }
  return result.data;
}

// ==============================================
// HOOKS
// ==============================================

/**
 * Fetch campaign analytics.
 * AC: #1 — CampaignAnalytics with totals and rates
 * AC: #6 — lastSyncAt included, data from polling (not persisted)
 */
export function useCampaignAnalytics(campaignId: string) {
  return useQuery({
    queryKey: ANALYTICS_QUERY_KEY(campaignId),
    queryFn: () => fetchAnalytics(campaignId),
    staleTime: 5 * 60 * 1000,
    enabled: !!campaignId,
  });
}

/**
 * Trigger manual sync (analytics + daily).
 * AC: #2 — syncAnalytics returns SyncResult with full data
 * Invalidates analytics query on success.
 */
export function useSyncAnalytics(campaignId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => syncAnalytics(campaignId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ANALYTICS_QUERY_KEY(campaignId) });
    },
  });
}
