/**
 * My Leads Page Content Component
 * Story 4.2.2: My Leads Page
 *
 * Main content component for displaying imported leads from database.
 *
 * AC: #2 - Table structure with imported leads
 * AC: #3 - Status, segment, and search filtering
 * AC: #4 - Inline status edit via LeadStatusDropdown
 * AC: #5 - Lead actions via LeadSelectionBar
 * AC: #6 - Empty state when no leads
 * AC: #7 - Pagination with LeadTablePagination
 */

"use client";

import { useMemo } from "react";
import { useMyLeads } from "@/hooks/use-my-leads";
import { useSelectionStore } from "@/stores/use-selection-store";
import { LeadTable } from "@/components/leads/LeadTable";
import { LeadSelectionBar } from "@/components/leads/LeadSelectionBar";
import { MyLeadsFilterBar } from "@/components/leads/MyLeadsFilterBar";
import { MyLeadsEmptyState } from "@/components/leads/MyLeadsEmptyState";
import { LeadsPageSkeleton } from "@/components/leads/LeadsPageSkeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
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

  const { selectedIds, setSelectedIds } = useSelectionStore();

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
      <MyLeadsFilterBar
        filters={filters}
        onFiltersChange={updateFilters}
        onClearFilters={clearFilters}
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
      {showEmptyState && <MyLeadsEmptyState />}

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
            <CardTitle
              className="text-base font-medium"
              data-testid="my-leads-result-count"
            >
              {totalEntries.toLocaleString("pt-BR")} lead
              {totalEntries !== 1 ? "s" : ""} importado
              {totalEntries !== 1 ? "s" : ""}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* AC: #2 - LeadTable with showCreatedAt for "Importado em" column */}
            <LeadTable
              leads={leads}
              selectedIds={selectedIds}
              onSelectionChange={setSelectedIds}
              isLoading={isFetching}
              showCreatedAt
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
      <LeadSelectionBar visibleSelectedCount={visibleSelectedCount} leads={leads} />
    </div>
  );
}
