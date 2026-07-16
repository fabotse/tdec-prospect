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

/** Retorno da rota de rascunho (21.5). `cached: true` = veio do cache, sem custo. */
export interface SuggestionResponse {
  suggestion: string | null;
  cached?: boolean;
}

/**
 * Resultado do PATCH de status (21.5). `leadPromoted` reflete o efeito
 * SECUNDÁRIO do servidor (leads.status → 'oportunidade' em `meeting_booked`):
 * `false` quando a oportunidade não tem lead ou o update falhou. Existe para o
 * toast não afirmar uma promoção que não aconteceu.
 */
export interface UpdateStatusResult {
  leadPromoted: boolean;
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
): Promise<UpdateStatusResult> {
  const response = await fetch(`/api/opportunities/${opportunityId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || "Erro ao atualizar oportunidade");
  }
  // `meta.leadPromoted` diz se o efeito secundário do servidor REALMENTE ocorreu
  // (oportunidade sem lead / update do lead falhou → false). Rota antiga ou body
  // ilegível degradam para `false`: o toast fica genérico, nunca mente.
  try {
    const body = (await response.json()) as { meta?: { leadPromoted?: boolean } };
    return { leadPromoted: body?.meta?.leadPromoted === true };
  } catch {
    return { leadPromoted: false };
  }
}

async function fetchOpportunitySuggestion(
  opportunityId: string,
  regenerate: boolean
): Promise<SuggestionResponse> {
  const response = await fetch(`/api/opportunities/${opportunityId}/suggestion`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ regenerate }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || "Erro ao gerar rascunho");
  }
  const result = await response.json();
  return result.data;
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
    onSuccess: (result, { status, silent }) => {
      if (!silent) {
        // meeting_booked tem copy própria: o PATCH promove o lead a
        // 'oportunidade' (21.5) — um efeito que o usuário não vê nesta tela.
        // Só AFIRMAR a promoção quando ela de fato ocorreu: a oportunidade pode
        // não ter lead (`lead_id` é nullable — 21.2 cria cards sem lead) e o
        // update do lead é secundário (erro só loga no servidor).
        toast.success(
          status === "meeting_booked"
            ? result.leadPromoted
              ? "Reunião marcada — lead promovido a oportunidade"
              : "Reunião marcada"
            : `Oportunidade marcada como ${OPPORTUNITY_STATUS_CONFIG[status].label.toLowerCase()}`
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

/**
 * Rascunho de próximo passo por IA (Story 21.5 — AC1/AC2/AC5).
 *
 * `generate()` é a geração PASSIVA (disparada ao abrir o card): silenciosa,
 * nunca rejeita e nunca dá toast — se a IA falhar, o card segue utilizável
 * com as demais ações (AC5). `regenerate()` é a ação EXPLÍCITA: bypassa o
 * cache do servidor e notifica o erro.
 */
export function useOpportunitySuggestion(opportunityId: string) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: ({ regenerate }: { regenerate: boolean }) =>
      fetchOpportunitySuggestion(opportunityId, regenerate),
    onSuccess: (data) => {
      // Update PONTUAL do cache — não `invalidateQueries`. O rascunho muda UM
      // campo de UMA linha; invalidar a lista inteira a cada abertura de card
      // amplificaria o churn já apontado no defer da review 21.4.
      if (!data.suggestion) return;
      queryClient.setQueriesData<OpportunitiesResponse>(
        { queryKey: ["opportunities"] },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            data: old.data.map((opportunity) =>
              opportunity.id === opportunityId
                ? { ...opportunity, suggestion: data.suggestion }
                : opportunity
            ),
          };
        }
      );
    },
    onError: (error: Error, { regenerate }) => {
      // Só a ação explícita notifica (mesma regra do `silent` do status).
      if (regenerate) toast.error(error.message);
    },
  });

  const run = async (regenerate: boolean): Promise<SuggestionResponse | null> => {
    try {
      return await mutation.mutateAsync({ regenerate });
    } catch {
      // Erro já tratado no onError. Resolver com null mantém o card intacto (AC5).
      return null;
    }
  };

  return {
    generate: () => run(false),
    regenerate: () => run(true),
    isGenerating: mutation.isPending,
    error: mutation.error instanceof Error ? mutation.error.message : null,
    data: mutation.data ?? null,
  };
}
