"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

interface InsightsFilterBarProps {
  statusFilter: string;
  periodFilter: string;
  onFilterChange: (status: string, period: string) => void;
}

const STATUS_OPTIONS = [
  { value: "all-status", label: "Todos os Status" },
  { value: "new", label: "Novos" },
  { value: "used", label: "Usados" },
  { value: "dismissed", label: "Descartados" },
];

const PERIOD_OPTIONS = [
  { value: "all", label: "Todo o periodo" },
  { value: "7d", label: "Ultimos 7 dias" },
  { value: "30d", label: "Ultimos 30 dias" },
  { value: "90d", label: "Ultimos 90 dias" },
];

export function InsightsFilterBar({
  statusFilter,
  periodFilter,
  onFilterChange,
}: InsightsFilterBarProps) {
  const hasActiveFilters = statusFilter !== "" || periodFilter !== "all";

  return (
    <div className="flex items-center gap-3">
      <Select
        value={statusFilter || "all-status"}
        onValueChange={(v) => onFilterChange(v === "all-status" ? "" : v, periodFilter)}
      >
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          {STATUS_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={periodFilter}
        onValueChange={(v) => onFilterChange(statusFilter, v)}
      >
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="Periodo" />
        </SelectTrigger>
        <SelectContent>
          {PERIOD_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {hasActiveFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onFilterChange("", "all")}
          className="h-8 px-2"
        >
          <X className="h-4 w-4 mr-1" />
          Limpar
        </Button>
      )}
    </div>
  );
}
