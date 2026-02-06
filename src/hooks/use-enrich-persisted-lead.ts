/**
 * Enrich Persisted Lead Hook
 * Story 4.4.1: Lead Data Enrichment
 *
 * AC: #2 - Individual lead enrichment with toast feedback
 * AC: #4 - Bulk lead enrichment with progress feedback
 *
 * TanStack Query hooks for enriching leads already saved in database.
 * Uses Apollo People Enrichment API to get complete data (email, LinkedIn, photo).
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { LeadRow } from "@/types/lead";

/**
 * Result from bulk enrichment API
 */
interface BulkEnrichResult {
  enriched: number;
  notFound: number;
  failed: number;
  leads: LeadRow[];
}

/**
 * Custom error class to include error code from API
 */
class EnrichmentError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "EnrichmentError";
  }
}

/**
 * Enrich a single persisted lead
 * AC: #2 - Calls /api/leads/:leadId/enrich
 */
async function enrichLead(leadId: string): Promise<LeadRow> {
  const response = await fetch(`/api/leads/${leadId}/enrich`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  if (!response.ok) {
    const error = await response.json();
    throw new EnrichmentError(
      error.error?.code || "UNKNOWN_ERROR",
      error.error?.message || "Erro ao enriquecer lead"
    );
  }
  const result = await response.json();
  return result.data;
}

/**
 * Enrich multiple persisted leads
 * AC: #4 - Calls /api/leads/enrich/bulk
 */
async function bulkEnrichLeads(leadIds: string[]): Promise<BulkEnrichResult> {
  const response = await fetch("/api/leads/enrich/bulk", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ leadIds }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || "Erro ao enriquecer leads");
  }
  const result = await response.json();
  return result.data;
}

/**
 * Options for the enrich persisted lead hook
 */
interface UseEnrichPersistedLeadOptions {
  onSuccess?: (lead: LeadRow) => void;
}

/**
 * Hook to enrich a single persisted lead
 * AC: #2 - Individual enrichment with toast feedback
 */
export function useEnrichPersistedLead(options?: UseEnrichPersistedLeadOptions) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (leadId: string) => enrichLead(leadId),
    onSuccess: (lead) => {
      toast.success("Dados do lead enriquecidos com sucesso");
      // Invalidate all lead-related queries to refresh data
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["my-leads"] });
      // Call custom onSuccess callback if provided
      options?.onSuccess?.(lead);
    },
    onError: (error: Error) => {
      // AC: #3 - Handle not found case with specific message
      // Check by error code for robust error handling
      if (error instanceof EnrichmentError && error.code === "NOT_FOUND") {
        toast.warning("Lead não encontrado no Apollo para enriquecimento");
      } else {
        toast.error(error.message);
      }
    },
  });
}

/**
 * Hook to enrich multiple persisted leads
 * AC: #4 - Bulk enrichment with count toast feedback
 */
export function useBulkEnrichPersistedLeads() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (leadIds: string[]) => bulkEnrichLeads(leadIds),
    onSuccess: (result) => {
      // AC: #4 - Show summary of results
      if (result.enriched > 0) {
        toast.success(
          `${result.enriched} leads enriquecidos${result.notFound > 0 ? `, ${result.notFound} não encontrados` : ""}`
        );
      } else if (result.notFound > 0) {
        toast.warning(`${result.notFound} leads não encontrados no Apollo`);
      } else {
        toast.error("Nenhum lead pôde ser enriquecido");
      }
      // Invalidate all lead-related queries to refresh data
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["my-leads"] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}
