/**
 * Lead Tracking Hook
 * Story 10.3: Instantly Analytics Service (Polling)
 *
 * AC: #3, #6 — TanStack Query hook for lead-level tracking data
 *
 * - useLeadTracking: fetch per-lead tracking (openCount, clickCount, hasReplied, lastOpenAt)
 */

"use client";

import { useQuery } from "@tanstack/react-query";
import type { LeadTracking } from "@/types/tracking";

// ==============================================
// QUERY KEYS
// ==============================================

export const LEAD_TRACKING_QUERY_KEY = (id: string) => ["lead-tracking", id];

// ==============================================
// FETCH FUNCTIONS
// ==============================================

async function fetchLeadTracking(campaignId: string): Promise<LeadTracking[]> {
  const response = await fetch(`/api/campaigns/${campaignId}/leads/tracking`);
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.error || "Erro ao buscar tracking de leads");
  }
  return result.data;
}

// ==============================================
// HOOKS
// ==============================================

/**
 * Fetch lead-level tracking data for a campaign.
 * AC: #3 — LeadTracking[] with openCount, clickCount, hasReplied, lastOpenAt
 * AC: #6 — Data from polling, not persisted
 */
export function useLeadTracking(campaignId: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: LEAD_TRACKING_QUERY_KEY(campaignId),
    queryFn: () => fetchLeadTracking(campaignId),
    staleTime: 5 * 60 * 1000,
    enabled: (options?.enabled ?? true) && !!campaignId,
  });
}
