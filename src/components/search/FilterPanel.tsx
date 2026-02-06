/**
 * Filter Panel Component
 * Story: 3.3 - Traditional Filter Search
 * Story: 3.7 - Saved Filters / Favorites
 *
 * AC: #1 - Filter panel with all filter fields
 * AC: #2 - Buscar button triggers search
 * AC: #4 - Limpar Filtros clears all values
 * AC (3.7): #1-#4 - Save, list, apply, delete saved filters
 *
 * Collapsible filter panel for lead search.
 * Code Review Fix: Controlled inputs, accessibility, memory leak prevention.
 */

"use client";

import { useCallback, useState, useRef, useEffect, useId } from "react";
import { Filter, X, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useFilterStore,
  INDUSTRIES,
  COMPANY_SIZES,
  EMAIL_STATUSES,
  LEAD_STATUS_OPTIONS,
  getActiveFilterCount,
} from "@/stores/use-filter-store";
import { SaveFilterDialog } from "./SaveFilterDialog";
import { SavedFiltersDropdown } from "./SavedFiltersDropdown";

// ==============================================
// TYPES
// ==============================================

interface FilterPanelProps {
  onSearch: () => void;
  isLoading: boolean;
}

// ==============================================
// MULTI-SELECT DROPDOWN COMPONENT (Accessible)
// ==============================================

interface MultiSelectProps {
  label: string;
  options: readonly { value: string; label: string }[];
  selected: string[];
  onChange: (values: string[]) => void;
  placeholder: string;
  testId?: string;
}

