/**
 * Technographic Page Content
 * Story: 15.3 - Resultados de Empresas: Tabela e Selecao
 * Story: 15.4 - Apollo Bridge: Busca de Contatos nas Empresas
 *
 * AC: #1-#6 (15.3) - Main client component orchestrating search, filters, results and selection
 * AC: #1-#5 (15.4) - Contact search via Apollo with title filters, results, error handling
 */

"use client";

import { useState, useCallback } from "react";
import { Search, Loader2, RotateCcw, UserPlus } from "lucide-react";
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
import { ContactSearchDialog } from "./ContactSearchDialog";
import { ContactResultsTable } from "./ContactResultsTable";
import { CreateLeadsDialog } from "./CreateLeadsDialog";
import { useCompanySearch } from "@/hooks/use-company-search";
import { useContactSearch } from "@/hooks/use-contact-search";

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
  const [selectedDomains, setSelectedDomains] = useState<string[]>([]);
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
  const [createLeadsOpen, setCreateLeadsOpen] = useState(false);

  const {
    search,
    data,
    isLoading,
    error,
    page,
    setPage,
  } = useCompanySearch();

  const {
    search: contactSearchFn,
    data: contactData,
    isLoading: contactLoading,
    error: contactError,
    reset: contactReset,
  } = useContactSearch();
  const [lastContactParams, setLastContactParams] = useState<{
    domains: string[];
    titles: string[];
  } | null>(null);

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
      setSelectedDomains([]);
      setSelectedContactIds([]);
      contactReset();
      setLastContactParams(null);

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
    [selectedTechnologies, filters, search, setPage, contactReset]
  );

  const handlePageChange = useCallback(
    (newPage: number) => {
      setSelectedDomains([]);
      setSelectedContactIds([]);
      handleSearch(newPage);
    },
    [handleSearch]
  );

  const selectedCompanies = data?.companies.filter(
    (c) => selectedDomains.includes(c.domain)
  ) ?? [];

  const handleContactSearch = useCallback(
    (titles: string[]) => {
      const params = { domains: selectedDomains, titles };
      setLastContactParams(params);
      contactSearchFn(params);
    },
    [selectedDomains, contactSearchFn]
  );

  const handleContactRetry = useCallback(() => {
    if (lastContactParams) {
      contactReset();
      contactSearchFn(lastContactParams);
    }
  }, [lastContactParams, contactReset, contactSearchFn]);

  const handleCreateLeadsSuccess = useCallback(() => {
    setSelectedContactIds([]);
  }, []);

  const selectedContacts = (contactData?.contacts ?? []).filter(
    (c) => selectedContactIds.includes(c.id)
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
        selectedDomains={selectedDomains}
        onSelectionChange={setSelectedDomains}
      />

      {/* Contact Search Section (AC: #1-#5 Story 15.4) */}
      {selectedDomains.length > 0 && (
        <div className="flex flex-col gap-4" data-testid="contact-search-section">
          <ContactSearchDialog
            selectedCompanies={selectedCompanies}
            onSearch={handleContactSearch}
            isLoading={contactLoading}
          />

          {/* Contact search error (AC: #5) */}
          {contactError && (
            <div
              className="flex items-center gap-3 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive"
              data-testid="contact-search-error"
            >
              <span>{contactError.message}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={handleContactRetry}
                data-testid="contact-retry-button"
              >
                <RotateCcw className="mr-1 h-3 w-3" />
                Tentar novamente
              </Button>
            </div>
          )}

          {/* Contact results (AC: #3, #4) */}
          {(contactData || contactLoading) && (
            <>
              <ContactResultsTable
                contacts={contactData?.contacts ?? []}
                isLoading={contactLoading}
                total={contactData?.total}
                selectedIds={selectedContactIds}
                onSelectionChange={setSelectedContactIds}
              />

              {/* Create Leads button (Story 15.5, AC: #1) */}
              {selectedContactIds.length > 0 && (
                <Button
                  onClick={() => setCreateLeadsOpen(true)}
                  data-testid="create-leads-trigger"
                >
                  <UserPlus className="mr-2 h-4 w-4" />
                  Criar Leads ({selectedContactIds.length})
                </Button>
              )}

              {/* Create Leads Dialog (Story 15.5) */}
              {createLeadsOpen && (
                <CreateLeadsDialog
                  open={createLeadsOpen}
                  onOpenChange={setCreateLeadsOpen}
                  selectedContacts={selectedContacts}
                  sourceTechnologies={selectedTechnologies.map((t) => t.name)}
                  onSuccess={handleCreateLeadsSuccess}
                />
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
