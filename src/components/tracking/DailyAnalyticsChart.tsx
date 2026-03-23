/**
 * DailyAnalyticsChart Component
 * Story 14.3: Grafico de Evolucao Diaria
 *
 * AC: #1 — Componente com grafico de linhas/area
 * AC: #2 — Series: Enviados, Aberturas, Respostas
 * AC: #3 — Eixo X: datas, Eixo Y: contagens
 * AC: #4 — Tooltip com valores de cada serie no dia
 * AC: #5 — Dados vindos de dailyAnalytics
 * AC: #6 — Estado vazio quando sem dados
 * AC: #7 — Secao colapsavel
 */

"use client";

import { useState, useId } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import { ChevronDown, ChevronUp, TrendingUp } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import type { DailyAnalyticsEntry } from "@/types/tracking";

// Cores distintas para cada serie — excecao ao grayscale theme para legibilidade do chart
const CHART_COLORS = {
  sent: "hsl(210 80% 60%)",       // Azul — envios
  opened: "hsl(45 90% 55%)",      // Amarelo/Amber — aberturas
  replies: "hsl(150 60% 50%)",    // Verde — respostas
} as const;

interface DailyAnalyticsChartProps {
  dailyAnalytics?: DailyAnalyticsEntry[];
}

export function formatDateBR(dateStr: string): string {
  const parts = dateStr.split("-");
  if (parts.length !== 3) return dateStr;
  const [, month, day] = parts;
  return `${day}/${month}`;
}

export interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}

export function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload || !label) return null;

  return (
    <div className="rounded-md border bg-popover p-3 shadow-md" data-testid="chart-tooltip">
      <p className="mb-1 font-medium">{formatDateBR(label)}</p>
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center gap-2 text-sm">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
            style={{ backgroundColor: entry.color }}
          />
          <span>{entry.name}: <strong>{entry.value}</strong></span>
        </div>
      ))}
    </div>
  );
}

export function DailyAnalyticsChart({ dailyAnalytics }: DailyAnalyticsChartProps) {
  const [isOpen, setIsOpen] = useState(true);
  const gradientId = useId().replace(/:/g, "");
  const hasData = dailyAnalytics && dailyAnalytics.length > 0;

  const handleToggle = () => setIsOpen((prev) => !prev);
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleToggle();
    }
  };

  return (
    <Card data-testid="daily-analytics-chart">
      <CardHeader
        className="cursor-pointer select-none"
        onClick={handleToggle}
        onKeyDown={handleKeyDown}
        role="button"
        tabIndex={0}
        data-testid="daily-chart-toggle"
      >
        <div className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-muted-foreground" />
          <CardTitle>Evolucao Diaria</CardTitle>
          <span className="ml-auto">
            {isOpen ? (
              <ChevronUp className="h-5 w-5 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-5 w-5 text-muted-foreground" />
            )}
          </span>
        </div>
        <CardDescription>Tendencia de envios, aberturas e respostas ao longo do tempo</CardDescription>
      </CardHeader>
      {isOpen && (
        <CardContent data-testid="daily-chart-content">
          {hasData ? (
            <div data-testid="daily-chart-container" style={{ width: "100%", height: 300 }}>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={dailyAnalytics} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                  <defs>
                    <linearGradient id={`${gradientId}-sent`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={CHART_COLORS.sent} stopOpacity={0.6} />
                      <stop offset="95%" stopColor={CHART_COLORS.sent} stopOpacity={0.1} />
                    </linearGradient>
                    <linearGradient id={`${gradientId}-opened`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={CHART_COLORS.opened} stopOpacity={0.6} />
                      <stop offset="95%" stopColor={CHART_COLORS.opened} stopOpacity={0.1} />
                    </linearGradient>
                    <linearGradient id={`${gradientId}-replies`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={CHART_COLORS.replies} stopOpacity={0.6} />
                      <stop offset="95%" stopColor={CHART_COLORS.replies} stopOpacity={0.1} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={formatDateBR}
                    className="text-xs"
                  />
                  <YAxis className="text-xs" />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend iconType="circle" iconSize={10} />
                  <Area
                    type="monotone"
                    dataKey="sent"
                    stroke={CHART_COLORS.sent}
                    fill={`url(#${gradientId}-sent)`}
                    name="Enviados"
                    strokeWidth={2}
                    dot={{ r: 2, fill: CHART_COLORS.sent }}
                    activeDot={{ r: 5 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="unique_opened"
                    stroke={CHART_COLORS.opened}
                    fill={`url(#${gradientId}-opened)`}
                    name="Aberturas"
                    strokeWidth={2}
                    dot={{ r: 2, fill: CHART_COLORS.opened }}
                    activeDot={{ r: 5 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="unique_replies"
                    stroke={CHART_COLORS.replies}
                    fill={`url(#${gradientId}-replies)`}
                    name="Respostas"
                    strokeWidth={2}
                    dot={{ r: 2, fill: CHART_COLORS.replies }}
                    activeDot={{ r: 5 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div
              data-testid="daily-chart-empty"
              className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground"
            >
              <TrendingUp className="h-8 w-8" />
              <p>Sincronize a campanha para ver a evolucao diaria</p>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
