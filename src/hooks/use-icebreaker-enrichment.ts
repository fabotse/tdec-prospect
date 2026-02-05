/**
 * Icebreaker Enrichment Hook
 * Story 6.5.6: Icebreaker UI - Lead Table Integration
 *
 * AC: #2 - Bulk icebreaker generation via selection bar
 * AC: #3 - Single lead generation from detail panel
 * AC: #4 - Loading states during generation
 *
 * TanStack Query hook for generating icebreakers from LinkedIn posts.
 * Uses the /api/leads/enrich-icebreaker endpoint created in Story 6.5.5.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { IcebreakerCategory } from "@/types/ai-prompt";

// ==============================================
// TYPES
// ==============================================

/**
 * Result for a single lead's icebreaker generation
 */
export interface IcebreakerResult {
  leadId: string;
  success: boolean;
  icebreaker?: string;
  error?: string;
  /** Story 9.1: True if category was changed due to fallback (e.g., post→lead) */
  categoryFallback?: boolean;
  /** Story 9.1: Original category before fallback */
  originalCategory?: string;
}

/**
 * Summary of bulk icebreaker generation
 */
export interface IcebreakerSummary {
  total: number;
  generated: number;
  skipped: number;
  failed: number;
}

/**
 * Response from /api/leads/enrich-icebreaker endpoint
 */
interface EnrichIcebreakerResponse {
  success: boolean;
  results: IcebreakerResult[];
  summary: IcebreakerSummary;
}

/**
 * Options for the icebreaker enrichment hook
 */
interface UseIcebreakerEnrichmentOptions {
  /** Callback for progress updates during bulk generation */
  onProgress?: (current: number, total: number) => void;
  /** Callback when all icebreakers are generated */
  onComplete?: (results: IcebreakerResult[], summary: IcebreakerSummary) => void;
}

// ==============================================
// COST ESTIMATION
// ==============================================

/**
 * Cost per lead for icebreaker generation (Apify + OpenAI)
 * Story 6.5.6: AC #2 - Cost estimate in confirmation dialog
 */
const COST_PER_LEAD = 0.004;

/**
 * Format estimated cost for display
 * @param leadCount - Number of leads to generate icebreakers for
 * @returns Formatted cost string (e.g., "~$0.04" or "<$0.01")
 */
export function estimateIcebreakerCost(leadCount: number): string {
  const cost = leadCount * COST_PER_LEAD;
  return cost < 0.01 ? "<$0.01" : `~$${cost.toFixed(2)}`;
}

// ==============================================
// API FUNCTIONS
// ==============================================

/**
 * Generate icebreakers for a batch of leads
 * Calls /api/leads/enrich-icebreaker endpoint
 * Story 9.1: Added category parameter
 */
async function generateIcebreakers(
  leadIds: string[],
  regenerate: boolean = false,
  category?: IcebreakerCategory
): Promise<EnrichIcebreakerResponse> {
  const response = await fetch("/api/leads/enrich-icebreaker", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ leadIds, regenerate, ...(category && { category }) }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || "Erro ao gerar icebreakers");
  }

  return response.json();
}

// ==============================================
// HOOK IMPLEMENTATION
// ==============================================

/**
 * Hook for icebreaker generation
 * Story 6.5.6: AC #2, #3, #4 - Generation with feedback
 *
 * @param options - Optional callbacks for progress and completion
 * @returns Mutation and helper functions for icebreaker generation
 */
