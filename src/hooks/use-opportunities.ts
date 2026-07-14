/**
 * Opportunities Hooks
 * Story 21.4: Central de Oportunidades — Página e Cards
 *
 * Espelha use-lead-insights.ts (useLeadInsights/useNewInsightsCount/useUpdateInsightStatus).
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Opportunity, OpportunityStatus } from "@/types/opportunity";
import { OPPORTUNITY_STATUS_CONFIG } from "@/types/opportunity";

// ========================================
// Types
// ========================================

export interface OpportunityFilters {
  intent?: string; // comma-separated: "interessado,pediu_info"
  status?: string; // comma-separated: "new,viewed"
  campaignId?: string;
  period?: string; // "7d" | "30d" | "90d" | "all"
  search?: string; // busca CLIENT-SIDE (não vai à API — filtra a página carregada)
  page?: number;
  perPage?: number;
}

export interface OpportunityLeadData {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  companyName: string | null;
  title: string | null;
  phone: string | null;
  photoUrl: string | null;
  isMonitored: boolean;
  linkedinUrl: string | null;
}

export interface OpportunityInsightData {
  leadId: string;
  suggestion: string | null;
  relevanceReasoning: string | null;
  postUrl: string | null;
  postText: string | null;
  postPublishedAt: string | null;
  createdAt: string;
}

/** DTO enriquecido do card (API GET /api/opportunities). */
export interface OpportunityCardData extends Opportunity {
  lead: OpportunityLeadData | null;
  campaignName: string | null;
  insight: OpportunityInsightData | null;
}

interface OpportunitiesResponse {
  data: OpportunityCardData[];
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

async function fetchOpportunities(
  filters: Omit<OpportunityFilters, "search">
): Promise<OpportunitiesResponse> {
  const params = new URLSearchParams();
  if (filters.intent) params.set("intent", filters.intent);
  if (filters.status) params.set("status", filters.status);
  if (filters.campaignId) params.set("campaign_id", filters.campaignId);
  if (filters.period) params.set("period", filters.period);
  if (filters.page) params.set("page", String(filters.page));
  if (filters.perPage) params.set("per_page", String(filters.perPage));

  const response = await fetch(`/api/opportunities?${params.toString()}`);
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || "Erro ao buscar oportunidades");
  }
  return response.json();
}

async function updateOpportunityStatus(
  opportunityId: string,
  status: OpportunityStatus
): Promise<void> {
  const response = await fetch(`/api/opportunities/${opportunityId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || "Erro ao atualizar oportunidade");
  }
}

async function fetchNewOpportunitiesCount(): Promise<number> {
  const response = await fetch("/api/opportunities/new-count");
  if (!response.ok) {
    throw new Error("Erro ao buscar contagem de oportunidades");
  }
  const result = await response.json();
  return result.data.count;
}

// ========================================
// Client-side search (decisão Task 7.2)
// ========================================

/**
 * Busca client-side por nome/e-mail/empresa sobre a página carregada.
 * Os campos vivem no lead embedado (não em colunas de `opportunities`),
 * então o filtro no servidor exigiria sintaxe de filtro no embed do
 * PostgREST — decisão da story: filtrar client-side (limitação: página atual).
 */
export function filterOpportunitiesBySearch(
  opportunities: OpportunityCardData[],
  search: string | undefined
): OpportunityCardData[] {
  const term = search?.trim().toLowerCase();
  if (!term) return opportunities;

  return opportunities.filter((opportunity) => {
    const lead = opportunity.lead;
    const haystack = [
      lead ? [lead.firstName, lead.lastName].filter(Boolean).join(" ") : null,
      lead?.email,
      lead?.companyName,
    ];
    return haystack.some((value) => value?.toLowerCase().includes(term));
  });
}

// ========================================
// Hooks
// ========================================

/**
 * Lista de oportunidades com filtros server-side + paginação.
 * `search` NÃO entra na queryKey (é client-side — evita refetch por tecla).
 */
export function useOpportunities(filters: OpportunityFilters = {}) {
  const serverFilters: Omit<OpportunityFilters, "search"> = {
    intent: filters.intent,
    status: filters.status,
    campaignId: filters.campaignId,
    period: filters.period,
    page: filters.page,
    perPage: filters.perPage,
  };

  const {
    data,
    isLoading,
    isFetching,
    error: queryError,
    refetch,
  } = useQuery({
    queryKey: ["opportunities", serverFilters],
    queryFn: () => fetchOpportunities(serverFilters),
    staleTime: 2 * 60 * 1000, // 2 minutes
  });

  return {
    opportunities: data?.data ?? [],
    meta: data?.meta ?? null,
    isLoading,
    isFetching,
    error: queryError instanceof Error ? queryError.message : null,
    refetch,
  };
}

/**
 * Badge da sidebar — contagem de oportunidades status='new'.
 */
export function useNewOpportunitiesCount() {
  return useQuery({
    queryKey: ["opportunities-new-count"],
    queryFn: fetchNewOpportunitiesCount,
    staleTime: 30 * 1000, // 30 seconds
    refetchInterval: 60 * 1000, // Auto-refetch every 60 seconds
  });
}

export interface UpdateOpportunityStatusInput {
  opportunityId: string;
  status: OpportunityStatus;
  /**
   * Transição passiva (new→viewed ao abrir o card): sem toast de sucesso.
   * Os toasts de ação explícita (contatada/reunião/descartada) são da 21.5.
   */
  silent?: boolean;
}

/**
 * Mutation de status. Invalida a lista E a contagem do badge (AC5:
 * abrir card new → badge da sidebar decrementa).
 */
export function useUpdateOpportunityStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ opportunityId, status }: UpdateOpportunityStatusInput) =>
      updateOpportunityStatus(opportunityId, status),
    onSuccess: (_data, { status, silent }) => {
      if (!silent) {
        toast.success(
          `Oportunidade marcada como ${OPPORTUNITY_STATUS_CONFIG[status].label.toLowerCase()}`
        );
      }
      queryClient.invalidateQueries({ queryKey: ["opportunities"] });
      queryClient.invalidateQueries({ queryKey: ["opportunities-new-count"] });
    },
    onError: (error: Error, { silent }) => {
      // Transição passiva (new→viewed ao abrir): não assustar o usuário com um
      // toast vermelho de uma ação que ele não pediu. Erros de ação explícita
      // (21.5) seguem notificando.
      if (!silent) toast.error(error.message);
    },
  });
}
