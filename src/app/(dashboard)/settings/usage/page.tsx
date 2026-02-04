/**
 * Usage Settings Page
 * Story 6.5.8: Apify Cost Tracking
 *
 * AC #3: Admin Settings Page - Usage Section
 *
 * Displays API usage statistics for external services.
 */

"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { UsageCard } from "@/components/settings/UsageCard";
import {
  useUsageStatistics,
  getCurrentMonthRange,
  getLastMonthRange,
  getServiceStatistics,
} from "@/hooks/use-usage-statistics";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type DateRange = "this-month" | "last-month" | "custom";

/**
 * Get date range based on selection (for preset ranges)
 */
function getPresetDateRange(range: "this-month" | "last-month"): { startDate: Date; endDate: Date } {
  if (range === "last-month") {
    return getLastMonthRange();
  }
  return getCurrentMonthRange();
}

/**
 * Format date for input value
 */
function formatDateForInput(date: Date): string {
  return date.toISOString().split("T")[0];
}

/**
 * Usage Settings Page Component
 *
 * AC #3: Displays usage statistics for Apify with:
 * - Date range filter (this month, last month, custom)
 * - Card showing total calls, estimated cost, average posts per lead
 */
export default function UsagePage() {
  const [dateRange, setDateRange] = useState<DateRange>("this-month");

  // Custom date state
  const defaultRange = getCurrentMonthRange();
  const [customStartDate, setCustomStartDate] = useState<string>(
    formatDateForInput(defaultRange.startDate)
  );
  const [customEndDate, setCustomEndDate] = useState<string>(
    formatDateForInput(defaultRange.endDate)
  );

  // Calculate effective date range
  const getEffectiveDateRange = (): { startDate: Date; endDate: Date } => {
    if (dateRange === "custom") {
      return {
        startDate: new Date(customStartDate),
        endDate: new Date(customEndDate),
      };
    }
    return getPresetDateRange(dateRange);
  };

  const { startDate, endDate } = getEffectiveDateRange();

  const { data, isLoading, error, refetch } = useUsageStatistics({
    startDate,
    endDate,
  });

  const apifyStats = getServiceStatistics(data, "apify");

  const handleDateRangeChange = (value: string) => {
    setDateRange(value as DateRange);
    if (value !== "custom") {
      // Reset custom dates when switching to preset
      const range = getPresetDateRange(value as "this-month" | "last-month");
      setCustomStartDate(formatDateForInput(range.startDate));
      setCustomEndDate(formatDateForInput(range.endDate));
    }
  };

  return (
    <div className="space-y-6">
      {/* Header with date range selector */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-h2 text-foreground">Uso da API</h2>
          <p className="text-body-small text-foreground-muted mt-1">
            Monitore o uso e custos estimados das integrações externas.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={dateRange} onValueChange={handleDateRangeChange}>
            <SelectTrigger className="w-[180px]" data-testid="date-range-select">
              <SelectValue placeholder="Selecionar período" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="this-month">Este mês</SelectItem>
              <SelectItem value="last-month">Mês passado</SelectItem>
              <SelectItem value="custom">Personalizado</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Custom date range inputs */}
      {dateRange === "custom" && (
        <div className="flex flex-wrap items-center gap-3 rounded-md bg-background-secondary p-4">
          <div className="flex items-center gap-2">
            <label htmlFor="start-date" className="text-body-small text-foreground-muted">
              De:
            </label>
            <Input
              id="start-date"
              type="date"
              value={customStartDate}
              onChange={(e) => setCustomStartDate(e.target.value)}
              className="w-auto"
              data-testid="custom-start-date"
            />
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="end-date" className="text-body-small text-foreground-muted">
              Até:
            </label>
            <Input
              id="end-date"
              type="date"
              value={customEndDate}
              onChange={(e) => setCustomEndDate(e.target.value)}
              className="w-auto"
              data-testid="custom-end-date"
            />
          </div>
        </div>
      )}

      {/* Error state with retry button */}
      {error && (
        <div className="flex items-center justify-between rounded-md bg-destructive/10 p-4">
          <p className="text-destructive text-body-small">
            Erro ao carregar dados de uso: {error.message}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            className="ml-4 shrink-0"
            data-testid="retry-button"
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Tentar novamente
          </Button>
        </div>
      )}

      {/* Usage cards */}
      <div className="grid gap-6 md:grid-cols-2">
        <UsageCard
          serviceName="apify"
          serviceLabel="Apify - Icebreakers Premium"
          statistics={apifyStats}
          isLoading={isLoading}
        />

        {/* Placeholder cards for future services */}
        <UsageCard
          serviceName="apollo"
          serviceLabel="Apollo - Busca de Leads"
          statistics={getServiceStatistics(data, "apollo")}
          isLoading={isLoading}
        />
      </div>

      {/* Info section */}
      <div className="rounded-md bg-background-secondary p-4 text-body-small text-foreground-muted">
        <p>
          <strong>Sobre os custos:</strong> Os valores exibidos são estimativas
          baseadas nos preços públicos dos serviços. O custo real pode variar
          conforme seu plano e uso.
        </p>
        <p className="mt-2">
          <strong>Apify:</strong> ~$1 por 1.000 posts do LinkedIn buscados.
        </p>
      </div>
    </div>
  );
}
