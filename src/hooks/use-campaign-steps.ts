/**
 * Campaign Steps Hook
 * Story 14.6: Tooltip com Preview do Email por Step
 *
 * AC: #3 — Cache with staleTime: Infinity (steps don't change during campaign)
 * AC: #6 — Non-blocking loading state
 */

"use client";

import { useQuery } from "@tanstack/react-query";
import type { CampaignStep } from "@/types/tracking";

// ==============================================
// QUERY KEYS
// ==============================================

export const CAMPAIGN_STEPS_QUERY_KEY = (id: string) => ["campaign-steps", id];

// ==============================================
// FETCH
// ==============================================

async function fetchCampaignSteps(campaignId: string): Promise<CampaignStep[]> {
  const response = await fetch(`/api/campaigns/${campaignId}/steps`);
  let result: { data?: CampaignStep[]; error?: string };
  try {
    result = await response.json();
  } catch {
    throw new Error("Erro ao buscar steps da campanha");
  }
  if (!response.ok) {
    throw new Error(result.error || "Erro ao buscar steps da campanha");
  }
  return result.data ?? [];
}

// ==============================================
// HOOK
// ==============================================

export function useCampaignSteps(campaignId: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: CAMPAIGN_STEPS_QUERY_KEY(campaignId),
    queryFn: () => fetchCampaignSteps(campaignId),
    select: (steps) => {
      const map = new Map<number, string>();
      for (const step of steps) {
        if (typeof step.stepNumber === "number" && typeof step.subject === "string" && step.subject) {
          map.set(step.stepNumber, step.subject);
        }
      }
      return map;
    },
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000,
    enabled: (options?.enabled ?? true) && !!campaignId,
  });
}
