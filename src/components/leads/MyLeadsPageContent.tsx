/**
 * My Leads Page Content Component
 * Story 4.2.2: My Leads Page
 * Story 4.3: Lead Detail View & Interaction History
 * Story 4.6: Interested Leads Highlighting
 * Story 4.7: Import Campaign Results
 * Story 12.2: Import Leads via CSV
 *
 * Main content component for displaying imported leads from database.
 *
 * AC: #2 - Table structure with imported leads
 * AC: #3 - Status, segment, and search filtering
 * AC: #4 - Inline status edit via LeadStatusDropdown
 * AC: #5 - Lead actions via LeadSelectionBar
 * AC: #6 - Empty state when no leads
 * AC: #7 - Pagination with LeadTablePagination
 * Story 4.3: AC #1 - Detail sidepanel on row click
 * Story 4.6: AC #2, #6 - Interested leads quick filter and counter
 * Story 4.7: AC #1 - Import campaign results button
 * Story 12.2: AC #1 - Import CSV button
 */

"use client";

import { useState, useMemo, useCallback } from "react";
import type { Lead } from "@/types/lead";
import { useMyLeads, useInterestedCount } from "@/hooks/use-my-leads";
import { useSelectionStore } from "@/stores/use-selection-store";
import { LeadTable } from "@/components/leads/LeadTable";
import { LeadSelectionBar } from "@/components/leads/LeadSelectionBar";
import { MyLeadsFilterBar } from "@/components/leads/MyLeadsFilterBar";
import { MyLeadsEmptyState } from "@/components/leads/MyLeadsEmptyState";
import { LeadsPageSkeleton } from "@/components/leads/LeadsPageSkeleton";
import { LeadDetailPanel } from "@/components/leads/LeadDetailPanel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ChevronLeft,
  ChevronRight,
  Upload,
  FileUp,
  Plus,
} from "lucide-react";
import { ImportCampaignResultsDialog } from "@/components/leads/ImportCampaignResultsDialog";
import { ImportLeadsDialog } from "@/components/leads/ImportLeadsDialog";
import { CreateLeadDialog } from "@/components/leads/CreateLeadDialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const PER_PAGE_OPTIONS = [10, 25, 50, 100];

/**
 * Content component for My Leads page
 * Fetches leads from database (not Apollo) and displays them
 */
