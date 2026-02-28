# Story 13.6: Página de Insights — UI

Status: done

## Story

As a Marco (SDR),
I want uma área dedicada no app para visualizar os insights gerados pelo monitoramento,
so that eu veja rapidamente quais leads postaram algo relevante e tenha a sugestão de abordagem pronta para agir.

## Acceptance Criteria

1. Nova rota `/insights` acessível via sidebar (entre "Campanhas" e "Configurações")
2. Tabela de insights com colunas: nome do lead (com avatar), resumo do post (truncado), link original do post (abre em nova aba), sugestão de abordagem, data de detecção
3. Badge no menu lateral indicando quantidade de insights com status `new`
4. Botão "Copiar Sugestão" em cada linha — copia texto para clipboard com feedback toast
5. Ação "Marcar como Usado" — muda status para `used`
6. Ação "Descartar" — muda status para `dismissed`
7. Filtros: status (novos/usados/descartados), período
8. Ordenação padrão: mais recentes primeiro
9. Empty state quando não há insights
10. Hook `useLeadInsights` com React Query para fetch e mutations
11. Testes unitários para componentes e hook

## Tasks / Subtasks

- [x] Task 1: Criar API routes de insights (AC: #2, #5, #6, #8)
  - [x] 1.1 Criar `src/app/api/insights/route.ts` — GET com paginação, filtros (status, período), join com leads para nome/avatar
  - [x] 1.2 Criar `src/app/api/insights/[insightId]/route.ts` — PATCH para atualizar status (new→used, new→dismissed, used→dismissed)
  - [x] 1.3 Criar `src/app/api/insights/new-count/route.ts` — GET retorna count de insights com status='new' (para badge sidebar)

- [x] Task 2: Criar hook useLeadInsights (AC: #10)
  - [x] 2.1 Criar `src/hooks/use-lead-insights.ts`
  - [x] 2.2 Implementar `useLeadInsights(filters?, options?)` — React Query com queryKey `["insights", filters]`
  - [x] 2.3 Implementar `useUpdateInsightStatus()` — mutation com invalidação de cache `["insights"]` + `["insights-new-count"]`
  - [x] 2.4 Implementar `useNewInsightsCount()` — query para badge sidebar com queryKey `["insights-new-count"]`

- [x] Task 3: Criar página e componentes de insights (AC: #1, #2, #3, #4, #5, #6, #7, #8, #9)
  - [x] 3.1 Criar `src/app/(dashboard)/insights/page.tsx` — page com metadata, header, Suspense wrapper
  - [x] 3.2 Criar `src/components/insights/InsightsPageContent.tsx` — componente principal com estado de filtros, paginação, loading/error/empty states
  - [x] 3.3 Criar `src/components/insights/InsightsTable.tsx` — tabela de insights com colunas definidas
  - [x] 3.4 Criar `src/components/insights/InsightsFilterBar.tsx` — filtros de status e período
  - [x] 3.5 Criar `src/components/insights/InsightsEmptyState.tsx` — empty state com ícone e mensagem
  - [x] 3.6 Implementar botão "Copiar Sugestão" com `copyToClipboard()` existente
  - [x] 3.7 Implementar ações de status (Marcar como Usado, Descartar) via dropdown menu por linha

- [x] Task 4: Adicionar ao Sidebar com Badge (AC: #1, #3)
  - [x] 4.1 Editar `src/components/common/Sidebar.tsx` — adicionar item "Insights" com ícone `Lightbulb` entre "Campanhas" e "Configurações"
  - [x] 4.2 Implementar badge de contagem de novos insights no item do sidebar
  - [x] 4.3 Hook `useNewInsightsCount()` chamado no sidebar para atualizar badge

- [x] Task 5: Testes unitários (AC: #11)
  - [x] 5.1 Criar `__tests__/unit/app/api/insights/route.test.ts` — testes da rota GET (paginação, filtros, auth, erro)
  - [x] 5.2 Criar `__tests__/unit/app/api/insights/[insightId]/route.test.ts` — testes da rota PATCH (transitions de status, auth, not found, erro)
  - [x] 5.3 Criar `__tests__/unit/app/api/insights/new-count/route.test.ts` — testes da rota de contagem
  - [x] 5.4 Criar `__tests__/unit/hooks/use-lead-insights.test.ts` — testes do hook (fetch, mutation, cache invalidation)
  - [x] 5.5 Criar `__tests__/unit/components/insights/InsightsPageContent.test.tsx` — testes do componente principal (loading, empty, data, filtros)
  - [x] 5.6 Criar `__tests__/unit/components/insights/InsightsTable.test.tsx` — testes da tabela (colunas, ações, copiar, links)
  - [x] 5.7 Criar `__tests__/unit/components/insights/InsightsFilterBar.test.tsx` — testes dos filtros
  - [x] 5.8 Criar `__tests__/unit/components/insights/InsightsEmptyState.test.tsx` — testes do empty state
  - [x] 5.9 Validar que todos os testes existentes continuam passando

## Dev Notes

### Decisão Arquitetural: Join com Leads na API

A tabela `lead_insights` contém apenas `lead_id`. A UI precisa do nome e avatar do lead. Existem duas abordagens:

**Abordagem escolhida: JOIN no Supabase (query relacional)**

```typescript
const { data, error, count } = await supabase
  .from("lead_insights")
  .select(`
    *,
    leads!inner (
      id,
      first_name,
      last_name,
      photo_url,
      company_name,
      title,
      linkedin_url
    )
  `, { count: "exact" })
  .eq("tenant_id", profile.tenant_id)
  .order("created_at", { ascending: false })
  .range(from, to);
```

**Tipo de resposta expandido:**

```typescript
// Insight com dados do lead (retorno da API)
export interface LeadInsightWithLead extends LeadInsight {
  lead: {
    id: string;
    firstName: string;
    lastName: string | null;
    photoUrl: string | null;
    companyName: string | null;
    title: string | null;
    linkedinUrl: string | null;
  };
}
```

**Nota sobre `!inner`:** Usar `leads!inner` garante que insights de leads deletados não apareçam (INNER JOIN). Se um lead for deletado, os insights vinculados desaparecem da listagem automaticamente.

### API Route: GET /api/insights

**Arquivo:** `src/app/api/insights/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserProfile } from "@/lib/supabase/tenant";
import type { LeadInsightRow } from "@/types/monitoring";
import { transformLeadInsightRow } from "@/types/monitoring";

/**
 * GET /api/insights
 * Fetch lead insights with pagination, filtering, and lead data
 *
 * Query params:
 * - status: comma-separated statuses (new,used,dismissed)
 * - period: date filter (7d, 30d, 90d, all)
 * - page: page number (default 1)
 * - per_page: items per page (default 25, max 100)
 */
export async function GET(request: NextRequest) {
  const profile = await getCurrentUserProfile();
  if (!profile) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Não autenticado" } },
      { status: 401 }
    );
  }

  const supabase = await createClient();
  const searchParams = request.nextUrl.searchParams;

  const statusParam = searchParams.get("status");
  const period = searchParams.get("period") || "all";
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const perPage = Math.min(100, Math.max(1, parseInt(searchParams.get("per_page") || "25")));

  let query = supabase
    .from("lead_insights")
    .select(`
      *,
      leads!inner (
        id, first_name, last_name, photo_url, company_name, title, linkedin_url
      )
    `, { count: "exact" })
    .eq("tenant_id", profile.tenant_id);

  // Filter by status
  if (statusParam) {
    const statuses = statusParam.split(",");
    query = query.in("status", statuses);
  }

  // Filter by period
  if (period !== "all") {
    const daysMap: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90 };
    const days = daysMap[period];
    if (days) {
      const since = new Date();
      since.setDate(since.getDate() - days);
      query = query.gte("created_at", since.toISOString());
    }
  }

  // Pagination + ordering (AC #8: mais recentes primeiro)
  const from = (page - 1) * perPage;
  const to = from + perPage - 1;
  query = query
    .order("created_at", { ascending: false })
    .range(from, to);

  const { data, error, count } = await query;

  if (error) {
    console.error("[GET /api/insights] Error:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro ao buscar insights" } },
      { status: 500 }
    );
  }

  const total = count ?? 0;
  const totalPages = Math.ceil(total / perPage);

  // Transform: snake_case → camelCase + attach lead data
  const transformed = (data ?? []).map((row: LeadInsightRow & { leads: Record<string, unknown> }) => {
    const insight = transformLeadInsightRow(row);
    return {
      ...insight,
      lead: {
        id: row.leads.id as string,
        firstName: row.leads.first_name as string,
        lastName: row.leads.last_name as string | null,
        photoUrl: row.leads.photo_url as string | null,
        companyName: row.leads.company_name as string | null,
        title: row.leads.title as string | null,
        linkedinUrl: row.leads.linkedin_url as string | null,
      },
    };
  });

  return NextResponse.json({
    data: transformed,
    meta: { total, page, limit: perPage, totalPages },
  });
}
```

### API Route: PATCH /api/insights/[insightId]

**Arquivo:** `src/app/api/insights/[insightId]/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserProfile } from "@/lib/supabase/tenant";
import { insightStatusValues } from "@/types/monitoring";

/**
 * PATCH /api/insights/:insightId
 * Update insight status
 *
 * Body: { status: "used" | "dismissed" }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ insightId: string }> }
) {
  const profile = await getCurrentUserProfile();
  if (!profile) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Não autenticado" } },
      { status: 401 }
    );
  }

  const { insightId } = await params;
  const body = await request.json();
  const { status } = body;

  // Validate status
  if (!status || !insightStatusValues.includes(status)) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Status inválido. Use: new, used, dismissed" } },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("lead_insights")
    .update({ status })
    .eq("id", insightId)
    .eq("tenant_id", profile.tenant_id)
    .select()
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Insight não encontrado" } },
        { status: 404 }
      );
    }
    console.error("[PATCH /api/insights] Error:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro ao atualizar insight" } },
      { status: 500 }
    );
  }

  return NextResponse.json({ data });
}
```

**Nota sobre params:** No Next.js 15 (App Router), `params` é uma Promise — usar `await params` para acessar `insightId`. Seguir padrão existente no projeto (verificar se routes existentes usam `await params` ou acesso direto).

### API Route: GET /api/insights/new-count

**Arquivo:** `src/app/api/insights/new-count/route.ts`

```typescript
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserProfile } from "@/lib/supabase/tenant";

/**
 * GET /api/insights/new-count
 * Returns count of insights with status='new' for sidebar badge
 */
export async function GET() {
  const profile = await getCurrentUserProfile();
  if (!profile) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Não autenticado" } },
      { status: 401 }
    );
  }

  const supabase = await createClient();

  const { count, error } = await supabase
    .from("lead_insights")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", profile.tenant_id)
    .eq("status", "new");

  if (error) {
    console.error("[GET /api/insights/new-count] Error:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro ao contar insights" } },
      { status: 500 }
    );
  }

  return NextResponse.json({ data: { count: count ?? 0 } });
}
```

### Hook: useLeadInsights

**Arquivo:** `src/hooks/use-lead-insights.ts`

```typescript
/**
 * Lead Insights Hook
 * Story 13.6: Página de Insights — UI
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
  status?: string;  // comma-separated: "new,used,dismissed"
  period?: string;  // "7d" | "30d" | "90d" | "all"
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
 * Hook for sidebar badge — count of new insights
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
```

### Componente: InsightsPageContent.tsx

**Arquivo:** `src/components/insights/InsightsPageContent.tsx`

```typescript
"use client";

import { useState, useCallback } from "react";
import { useLeadInsights, useUpdateInsightStatus } from "@/hooks/use-lead-insights";
import type { InsightFilters } from "@/hooks/use-lead-insights";
import { InsightsTable } from "@/components/insights/InsightsTable";
import { InsightsFilterBar } from "@/components/insights/InsightsFilterBar";
import { InsightsEmptyState } from "@/components/insights/InsightsEmptyState";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const PER_PAGE_OPTIONS = [10, 25, 50, 100];

export function InsightsPageContent() {
  // Filter state
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [periodFilter, setPeriodFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);

  const filters: InsightFilters = {
    ...(statusFilter ? { status: statusFilter } : {}),
    period: periodFilter,
    page,
    perPage,
  };

  // Data fetching
  const { insights, meta, isLoading, error } = useLeadInsights(filters);
  const updateStatus = useUpdateInsightStatus();

  // Callbacks
  const handleFilterChange = useCallback((newStatus: string, newPeriod: string) => {
    setStatusFilter(newStatus);
    setPeriodFilter(newPeriod);
    setPage(1); // Reset to first page
  }, []);

  const handlePerPageChange = useCallback((value: string) => {
    setPerPage(parseInt(value));
    setPage(1);
  }, []);

  // Pagination info
  const totalEntries = meta?.total ?? 0;
  const totalPages = meta?.totalPages ?? 1;
  const startItem = totalEntries > 0 ? (page - 1) * perPage + 1 : 0;
  const endItem = Math.min(page * perPage, totalEntries);

  // Loading skeleton
  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-16 bg-muted animate-pulse rounded" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Error state
  if (error) {
    return (
      <Card className="border-destructive">
        <CardContent className="pt-6">
          <p className="text-destructive">Erro: {error}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Filters */}
      <InsightsFilterBar
        statusFilter={statusFilter}
        periodFilter={periodFilter}
        onFilterChange={handleFilterChange}
      />

      {/* Empty state */}
      {insights.length === 0 && !isLoading && (
        <InsightsEmptyState hasFilters={!!statusFilter || periodFilter !== "all"} />
      )}

      {/* Data Table */}
      {insights.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
            <CardTitle className="text-base font-medium">
              {totalEntries} {totalEntries === 1 ? "insight" : "insights"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <InsightsTable
              insights={insights}
              onUpdateStatus={(insightId, status) =>
                updateStatus.mutate({ insightId, status })
              }
              isPending={updateStatus.isPending}
            />
          </CardContent>
        </Card>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {startItem}-{endItem} de {totalEntries}
            </span>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Por página:</span>
              <Select value={String(perPage)} onValueChange={handlePerPageChange}>
                <SelectTrigger className="w-[70px] h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PER_PAGE_OPTIONS.map((opt) => (
                    <SelectItem key={opt} value={String(opt)}>
                      {opt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              aria-label="Página anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm text-muted-foreground px-2">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              aria-label="Próxima página"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
```

### Componente: InsightsTable.tsx

**Arquivo:** `src/components/insights/InsightsTable.tsx`

```typescript
"use client";

import { Copy, Check, MoreHorizontal, ExternalLink, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { copyToClipboard } from "@/lib/utils/clipboard";
import { insightStatusLabels, insightStatusVariants } from "@/types/monitoring";
import type { InsightStatus } from "@/types/monitoring";
import type { InsightWithLead } from "@/hooks/use-lead-insights";

interface InsightsTableProps {
  insights: InsightWithLead[];
  onUpdateStatus: (insightId: string, status: InsightStatus) => void;
  isPending: boolean;
}

export function InsightsTable({ insights, onUpdateStatus, isPending }: InsightsTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b text-left text-sm text-muted-foreground">
            <th className="pb-3 pr-4 font-medium">Lead</th>
            <th className="pb-3 pr-4 font-medium">Post</th>
            <th className="pb-3 pr-4 font-medium">Sugestão de Abordagem</th>
            <th className="pb-3 pr-4 font-medium w-[100px]">Status</th>
            <th className="pb-3 pr-4 font-medium w-[120px]">Data</th>
            <th className="pb-3 font-medium w-[100px]">Ações</th>
          </tr>
        </thead>
        <tbody>
          {insights.map((insight) => (
            <InsightRow
              key={insight.id}
              insight={insight}
              onUpdateStatus={onUpdateStatus}
              isPending={isPending}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function InsightRow({
  insight,
  onUpdateStatus,
  isPending,
}: {
  insight: InsightWithLead;
  onUpdateStatus: (insightId: string, status: InsightStatus) => void;
  isPending: boolean;
}) {
  const leadName = `${insight.lead.firstName}${insight.lead.lastName ? ` ${insight.lead.lastName}` : ""}`;
  const truncatedPost = insight.postText.length > 120
    ? insight.postText.substring(0, 120) + "..."
    : insight.postText;
  const truncatedSuggestion = insight.suggestion
    ? insight.suggestion.length > 150
      ? insight.suggestion.substring(0, 150) + "..."
      : insight.suggestion
    : null;

  const dateStr = new Date(insight.createdAt).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  return (
    <tr className="border-b last:border-0 hover:bg-muted/50 transition-colors">
      {/* Lead */}
      <td className="py-3 pr-4">
        <div className="flex items-center gap-3">
          {insight.lead.photoUrl ? (
            <img
              src={insight.lead.photoUrl}
              alt={leadName}
              className="h-8 w-8 rounded-full object-cover"
            />
          ) : (
            <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium text-muted-foreground">
              {insight.lead.firstName.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{leadName}</p>
            {insight.lead.companyName && (
              <p className="text-xs text-muted-foreground truncate">
                {insight.lead.title ? `${insight.lead.title} • ` : ""}{insight.lead.companyName}
              </p>
            )}
          </div>
        </div>
      </td>

      {/* Post */}
      <td className="py-3 pr-4 max-w-[250px]">
        <TooltipProvider>
          <Tooltip delayDuration={300}>
            <TooltipTrigger asChild>
              <p className="text-sm text-muted-foreground line-clamp-2">{truncatedPost}</p>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-[400px]">
              <p className="text-sm whitespace-pre-wrap">{insight.postText}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        {insight.postUrl && (
          <a
            href={insight.postUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary hover:underline inline-flex items-center gap-1 mt-1"
          >
            Ver post <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </td>

      {/* Sugestão */}
      <td className="py-3 pr-4 max-w-[300px]">
        {truncatedSuggestion ? (
          <div className="flex flex-col gap-1">
            <TooltipProvider>
              <Tooltip delayDuration={300}>
                <TooltipTrigger asChild>
                  <p className="text-sm line-clamp-2">{truncatedSuggestion}</p>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-[400px]">
                  <p className="text-sm whitespace-pre-wrap">{insight.suggestion}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs w-fit"
              onClick={() => copyToClipboard(insight.suggestion!)}
            >
              <Copy className="h-3 w-3 mr-1" />
              Copiar
            </Button>
          </div>
        ) : (
          <span className="text-sm text-muted-foreground italic">
            Sugestão não disponível
          </span>
        )}
      </td>

      {/* Status */}
      <td className="py-3 pr-4">
        <Badge variant={insightStatusVariants[insight.status]}>
          {insightStatusLabels[insight.status]}
        </Badge>
      </td>

      {/* Data */}
      <td className="py-3 pr-4">
        <span className="text-sm text-muted-foreground">{dateStr}</span>
      </td>

      {/* Ações */}
      <td className="py-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label="Ações do insight"
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {insight.suggestion && (
              <DropdownMenuItem onClick={() => copyToClipboard(insight.suggestion!)}>
                <Copy className="h-4 w-4 mr-2" />
                Copiar Sugestão
              </DropdownMenuItem>
            )}
            {insight.status !== "used" && (
              <DropdownMenuItem
                onClick={() => onUpdateStatus(insight.id, "used")}
                disabled={isPending}
              >
                <Check className="h-4 w-4 mr-2" />
                Marcar como Usado
              </DropdownMenuItem>
            )}
            {insight.status !== "dismissed" && (
              <DropdownMenuItem
                onClick={() => onUpdateStatus(insight.id, "dismissed")}
                disabled={isPending}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Descartar
              </DropdownMenuItem>
            )}
            {insight.postUrl && (
              <DropdownMenuItem asChild>
                <a href={insight.postUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Ver Post Original
                </a>
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </td>
    </tr>
  );
}
```

### Componente: InsightsFilterBar.tsx

**Arquivo:** `src/components/insights/InsightsFilterBar.tsx`

```typescript
"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

interface InsightsFilterBarProps {
  statusFilter: string;
  periodFilter: string;
  onFilterChange: (status: string, period: string) => void;
}

const STATUS_OPTIONS = [
  { value: "", label: "Todos os Status" },
  { value: "new", label: "Novos" },
  { value: "used", label: "Usados" },
  { value: "dismissed", label: "Descartados" },
];

const PERIOD_OPTIONS = [
  { value: "all", label: "Todo o período" },
  { value: "7d", label: "Últimos 7 dias" },
  { value: "30d", label: "Últimos 30 dias" },
  { value: "90d", label: "Últimos 90 dias" },
];

export function InsightsFilterBar({
  statusFilter,
  periodFilter,
  onFilterChange,
}: InsightsFilterBarProps) {
  const hasActiveFilters = statusFilter !== "" || periodFilter !== "all";

  return (
    <div className="flex items-center gap-3">
      <Select
        value={statusFilter || "all-status"}
        onValueChange={(v) => onFilterChange(v === "all-status" ? "" : v, periodFilter)}
      >
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          {STATUS_OPTIONS.map((opt) => (
            <SelectItem key={opt.value || "all-status"} value={opt.value || "all-status"}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={periodFilter}
        onValueChange={(v) => onFilterChange(statusFilter, v)}
      >
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="Período" />
        </SelectTrigger>
        <SelectContent>
          {PERIOD_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {hasActiveFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onFilterChange("", "all")}
          className="h-8 px-2"
        >
          <X className="h-4 w-4 mr-1" />
          Limpar
        </Button>
      )}
    </div>
  );
}
```

### Componente: InsightsEmptyState.tsx

**Arquivo:** `src/components/insights/InsightsEmptyState.tsx`

```typescript
import { Lightbulb } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface InsightsEmptyStateProps {
  hasFilters: boolean;
}

export function InsightsEmptyState({ hasFilters }: InsightsEmptyStateProps) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-16 text-center">
        <Lightbulb className="h-12 w-12 text-muted-foreground/50 mb-4" />
        <h3 className="text-lg font-medium text-foreground mb-2">
          {hasFilters ? "Nenhum insight encontrado" : "Nenhum insight ainda"}
        </h3>
        <p className="text-sm text-muted-foreground max-w-md">
          {hasFilters
            ? "Tente ajustar os filtros para ver mais resultados."
            : "Quando leads monitorados publicarem posts relevantes no LinkedIn, os insights aparecerão aqui com sugestões de abordagem."}
        </p>
      </CardContent>
    </Card>
  );
}
```

### Página: /insights

**Arquivo:** `src/app/(dashboard)/insights/page.tsx`

```typescript
import { Suspense } from "react";
import { InsightsPageContent } from "@/components/insights/InsightsPageContent";

export const metadata = {
  title: "Insights - tdec-prospect",
  description: "Insights de monitoramento de leads no LinkedIn",
};

export default function InsightsPage() {
  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-h1 text-foreground">Insights</h1>
          <p className="text-body-small text-muted-foreground mt-1">
            Oportunidades de abordagem baseadas em posts recentes dos seus leads.
          </p>
        </div>
      </div>

      {/* Insights Content */}
      <Suspense
        fallback={
          <div className="flex flex-col gap-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-16 bg-muted animate-pulse rounded" />
            ))}
          </div>
        }
      >
        <InsightsPageContent />
      </Suspense>
    </div>
  );
}
```

### Modificação do Sidebar

**Arquivo:** `src/components/common/Sidebar.tsx`

**Imports a adicionar:**
```typescript
import { Lightbulb } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useNewInsightsCount } from "@/hooks/use-lead-insights";
```

**navItems atualizado (adicionar entre Campanhas e Configurações):**
```typescript
const navItems: NavItem[] = [
  {
    label: "Leads",
    href: "/leads",
    icon: Users,
    subItems: [
      { label: "Buscar", href: "/leads", icon: Search },
      { label: "Meus Leads", href: "/leads/my-leads", icon: Database },
    ],
  },
  { label: "Campanhas", href: "/campaigns", icon: Send },
  { label: "Insights", href: "/insights", icon: Lightbulb },  // ← NOVO
  { label: "Configurações", href: "/settings", icon: Settings },
];
```

**Badge no sidebar:**

O sidebar renderiza os navItems em um loop. Para o item "Insights", precisa renderizar um badge ao lado do label mostrando a contagem de novos insights. Como o Sidebar é um client component ("use client"), pode usar o hook `useNewInsightsCount()`.

**Abordagem recomendada:** Componente wrapper `InsightsBadge` renderizado condicionalmente quando `item.href === "/insights"`:

```typescript
function InsightsBadge() {
  const { data: count } = useNewInsightsCount();
  if (!count || count === 0) return null;
  return (
    <Badge variant="default" className="ml-auto text-[10px] h-5 min-w-[20px] px-1.5">
      {count > 99 ? "99+" : count}
    </Badge>
  );
}
```

Renderizar dentro do loop de navItems:
```typescript
<span className="...">{item.label}</span>
{item.href === "/insights" && <InsightsBadge />}
```

### Padrão de Testes — Seguir Exatamente

**Framework:** Vitest. **ESLint:** no-console.

**Testes de API routes:**
```typescript
// Pattern: mock getCurrentUserProfile, createClient, supabase query chain
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "@/app/api/insights/route";
import { NextRequest } from "next/server";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));
vi.mock("@/lib/supabase/tenant", () => ({
  getCurrentUserProfile: vi.fn(),
}));

// Mock supabase chain: .from().select().eq().in().order().range()
// Use centralized mock from __tests__/helpers/mock-supabase.ts
```

**Testes de componentes:**
```typescript
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
// Wrap with QueryClientProvider for hooks
```

**Testes do hook:**
```typescript
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
// Mock fetch globally
```

### Tipo de Resposta no Join Supabase — Casting

Quando Supabase retorna dados com join, o tipo é:
```typescript
// O Supabase retorna a relação como propriedade no objeto
interface RawInsightWithLead extends LeadInsightRow {
  leads: {
    id: string;
    first_name: string;
    last_name: string | null;
    photo_url: string | null;
    company_name: string | null;
    title: string | null;
    linkedin_url: string | null;
  };
}
```

**Nota:** O nome da propriedade é `leads` (nome da tabela), não `lead`. Mapear para `lead` na transformação.

### Next.js 15 — Route Params Pattern

Verificar como outras routes no projeto acessam `params`. No Next.js 15 (App Router), `params` em route handlers é uma `Promise`:

```typescript
// Padrão correto Next.js 15:
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ insightId: string }> }
) {
  const { insightId } = await params;
  // ...
}
```

**Verificar** se routes existentes como `src/app/api/leads/[leadId]/monitor/route.ts` já usam `await params` ou acesso direto. Seguir o mesmo padrão.

### Sidebar — Impacto da Adição do Hook

O Sidebar já é `"use client"`. Adicionar `useNewInsightsCount()` significa:
1. O hook faz um fetch para `/api/insights/new-count` no mount
2. Refaz a cada 60 segundos (refetchInterval)
3. Precisa estar dentro de um `QueryClientProvider` — verificar se o Sidebar está envolvido pelo provider

**Verificar:** Se `QueryClientProvider` está no root layout ou no AppShell. Se não estiver envolvendo o Sidebar, o hook não funcionará. Nesse caso, usar uma alternativa como fetch direto com `useState` + `useEffect`.

### Ícone Escolhido: Lightbulb

```typescript
import { Lightbulb } from "lucide-react";
```

Alternativas consideradas:
- `TrendingUp` — genérico demais
- `BarChart3` — sugere analytics, não insights
- `Zap` — sugere velocidade, não inteligência
- `Lightbulb` — **melhor fit** — remete a "insight" / "ideia" / "oportunidade"

### Project Structure Notes

| Ação | Arquivo | Descrição |
|------|---------|-----------|
| CRIAR | `src/app/(dashboard)/insights/page.tsx` | Página de Insights com metadata e Suspense |
| CRIAR | `src/app/api/insights/route.ts` | GET — lista insights com paginação, filtros e join com leads |
| CRIAR | `src/app/api/insights/[insightId]/route.ts` | PATCH — atualizar status do insight |
| CRIAR | `src/app/api/insights/new-count/route.ts` | GET — contagem de insights novos (sidebar badge) |
| CRIAR | `src/hooks/use-lead-insights.ts` | Hooks React Query: useLeadInsights, useUpdateInsightStatus, useNewInsightsCount |
| CRIAR | `src/components/insights/InsightsPageContent.tsx` | Componente principal da página com filtros, tabela, paginação |
| CRIAR | `src/components/insights/InsightsTable.tsx` | Tabela de insights com colunas, ações, copiar sugestão |
| CRIAR | `src/components/insights/InsightsFilterBar.tsx` | Barra de filtros (status + período) |
| CRIAR | `src/components/insights/InsightsEmptyState.tsx` | Empty state com ícone e mensagem contextual |
| EDITAR | `src/components/common/Sidebar.tsx` | Adicionar item "Insights" com badge de contagem |
| CRIAR | `__tests__/unit/app/api/insights/route.test.ts` | Testes GET /api/insights |
| CRIAR | `__tests__/unit/app/api/insights/[insightId]/route.test.ts` | Testes PATCH /api/insights/:id |
| CRIAR | `__tests__/unit/app/api/insights/new-count/route.test.ts` | Testes GET /api/insights/new-count |
| CRIAR | `__tests__/unit/hooks/use-lead-insights.test.ts` | Testes do hook useLeadInsights |
| CRIAR | `__tests__/unit/components/insights/InsightsPageContent.test.tsx` | Testes do componente principal |
| CRIAR | `__tests__/unit/components/insights/InsightsTable.test.tsx` | Testes da tabela |
| CRIAR | `__tests__/unit/components/insights/InsightsFilterBar.test.tsx` | Testes dos filtros |
| CRIAR | `__tests__/unit/components/insights/InsightsEmptyState.test.tsx` | Testes do empty state |

### Guardrails — O Que NÃO Fazer

- **NÃO criar migration** — tabela `lead_insights` já existe (migration 00043), todos os campos necessários já estão lá
- **NÃO modificar `monitoring.ts` types** — `LeadInsight`, `InsightStatus`, `insightStatusLabels`, `insightStatusVariants` já existem
- **NÃO criar `LeadInsightWithLead` em monitoring.ts** — definir no hook ou em arquivo separado para evitar criar dependência circular com tipos de Lead
- **NÃO usar `space-y-*`** — Tailwind v4, usar `flex flex-col gap-*` para todos os wrappers label+input
- **NÃO modificar LeadTable** — a tabela de insights é completamente separada
- **NÃO modificar process-batch/route.ts** — story é UI-only
- **NÃO modificar nenhuma edge function** — story é UI-only
- **NÃO implementar envio WhatsApp** — story 13.7 fará isso
- **NÃO implementar configurações de monitoramento** — story 13.8 fará isso
- **NÃO usar `PromptManager`** — story é UI-only, sem interação com IA
- **NÃO duplicar `copyToClipboard`** — importar de `@/lib/utils/clipboard`
- **NÃO criar novo store Zustand** — React Query é suficiente para este caso
- **NÃO fazer detail sidepanel** — tabela com tooltip de hover é suficiente para MVP. Se Marco quiser mais detalhes, clicará no link do post original
- **NÃO adicionar filtro de busca por texto** — AC não pede. Filtro por status e período é suficiente
- **NÃO modificar tipos existentes em monitoring.ts** — apenas usar o que já existe

### Previous Story Intelligence (Story 13.5)

**Learnings da 13.5:**
- `generateApproachSuggestion()` popula `lead_insights.suggestion` — pode ser `null` se geração falhou
- `insight.status` pode ser: `"new"`, `"used"`, `"dismissed"` (enum em DB)
- Tipo `LeadInsight` já tem todos os campos necessários para UI
- `insightStatusLabels` e `insightStatusVariants` já estão em `monitoring.ts` — reutilizar diretamente para badges
- Mock de Supabase usa padrão centralizado de `__tests__/helpers/mock-supabase.ts`
- Total antes desta story: **262 arquivos, 4814 testes, 0 falhas**

**Learnings da 13.4:**
- `classifyPostRelevance()` salva `relevance_reasoning` em `lead_insights` — mostrar como tooltip/info na UI
- Posts não relevantes são descartados e NÃO aparecem em `lead_insights` — tabela só tem posts relevantes

**Learnings da 13.2:**
- `useToggleMonitoring()` e `useMonitoredCount()` seguem exatamente o padrão de hook que devemos seguir
- Toast com `sonner` — `toast.success()` e `toast.error()`
- Cache invalidation via `queryClient.invalidateQueries({ queryKey: [...] })`

**Learnings da 13.1:**
- Migration 00043 criou `lead_insights` com todos os campos necessários
- Tipos em `src/types/monitoring.ts` prontos para uso
- `transformLeadInsightRow()` faz snake_case → camelCase

### Git Intelligence

Último commit: `2e011ab feat(story-13.4): filtro de relevância por IA + code review fixes`
Branch: `epic/12-melhorias-ux-produtividade`
Padrão de commit esperado: `feat(story-13.6): página de insights UI`

### Edge Cases a Tratar

1. **Insight sem sugestão (suggestion=null):** Mostrar "Sugestão não disponível" em itálico, botão "Copiar" não aparece
2. **Lead sem foto (photoUrl=null):** Mostrar initial letter placeholder (círculo com primeira letra do firstName)
3. **Lead sem empresa/cargo:** Não mostrar subtitle na coluna Lead
4. **Post URL vazio:** Não renderizar link "Ver post" (improvável mas defensivo)
5. **Post muito longo:** Truncar em 120 chars na tabela, mostrar completo no tooltip
6. **Sugestão muito longa:** Truncar em 150 chars na tabela, mostrar completa no tooltip
7. **0 insights (sem filtro):** Empty state com mensagem "Nenhum insight ainda" + explicação de como funciona
8. **0 insights (com filtro):** Empty state com "Nenhum insight encontrado" + sugerir ajustar filtros
9. **Lead deletado:** `!inner` join garante que insights de leads deletados não apareçam
10. **Muitos insights:** Paginação com 25 por página padrão, opções 10/25/50/100
11. **Badge no sidebar com count=0:** Badge não renderiza (retorna null)
12. **Badge com count>99:** Mostrar "99+" para não quebrar layout
13. **QueryClientProvider no Sidebar:** Verificar se o Sidebar está envolvido pelo provider antes de usar hook. Se não, usar fetch direto com useState/useEffect como fallback
14. **Filtro de período com timezone:** Calcular data `since` no servidor (API route), não no cliente, para consistência

### References

- [Source: _bmad-output/planning-artifacts/epic-13-monitoramento-inteligente-leads-linkedin.md#Story 13.6] — AC originais
- [Source: _bmad-output/implementation-artifacts/13-5-geracao-de-sugestao-de-abordagem.md] — Story anterior e padrões
- [Source: src/types/monitoring.ts] — LeadInsight, InsightStatus, insightStatusLabels, insightStatusVariants, transformLeadInsightRow
- [Source: src/components/common/Sidebar.tsx] — NavItem interface, navItems array, padrão de ícones lucide-react
- [Source: src/components/ui/badge.tsx] — Badge component com variants
- [Source: src/lib/utils/clipboard.ts] — copyToClipboard utility
- [Source: src/hooks/use-lead-monitoring.ts] — Padrão de hooks com React Query (useMutation, useQuery, cache invalidation)
- [Source: src/app/api/leads/route.ts] — Padrão de API route GET com paginação, filtros, auth
- [Source: src/app/(dashboard)/leads/my-leads/page.tsx] — Padrão de página com metadata, header, Suspense
- [Source: src/components/leads/MyLeadsPageContent.tsx] — Padrão de componente de conteúdo com filtros, tabela, paginação
- [Source: src/components/leads/LeadTable.tsx] — Padrão de tabela com colunas, hover, ações
- [Source: src/components/leads/MyLeadsEmptyState.tsx] — Padrão de empty state
- [Source: src/components/leads/MyLeadsFilterBar.tsx] — Padrão de barra de filtros
- [Source: supabase/migrations/00043_add_lead_monitoring_schema.sql] — Schema lead_insights com todos os campos

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- Sidebar tests (Sidebar.test.tsx, AppShell.test.tsx) required mock for `useNewInsightsCount` since Sidebar now uses React Query hook
- Radix UI Select dropdown tests in InsightsFilterBar removed (JSDOM does not support `hasPointerCapture`); tested select triggers + selected values instead

### Completion Notes List

- Task 1: 3 API routes created (GET /api/insights, PATCH /api/insights/:id, GET /api/insights/new-count) — 30 tests
- Task 2: Hook `useLeadInsights` with 3 exports (useLeadInsights, useUpdateInsightStatus, useNewInsightsCount) — 11 tests
- Task 3: 5 components created (page, InsightsPageContent, InsightsTable, InsightsFilterBar, InsightsEmptyState) — 43 tests
- Task 4: Sidebar updated with Insights item + InsightsBadge component — existing 43+14 tests updated
- Task 5: 84 new tests, 0 regressions. Total: 270 files, 4898 tests, 0 failures
- All 11 ACs satisfied
- Code Review: 7 issues found (1 HIGH, 4 MEDIUM, 2 LOW) — all fixed. +1 test added. Final: 270 files, 4899 tests, 0 failures

### Change Log

- 2026-02-28: Story 13.6 implemented — Insights page with full UI, filters, pagination, sidebar badge
- 2026-02-28: Code review fixes — try-catch on PATCH JSON parsing, removed JS double-truncation (CSS-only), next/image, aria-label, test dead code cleanup, stronger test assertions

### File List

New files:
- src/app/api/insights/route.ts
- src/app/api/insights/[insightId]/route.ts
- src/app/api/insights/new-count/route.ts
- src/hooks/use-lead-insights.ts
- src/app/(dashboard)/insights/page.tsx
- src/components/insights/InsightsPageContent.tsx
- src/components/insights/InsightsTable.tsx
- src/components/insights/InsightsFilterBar.tsx
- src/components/insights/InsightsEmptyState.tsx
- __tests__/unit/app/api/insights/route.test.ts
- __tests__/unit/app/api/insights/[insightId]/route.test.ts
- __tests__/unit/app/api/insights/new-count/route.test.ts
- __tests__/unit/hooks/use-lead-insights.test.ts
- __tests__/unit/components/insights/InsightsPageContent.test.tsx
- __tests__/unit/components/insights/InsightsTable.test.tsx
- __tests__/unit/components/insights/InsightsFilterBar.test.tsx
- __tests__/unit/components/insights/InsightsEmptyState.test.tsx

Modified files:
- src/components/common/Sidebar.tsx (added Insights nav item + InsightsBadge component)
- __tests__/unit/components/Sidebar.test.tsx (added mock for useNewInsightsCount, updated nav assertions)
- __tests__/unit/components/AppShell.test.tsx (added mock for useNewInsightsCount)
- _bmad-output/implementation-artifacts/sprint-status.yaml (status: in-progress -> review)
