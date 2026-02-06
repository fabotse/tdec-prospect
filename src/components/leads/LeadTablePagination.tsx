/**
 * Lead Table Pagination Component
 * Story: 3.8 - Lead Table Pagination
 *
 * AC #1: Pagination controls with Previous/Next, page indicator, results counter
 * AC #2: Page navigation with proper state updates
 * AC #3: Items per page selector (10, 25, 50, 100)
 * AC #7: Edge cases (0 results, 1 page)
 * AC #8: Keyboard accessibility
 */

"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { PaginationMeta } from "@/types/apollo";

// ==============================================
// TYPES
// ==============================================

interface LeadTablePaginationProps {
  pagination: PaginationMeta | null;
  page: number;
  perPage: number;
  onPageChange: (page: number) => void;
  onPerPageChange: (perPage: number) => void;
  isLoading?: boolean;
}

// AC #3: Items per page options
const PER_PAGE_OPTIONS = [10, 25, 50, 100];

// ==============================================
// COMPONENT
// ==============================================

export function LeadTablePagination({
  pagination,
  page,
  perPage,
  onPageChange,
  onPerPageChange,
  isLoading = false,
}: LeadTablePaginationProps) {
  // AC #7: Hide pagination if no results
  if (!pagination || pagination.totalEntries === 0) {
    return null;
  }

  const { totalEntries, totalPages } = pagination;

  // Calculate display range "Mostrando X-Y de Z resultados"
  const startItem = (page - 1) * perPage + 1;
  const endItem = Math.min(page * perPage, totalEntries);

  // AC #7: Check if only 1 page
  const hasMultiplePages = totalPages > 1;
  const isFirstPage = page === 1;
  const isLastPage = page >= totalPages;

  // AC #2: Page navigation handlers
  const handlePreviousPage = () => {
    if (!isFirstPage && !isLoading) {
      onPageChange(page - 1);
    }
  };

  const handleNextPage = () => {
    if (!isLastPage && !isLoading) {
      onPageChange(page + 1);
    }
  };

  // AC #3: Per page change handler
  const handlePerPageChange = (value: string) => {
    if (!isLoading) {
      onPerPageChange(Number(value));
    }
  };

  return (
    <div
      className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-t pt-4"
      role="navigation"
      aria-label="Paginação da tabela"
    >
      {/* Left side: Results counter */}
      <div className="text-sm text-muted-foreground">
        {/* AC #1: "Mostrando X-Y de Z resultados" */}
        Mostrando {startItem.toLocaleString("pt-BR")}-
        {endItem.toLocaleString("pt-BR")} de{" "}
        {totalEntries.toLocaleString("pt-BR")} resultados
      </div>

      {/* Right side: Controls */}
      <div className="flex items-center gap-4">
        {/* AC #3: Items per page selector */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Por página:</span>
          <Select
            value={String(perPage)}
            onValueChange={handlePerPageChange}
            disabled={isLoading}
          >
            <SelectTrigger
              className="w-[70px]"
              size="sm"
              aria-label="Selecionar quantidade por página"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PER_PAGE_OPTIONS.map((option) => (
                <SelectItem key={option} value={String(option)}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* AC #1, #2: Page navigation */}
        {hasMultiplePages && (
          <div className="flex items-center gap-2">
            {/* AC #1: Page indicator "Página X de Y" */}
            <span className="text-sm text-muted-foreground min-w-[100px] text-center">
              Página {page.toLocaleString("pt-BR")} de{" "}
              {totalPages.toLocaleString("pt-BR")}
            </span>

            {/* AC #1, #2, #8: Previous/Next buttons with keyboard accessibility */}
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon-sm"
                onClick={handlePreviousPage}
                disabled={isFirstPage || isLoading}
                aria-label="Página anterior"
              >
                <ChevronLeft className="size-4" />
              </Button>
              <Button
                variant="outline"
                size="icon-sm"
                onClick={handleNextPage}
                disabled={isLastPage || isLoading}
                aria-label="Próxima página"
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
