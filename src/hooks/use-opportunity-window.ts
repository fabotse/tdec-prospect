"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import type {
  OpportunityConfig,
  LeadTracking,
  OpportunityLead,
} from "@/types/tracking";
import {
  evaluateOpportunityWindow,
  getDefaultConfig,
} from "@/lib/services/opportunity-engine";

export const OPPORTUNITY_CONFIG_QUERY_KEY = (id: string) => [
  "opportunity-config",
  id,
];

async function fetchOpportunityConfig(
  campaignId: string
): Promise<OpportunityConfig | null> {
  const response = await fetch(
    `/api/campaigns/${campaignId}/opportunity-config`
  );
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error || "Erro ao buscar configuracao");
  return result.data;
}

async function saveOpportunityConfig(
  campaignId: string,
  config: { minOpens: number; periodDays: number }
): Promise<OpportunityConfig> {
  const response = await fetch(
    `/api/campaigns/${campaignId}/opportunity-config`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    }
  );
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error || "Erro ao salvar configuracao");
  return result.data;
}

export function useOpportunityConfig(
  campaignId: string,
  options?: { enabled?: boolean }
) {
  const query = useQuery({
    queryKey: OPPORTUNITY_CONFIG_QUERY_KEY(campaignId),
    queryFn: () => fetchOpportunityConfig(campaignId),
    staleTime: 5 * 60 * 1000,
    enabled: (options?.enabled ?? true) && !!campaignId,
  });

  const config = useMemo(
    () => (query.data === null ? getDefaultConfig(campaignId) : query.data),
    [query.data, campaignId]
  );

  return {
    ...query,
    data: config,
  };
}

export function useSaveOpportunityConfig(campaignId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (config: { minOpens: number; periodDays: number }) =>
      saveOpportunityConfig(campaignId, config),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: OPPORTUNITY_CONFIG_QUERY_KEY(campaignId),
      });
    },
  });
}

export function useOpportunityLeads(
  leads: LeadTracking[] | undefined,
  config: OpportunityConfig | null | undefined
): OpportunityLead[] {
  return useMemo(() => {
    if (!leads || !config) return [];
    return evaluateOpportunityWindow(leads, config);
  }, [leads, config]);
}