function MultiSelect({
  label,
  options,
  selected,
  onChange,
  placeholder,
  testId,
}: MultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const labelId = useId();

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      } else if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        setIsOpen((prev) => !prev);
      }
    },
    []
  );

  const handleToggle = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  };

  return (
    <div className="flex flex-col gap-2" ref={containerRef}>
      <Label id={labelId} className="block">
        {label}
      </Label>
      <div className="relative">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          onKeyDown={handleKeyDown}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-labelledby={labelId}
          aria-controls={isOpen ? listboxId : undefined}
          data-testid={testId}
          className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none"
        >
          <span className="text-muted-foreground">
            {selected.length === 0
              ? placeholder
              : `${selected.length} selecionado${selected.length > 1 ? "s" : ""}`}
          </span>
          {isOpen ? (
            <ChevronUp className="h-4 w-4 opacity-50" aria-hidden="true" />
          ) : (
            <ChevronDown className="h-4 w-4 opacity-50" aria-hidden="true" />
          )}
        </button>

        {isOpen && (
          <div
            id={listboxId}
            role="listbox"
            aria-labelledby={labelId}
            aria-multiselectable="true"
            className="absolute z-50 mt-1 w-full rounded-md border bg-popover p-2 shadow-md"
          >
            <div className="max-h-48 overflow-y-auto space-y-1">
              {options.map((option) => (
                <label
                  key={option.value}
                  role="option"
                  aria-selected={selected.includes(option.value)}
                  className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm cursor-pointer hover:bg-accent"
                >
                  <Checkbox
                    checked={selected.includes(option.value)}
                    onCheckedChange={() => handleToggle(option.value)}
                    aria-label={option.label}
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ==============================================
// DEBOUNCE DELAY CONSTANT (exported for testing)
// ==============================================

export const DEBOUNCE_DELAY_MS = 300;

// ==============================================
// FILTER PANEL COMPONENT
// ==============================================

export function FilterPanel({ onSearch, isLoading }: FilterPanelProps) {
  const {
    filters,
    isExpanded,
    togglePanel,
    setIndustries,
    setCompanySizes,
    setLocations,
    setTitles,
    setKeywords,
    setContactEmailStatuses,
    setLeadStatuses,
    clearFilters,
  } = useFilterStore();

  const activeFilterCount = getActiveFilterCount(filters);

  // Local state for controlled text inputs (syncs with store via debounce)
  const [localLocation, setLocalLocation] = useState(
    filters.locations.join(", ")
  );
  const [localTitle, setLocalTitle] = useState(filters.titles.join(", "));
  const [localKeywords, setLocalKeywords] = useState(filters.keywords);

  // Sync local state when store filters change externally (clear, AI extract).
  // Skip sync when the change came from our own debounce to avoid removing
  // trailing spaces while the user is still typing.
  useEffect(() => {
    const localParsed = localLocation
      .split(",")
      .map((l) => l.trim())
      .filter(Boolean);
    const storeMatch =
      localParsed.length === filters.locations.length &&
      localParsed.every((v, i) => v === filters.locations[i]);
    if (!storeMatch) {
      setLocalLocation(filters.locations.join(", "));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.locations]);

  useEffect(() => {
    const localParsed = localTitle
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const storeMatch =
      localParsed.length === filters.titles.length &&
      localParsed.every((v, i) => v === filters.titles[i]);
    if (!storeMatch) {
      setLocalTitle(filters.titles.join(", "));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.titles]);

  useEffect(() => {
    setLocalKeywords(filters.keywords);
  }, [filters.keywords]);

  // Mounted ref to prevent state updates after unmount (memory leak fix)
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Debounce timers for text inputs
  const locationTimerRef = useRef<NodeJS.Timeout | null>(null);
  const titleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const keywordsTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleLocationChange = useCallback(
    (value: string) => {
      setLocalLocation(value);
      if (locationTimerRef.current) {
        clearTimeout(locationTimerRef.current);
      }
      locationTimerRef.current = setTimeout(() => {
        if (!isMountedRef.current) return;
        const locations = value
          .split(",")
          .map((l) => l.trim())
          .filter(Boolean);
        setLocations(locations);
      }, DEBOUNCE_DELAY_MS);
    },
    [setLocations]
  );

  const handleTitleChange = useCallback(
    (value: string) => {
      setLocalTitle(value);
      if (titleTimerRef.current) {
        clearTimeout(titleTimerRef.current);
      }
      titleTimerRef.current = setTimeout(() => {
        if (!isMountedRef.current) return;
        const titles = value
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean);
        setTitles(titles);
      }, DEBOUNCE_DELAY_MS);
    },
    [setTitles]
  );

  const handleKeywordsChange = useCallback(
    (value: string) => {
      setLocalKeywords(value);
      if (keywordsTimerRef.current) {
        clearTimeout(keywordsTimerRef.current);
      }
      keywordsTimerRef.current = setTimeout(() => {
        if (!isMountedRef.current) return;
        setKeywords(value);
      }, DEBOUNCE_DELAY_MS);
    },
    [setKeywords]
  );

  const handleClearFilters = useCallback(() => {
    // Clear local state immediately for responsive UI
    setLocalLocation("");
    setLocalTitle("");
    setLocalKeywords("");
    clearFilters();
  }, [clearFilters]);

  const handleSearch = useCallback(() => {
    onSearch();
  }, [onSearch]);

  // Cleanup all debounce timers on unmount
  useEffect(() => {
    return () => {
      if (locationTimerRef.current) clearTimeout(locationTimerRef.current);
      if (titleTimerRef.current) clearTimeout(titleTimerRef.current);
      if (keywordsTimerRef.current) clearTimeout(keywordsTimerRef.current);
    };
  }, []);

  const hasActiveFilters = activeFilterCount > 0;

  return (
    <div className="space-y-4">
      {/* Toggle Button and Saved Filters Row (Story 3.7) */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={togglePanel}
            className="gap-2"
            data-testid="filter-toggle-button"
          >
            <Filter className="h-4 w-4" />
            Filtros
            {activeFilterCount > 0 && (
              <Badge variant="secondary" className="ml-1">
                {activeFilterCount}
              </Badge>
            )}
            {isExpanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>

          {/* Story 3.7: Saved Filters Dropdown */}
          <SavedFiltersDropdown />
        </div>

        {/* Story 3.7: Save Filter Button */}
        <SaveFilterDialog disabled={!hasActiveFilters} />
      </div>

      {/* Filter Panel */}
      {isExpanded && (
        <Card data-testid="filter-panel">
          <CardContent className="pt-6">
            {/* Filter Fields Grid */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              {/* Industry Multi-Select */}
              <MultiSelect
                label="Setor/Indústria"
                options={INDUSTRIES}
                selected={filters.industries}
                onChange={setIndustries}
                placeholder="Selecione setores"
                testId="industry-select"
              />

              {/* Company Size Select */}
              <div className="flex flex-col gap-2">
                <Label className="block">Tamanho da Empresa</Label>
                <Select
                  value={filters.companySizes[0] || ""}
                  onValueChange={(value) =>
                    setCompanySizes(value ? [value] : [])
                  }
                >
                  <SelectTrigger className="w-full" data-testid="company-size-select">
                    <SelectValue placeholder="Selecione tamanho" />
                  </SelectTrigger>
                  <SelectContent>
                    {COMPANY_SIZES.map((size) => (
                      <SelectItem key={size.value} value={size.value}>
                        {size.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Location Input */}
              <div className="flex flex-col gap-2">
                <Label className="block" htmlFor="location-input">
                  Localização
                </Label>
                <Input
                  id="location-input"
                  placeholder="Ex: São Paulo, Brasil"
                  value={localLocation}
                  onChange={(e) => handleLocationChange(e.target.value)}
                  data-testid="location-input"
                />
              </div>

              {/* Title Input */}
              <div className="flex flex-col gap-2">
                <Label className="block" htmlFor="title-input">
                  Cargo/Título
                </Label>
                <Input
                  id="title-input"
                  placeholder="Ex: CEO, CTO, Diretor"
                  value={localTitle}
                  onChange={(e) => handleTitleChange(e.target.value)}
                  data-testid="title-input"
                />
              </div>

              {/* Keywords Input */}
              <div className="flex flex-col gap-2">
                <Label className="block" htmlFor="keywords-input">
                  Palavras-chave
                </Label>
                <Input
                  id="keywords-input"
                  placeholder="Termos de busca"
                  value={localKeywords}
                  onChange={(e) => handleKeywordsChange(e.target.value)}
                  data-testid="keywords-input"
                />
              </div>

              {/* Email Status Multi-Select (Story 3.5.1: AC #3, #4) */}
              <MultiSelect
                label="Status do Email"
                options={EMAIL_STATUSES}
                selected={filters.contactEmailStatuses}
                onChange={setContactEmailStatuses}
                placeholder="Selecione status"
                testId="email-status-select"
              />

              {/* Lead Status Multi-Select (Story 4.2: AC #3) */}
              <MultiSelect
                label="Status do Lead"
                options={LEAD_STATUS_OPTIONS}
                selected={filters.leadStatuses}
                onChange={setLeadStatuses}
                placeholder="Selecione status"
                testId="lead-status-select"
              />
            </div>

            {/* Action Buttons */}
            <div className="mt-6 flex items-center gap-3">
              <Button
                onClick={handleSearch}
                disabled={isLoading}
                data-testid="search-button"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Buscando...
                  </>
                ) : (
                  "Buscar"
                )}
              </Button>

              <Button
                variant="outline"
                onClick={handleClearFilters}
                disabled={isLoading || activeFilterCount === 0}
                className="gap-2"
                data-testid="clear-filters-button"
              >
                <X className="h-4 w-4" />
                Limpar Filtros
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
