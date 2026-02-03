/**
 * Campaigns Hook
 * Story 5.1: Campaigns Page & Data Model
 * Story 5.9: Campaign Save & Multiple Campaigns
 *
 * AC 5.1: #1 - View campaigns list
 * AC 5.1: #4 - Create new campaign
 * AC 5.1: #5 - Lead count per campaign
 * AC 5.9: #1, #3, #5 - Salvar campanha e blocos
 *
 * Delete Campaign:
 * - useDeleteCampaign hook for removing campaigns
 *
 * TanStack Query hooks for managing campaigns server state.
 */

"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  CampaignWithCount,
  CreateCampaignInput,
} from "@/types/campaign";
import type { BuilderBlock } from "@/stores/use-builder-store";
import { BLOCKS_QUERY_KEY } from "@/hooks/use-campaign-blocks";

const QUERY_KEY = ["campaigns"];
const SINGLE_QUERY_KEY = (id: string) => ["campaigns", id];

/**
 * Fetch all campaigns for current tenant
 */
async function fetchCampaigns(): Promise<CampaignWithCount[]> {
  const response = await fetch("/api/campaigns");
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.error?.message || "Erro ao buscar campanhas");
  }
  return result.data;
}

/**
 * Fetch a single campaign by ID
 * Story 5.2: Campaign Builder Canvas
 */
async function fetchCampaign(campaignId: string): Promise<CampaignWithCount> {
  const response = await fetch(`/api/campaigns/${campaignId}`);
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.error?.message || "Erro ao buscar campanha");
  }
  return result.data;
}

/**
 * Create a new campaign
 */
async function createCampaign(
  input: CreateCampaignInput
): Promise<CampaignWithCount> {
  const response = await fetch("/api/campaigns", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.error?.message || "Erro ao criar campanha");
  }
  return result.data;
}

/**
 * Hook to fetch campaigns list
 * AC: #1, #5 - View campaigns with lead count
 */
export function useCampaigns() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchCampaigns,
    staleTime: 60_000, // 1 minute
  });
}

/**
 * Hook to fetch a single campaign by ID
 * Story 5.2: Campaign Builder Canvas
 * AC: #1 - Route to builder page
 */
export function useCampaign(campaignId: string | undefined) {
  return useQuery({
    queryKey: SINGLE_QUERY_KEY(campaignId || ""),
    queryFn: () => fetchCampaign(campaignId!),
    enabled: !!campaignId,
    staleTime: 60_000, // 1 minute
  });
}

/**
 * Hook to create a new campaign
 * AC: #4 - Create new campaign with status draft
 */
export function useCreateCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createCampaign,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}

// ==============================================
// Story 5.9: Campaign Save & Multiple Campaigns
// ==============================================

/**
 * Input for saving campaign
 */
export interface SaveCampaignInput {
  name?: string;
  blocks?: BuilderBlock[];
  productId?: string | null;
}

/**
 * Save campaign name and/or blocks
 * AC 5.9: #1 - Salvar campanha
 */
async function saveCampaign(
  campaignId: string,
  input: SaveCampaignInput
): Promise<CampaignWithCount> {
  const response = await fetch(`/api/campaigns/${campaignId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.error?.message || "Erro ao salvar campanha");
  }
  return result.data;
}

/**
 * Hook to save campaign (name and/or blocks)
 * AC 5.9: #1 - Salvar campanha
 * AC 5.9: #3 - Editar nome da campanha
 * AC 5.9: #5 - Feedback visual de salvamento
 *
 * @param campaignId - Campaign UUID
 * @returns Mutation with isPending, isError, error states
 */
export function useSaveCampaign(campaignId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: SaveCampaignInput) => saveCampaign(campaignId, input),
    onSuccess: () => {
      // Invalidate campaigns list
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      // Invalidate single campaign
      queryClient.invalidateQueries({ queryKey: SINGLE_QUERY_KEY(campaignId) });
      // Invalidate blocks cache
      queryClient.invalidateQueries({ queryKey: BLOCKS_QUERY_KEY(campaignId) });
    },
  });
}

// ==============================================
// Delete Campaign
// ==============================================

/**
 * Delete a campaign by ID
 */
async function deleteCampaign(campaignId: string): Promise<void> {
  const response = await fetch(`/api/campaigns/${campaignId}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    const result = await response.json();
    throw new Error(result.error?.message || "Erro ao remover campanha");
  }
  // 204 No Content - no body to parse
}

/**
 * Hook to delete a campaign
 * Invalidates campaigns list on success
 *
 * @returns Mutation with mutate(campaignId), isPending, isError, error states
 */
export function useDeleteCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteCampaign,
    onSuccess: () => {
      // Invalidate campaigns list to refresh
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}
