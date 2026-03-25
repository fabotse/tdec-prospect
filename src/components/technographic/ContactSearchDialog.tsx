/**
 * Contact Search Dialog
 * Story: 15.4 - Apollo Bridge: Busca de Contatos nas Empresas
 *
 * AC: #1 - Filter by target job titles for selected companies
 * AC: #2 - Confirm search with loading state
 */

"use client";

import { useState, useCallback } from "react";
import { Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { TheirStackCompany } from "@/types/theirstack";

// ==============================================
// TYPES
// ==============================================

interface ContactSearchDialogProps {
  selectedCompanies: TheirStackCompany[];
  onSearch: (titles: string[]) => void;
  isLoading: boolean;
}

// ==============================================
// CONSTANTS
// ==============================================

const SUGGESTED_TITLES = [
  "CEO",
  "CTO",
  "CISO",
  "Head of IT",
  "VP Engineering",
  "CFO",
  "COO",
  "Diretor de Tecnologia",
];

function slugify(text: string): string {
  return text.toLowerCase().replace(/\s+/g, "-");
}

// ==============================================
// COMPONENT
// ==============================================

export function ContactSearchDialog({
  selectedCompanies,
  onSearch,
  isLoading,
}: ContactSearchDialogProps) {
  const [open, setOpen] = useState(false);
  const [titles, setTitles] = useState<string[]>([]);
  const [inputValue, setInputValue] = useState("");

  const addTitle = useCallback(
    (title: string) => {
      const trimmed = title.trim();
      if (trimmed && !titles.includes(trimmed)) {
        setTitles((prev) => [...prev, trimmed]);
      }
      setInputValue("");
    },
    [titles]
  );

  const removeTitle = useCallback((title: string) => {
    setTitles((prev) => prev.filter((t) => t !== title));
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" || e.key === ",") {
        e.preventDefault();
        addTitle(inputValue);
      }
    },
    [inputValue, addTitle]
  );

  const handleSearch = useCallback(() => {
    // Add any remaining input as a title
    const allTitles = [...titles];
    const trimmed = inputValue.trim();
    if (trimmed && !allTitles.includes(trimmed)) {
      allTitles.push(trimmed);
    }

    if (allTitles.length > 0) {
      onSearch(allTitles);
      setOpen(false);
      setTitles([]);
      setInputValue("");
    }
  }, [titles, inputValue, onSearch]);

  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      setOpen(isOpen);
      if (!isOpen) {
        setTitles([]);
        setInputValue("");
      }
    },
    []
  );

  const canSearch = titles.length > 0 || inputValue.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          disabled={selectedCompanies.length === 0 || isLoading}
          data-testid="contact-search-trigger"
        >
          <Users className="mr-2 h-4 w-4" />
          Buscar Contatos
        </Button>
      </DialogTrigger>
      <DialogContent data-testid="contact-search-dialog">
        <DialogHeader>
          <DialogTitle>Buscar Contatos nas Empresas Selecionadas</DialogTitle>
          <DialogDescription className="sr-only">
            Defina cargos-alvo para buscar contatos via Apollo
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {/* Company count info */}
          <p className="text-sm text-muted-foreground" data-testid="company-count-info">
            {selectedCompanies.length} empresa{selectedCompanies.length === 1 ? "" : "s"} selecionada{selectedCompanies.length === 1 ? "" : "s"}
          </p>

          {/* Title input */}
          <div className="flex flex-col gap-2">
            <label htmlFor="title-input" className="text-sm font-medium">
              Cargos-alvo
            </label>
            <Input
              id="title-input"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Digite um cargo e pressione Enter"
              data-testid="title-input"
            />
          </div>

          {/* Selected titles as chips */}
          {titles.length > 0 && (
            <div className="flex flex-wrap gap-1.5" data-testid="selected-titles">
              {titles.map((title) => (
                <Badge
                  key={title}
                  variant="secondary"
                  className="cursor-pointer gap-1"
                  onClick={() => removeTitle(title)}
                  data-testid={`title-chip-${title}`}
                >
                  {title}
                  <X className="h-3 w-3" />
                </Badge>
              ))}
            </div>
          )}

          {/* Quick suggestions */}
          <div className="flex flex-col gap-2">
            <span className="text-xs text-muted-foreground">
              Sugestões rápidas:
            </span>
            <div className="flex flex-wrap gap-1.5" data-testid="title-suggestions">
              {SUGGESTED_TITLES.filter((s) => !titles.includes(s)).map((suggestion) => (
                <Badge
                  key={suggestion}
                  variant="outline"
                  className="cursor-pointer"
                  onClick={() => addTitle(suggestion)}
                  data-testid={`suggestion-${slugify(suggestion)}`}
                >
                  {suggestion}
                </Badge>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            onClick={handleSearch}
            disabled={!canSearch}
            data-testid="confirm-contact-search"
          >
            <Users className="mr-2 h-4 w-4" />
            Buscar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
