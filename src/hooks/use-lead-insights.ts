/**
 * Lead Insights Hook
 * Story 13.6: Pagina de Insights - UI
 *
 * AC: #10 - Hook useLeadInsights com React Query para fetch e mutations
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { InsightStatus } from "@/types/monitoring";

// ========================================
// Types
// ========================================

export interface InsightFilters {
  status?: string; // comma-separated: "new,used,dismissed"
  period?: string; // "7d" | "30d" | "90d" | "all"
  page?: number;
  perPage?: number;
}

export interface InsightLeadData {
  id: string;
  firstName: string;
  lastName: string | null;
  photoUrl: string | null;
  companyName: string | null;
  title: string | null;
  linkedinUrl: string | null;
  phone: string | null;
  email: string | null;
}

export interface InsightWithLead {
  id: string;
  tenantId: string;
  leadId: string;
  postUrl: string;
  postText: string;
  postPublishedAt: string | null;
  relevanceReasoning: string | null;
  suggestion: string | null;
  status: InsightStatus;
  createdAt: string;
  updatedAt: string;
  lead: InsightLeadData;
}

interface InsightsResponse {
  data: InsightWithLead[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// ========================================
// Fetch functions
// ========================================

async function fetchInsights(filters: InsightFilters): Promise<InsightsResponse> {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (filters.period) params.set("period", filters.period);
  if (filters.page) params.set("page", String(filters.page));
  if (filters.perPage) params.set("per_page", String(filters.perPage));

  const response = await fetch(`/api/insights?${params.toString()}`);
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || "Erro ao buscar insights");
  }
  return response.json();
}

async function updateInsightStatus(insightId: string, status: InsightStatus): Promise<void> {
  const response = await fetch(`/api/insights/${insightId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || "Erro ao atualizar insight");
  }
}

async function fetchNewInsightsCount(): Promise<number> {
  const response = await fetch("/api/insights/new-count");
  if (!response.ok) {
    throw new Error("Erro ao buscar contagem de insights");
  }
  const result = await response.json();
  return result.data.count;
}

// ========================================
// Hooks
// ========================================

/**
 * Hook to fetch insights with pagination and filters
 * AC: #10 - React Query with staleTime 2 minutes
 */
export function useLeadInsights(filters: InsightFilters = {}) {
  const {
    data,
    isLoading,
    isFetching,
    error: queryError,
    refetch,
  } = useQuery({
    queryKey: ["insights", filters],
    queryFn: () => fetchInsights(filters),
    staleTime: 2 * 60 * 1000, // 2 minutes
  });

  return {
    insights: data?.data ?? [],
    meta: data?.meta ?? null,
    isLoading,
    isFetching,
    error: queryError instanceof Error ? queryError.message : null,
    refetch,
  };
}

/**
 * Hook to update insight status (used/dismissed)
 * Invalidates both insights list and new count (sidebar badge)
 */
export function useUpdateInsightStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ insightId, status }: { insightId: string; status: InsightStatus }) =>
      updateInsightStatus(insightId, status),
    onSuccess: (_data, { status }) => {
      const statusLabels: Record<InsightStatus, string> = {
        new: "Insight reaberto",
        used: "Insight marcado como usado",
        dismissed: "Insight descartado",
      };
      toast.success(statusLabels[status]);
      queryClient.invalidateQueries({ queryKey: ["insights"] });
      queryClient.invalidateQueries({ queryKey: ["insights-new-count"] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

/**
 * Hook for sidebar badge - count of new insights
 * Short staleTime (30s) so badge updates frequently
 */
export function useNewInsightsCount() {
  return useQuery({
    queryKey: ["insights-new-count"],
    queryFn: fetchNewInsightsCount,
    staleTime: 30 * 1000, // 30 seconds
    refetchInterval: 60 * 1000, // Auto-refetch every 60 seconds
  });
}
