"use client";

import { useState, useCallback } from "react";
import { useLeadInsights, useUpdateInsightStatus } from "@/hooks/use-lead-insights";
import type { InsightFilters } from "@/hooks/use-lead-insights";
import { InsightsTable } from "@/components/insights/InsightsTable";
import { InsightsFilterBar } from "@/components/insights/InsightsFilterBar";
import { InsightsEmptyState } from "@/components/insights/InsightsEmptyState";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const PER_PAGE_OPTIONS = [10, 25, 50, 100];

export function InsightsPageContent() {
  // Filter state
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [periodFilter, setPeriodFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);

  const filters: InsightFilters = {
    ...(statusFilter ? { status: statusFilter } : {}),
    period: periodFilter,
    page,
    perPage,
  };

  // Data fetching
  const { insights, meta, isLoading, error } = useLeadInsights(filters);
  const updateStatus = useUpdateInsightStatus();

  // Callbacks
  const handleFilterChange = useCallback((newStatus: string, newPeriod: string) => {
    setStatusFilter(newStatus);
    setPeriodFilter(newPeriod);
    setPage(1); // Reset to first page
  }, []);

  const handlePerPageChange = useCallback((value: string) => {
    setPerPage(parseInt(value));
    setPage(1);
  }, []);

  // Pagination info
  const totalEntries = meta?.total ?? 0;
  const totalPages = meta?.totalPages ?? 1;
  const startItem = totalEntries > 0 ? (page - 1) * perPage + 1 : 0;
  const endItem = Math.min(page * perPage, totalEntries);

  // Loading skeleton
  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-16 bg-muted animate-pulse rounded" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Error state
  if (error) {
    return (
      <Card className="border-destructive">
        <CardContent className="pt-6">
          <p className="text-destructive">Erro: {error}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Filters */}
      <InsightsFilterBar
        statusFilter={statusFilter}
        periodFilter={periodFilter}
        onFilterChange={handleFilterChange}
      />

      {/* Empty state */}
      {insights.length === 0 && !isLoading && (
        <InsightsEmptyState hasFilters={!!statusFilter || periodFilter !== "all"} />
      )}

      {/* Data Table */}
      {insights.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
            <CardTitle className="text-base font-medium">
              {totalEntries} {totalEntries === 1 ? "insight" : "insights"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <InsightsTable
              insights={insights}
              onUpdateStatus={(insightId, status) =>
                updateStatus.mutate({ insightId, status })
              }
              isPending={updateStatus.isPending}
            />
          </CardContent>
        </Card>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {startItem}-{endItem} de {totalEntries}
            </span>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Por pagina:</span>
              <Select value={String(perPage)} onValueChange={handlePerPageChange}>
                <SelectTrigger className="w-[70px] h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PER_PAGE_OPTIONS.map((opt) => (
                    <SelectItem key={opt} value={String(opt)}>
                      {opt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              aria-label="Pagina anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm text-muted-foreground px-2">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              aria-label="Proxima pagina"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
