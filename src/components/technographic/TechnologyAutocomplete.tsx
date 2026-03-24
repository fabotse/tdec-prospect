/**
 * Technology Autocomplete Component
 * Story: 15.2 - Busca Technografica: Autocomplete e Filtros
 *
 * AC: #1 - Autocomplete with debounce 300ms, dropdown with name/category/count
 * Minimum 2 chars, limit 15 suggestions, multi-select with chips
 */

"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { X, Search, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useTechnologySearch } from "@/hooks/use-technology-search";
import type { KeywordAggregated } from "@/types/theirstack";

interface SelectedTechnology {
  name: string;
  slug: string;
  category: string | null;
}

interface TechnologyAutocompleteProps {
  selectedTechnologies: SelectedTechnology[];
  onSelect: (tech: SelectedTechnology) => void;
  onRemove: (slug: string) => void;
}

export function TechnologyAutocomplete({
  selectedTechnologies,
  onSelect,
  onRemove,
}: TechnologyAutocompleteProps) {
  const [query, setQuery] = useState("");
  const [isClosed, setIsClosed] = useState(true);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: suggestions, isLoading } = useTechnologySearch(query);

  const filteredSuggestions = (suggestions ?? []).filter(
    (s) => !selectedTechnologies.some((t) => t.slug === s.slug)
  );

  // Derived: show dropdown when query >= 2, suggestions exist, and not manually closed
  const showDropdown =
    query.length >= 2 && filteredSuggestions.length > 0 && !isClosed;

  const handleSelect = useCallback(
    (item: KeywordAggregated) => {
      onSelect({
        name: item.name,
        slug: item.slug,
        category: item.category,
      });
      setQuery("");
      setIsClosed(true);
      setHighlightedIndex(-1);
      inputRef.current?.focus();
    },
    [onSelect]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!showDropdown) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev < filteredSuggestions.length - 1 ? prev + 1 : 0
        );
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev > 0 ? prev - 1 : filteredSuggestions.length - 1
        );
      } else if (e.key === "Enter" && highlightedIndex >= 0) {
        e.preventDefault();
        handleSelect(filteredSuggestions[highlightedIndex]);
      } else if (e.key === "Escape") {
        setIsClosed(true);
        setHighlightedIndex(-1);
      }
    },
    [showDropdown, filteredSuggestions, highlightedIndex, handleSelect]
  );

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsClosed(true);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="flex flex-col gap-2" ref={containerRef}>
      <label className="text-sm font-medium text-foreground">
        Tecnologias
      </label>

      {/* Selected chips */}
      {selectedTechnologies.length > 0 && (
        <div className="flex flex-wrap gap-1.5" data-testid="selected-technologies">
          {selectedTechnologies.map((tech) => (
            <Badge
              key={tech.slug}
              variant="secondary"
              className="gap-1 pr-1"
            >
              {tech.name}
              <button
                type="button"
                onClick={() => onRemove(tech.slug)}
                className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20"
                aria-label={`Remover ${tech.name}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {/* Search input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={inputRef}
          type="text"
          placeholder="Buscar tecnologia (ex: React, AWS, Salesforce...)"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setHighlightedIndex(-1);
            setIsClosed(false);
          }}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsClosed(false)}
          className="pl-9"
          data-testid="technology-search-input"
        />
        {isLoading && (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}

        {/* Dropdown */}
        {showDropdown && (
          <div
            className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border bg-popover shadow-md"
            role="listbox"
            data-testid="technology-suggestions"
          >
            {filteredSuggestions.map((item, index) => (
              <button
                key={item.slug}
                type="button"
                role="option"
                aria-selected={index === highlightedIndex}
                className={`flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-accent ${
                  index === highlightedIndex ? "bg-accent" : ""
                }`}
                onClick={() => handleSelect(item)}
                onMouseEnter={() => setHighlightedIndex(index)}
              >
                <div className="flex flex-col items-start">
                  <span className="font-medium">{item.name}</span>
                  {item.category && (
                    <span className="text-xs text-muted-foreground">
                      {item.category}
                    </span>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">
                  {item.company_count.toLocaleString("pt-BR")} empresas
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export type { SelectedTechnology };
