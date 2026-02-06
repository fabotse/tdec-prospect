/**
 * My Leads Filter Bar Component
 * Story 4.2.2: My Leads Page
 * Story 4.6: Interested Leads Highlighting
 *
 * AC: #3 - Filter panel for status, segment, and search
 * Story 4.6: AC #2 - Quick filter "Interessados" button
 */

"use client";

import { useCallback, useMemo } from "react";
import { Search, X, Filter, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSegments } from "@/hooks/use-segments";
import { LEAD_STATUSES } from "@/types/lead";
import type { MyLeadsFilters } from "@/hooks/use-my-leads";

interface MyLeadsFilterBarProps {
  filters: MyLeadsFilters;
  onFiltersChange: (filters: Partial<MyLeadsFilters>) => void;
  onClearFilters: () => void;
  /** Story 4.6: AC #2 - Count of interested leads for quick filter badge */
  interestedCount?: number;
}

/**
 * Filter bar for My Leads page
 * AC: #3 - Status multi-select, segment dropdown, search input
 * Story 4.6: AC #2 - Quick filter "Interessados" button
 */
export function MyLeadsFilterBar({
  filters,
  onFiltersChange,
  onClearFilters,
  interestedCount = 0,
}: MyLeadsFilterBarProps) {
  const { data: segments, isLoading: segmentsLoading } = useSegments();

  // Story 4.6: AC #2 - Check if interested filter is active
  const isInterestedFilterActive = useMemo(() => {
    return (
      filters.statuses?.length === 1 && filters.statuses[0] === "interessado"
    );
  }, [filters.statuses]);

  // Story 4.6: AC #2 - Toggle interested filter
  const handleInterestedToggle = useCallback(() => {
    if (isInterestedFilterActive) {
      onFiltersChange({ statuses: undefined });
    } else {
      onFiltersChange({ statuses: ["interessado"] });
    }
  }, [isInterestedFilterActive, onFiltersChange]);

  // Fully controlled input - value comes from parent's filters.search
  // Parent (useMyLeads) updates filters.search immediately on each keystroke
  // Debouncing only affects when the API query is triggered, not the input display
  const searchValue = filters.search ?? "";

  // Handle search input change - notify parent
  const handleSearchChange = useCallback(
    (value: string) => {
      onFiltersChange({ search: value || undefined });
    },
    [onFiltersChange]
  );

  // Handle status toggle
  const handleStatusToggle = useCallback(
    (status: string, checked: boolean) => {
      const currentStatuses = filters.statuses ?? [];
      const newStatuses = checked
        ? [...currentStatuses, status]
        : currentStatuses.filter((s) => s !== status);
      onFiltersChange({ statuses: newStatuses.length > 0 ? newStatuses : undefined });
    },
    [filters.statuses, onFiltersChange]
  );

  // Handle segment change
  const handleSegmentChange = useCallback(
    (value: string) => {
      onFiltersChange({ segmentId: value === "all" ? null : value });
    },
    [onFiltersChange]
  );

  // Count active filters
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.statuses && filters.statuses.length > 0) count++;
    if (filters.segmentId) count++;
    if (filters.search) count++;
    return count;
  }, [filters]);

  return (
    <div
      className="flex flex-wrap items-center gap-3"
      data-testid="my-leads-filter-bar"
    >
      {/* Story 4.6: AC #2 - Quick filter "Interessados" */}
      <Button
        variant={isInterestedFilterActive ? "default" : "outline"}
        size="sm"
        onClick={handleInterestedToggle}
        className="gap-1.5"
        data-testid="interested-filter-button"
      >
        <Sparkles className="h-4 w-4" />
        Interessados
        {interestedCount > 0 && (
          <Badge
            variant={isInterestedFilterActive ? "outline" : "secondary"}
            className="ml-1 h-5 min-w-[20px] px-1.5"
          >
            {interestedCount}
          </Badge>
        )}
      </Button>

      {/* Search Input */}
      <div className="relative flex-1 min-w-[200px] max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Buscar por nome ou empresa..."
          value={searchValue}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="pl-9 pr-9"
          data-testid="my-leads-search-input"
        />
        {searchValue && (
          <button
            type="button"
            onClick={() => handleSearchChange("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label="Limpar busca"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Status Filter (Multi-select) */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="gap-2" data-testid="status-filter-trigger">
            <Filter className="h-4 w-4" />
            Status
            {filters.statuses && filters.statuses.length > 0 && (
              <Badge variant="secondary" className="ml-1">
                {filters.statuses.length}
              </Badge>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48">
          <DropdownMenuLabel>Filtrar por status</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {LEAD_STATUSES.map((status) => (
            <DropdownMenuCheckboxItem
              key={status.value}
              checked={filters.statuses?.includes(status.value) ?? false}
              onCheckedChange={(checked) =>
                handleStatusToggle(status.value, checked)
              }
              data-testid={`status-option-${status.value}`}
            >
              {status.label}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Segment Filter */}
      <Select
        value={filters.segmentId ?? "all"}
        onValueChange={handleSegmentChange}
        disabled={segmentsLoading}
      >
        <SelectTrigger
          className="w-[180px]"
          data-testid="segment-filter-trigger"
        >
          <SelectValue placeholder="Todos os segmentos" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos os segmentos</SelectItem>
          {segments?.map((segment) => (
            <SelectItem key={segment.id} value={segment.id}>
              {segment.name} ({segment.leadCount})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Clear Filters */}
      {activeFilterCount > 0 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onClearFilters}
          className="gap-1 text-muted-foreground"
          data-testid="clear-filters-button"
        >
          <X className="h-4 w-4" />
          Limpar filtros
        </Button>
      )}
    </div>
  );
}