export function MyLeadsPageContent() {
  const {
    leads,
    pagination,
    isLoading,
    isFetching,
    error,
    filters,
    updateFilters,
    clearFilters,
    page,
    perPage,
    setPage,
    setPerPage,
  } = useMyLeads();

  // Story 4.6: AC #2, #6 - Interested leads count for quick filter and header
  const { count: interestedCount } = useInterestedCount();

  const { selectedIds, setSelectedIds } = useSelectionStore();

  // Story 4.3: AC #1 - State for lead detail panel
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [isPanelOpen, setIsPanelOpen] = useState(false);

  // Story 4.7: AC #1 - State for import campaign results dialog
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);

  // Story 12.2: AC #1 - State for import leads CSV dialog
  const [isImportCsvDialogOpen, setIsImportCsvDialogOpen] = useState(false);

  // Quick Dev: State for manual lead creation dialog
  const [isCreateLeadDialogOpen, setIsCreateLeadDialogOpen] = useState(false);

  // Story 6.5.6: AC #4 - Track leads currently generating icebreakers
  const [generatingIcebreakerIds, setGeneratingIcebreakerIds] = useState<Set<string>>(new Set());

  // Story 4.3: AC #1 - Open panel when row is clicked
  const handleRowClick = useCallback((lead: Lead) => {
    setSelectedLead(lead);
    setIsPanelOpen(true);
  }, []);

  // Story 4.3: AC #7 - Close panel handler
  const handleClosePanel = useCallback(() => {
    setIsPanelOpen(false);
  }, []);

  // Story 4.4.1: Update selected lead when enriched
  const handleLeadUpdate = useCallback((updatedLead: Lead) => {
    setSelectedLead(updatedLead);
  }, []);

  // Story 6.5.6: AC #4 - Handle icebreaker generation start
  const handleIcebreakerGenerationStart = useCallback((leadIds: string[]) => {
    setGeneratingIcebreakerIds(new Set(leadIds));
  }, []);

  // Story 6.5.6: AC #4 - Handle icebreaker generation end
  const handleIcebreakerGenerationEnd = useCallback(() => {
    setGeneratingIcebreakerIds(new Set());
  }, []);

  // Count visible selected leads
  const visibleSelectedCount = useMemo(() => {
    const visibleIds = new Set(leads.map((l) => l.id));
    return selectedIds.filter((id) => visibleIds.has(id)).length;
  }, [selectedIds, leads]);

  // AC: #6 - Show empty state when no leads and not loading
  const showEmptyState = !isLoading && leads.length === 0 && !hasActiveFilters();

  // Check if any filters are active
  function hasActiveFilters(): boolean {
    return Boolean(
      (filters.statuses && filters.statuses.length > 0) ||
      filters.segmentId ||
      filters.search
    );
  }

  // Pagination calculations
  const totalEntries = pagination?.total ?? 0;
  const totalPages = pagination?.totalPages ?? 1;
  const startItem = totalEntries > 0 ? (page - 1) * perPage + 1 : 0;
  const endItem = Math.min(page * perPage, totalEntries);
  const hasMultiplePages = totalPages > 1;
  const isFirstPage = page === 1;
  const isLastPage = page >= totalPages;

  return (
    <div className="space-y-4">
      {/* AC: #3 - Filter bar */}
      {/* Story 4.6: AC #2 - interestedCount for quick filter badge */}
      <MyLeadsFilterBar
        filters={filters}
        onFiltersChange={updateFilters}
        onClearFilters={clearFilters}
        interestedCount={interestedCount}
      />

      {/* Loading State */}
      {isLoading && <LeadsPageSkeleton />}

      {/* Error State */}
      {!isLoading && error && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p className="text-destructive">Erro ao buscar leads: {error}</p>
          </CardContent>
        </Card>
      )}

      {/* AC: #6 - Empty state when no imported leads */}
      {showEmptyState && (
        <MyLeadsEmptyState onCreateLead={() => setIsCreateLeadDialogOpen(true)} />
      )}

      {/* Empty state when filters yield no results */}
      {!isLoading && !error && leads.length === 0 && hasActiveFilters() && (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              Nenhum lead encontrado com os filtros selecionados.
            </p>
            <Button
              variant="link"
              onClick={clearFilters}
              className="mt-2"
            >
              Limpar filtros
            </Button>
          </CardContent>
        </Card>
      )}

      {/* AC: #2 - Lead table with results */}
      {!isLoading && !error && leads.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
            <div className="flex items-center gap-3">
              <CardTitle
                className="text-base font-medium"
                data-testid="my-leads-result-count"
              >
                {totalEntries.toLocaleString("pt-BR")} lead
                {totalEntries !== 1 ? "s" : ""} importado
                {totalEntries !== 1 ? "s" : ""}
              </CardTitle>
              {/* Story 4.6: AC #6 - Interested leads counter */}
              {interestedCount > 0 && (
                <span
                  className="text-sm text-green-600 dark:text-green-400 font-medium"
                  data-testid="interested-count"
                >
                  • {interestedCount} interessado{interestedCount !== 1 ? "s" : ""}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {/* Quick Dev: Manual lead creation button */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsCreateLeadDialogOpen(true)}
                data-testid="create-lead-button"
              >
                <Plus className="h-4 w-4 mr-2" />
                Criar Lead
              </Button>
              {/* Story 12.2: AC #1 - Import leads CSV button */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsImportCsvDialogOpen(true)}
                data-testid="import-csv-button"
              >
                <FileUp className="h-4 w-4 mr-2" />
                Importar CSV
              </Button>
              {/* Story 4.7: AC #1 - Import campaign results button */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsImportDialogOpen(true)}
                data-testid="import-campaign-results-button"
              >
                <Upload className="h-4 w-4 mr-2" />
                Importar Resultados
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* AC: #2 - LeadTable with showCreatedAt for "Importado em" column */}
            {/* Story 4.3: AC #1 - Row click opens detail panel */}
            {/* Story 6.5.6: AC #1 - showIcebreaker column on My Leads page */}
            <LeadTable
              leads={leads}
              selectedIds={selectedIds}
              onSelectionChange={setSelectedIds}
              isLoading={isFetching}
              showCreatedAt
              showIcebreaker
              onRowClick={handleRowClick}
              generatingIcebreakerIds={generatingIcebreakerIds}
            />

            {/* AC: #7 - Pagination controls */}
            {totalEntries > 0 && (
              <div
                className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2"
                data-testid="my-leads-pagination"
              >
                {/* Results counter */}
                <p className="text-sm text-muted-foreground">
                  Mostrando {startItem}-{endItem} de{" "}
                  {totalEntries.toLocaleString("pt-BR")} leads
                </p>

                <div className="flex items-center gap-4">
                  {/* Items per page selector */}
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">
                      Itens por página:
                    </span>
                    <Select
                      value={perPage.toString()}
                      onValueChange={(value) => setPerPage(parseInt(value))}
                      disabled={isFetching}
                    >
                      <SelectTrigger className="w-[70px] h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PER_PAGE_OPTIONS.map((option) => (
                          <SelectItem key={option} value={option.toString()}>
                            {option}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Page navigation */}
                  {hasMultiplePages && (
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setPage(page - 1)}
                        disabled={isFirstPage || isFetching}
                        aria-label="Página anterior"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>

                      <span className="text-sm text-muted-foreground px-2 min-w-[80px] text-center">
                        {page} de {totalPages}
                      </span>

                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setPage(page + 1)}
                        disabled={isLastPage || isFetching}
                        aria-label="Próxima página"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* AC: #5 - Selection bar for batch actions */}
      {/* Story 4.4.1: AC #4 - showEnrichment on My Leads page */}
      {/* Story 4.5: AC #4.2 - showPhoneLookup only on My Leads page */}
      {/* Story 6.5.6: AC #2 - showIcebreaker button on My Leads page */}
      <LeadSelectionBar
        visibleSelectedCount={visibleSelectedCount}
        leads={leads}
        showEnrichment
        showPhoneLookup
        showIcebreaker
        onIcebreakerGenerationStart={handleIcebreakerGenerationStart}
        onIcebreakerGenerationEnd={handleIcebreakerGenerationEnd}
      />

      {/* Story 4.3: AC #1 - Lead detail sidepanel */}
      {/* Story 4.4.1: onLeadUpdate refreshes panel data after enrichment */}
      <LeadDetailPanel
        lead={selectedLead}
        isOpen={isPanelOpen}
        onClose={handleClosePanel}
        onLeadUpdate={handleLeadUpdate}
      />

      {/* Story 4.7: AC #1 - Import campaign results dialog */}
      <ImportCampaignResultsDialog
        open={isImportDialogOpen}
        onOpenChange={setIsImportDialogOpen}
      />

      {/* Story 12.2: AC #1 - Import leads CSV dialog */}
      <ImportLeadsDialog
        open={isImportCsvDialogOpen}
        onOpenChange={setIsImportCsvDialogOpen}
      />

      {/* Quick Dev: Manual lead creation dialog */}
      <CreateLeadDialog
        open={isCreateLeadDialogOpen}
        onOpenChange={setIsCreateLeadDialogOpen}
      />
    </div>
  );
}
