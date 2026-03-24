/**
 * Technographic Page Content
 * Story: 15.2 - Busca Technografica: Autocomplete e Filtros
 *
 * AC: #1, #2, #3 - Main client component orchestrating search, filters and results
 */

"use client";

import { useState, useCallback } from "react";
import { Search, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  TechnologyAutocomplete,
  type SelectedTechnology,
} from "./TechnologyAutocomplete";
import {
  TechnographicFilterPanel,
  type TechnographicFilters,
} from "./TechnographicFilterPanel";
import { CompanyResultsTable } from "./CompanyResultsTable";
import { useCompanySearch } from "@/hooks/use-company-search";

// ==============================================
// DEFAULT VALUES
// ==============================================

const DEFAULT_LIMIT = 2;

const INITIAL_FILTERS: TechnographicFilters = {
  countryCodes: [],
  minEmployeeCount: undefined,
  maxEmployeeCount: undefined,
  industryIds: [],
};

// ==============================================
// COMPONENT
// ==============================================

export function TechnographicPageContent() {
  const [selectedTechnologies, setSelectedTechnologies] = useState<
    SelectedTechnology[]
  >([]);
  const [filters, setFilters] = useState<TechnographicFilters>(INITIAL_FILTERS);
  const [hasSearched, setHasSearched] = useState(false);

  const {
    search,
    data,
    isLoading,
    error,
    page,
    setPage,
  } = useCompanySearch();

  const handleSelectTechnology = useCallback((tech: SelectedTechnology) => {
    setSelectedTechnologies((prev) => {
      if (prev.some((t) => t.slug === tech.slug)) return prev;
      return [...prev, tech];
    });
  }, []);

  const handleRemoveTechnology = useCallback((slug: string) => {
    setSelectedTechnologies((prev) => prev.filter((t) => t.slug !== slug));
  }, []);

  const handleSearch = useCallback(
    (searchPage = 0) => {
      if (selectedTechnologies.length === 0) return;

      setHasSearched(true);
      setPage(searchPage);

      search({
        technologySlugs: selectedTechnologies.map((t) => t.slug),
        countryCodes:
          filters.countryCodes.length > 0 ? filters.countryCodes : undefined,
        minEmployeeCount: filters.minEmployeeCount,
        maxEmployeeCount: filters.maxEmployeeCount,
        industryIds:
          filters.industryIds.length > 0 ? filters.industryIds : undefined,
        page: searchPage,
        limit: DEFAULT_LIMIT,
      });
    },
    [selectedTechnologies, filters, search, setPage]
  );

  const handlePageChange = useCallback(
    (newPage: number) => {
      handleSearch(newPage);
    },
    [handleSearch]
  );

  const canSearch = selectedTechnologies.length > 0;
  const creditsUsed = data
    ? data.companies.length * 3
    : undefined;

  return (
    <div className="flex flex-col gap-4">
      {/* Technology Autocomplete */}
      <TechnologyAutocomplete
        selectedTechnologies={selectedTechnologies}
        onSelect={handleSelectTechnology}
        onRemove={handleRemoveTechnology}
      />

      {/* Filter Panel */}
      <TechnographicFilterPanel
        filters={filters}
        onFiltersChange={setFilters}
      />

      {/* Search Button */}
      <div className="flex items-center gap-3">
        <Button
          onClick={() => handleSearch(0)}
          disabled={!canSearch || isLoading}
          data-testid="search-button"
        >
          {isLoading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Search className="mr-2 h-4 w-4" />
          )}
          Buscar empresas
        </Button>
        {!canSearch && (
          <span className="text-sm text-muted-foreground">
            Selecione pelo menos uma tecnologia
          </span>
        )}
      </div>

      {/* Error */}
      {error && (
        <div
          className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive"
          data-testid="search-error"
        >
          {error.message}
        </div>
      )}

      {/* Results */}
      <CompanyResultsTable
        companies={data?.companies ?? []}
        totalResults={data?.totalResults ?? 0}
        totalCompanies={data?.totalCompanies ?? 0}
        isLoading={isLoading}
        hasSearched={hasSearched}
        page={page}
        limit={DEFAULT_LIMIT}
        onPageChange={handlePageChange}
        creditsUsed={creditsUsed}
      />
    </div>
  );
}
