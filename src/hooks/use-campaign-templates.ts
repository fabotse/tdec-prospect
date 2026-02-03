/**
 * Campaign Templates Hook
 * Story 6.13: Smart Campaign Templates
 *
 * AC #1: Fetch templates for wizard display
 * AC #2: Parse and validate structure_json
 *
 * TanStack Query hook for fetching campaign templates.
 * Caches templates for 5 minutes to reduce API calls.
 */

"use client";

import { useQuery } from "@tanstack/react-query";
import type { CampaignTemplate } from "@/types/campaign-template";

const TEMPLATES_KEY = ["campaign-templates"];

interface ApiError {
  code: string;
  message: string;
}

interface ApiResponse<T> {
  data?: T;
  error?: ApiError;
}

/**
 * Fetch all active campaign templates
 * AC #1: Templates fetched from API with caching
 */
async function fetchCampaignTemplates(): Promise<CampaignTemplate[]> {
  const response = await fetch("/api/campaign-templates");
  const result: ApiResponse<CampaignTemplate[]> = await response.json();

  if (!response.ok) {
    throw new Error(result.error?.message || "Erro ao buscar templates");
  }

  return result.data || [];
}

/**
 * Hook to fetch campaign templates
 *
 * AC #1: Templates displayed in wizard
 * AC #2: Structure_json parsed and validated
 *
 * @returns Query result with templates array, loading state, and error
 *
 * @example
 * ```tsx
 * const { data: templates, isLoading, error } = useCampaignTemplates();
 * ```
 */
export function useCampaignTemplates() {
  return useQuery({
    queryKey: TEMPLATES_KEY,
    queryFn: fetchCampaignTemplates,
    staleTime: 5 * 60 * 1000, // 5 minutes cache (templates rarely change)
    gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
  });
}

/**
 * Export query key for testing and invalidation
 */
export { TEMPLATES_KEY };
