/**
 * Opportunities Filter Bar
 * Story 21.4: Central de Oportunidades — AC #4
 *
 * Espelha MyLeadsFilterBar (barra inline: busca + multi-select DropdownMenu +
 * Select de campanha + limpar filtros) com filtros de intent/status/período.
 */

"use client";

import { useCallback, useMemo } from "react";
import { Search, X, Filter, Tag } from "lucide-react";
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
import {
  OPPORTUNITY_INTENTS,
  OPPORTUNITY_STATUSES,
  OPPORTUNITY_INTENT_CONFIG,
  OPPORTUNITY_STATUS_CONFIG,
} from "@/types/opportunity";
import { useCampaigns } from "@/hooks/use-campaigns";

export interface OpportunitiesFilterState {
  intents: string[];
  statuses: string[];
  campaignId: string | null;
  period: string; // "all" | "7d" | "30d" | "90d"
  search: string;
}

export const DEFAULT_OPPORTUNITIES_FILTERS: OpportunitiesFilterState = {
  intents: [],
  statuses: [],
  campaignId: null,
  period: "all",
  search: "",
};

const PERIOD_OPTIONS = [
  { value: "all", label: "Todo o período" },
  { value: "7d", label: "Últimos 7 dias" },
  { value: "30d", label: "Últimos 30 dias" },
  { value: "90d", label: "Últimos 90 dias" },
];

interface OpportunitiesFilterBarProps {
  filters: OpportunitiesFilterState;
  onFiltersChange: (filters: Partial<OpportunitiesFilterState>) => void;
  onClearFilters: () => void;
}

export function OpportunitiesFilterBar({
  filters,
  onFiltersChange,
  onClearFilters,
}: OpportunitiesFilterBarProps) {
  const { data: campaigns, isLoading: campaignsLoading } = useCampaigns();

  const handleSearchChange = useCallback(
    (value: string) => {
      onFiltersChange({ search: value });
    },
    [onFiltersChange]
  );

  const handleIntentToggle = useCallback(
    (intent: string, checked: boolean) => {
      const current = filters.intents;
      const next = checked ? [...current, intent] : current.filter((i) => i !== intent);
      onFiltersChange({ intents: next });
    },
    [filters.intents, onFiltersChange]
  );

  const handleStatusToggle = useCallback(
    (status: string, checked: boolean) => {
      const current = filters.statuses;
      const next = checked ? [...current, status] : current.filter((s) => s !== status);
      onFiltersChange({ statuses: next });
    },
    [filters.statuses, onFiltersChange]
  );

  const handleCampaignChange = useCallback(
    (value: string) => {
      onFiltersChange({ campaignId: value === "all" ? null : value });
    },
    [onFiltersChange]
  );

  const handlePeriodChange = useCallback(
    (value: string) => {
      onFiltersChange({ period: value });
    },
    [onFiltersChange]
  );

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.intents.length > 0) count++;
    if (filters.statuses.length > 0) count++;
    if (filters.campaignId) count++;
    if (filters.period !== "all") count++;
    if (filters.search) count++;
    return count;
  }, [filters]);

  return (
    <div
      className="flex flex-wrap items-center gap-3"
      data-testid="opportunities-filter-bar"
    >
      {/* Busca (client-side sobre a página carregada — decisão Task 7.2) */}
      <div className="relative flex-1 min-w-[200px] max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Buscar por nome, e-mail ou empresa..."
          value={filters.search}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="pl-9 pr-9"
          data-testid="opportunities-search-input"
        />
        {filters.search && (
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

      {/* Intent (multi-select) */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="gap-2" data-testid="intent-filter-trigger">
            <Tag className="h-4 w-4" />
            Intenção
            {filters.intents.length > 0 && (
              <Badge variant="secondary" className="ml-1">
                {filters.intents.length}
              </Badge>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-52">
          <DropdownMenuLabel>Filtrar por intenção</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {OPPORTUNITY_INTENTS.map((intent) => (
            <DropdownMenuCheckboxItem
              key={intent}
              checked={filters.intents.includes(intent)}
              onCheckedChange={(checked) => handleIntentToggle(intent, checked)}
              data-testid={`intent-option-${intent}`}
            >
              {OPPORTUNITY_INTENT_CONFIG[intent].label}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Status do card (multi-select) */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="gap-2" data-testid="status-filter-trigger">
            <Filter className="h-4 w-4" />
            Status
            {filters.statuses.length > 0 && (
              <Badge variant="secondary" className="ml-1">
                {filters.statuses.length}
              </Badge>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48">
          <DropdownMenuLabel>Filtrar por status</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {OPPORTUNITY_STATUSES.map((status) => (
            <DropdownMenuCheckboxItem
              key={status}
              checked={filters.statuses.includes(status)}
              onCheckedChange={(checked) => handleStatusToggle(status, checked)}
              data-testid={`status-option-${status}`}
            >
              {OPPORTUNITY_STATUS_CONFIG[status].label}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Campanha */}
      <Select
        value={filters.campaignId ?? "all"}
        onValueChange={handleCampaignChange}
        disabled={campaignsLoading}
      >
        <SelectTrigger className="w-[200px]" data-testid="campaign-filter-trigger">
          <SelectValue placeholder="Todas as campanhas" />
        </SelectTrigger>
        <SelectContent position="popper" side="bottom" className="max-h-60">
          <SelectItem value="all">Todas as campanhas</SelectItem>
          {campaigns?.map((campaign) => (
            <SelectItem key={campaign.id} value={campaign.id}>
              {campaign.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Período */}
      <Select value={filters.period} onValueChange={handlePeriodChange}>
        <SelectTrigger className="w-[170px]" data-testid="period-filter-trigger">
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper" side="bottom">
          {PERIOD_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Limpar filtros */}
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
