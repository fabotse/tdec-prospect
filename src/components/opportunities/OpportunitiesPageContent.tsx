/**
 * Opportunities Page Content
 * Story 21.4: Central de Oportunidades — AC #2, #4, #6
 * Story 21.5: dialogs de ação (WhatsApp/telefone) levantados para o container
 *   — UM por tipo, não um por card (padrão InsightsPageContent/OpportunityPanel).
 *
 * Espelha InsightsPageContent: filtros + loading/error/empty + lista + paginação.
 */

"use client";

import { useCallback, useMemo, useState } from "react";
import { useOpportunities, filterOpportunitiesBySearch } from "@/hooks/use-opportunities";
import type { OpportunityFilters, OpportunityCardData } from "@/hooks/use-opportunities";
import { OpportunityCard } from "@/components/opportunities/OpportunityCard";
import { WhatsAppComposerDialog } from "@/components/tracking/WhatsAppComposerDialog";
import { PhoneLookupDialog } from "@/components/tracking/PhoneLookupDialog";
import { useWhatsAppSendFromOpportunity } from "@/hooks/use-whatsapp-send-from-opportunity";
import {
  OpportunitiesFilterBar,
  DEFAULT_OPPORTUNITIES_FILTERS,
  type OpportunitiesFilterState,
} from "@/components/opportunities/OpportunitiesFilterBar";
import { OpportunitiesEmptyState } from "@/components/opportunities/OpportunitiesEmptyState";
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

