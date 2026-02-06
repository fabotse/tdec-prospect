/**
 * Leads Page Content
 * Story: 3.1 - Leads Page & Data Model
 * Story: 3.3 - Traditional Filter Search
 * Story: 3.4 - AI Conversational Search
 * Story: 3.5 - Lead Table Display
 * Story: 3.6 - Lead Selection (Individual & Batch)
 * Story: 3.8 - Lead Table Pagination
 * Story: 4.1 - Lead Segments/Lists
 * Story: 4.3 - Lead Detail View & Interaction History
 * Story: 4.6 - Interested Leads Highlighting
 *
 * AC: #1 - Filter panel integration
 * AC: #2 - Search with filters, loading state
 * AC: #3 - Result count display
 * AC: #5 - Empty state when no results
 * AC (3.4): #1 - AI search input above filter panel
 * AC (3.4): #5 - Populate FilterPanel with AI-extracted values
 * AC (3.5): #1-8 - Lead table with sorting, resizing, accessibility
 * AC (3.6): #1, #6 - Selection bar appears when leads selected
 * AC (3.8): #1-7 - Pagination controls with state management
 * Story 4.1: AC #3 - Segment filter dropdown above results
 * Story 4.3: AC #6 - Simplified preview for Apollo leads
 * Story 4.6: AC #4 - Read-only status badge on import indicator
 */

"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useSearchLeads, filterLeadsBySegment, filterLeadsByStatus } from "@/hooks/use-leads";
import { useSegmentLeadIds } from "@/hooks/use-segments";
import { useFilterStore } from "@/stores/use-filter-store";
import { useSelectionStore } from "@/stores/use-selection-store";
import { FilterPanel } from "@/components/search/FilterPanel";
import { AISearchInput } from "@/components/search/AISearchInput";
import { LeadsEmptyState } from "@/components/leads/LeadsEmptyState";
import { LeadsSearchEmptyState } from "@/components/leads/LeadsSearchEmptyState";
import { LeadsPageSkeleton } from "@/components/leads/LeadsPageSkeleton";
import { LeadTable } from "@/components/leads/LeadTable";
import { LeadSelectionBar } from "@/components/leads/LeadSelectionBar";
import { LeadTablePagination } from "@/components/leads/LeadTablePagination";
import { SegmentFilter } from "@/components/leads/SegmentFilter";
import { LeadPreviewPanel } from "@/components/leads/LeadPreviewPanel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ApolloSearchFilters } from "@/types/apollo";
import type { Lead } from "@/types/lead";

// ==============================================
// SEARCH MODE TYPE
// ==============================================

type SearchMode = "ai" | "manual";

// ==============================================
// COMPONENT
// ==============================================

