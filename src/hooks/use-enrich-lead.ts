/**
 * Lead Enrichment Hook
 * Story: 3.2.1 - People Enrichment Integration
 *
 * TanStack Query mutations for lead enrichment via Apollo API.
 *
 * AC: #1 - Enrichment via API calls
 */

"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Lead } from "@/types/lead";
import type {
  ApolloEnrichmentResponse,
  ApolloEnrichedPerson,
  EnrichmentOptions,
} from "@/types/apollo";
import type { APISuccessResponse, APIErrorResponse } from "@/types/api";
import { isAPIError } from "@/types/api";

// ==============================================
// QUERY KEYS
// ==============================================

const LEADS_QUERY_KEY = ["leads"];
const ENRICHMENT_QUERY_KEY = ["enrichment"];

// ==============================================
// TYPES
// ==============================================

export interface EnrichLeadParams {
  apolloId: string;
  options?: EnrichmentOptions;
}

export interface BulkEnrichLeadsParams {
  apolloIds: string[];
  options?: EnrichmentOptions;
}

// ==============================================
// API FUNCTIONS
// ==============================================

/**
 * Enrich a single lead via API
 */
async function enrichLeadApi(
  params: EnrichLeadParams
): Promise<ApolloEnrichmentResponse> {
  const response = await fetch("/api/integrations/apollo/enrich", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      apolloId: params.apolloId,
      revealPersonalEmails: params.options?.revealPersonalEmails ?? false,
      revealPhoneNumber: params.options?.revealPhoneNumber ?? false,
      webhookUrl: params.options?.webhookUrl,
    }),
  });

  const result = (await response.json()) as
    | APISuccessResponse<ApolloEnrichmentResponse>
    | APIErrorResponse;

  if (isAPIError(result)) {
    throw new Error(result.error.message);
  }

  return result.data;
}

/**
 * Bulk enrich leads via API
 */
async function bulkEnrichLeadsApi(
  params: BulkEnrichLeadsParams
): Promise<ApolloEnrichedPerson[]> {
  const response = await fetch("/api/integrations/apollo/enrich/bulk", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      apolloIds: params.apolloIds,
      revealPersonalEmails: params.options?.revealPersonalEmails ?? false,
      revealPhoneNumber: params.options?.revealPhoneNumber ?? false,
      webhookUrl: params.options?.webhookUrl,
    }),
  });

  const result = (await response.json()) as
    | APISuccessResponse<ApolloEnrichedPerson[]>
    | APIErrorResponse;

  if (isAPIError(result)) {
    throw new Error(result.error.message);
  }

  return result.data;
}

// ==============================================
// HOOKS
// ==============================================

/**
 * Hook for enriching a single lead
 * AC: #1 - TanStack Query mutation for single lead enrichment
 */
export function useEnrichLead() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: enrichLeadApi,
    onSuccess: (data, variables) => {
      // Invalidate leads cache to refetch with enriched data
      queryClient.invalidateQueries({ queryKey: LEADS_QUERY_KEY });

      // Cache enrichment result
      queryClient.setQueryData(
        [...ENRICHMENT_QUERY_KEY, variables.apolloId],
        data
      );
    },
    onMutate: async (variables) => {
      // Optimistic update: mark lead as "enriching"
      await queryClient.cancelQueries({ queryKey: LEADS_QUERY_KEY });

      const previousLeads = queryClient.getQueryData<Lead[]>(LEADS_QUERY_KEY);

      // Update lead with optimistic "enriching" state
      if (previousLeads) {
        queryClient.setQueryData<Lead[]>(
          LEADS_QUERY_KEY,
          previousLeads.map((lead) =>
            lead.apolloId === variables.apolloId
              ? { ...lead, _enriching: true }
              : lead
          ) as Lead[]
        );
      }

      return { previousLeads };
    },
    onError: (_error, _variables, context) => {
      // Rollback on error
      if (context?.previousLeads) {
        queryClient.setQueryData(LEADS_QUERY_KEY, context.previousLeads);
      }
    },
  });

  return {
    enrich: mutation.mutate,
    enrichAsync: mutation.mutateAsync,
    data: mutation.data,
    isLoading: mutation.isPending,
    isSuccess: mutation.isSuccess,
    error: mutation.error instanceof Error ? mutation.error.message : null,
    reset: mutation.reset,
  };
}

/**
 * Hook for bulk enriching leads (up to 10)
 * AC: #4 - TanStack Query mutation for bulk enrichment
 */
export function useBulkEnrichLeads() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: bulkEnrichLeadsApi,
    onSuccess: () => {
      // Invalidate leads cache to refetch with enriched data
      queryClient.invalidateQueries({ queryKey: LEADS_QUERY_KEY });
    },
    onMutate: async (variables) => {
      // Optimistic update: mark leads as "enriching"
      await queryClient.cancelQueries({ queryKey: LEADS_QUERY_KEY });

      const previousLeads = queryClient.getQueryData<Lead[]>(LEADS_QUERY_KEY);

      // Update leads with optimistic "enriching" state
      if (previousLeads) {
        const apolloIdSet = new Set(variables.apolloIds);
        queryClient.setQueryData<Lead[]>(
          LEADS_QUERY_KEY,
          previousLeads.map((lead) =>
            lead.apolloId && apolloIdSet.has(lead.apolloId)
              ? { ...lead, _enriching: true }
              : lead
          ) as Lead[]
        );
      }

      return { previousLeads };
    },
    onError: (_error, _variables, context) => {
      // Rollback on error
      if (context?.previousLeads) {
        queryClient.setQueryData(LEADS_QUERY_KEY, context.previousLeads);
      }
    },
  });

  return {
    enrichBulk: mutation.mutate,
    enrichBulkAsync: mutation.mutateAsync,
    data: mutation.data ?? [],
    isLoading: mutation.isPending,
    isSuccess: mutation.isSuccess,
    error: mutation.error instanceof Error ? mutation.error.message : null,
    reset: mutation.reset,
  };
}