export function OpportunitiesPageContent() {
  const [filterState, setFilterState] = useState<OpportunitiesFilterState>(
    DEFAULT_OPPORTUNITIES_FILTERS
  );
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);

  const filters: OpportunityFilters = {
    ...(filterState.intents.length > 0 ? { intent: filterState.intents.join(",") } : {}),
    ...(filterState.statuses.length > 0 ? { status: filterState.statuses.join(",") } : {}),
    ...(filterState.campaignId ? { campaignId: filterState.campaignId } : {}),
    period: filterState.period,
    page,
    perPage,
  };

  const { opportunities, meta, isLoading, error } = useOpportunities(filters);

  // Story 21.5 — dialogs de ação (um por tipo, no container)
  const [composerOpportunity, setComposerOpportunity] =
    useState<OpportunityCardData | null>(null);
  const [phoneLookupOpportunity, setPhoneLookupOpportunity] =
    useState<OpportunityCardData | null>(null);
  // Telefone encontrado no lookup, por opportunityId (otimista — espelha o
  // `localPhones` do OpportunityPanel; sobrevive até o próximo refetch).
  const [localPhones, setLocalPhones] = useState<Map<string, string>>(new Map());
  const { send: sendWhatsApp, isSending } = useWhatsAppSendFromOpportunity();

  const handleWhatsAppSend = useCallback(
    async (data: { phone: string; message: string }) => {
      if (!composerOpportunity?.lead) return;
      const success = await sendWhatsApp({
        opportunityId: composerOpportunity.id,
        leadId: composerOpportunity.lead.id,
        phone: data.phone,
        message: data.message,
      });
      if (success) setComposerOpportunity(null);
    },
    [composerOpportunity, sendWhatsApp]
  );

  const handlePhoneFound = useCallback(
    (phone: string) => {
      if (!phoneLookupOpportunity) return;
      setLocalPhones((prev) => new Map(prev).set(phoneLookupOpportunity.id, phone));
      setPhoneLookupOpportunity(null);
    },
    [phoneLookupOpportunity]
  );

  // Busca client-side sobre a página carregada (decisão Task 7.2)
  const visibleOpportunities = useMemo(
    () => filterOpportunitiesBySearch(opportunities, filterState.search),
    [opportunities, filterState.search]
  );

  const handleFiltersChange = useCallback(
    (partial: Partial<OpportunitiesFilterState>) => {
      setFilterState((prev) => ({ ...prev, ...partial }));
      // Filtros server-side resetam a página (busca é client-side — não reseta)
      if (!("search" in partial) || Object.keys(partial).length > 1) {
        setPage(1);
      }
    },
    []
  );

  const handleClearFilters = useCallback(() => {
    setFilterState(DEFAULT_OPPORTUNITIES_FILTERS);
    setPage(1);
  }, []);

  const handlePerPageChange = useCallback((value: string) => {
    setPerPage(parseInt(value));
    setPage(1);
  }, []);

  const hasActiveFilters =
    filterState.intents.length > 0 ||
    filterState.statuses.length > 0 ||
    !!filterState.campaignId ||
    filterState.period !== "all" ||
    !!filterState.search;

  // Busca é client-side sobre a página carregada — quando ativa, a contagem
  // e a paginação (server-side) mentiriam sobre o que está renderizado.
  const isSearchActive = !!filterState.search?.trim();

  // Pagination info
  const totalEntries = meta?.total ?? 0;
  const totalPages = meta?.totalPages ?? 1;
  const startItem = totalEntries > 0 ? (page - 1) * perPage + 1 : 0;
  const endItem = Math.min(page * perPage, totalEntries);
  // Header: reflete a view filtrada quando há busca; senão, o total do servidor.
  const shownCount = isSearchActive ? visibleOpportunities.length : totalEntries;

  // Loading skeleton (UX-DR2)
  if (isLoading) {
    return (
      <Card data-testid="opportunities-loading">
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

  // Error state (UX-DR2)
  if (error) {
    return (
      <Card className="border-destructive" data-testid="opportunities-error">
        <CardContent className="pt-6">
          <p className="text-destructive">Erro: {error}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Filters */}
      <OpportunitiesFilterBar
        filters={filterState}
        onFiltersChange={handleFiltersChange}
        onClearFilters={handleClearFilters}
      />

      {/* Empty state */}
      {visibleOpportunities.length === 0 && (
        <OpportunitiesEmptyState hasFilters={hasActiveFilters} />
      )}

      {/* Lista de cards (ordenada por recência no servidor) */}
      {visibleOpportunities.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
            <CardTitle className="text-base font-medium">
              {shownCount} {shownCount === 1 ? "oportunidade" : "oportunidades"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-3">
              {visibleOpportunities.map((opportunity) => (
                <OpportunityCard
                  key={opportunity.id}
                  opportunity={opportunity}
                  onWhatsApp={setComposerOpportunity}
                  onPhoneLookup={setPhoneLookupOpportunity}
                  localPhone={localPhones.get(opportunity.id)}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pagination — oculta durante busca client-side (pagina dados do servidor,
          não a view filtrada; exibi-la contradiria a lista/contagem renderizada) */}
      {totalPages > 1 && !isSearchActive && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {startItem}-{endItem} de {totalEntries}
            </span>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Por pagina:</span>
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
              aria-label="Pagina anterior"
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
              aria-label="Proxima pagina"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* AC3 — composer de WhatsApp pré-preenchido com o rascunho da IA */}
      {composerOpportunity?.lead && (
        <WhatsAppComposerDialog
          open={true}
          onOpenChange={(open) => {
            if (!open) setComposerOpportunity(null);
          }}
          lead={{
            firstName: composerOpportunity.lead.firstName,
            lastName: composerOpportunity.lead.lastName ?? undefined,
            phone:
              localPhones.get(composerOpportunity.id) ??
              composerOpportunity.lead.phone ??
              undefined,
            leadEmail: composerOpportunity.lead.email ?? undefined,
            companyName: composerOpportunity.lead.companyName ?? undefined,
            title: composerOpportunity.lead.title ?? undefined,
          }}
          campaignId=""
          initialMessage={composerOpportunity.suggestion ?? undefined}
          isSending={isSending}
          onSend={handleWhatsAppSend}
        />
      )}

      {/* AC3 — busca de telefone (SignalHire exige e-mail ou LinkedIn) */}
      {phoneLookupOpportunity?.lead?.email && (
        <PhoneLookupDialog
          open={true}
          onOpenChange={(open) => {
            if (!open) setPhoneLookupOpportunity(null);
          }}
          lead={{
            leadEmail: phoneLookupOpportunity.lead.email,
            firstName: phoneLookupOpportunity.lead.firstName,
            lastName: phoneLookupOpportunity.lead.lastName ?? undefined,
            leadId: phoneLookupOpportunity.lead.id,
          }}
          onPhoneFound={handlePhoneFound}
        />
      )}
    </div>
  );
}