export function LeadsPageContent() {
  const { filters, setExpanded, setFilters } = useFilterStore();
  const { selectedIds, setSelectedIds } = useSelectionStore();

  // Manual search
  const manualSearch = useSearchLeads();

  // AI search results stored via callback from AISearchInput
  const [aiLeads, setAiLeads] = useState<Lead[]>([]);

  // Track search mode and if search has been performed
  const [searchMode, setSearchMode] = useState<SearchMode>("ai");
  const [hasSearched, setHasSearched] = useState(false);

  // Story 4.1: Segment filter state
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
  const { data: segmentLeadIds } = useSegmentLeadIds(selectedSegmentId);

  // Story 4.3: AC #6 - Lead preview panel state
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  // Story 4.3: AC #6 - Open preview panel when row is clicked
  const handleRowClick = useCallback((lead: Lead) => {
    setSelectedLead(lead);
    setIsPreviewOpen(true);
  }, []);

  // Story 4.3: AC #7 - Close preview panel
  const handleClosePreview = useCallback(() => {
    setIsPreviewOpen(false);
  }, []);

  // Story 3.8: Store current filters for pagination re-fetch
  const currentFiltersRef = useRef<ApolloSearchFilters>({});

  // Current data based on mode
  const rawLeads: Lead[] = searchMode === "ai" ? aiLeads : manualSearch.data;

  // Story 4.1: AC #3 - Filter leads by segment if segment is selected
  // Story 4.2: AC #3 - Filter leads by status if status filter is active
  // @perf: Client-side filtering is used for MVP. For large datasets (>1000 leads),
  // consider implementing server-side filtering via API query parameter to avoid
  // iterating through all leads on every render. See architecture.md for API patterns.
  const leads = useMemo(() => {
    let filteredLeads = rawLeads;

    // Apply segment filter
    if (selectedSegmentId) {
      filteredLeads = filterLeadsBySegment(filteredLeads, segmentLeadIds);
    }

    // Apply status filter (Story 4.2: AC #3)
    if (filters.leadStatuses.length > 0) {
      filteredLeads = filterLeadsByStatus(filteredLeads, filters.leadStatuses);
    }

    return filteredLeads;
  }, [rawLeads, selectedSegmentId, segmentLeadIds, filters.leadStatuses]);

  // AI loading/error is handled inside AISearchInput's own UI
  const isLoading = searchMode === "manual" ? manualSearch.isLoading : false;
  const error = searchMode === "manual" ? manualSearch.error : null;

  // Story 3.8: Get pagination state from manual search
  const { pagination, page, perPage, setPage, setPerPage, resetPage } = manualSearch;

  // AC: #2 - Handle manual search with current filters
  // Story 3.5.1: Added contactEmailStatuses to filter mapping
  // Story 3.8: AC #5 - Reset page to 1 when filters change
  const handleManualSearch = useCallback(() => {
    const apolloFilters: ApolloSearchFilters = {
      industries:
        filters.industries.length > 0 ? filters.industries : undefined,
      companySizes:
        filters.companySizes.length > 0 ? filters.companySizes : undefined,
      locations: filters.locations.length > 0 ? filters.locations : undefined,
      titles: filters.titles.length > 0 ? filters.titles : undefined,
      keywords: filters.keywords || undefined,
      contactEmailStatuses:
        filters.contactEmailStatuses.length > 0
          ? filters.contactEmailStatuses
          : undefined,
    };
    // Story 3.8: Store filters for pagination and reset page
    currentFiltersRef.current = apolloFilters;
    resetPage();
    setSearchMode("manual");
    manualSearch.search(apolloFilters);
    setHasSearched(true);
  }, [filters, manualSearch, resetPage]);

  // AC (3.4): #5 - When AI extracts filters, populate manual filter panel
  // Story 3.5.1: Added contactEmailStatuses to extracted filters
  const handleFiltersExtracted = useCallback(
    (extractedFilters: ApolloSearchFilters) => {
      setFilters({
        industries: extractedFilters.industries ?? [],
        companySizes: extractedFilters.companySizes ?? [],
        locations: extractedFilters.locations ?? [],
        titles: extractedFilters.titles ?? [],
        keywords: extractedFilters.keywords ?? "",
        contactEmailStatuses: extractedFilters.contactEmailStatuses ?? [],
      });
      setExpanded(true);
      setSearchMode("manual");
    },
    [setFilters, setExpanded]
  );

  // Handle AI search completion — receive leads from AISearchInput
  const handleAISearchComplete = useCallback((leads: Lead[]) => {
    setAiLeads(leads);
    setSearchMode("ai");
    setHasSearched(true);
  }, []);

  // AC: #5 - Handle adjust filters action
  const handleAdjustFilters = useCallback(() => {
    setExpanded(true);
  }, [setExpanded]);

  // Story 3.6: Count visible selected leads (intersection of selectedIds and current leads)
  const visibleSelectedCount = useMemo(() => {
    const visibleIds = new Set(leads.map((l) => l.id));
    return selectedIds.filter((id) => visibleIds.has(id)).length;
  }, [selectedIds, leads]);

  // Story 3.8: AC #2 - Handle page change
  // Fix: Pass explicit page value to avoid race condition with React setState
  const handlePageChange = useCallback(
    (newPage: number) => {
      setPage(newPage);
      // Re-fetch with explicit new page to avoid race condition
      manualSearch.search({ ...currentFiltersRef.current, page: newPage });
    },
    [setPage, manualSearch]
  );

  // Story 3.8: AC #3 - Handle per page change
  // Fix: Pass explicit perPage and reset page to 1 to avoid race condition
  const handlePerPageChange = useCallback(
    (newPerPage: number) => {
      setPerPage(newPerPage);
      // Re-fetch with explicit new perPage and page=1 to avoid race condition
      manualSearch.search({ ...currentFiltersRef.current, perPage: newPerPage, page: 1 });
    },
    [setPerPage, manualSearch]
  );

  return (
    <div className="space-y-6">
      {/* AI Search Input - Primary (Story 3.4) */}
      <AISearchInput
        onFiltersExtracted={handleFiltersExtracted}
        onSearchComplete={handleAISearchComplete}
      />

      {/* Divider */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-background px-2 text-muted-foreground">
            ou use filtros manuais
          </span>
        </div>
      </div>

      {/* Filter Panel - AC: #1 */}
      <FilterPanel onSearch={handleManualSearch} isLoading={manualSearch.isLoading} />

      {/* Loading State - AC: #2 */}
      {isLoading && <LeadsPageSkeleton />}

      {/* Error State */}
      {!isLoading && error && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p className="text-destructive">Erro ao buscar leads: {error}</p>
          </CardContent>
        </Card>
      )}

      {/* Initial Empty State - No search performed yet */}
      {!isLoading && !error && !hasSearched && <LeadsEmptyState />}

      {/* Search Empty State - AC: #5 */}
      {!isLoading && !error && hasSearched && leads.length === 0 && (
        <LeadsSearchEmptyState onAdjustFilters={handleAdjustFilters} />
      )}

      {/* Results - AC (3.5): Lead table with sorting, resizing, accessibility */}
      {/* Story 3.8: AC #1 - Pagination controls below table */}
      {!isLoading && !error && hasSearched && leads.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle
              className="text-base font-medium"
              data-testid="result-count"
            >
              {/* Story 3.8: Show total from pagination if available */}
              {/* Story 4.1: When segment filtered, show filtered count */}
              {selectedSegmentId
                ? leads.length.toLocaleString("pt-BR")
                : (searchMode === "manual" && pagination?.totalEntries
                    ? pagination.totalEntries.toLocaleString("pt-BR")
                    : leads.length)}{" "}
              lead
              {leads.length !== 1 ? "s" : ""}{" "}
              {selectedSegmentId ? "no segmento" : "encontrado" + (leads.length !== 1 ? "s" : "")}
            </CardTitle>
            {/* Story 4.1: AC #3 - Segment filter dropdown */}
            <SegmentFilter
              selectedSegmentId={selectedSegmentId}
              onSegmentChange={setSelectedSegmentId}
            />
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Story 4.3: AC #6 - Row click opens preview panel */}
            {/* Story 4.6: AC #4 - Show import status on Apollo search */}
            <LeadTable
              leads={leads}
              selectedIds={selectedIds}
              onSelectionChange={setSelectedIds}
              isLoading={isLoading}
              onRowClick={handleRowClick}
              showImportStatus
            />
            {/* Story 3.8: AC #1, #6 - Pagination controls with loading state */}
            {searchMode === "manual" && (
              <LeadTablePagination
                pagination={pagination}
                page={page}
                perPage={perPage}
                onPageChange={handlePageChange}
                onPerPageChange={handlePerPageChange}
                isLoading={isLoading}
              />
            )}
          </CardContent>
        </Card>
      )}

      {/* Story 3.6: Selection Bar - Fixed at bottom */}
      {/* Story 4.1: Pass leads for segment functionality */}
      <LeadSelectionBar visibleSelectedCount={visibleSelectedCount} leads={leads} />

      {/* Story 4.3: AC #6 - Lead preview panel for Apollo search leads */}
      <LeadPreviewPanel
        lead={selectedLead}
        isOpen={isPreviewOpen}
        onClose={handleClosePreview}
      />
    </div>
  );
}
