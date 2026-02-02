/**
 * Campaign Blocks Hook
 * Story 5.9: Campaign Save & Multiple Campaigns
 *
 * AC: #2, #7 - Carregar blocos existentes
 *
 * TanStack Query hook for fetching campaign blocks.
 */

"use client";

import { useQuery } from "@tanstack/react-query";
import type { BuilderBlock } from "@/stores/use-builder-store";

/**
 * Query key for campaign blocks
 */
export const BLOCKS_QUERY_KEY = (campaignId: string) => [
  "campaigns",
  campaignId,
  "blocks",
];

/**
 * Fetch blocks for a campaign
 * Returns empty array for new campaigns
 */
async function fetchCampaignBlocks(campaignId: string): Promise<BuilderBlock[]> {
  const response = await fetch(`/api/campaigns/${campaignId}/blocks`);
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.error?.message || "Erro ao buscar blocos");
  }
  return result.data;
}

/**
 * Hook to fetch campaign blocks
 * AC: #2 - Carregar blocos existentes
 * AC: #7 - Campanha nova vs existente
 *
 * @param campaignId - Campaign UUID
 * @returns Query result with blocks array
 */
export function useCampaignBlocks(campaignId: string | undefined) {
  return useQuery({
    queryKey: BLOCKS_QUERY_KEY(campaignId || ""),
    queryFn: () => fetchCampaignBlocks(campaignId!),
    enabled: !!campaignId,
    staleTime: 60_000, // 1 minute
  });
}