export function useIcebreakerEnrichment(options?: UseIcebreakerEnrichmentOptions) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: ({ leadIds, regenerate, category }: { leadIds: string[]; regenerate?: boolean; category?: IcebreakerCategory }) =>
      generateIcebreakers(leadIds, regenerate, category),
    onSuccess: (data) => {
      // Invalidate lead queries to refresh data
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["my-leads"] });

      // Story 9.1 AC #3: Show fallback toast for category changes
      const fallbackResults = data.results.filter((r) => r.categoryFallback);
      if (fallbackResults.length > 0) {
        toast.info(
          fallbackResults.length === 1
            ? "Lead sem posts — Ice Breaker gerado com foco no perfil"
            : `${fallbackResults.length} leads sem posts — Ice Breakers gerados com foco no perfil`
        );
      }

      // Show summary toast
      const { summary } = data;
      if (summary.generated > 0) {
        const message = summary.failed > 0
          ? `${summary.generated} icebreakers gerados, ${summary.failed} erros`
          : `${summary.generated} icebreakers gerados`;
        toast.success(message);
      } else if (summary.skipped > 0) {
        toast.info(`${summary.skipped} leads já tinham icebreaker`);
      } else if (summary.failed > 0) {
        toast.error(`Falha ao gerar icebreakers: ${summary.failed} erros`);
      }
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  /**
   * Generate icebreaker for a single lead
   * AC: #3 - Single lead generation from detail panel
   * Story 9.1: Added optional category parameter
   *
   * @param leadId - UUID of the lead
   * @param regenerate - If true, regenerate even if icebreaker exists
   * @param category - Icebreaker focus category (defaults to "empresa" on server)
   */
  const generateForLead = async (leadId: string, regenerate: boolean = false, category?: IcebreakerCategory) => {
    return mutation.mutateAsync({ leadIds: [leadId], regenerate, category });
  };

  /**
   * Generate icebreakers for multiple leads with progress tracking
   * AC: #2 - Bulk generation with progress updates
   * Story 9.1: Added optional category parameter
   *
   * Processes leads one by one to provide real-time progress.
   * Uses direct API call instead of mutation to avoid double toasts.
   *
   * @param leadIds - Array of lead UUIDs
   * @param regenerate - If true, regenerate even if icebreaker exists
   * @param category - Icebreaker focus category (defaults to "empresa" on server)
   */
  const generateForLeads = async (leadIds: string[], regenerate: boolean = false, category?: IcebreakerCategory) => {
    const allResults: IcebreakerResult[] = [];
    const summary: IcebreakerSummary = {
      total: leadIds.length,
      generated: 0,
      skipped: 0,
      failed: 0,
    };

    // Process one lead at a time for progress tracking
    // Call API directly to avoid triggering mutation's onSuccess toast for each lead
    for (let i = 0; i < leadIds.length; i++) {
      options?.onProgress?.(i + 1, leadIds.length);

      try {
        const result = await generateIcebreakers([leadIds[i]], regenerate, category);

        // Story 9.1 AC #3: Show fallback toast per lead
        const fallbackResults = result.results.filter((r) => r.categoryFallback);
        if (fallbackResults.length > 0) {
          toast.info("Lead sem posts — Ice Breaker gerado com foco no perfil");
        }

        allResults.push(...result.results);
        summary.generated += result.summary.generated;
        summary.skipped += result.summary.skipped;
        summary.failed += result.summary.failed;
      } catch (error) {
        // Track failure but continue with other leads
        const errorMessage = error instanceof Error ? error.message : "Erro ao processar lead";
        summary.failed += 1;
        allResults.push({
          leadId: leadIds[i],
          success: false,
          error: errorMessage,
        });
      }
    }

    // Invalidate queries to refresh data after bulk operation
    queryClient.invalidateQueries({ queryKey: ["leads"] });
    queryClient.invalidateQueries({ queryKey: ["my-leads"] });

    // Call completion callback
    options?.onComplete?.(allResults, summary);

    // Show single summary toast (not per-lead toasts)
    if (summary.generated > 0) {
      const message = summary.failed > 0
        ? `${summary.generated} icebreakers gerados, ${summary.failed} erros`
        : `${summary.generated} icebreakers gerados com sucesso`;
      toast.success(message);
    } else if (summary.failed > 0) {
      toast.error(`Falha ao gerar icebreakers: ${summary.failed} erros`);
    }

    return { results: allResults, summary };
  };

  return {
    /** The underlying mutation object */
    mutation,
    /** Generate icebreaker for a single lead */
    generateForLead,
    /** Generate icebreakers for multiple leads with progress */
    generateForLeads,
    /** Whether generation is in progress */
    isGenerating: mutation.isPending,
    /** Last error from generation attempt */
    error: mutation.error,
  };
}
