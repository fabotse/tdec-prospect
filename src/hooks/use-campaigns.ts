/**
 * Campaigns Hook
 * Story 5.1: Campaigns Page & Data Model
 *
 * AC: #1 - View campaigns list
 * AC: #4 - Create new campaign
 * AC: #5 - Lead count per campaign
 *
 * TanStack Query hooks for managing campaigns server state.
 */

"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  CampaignWithCount,
  CreateCampaignInput,
} from "@/types/campaign";

const QUERY_KEY = ["campaigns"];

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
