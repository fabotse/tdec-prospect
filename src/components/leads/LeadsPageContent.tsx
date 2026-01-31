/**
 * Leads Page Content
 * Story: 3.1 - Leads Page & Data Model
 * Story: 3.3 - Traditional Filter Search
 *
 * AC: #1 - Filter panel integration
 * AC: #2 - Search with filters, loading state
 * AC: #3 - Result count display
 * AC: #5 - Empty state when no results
 */

"use client";

import { useCallback, useState } from "react";
import { useSearchLeads } from "@/hooks/use-leads";
import { useFilterStore } from "@/stores/use-filter-store";
import { FilterPanel } from "@/components/search/FilterPanel";
import { LeadsEmptyState } from "@/components/leads/LeadsEmptyState";
import { LeadsSearchEmptyState } from "@/components/leads/LeadsSearchEmptyState";
import { LeadsPageSkeleton } from "@/components/leads/LeadsPageSkeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ApolloSearchFilters } from "@/types/apollo";

export function LeadsPageContent() {
  const { filters, setExpanded } = useFilterStore();
  const { search, data: leads, isLoading, error } = useSearchLeads();

  // Track if a search has been performed
  const [hasSearched, setHasSearched] = useState(false);

  // AC: #2 - Handle search with current filters
  const handleSearch = useCallback(() => {
    const apolloFilters: ApolloSearchFilters = {
      industries:
        filters.industries.length > 0 ? filters.industries : undefined,
      companySizes:
        filters.companySizes.length > 0 ? filters.companySizes : undefined,
      locations: filters.locations.length > 0 ? filters.locations : undefined,
      titles: filters.titles.length > 0 ? filters.titles : undefined,
      keywords: filters.keywords || undefined,
    };
    search(apolloFilters);
    setHasSearched(true);
  }, [filters, search]);

  // AC: #5 - Handle adjust filters action
  const handleAdjustFilters = useCallback(() => {
    setExpanded(true);
  }, [setExpanded]);

  return (
    <div className="space-y-6">
      {/* Filter Panel - AC: #1 */}
      <FilterPanel onSearch={handleSearch} isLoading={isLoading} />

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

      {/* Results - AC: #3 */}
      {!isLoading && !error && hasSearched && leads.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle
              className="text-lg font-semibold"
              data-testid="result-count"
            >
              {leads.length} lead{leads.length !== 1 ? "s" : ""} encontrado
              {leads.length !== 1 ? "s" : ""}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* Future: LeadTable component (Story 3.5) */}
            <p className="text-muted-foreground">
              Tabela de leads em implementação (Story 3.5).
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
