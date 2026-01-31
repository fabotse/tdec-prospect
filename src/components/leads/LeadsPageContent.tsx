/**
 * Leads Page Content
 * Story: 3.1 - Leads Page & Data Model
 * Story: 3.3 - Traditional Filter Search
 * Story: 3.4 - AI Conversational Search
 *
 * AC: #1 - Filter panel integration
 * AC: #2 - Search with filters, loading state
 * AC: #3 - Result count display
 * AC: #5 - Empty state when no results
 * AC (3.4): #1 - AI search input above filter panel
 * AC (3.4): #5 - Populate FilterPanel with AI-extracted values
 */

"use client";

import { useCallback, useState } from "react";
import { useSearchLeads } from "@/hooks/use-leads";
import { useAISearch } from "@/hooks/use-ai-search";
import { useFilterStore } from "@/stores/use-filter-store";
import { FilterPanel } from "@/components/search/FilterPanel";
import { AISearchInput } from "@/components/search/AISearchInput";
import { LeadsEmptyState } from "@/components/leads/LeadsEmptyState";
import { LeadsSearchEmptyState } from "@/components/leads/LeadsSearchEmptyState";
import { LeadsPageSkeleton } from "@/components/leads/LeadsPageSkeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ApolloSearchFilters } from "@/types/apollo";
import type { Lead } from "@/types/lead";
import { leadStatusLabels, leadStatusVariants } from "@/types/lead";

// ==============================================
// SEARCH MODE TYPE
// ==============================================

type SearchMode = "ai" | "manual";

// ==============================================
// COMPONENT
// ==============================================

export function LeadsPageContent() {
  const { filters, setExpanded, setFilters } = useFilterStore();

  // Manual search
  const manualSearch = useSearchLeads();

  // AI search
  const aiSearch = useAISearch();

  // Track search mode and if search has been performed
  const [searchMode, setSearchMode] = useState<SearchMode>("ai");
  const [hasSearched, setHasSearched] = useState(false);

  // Current data based on mode
  const leads: Lead[] = searchMode === "ai" ? aiSearch.data : manualSearch.data;
  const isLoading =
    searchMode === "ai" ? aiSearch.isLoading : manualSearch.isLoading;
  const error = searchMode === "ai" ? aiSearch.error : manualSearch.error;

  // AC: #2 - Handle manual search with current filters
  const handleManualSearch = useCallback(() => {
    const apolloFilters: ApolloSearchFilters = {
      industries:
        filters.industries.length > 0 ? filters.industries : undefined,
      companySizes:
        filters.companySizes.length > 0 ? filters.companySizes : undefined,
      locations: filters.locations.length > 0 ? filters.locations : undefined,
      titles: filters.titles.length > 0 ? filters.titles : undefined,
      keywords: filters.keywords || undefined,
    };
    setSearchMode("manual");
    manualSearch.search(apolloFilters);
    setHasSearched(true);
  }, [filters, manualSearch]);

  // AC (3.4): #5 - When AI extracts filters, populate manual filter panel
  const handleFiltersExtracted = useCallback(
    (extractedFilters: ApolloSearchFilters) => {
      setFilters({
        industries: extractedFilters.industries ?? [],
        companySizes: extractedFilters.companySizes ?? [],
        locations: extractedFilters.locations ?? [],
        titles: extractedFilters.titles ?? [],
        keywords: extractedFilters.keywords ?? "",
      });
      setExpanded(true);
      setSearchMode("manual");
    },
    [setFilters, setExpanded]
  );

  // Handle AI search completion
  const handleAISearchComplete = useCallback(() => {
    setSearchMode("ai");
    setHasSearched(true);
  }, []);

  // AC: #5 - Handle adjust filters action
  const handleAdjustFilters = useCallback(() => {
    setExpanded(true);
  }, [setExpanded]);

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

      {/* Results - AC (3.4): #1 - Results appear in the leads table */}
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
            <Table data-testid="leads-table">
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Cargo</TableHead>
                  <TableHead>Localização</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leads.map((lead) => (
                  <TableRow key={lead.id} data-testid={`lead-row-${lead.id}`}>
                    <TableCell className="font-medium">
                      {lead.firstName} {lead.lastName ?? ""}
                    </TableCell>
                    <TableCell>{lead.email ?? "-"}</TableCell>
                    <TableCell>{lead.companyName ?? "-"}</TableCell>
                    <TableCell>{lead.title ?? "-"}</TableCell>
                    <TableCell>{lead.location ?? "-"}</TableCell>
                    <TableCell>
                      <Badge variant={leadStatusVariants[lead.status]}>
                        {leadStatusLabels[lead.status]}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
