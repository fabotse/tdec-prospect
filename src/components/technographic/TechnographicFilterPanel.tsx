/**
 * Technographic Filter Panel
 * Story: 15.2 - Busca Technografica: Autocomplete e Filtros
 *
 * AC: #2 - Complementary filters: country, company size (min/max), industry
 */

"use client";

import { useState } from "react";
import { Filter, ChevronDown, ChevronUp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ==============================================
// FILTER DATA
// ==============================================

const COMMON_COUNTRIES = [
  { code: "BR", label: "Brasil" },
  { code: "US", label: "Estados Unidos" },
  { code: "GB", label: "Reino Unido" },
  { code: "DE", label: "Alemanha" },
  { code: "FR", label: "França" },
  { code: "CA", label: "Canadá" },
  { code: "AU", label: "Austrália" },
  { code: "IN", label: "Índia" },
  { code: "PT", label: "Portugal" },
  { code: "ES", label: "Espanha" },
  { code: "MX", label: "México" },
  { code: "AR", label: "Argentina" },
  { code: "CL", label: "Chile" },
  { code: "CO", label: "Colômbia" },
  { code: "JP", label: "Japão" },
  { code: "IL", label: "Israel" },
  { code: "NL", label: "Holanda" },
  { code: "SE", label: "Suécia" },
  { code: "SG", label: "Singapura" },
  { code: "AE", label: "Emirados Árabes" },
];

// TODO: IDs hardcoded — validar com theirStack API docs antes de produção
const COMMON_INDUSTRIES = [
  { id: 1, label: "Software & Tecnologia" },
  { id: 2, label: "Serviços Financeiros" },
  { id: 3, label: "Saúde" },
  { id: 4, label: "Educação" },
  { id: 5, label: "E-commerce & Varejo" },
  { id: 6, label: "Manufatura" },
  { id: 7, label: "Consultoria" },
  { id: 8, label: "Marketing & Publicidade" },
  { id: 9, label: "Telecomunicações" },
  { id: 10, label: "Energia" },
];

// ==============================================
// TYPES
// ==============================================

export interface TechnographicFilters {
  countryCodes: string[];
  minEmployeeCount: number | undefined;
  maxEmployeeCount: number | undefined;
  industryIds: number[];
}

interface TechnographicFilterPanelProps {
  filters: TechnographicFilters;
  onFiltersChange: (filters: TechnographicFilters) => void;
}

// ==============================================
// COMPONENT
// ==============================================

export function TechnographicFilterPanel({
  filters,
  onFiltersChange,
}: TechnographicFilterPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const activeFilterCount =
    filters.countryCodes.length +
    (filters.minEmployeeCount !== undefined ? 1 : 0) +
    (filters.maxEmployeeCount !== undefined ? 1 : 0) +
    filters.industryIds.length;

  const handleCountryToggle = (code: string) => {
    const updated = filters.countryCodes.includes(code)
      ? filters.countryCodes.filter((c) => c !== code)
      : [...filters.countryCodes, code];
    onFiltersChange({ ...filters, countryCodes: updated });
  };

  const handleIndustryToggle = (id: number) => {
    const updated = filters.industryIds.includes(id)
      ? filters.industryIds.filter((i) => i !== id)
      : [...filters.industryIds, id];
    onFiltersChange({ ...filters, industryIds: updated });
  };

  const handleClearFilters = () => {
    onFiltersChange({
      countryCodes: [],
      minEmployeeCount: undefined,
      maxEmployeeCount: undefined,
      industryIds: [],
    });
  };

  return (
    <div className="rounded-lg border bg-card" data-testid="filter-panel">
      {/* Header */}
      <button
        type="button"
        className="flex w-full items-center justify-between p-3 text-sm font-medium"
        onClick={() => setIsExpanded(!isExpanded)}
        data-testid="filter-panel-toggle"
      >
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4" />
          <span>Filtros</span>
          {activeFilterCount > 0 && (
            <Badge variant="secondary" className="text-xs">
              {activeFilterCount}
            </Badge>
          )}
        </div>
        {isExpanded ? (
          <ChevronUp className="h-4 w-4" />
        ) : (
          <ChevronDown className="h-4 w-4" />
        )}
      </button>

      {/* Filter content */}
      {isExpanded && (
        <div className="border-t p-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            {/* Country filter */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">País</label>
              <Select
                key={`country-${filters.countryCodes.join(",")}`}
                onValueChange={(value) => handleCountryToggle(value)}
              >
                <SelectTrigger data-testid="country-select">
                  <SelectValue placeholder="Selecionar país" />
                </SelectTrigger>
                <SelectContent>
                  {COMMON_COUNTRIES.map((country) => (
                    <SelectItem key={country.code} value={country.code}>
                      {country.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {filters.countryCodes.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {filters.countryCodes.map((code) => {
                    const country = COMMON_COUNTRIES.find(
                      (c) => c.code === code
                    );
                    return (
                      <Badge
                        key={code}
                        variant="outline"
                        className="gap-1 pr-1 text-xs"
                      >
                        {country?.label ?? code}
                        <button
                          type="button"
                          onClick={() => handleCountryToggle(code)}
                          className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20"
                          aria-label={`Remover ${country?.label ?? code}`}
                        >
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </Badge>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Min employees */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Funcionários (min)</label>
              <Input
                type="number"
                placeholder="Ex: 50"
                min={1}
                value={filters.minEmployeeCount ?? ""}
                onChange={(e) =>
                  onFiltersChange({
                    ...filters,
                    minEmployeeCount: e.target.value
                      ? parseInt(e.target.value, 10)
                      : undefined,
                  })
                }
                data-testid="min-employees-input"
              />
            </div>

            {/* Max employees */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Funcionários (max)</label>
              <Input
                type="number"
                placeholder="Ex: 5000"
                min={1}
                value={filters.maxEmployeeCount ?? ""}
                onChange={(e) =>
                  onFiltersChange({
                    ...filters,
                    maxEmployeeCount: e.target.value
                      ? parseInt(e.target.value, 10)
                      : undefined,
                  })
                }
                data-testid="max-employees-input"
              />
            </div>

            {/* Industry filter */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Indústria</label>
              <Select
                key={`industry-${filters.industryIds.join(",")}`}
                onValueChange={(value) =>
                  handleIndustryToggle(parseInt(value, 10))
                }
              >
                <SelectTrigger data-testid="industry-select">
                  <SelectValue placeholder="Selecionar indústria" />
                </SelectTrigger>
                <SelectContent>
                  {COMMON_INDUSTRIES.map((industry) => (
                    <SelectItem
                      key={industry.id}
                      value={String(industry.id)}
                    >
                      {industry.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {filters.industryIds.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {filters.industryIds.map((id) => {
                    const industry = COMMON_INDUSTRIES.find(
                      (i) => i.id === id
                    );
                    return (
                      <Badge
                        key={id}
                        variant="outline"
                        className="gap-1 pr-1 text-xs"
                      >
                        {industry?.label ?? id}
                        <button
                          type="button"
                          onClick={() => handleIndustryToggle(id)}
                          className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20"
                          aria-label={`Remover ${industry?.label ?? id}`}
                        >
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </Badge>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Clear filters */}
          {activeFilterCount > 0 && (
            <div className="mt-3 flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearFilters}
                data-testid="clear-filters-button"
              >
                Limpar filtros
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
