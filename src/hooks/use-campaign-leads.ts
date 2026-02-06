/**
 * Campaign Leads Hook
 * Story 5.7: Campaign Lead Association
 * Story 6.6: Personalized Icebreakers
 *
 * Hook for managing leads associated with a campaign.
 * Uses TanStack Query for server state management.
 *
 * AC 5.7: #4 - Add leads to campaign
 * AC 5.7: #7 - View leads associated
 * AC 5.7: #8 - Remove leads from campaign
 * AC 6.6 #1: Lead Preview Selector - fetches leads for preview
 */

"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Lead } from "@/types/lead";
import type { APIErrorResponse } from "@/types/api";

/**
 * Cached LinkedIn posts structure (Story 6.5.7)
 */
interface LinkedInPostsCacheResponse {
  posts: Array<{
    text: string;
    publishedAt: string;
    postUrl?: string;
  }>;
  fetchedAt: string;
  profileUrl: string;
}

/**
 * Lead data returned from campaign leads API
 * Uses snake_case as it comes directly from Supabase join
 * Story 6.5.7: Added icebreaker fields for premium icebreaker integration
 */
interface CampaignLeadResponse {
  id: string;
  added_at: string;
  lead: {
    id: string;
    first_name: string;
    last_name: string | null;
    email: string | null;
    company_name: string | null;
    title: string | null;
    photo_url: string | null;
    /** Story 6.5.7: Premium icebreaker text */
    icebreaker: string | null;
    /** Story 6.5.7: Timestamp when icebreaker was generated */
    icebreaker_generated_at: string | null;
    /** Story 6.5.7: Cached LinkedIn posts for source display */
    linkedin_posts_cache: LinkedInPostsCacheResponse | null;
  };
}

/**
 * Simplified LinkedIn posts cache for campaign leads
 * Story 6.5.7: Used for icebreaker source display in preview
 * Note: Uses simplified post structure (subset of full LinkedInPost)
 */
export interface CampaignLeadLinkedInPostsCache {
  posts: Array<{
    text: string;
    publishedAt: string;
    postUrl?: string;
  }>;
  fetchedAt: string;
  profileUrl: string;
}

/**
 * Campaign lead with transformed lead data (camelCase)
 * Story 6.5.7: Added icebreaker fields for premium icebreaker integration
 */
export interface CampaignLeadWithLead {
  id: string;
  addedAt: string;
  lead: Pick<
    Lead,
    "id" | "firstName" | "lastName" | "email" | "companyName" | "title" | "photoUrl" | "icebreaker" | "icebreakerGeneratedAt"
  > & {
    /** Story 6.5.7: Simplified LinkedIn posts cache for tooltip display */
    linkedinPostsCache: CampaignLeadLinkedInPostsCache | null;
  };
}

/**
 * Transform API response to CampaignLeadWithLead
 * Story 6.5.7: Added icebreaker field transformation
 */
function transformCampaignLead(
  response: CampaignLeadResponse
): CampaignLeadWithLead {
  return {
    id: response.id,
    addedAt: response.added_at,
    lead: {
      id: response.lead.id,
      firstName: response.lead.first_name,
      lastName: response.lead.last_name,
      email: response.lead.email,
      companyName: response.lead.company_name,
      title: response.lead.title,
      photoUrl: response.lead.photo_url,
      // Story 6.5.7: Premium icebreaker fields
      icebreaker: response.lead.icebreaker,
      icebreakerGeneratedAt: response.lead.icebreaker_generated_at,
      linkedinPostsCache: response.lead.linkedin_posts_cache,
    },
  };
}

/**
 * Fetch campaign leads from API
 */
async function fetchCampaignLeads(
  campaignId: string
): Promise<CampaignLeadWithLead[]> {
  const response = await fetch(`/api/campaigns/${campaignId}/leads`);
  const result = await response.json();

  if (result.error) {
    throw new Error(result.error.message);
  }

  return (result.data as CampaignLeadResponse[]).map(transformCampaignLead);
}

/**
 * Add leads to campaign via API
 */
async function addLeadsToApi(
  campaignId: string,
  leadIds: string[]
): Promise<{ added: number }> {
  const response = await fetch(`/api/campaigns/${campaignId}/leads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ leadIds }),
  });

  const result = await response.json();

  if (result.error) {
    throw new Error(result.error.message);
  }

  return { added: result.meta?.added ?? leadIds.length };
}

/**
 * Remove lead from campaign via API
 */
async function removeLeadFromApi(
  campaignId: string,
  leadId: string
): Promise<void> {
  const response = await fetch(`/api/campaigns/${campaignId}/leads/${leadId}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    const result = (await response.json()) as APIErrorResponse;
    throw new Error(result.error?.message || "Erro ao remover lead");
  }
}

/**
 * Hook for managing leads associated with a campaign
 * Story 5.7: AC #4, #7, #8
 *
 * @param campaignId - Campaign UUID or null (for new campaigns)
 * @returns Campaign leads data, mutations, and loading states
 */
export function useCampaignLeads(campaignId: string | null) {
  const queryClient = useQueryClient();

  // Query for fetching campaign leads
  // Story 6.6: 5 minute cache for lead preview selector
  const {
    data,
    isLoading,
    isFetching,
    error: queryError,
    refetch,
  } = useQuery({
    queryKey: ["campaign-leads", campaignId],
    queryFn: () => fetchCampaignLeads(campaignId!),
    enabled: !!campaignId,
    staleTime: 5 * 60 * 1000, // 5 minutes cache
  });

  // Mutation for adding leads
  const addLeads = useMutation({
    mutationFn: async (leadIds: string[]) => {
      if (!campaignId) throw new Error("ID da campanha e obrigatorio");
      return addLeadsToApi(campaignId, leadIds);
    },
    onSuccess: (result, variables) => {
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ["campaign-leads", campaignId] });
      queryClient.invalidateQueries({ queryKey: ["campaigns", campaignId] });

      // Show success toast
      const count = variables.length;
      toast.success(
        `${count} lead${count > 1 ? "s" : ""} adicionado${count > 1 ? "s" : ""}`
      );
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Erro ao adicionar leads"
      );
    },
  });

  // Mutation for removing a lead
  const removeLead = useMutation({
    mutationFn: async (leadId: string) => {
      if (!campaignId) throw new Error("ID da campanha e obrigatorio");
      return removeLeadFromApi(campaignId, leadId);
    },
    onSuccess: () => {
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ["campaign-leads", campaignId] });
      queryClient.invalidateQueries({ queryKey: ["campaigns", campaignId] });

      toast.success("Lead removido da campanha");
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Erro ao remover lead"
      );
    },
  });

  return {
    // Data
    leads: data ?? [],
    leadCount: data?.length ?? 0,

    // Loading states
    isLoading,
    isFetching,
    error: queryError instanceof Error ? queryError.message : null,

    // Refetch
    refetch,

    // Mutations
    addLeads,
    removeLead,

    // Mutation states
    isAdding: addLeads.isPending,
    isRemoving: removeLead.isPending,
  };
}
