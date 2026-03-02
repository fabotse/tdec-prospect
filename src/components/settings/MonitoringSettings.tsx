/**
 * MonitoringSettings Component
 * Story 13.8: Configuracoes de Monitoramento
 *
 * AC: #1 - Nova aba Monitoramento
 * AC: #2 - Dropdown frequencia (Semanal/Quinzenal)
 * AC: #3 - Visualizacao X/100 leads monitorados
 * AC: #4 - Proxima execucao agendada
 * AC: #5 - Ultima execucao com status
 * AC: #6 - Estimativa de custo mensal
 */

"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useMonitoringConfig } from "@/hooks/use-monitoring-config";
import { useMonitoredCount } from "@/hooks/use-lead-monitoring";
import {
  monitoringFrequencyLabels,
  type MonitoringFrequency,
} from "@/types/monitoring";
import { SERVICE_COST_RATES } from "@/types/api-usage";

// ==============================================
// HELPERS
// ==============================================

function formatDatePtBr(dateStr: string | null): string {
  if (!dateStr) return "\u2014";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(dateStr));
}

const POSTS_PER_LEAD = 5;
const COST_PER_LEAD = (POSTS_PER_LEAD / 1000) * SERVICE_COST_RATES.apify;
const RUNS_PER_MONTH: Record<MonitoringFrequency, number> = {
  weekly: 4,
  biweekly: 2,
};

function calculateMonthlyCost(
  monitoredLeads: number,
  frequency: MonitoringFrequency
): number {
  return monitoredLeads * COST_PER_LEAD * RUNS_PER_MONTH[frequency];
}

// ==============================================
// SKELETON LOADING
// ==============================================

function SettingsSkeleton() {
  return (
    <div className="space-y-6" data-testid="monitoring-skeleton">
      <Skeleton className="h-[200px] w-full rounded-xl" />
      <Skeleton className="h-[200px] w-full rounded-xl" />
      <Skeleton className="h-[150px] w-full rounded-xl" />
    </div>
  );
}

// ==============================================
// EMPTY STATE
// ==============================================

function EmptyState() {
  return (
    <Card data-testid="monitoring-empty-state">
      <CardContent className="py-8 text-center">
        <p className="text-foreground-muted text-body">
          Nenhum lead esta sendo monitorado.
        </p>
        <p className="text-foreground-muted text-body-small mt-2">
          Acesse &quot;Meus Leads&quot; e ative o monitoramento nos leads
          desejados.
        </p>
      </CardContent>
    </Card>
  );
}

// ==============================================
// MAIN COMPONENT
// ==============================================

export function MonitoringSettings() {
  const { config, isLoading: configLoading, error: configError, updateFrequency } =
    useMonitoringConfig();
  const { data: monitoredData, isLoading: countLoading, error: countError } =
    useMonitoredCount();

  const [selectedFrequency, setSelectedFrequency] =
    useState<MonitoringFrequency | null>(null);

  const isLoading = configLoading || countLoading;
  const currentFrequency = config?.frequency ?? "weekly";
  const displayFrequency = selectedFrequency ?? currentFrequency;
  const hasChanged = selectedFrequency !== null && selectedFrequency !== currentFrequency;

  const monitoredCount = monitoredData?.current ?? 0;
  const maxMonitored = monitoredData?.max ?? 100;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-h2 text-foreground">Monitoramento</h2>
          <p className="text-body-small text-foreground-muted mt-1">
            Configure a frequencia de monitoramento e visualize o status atual.
          </p>
        </div>
        <SettingsSkeleton />
      </div>
    );
  }

  if (configError || countError) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-h2 text-foreground">Monitoramento</h2>
          <p className="text-body-small text-foreground-muted mt-1">
            Configure a frequencia de monitoramento e visualize o status atual.
          </p>
        </div>
        <Card data-testid="monitoring-error-state">
          <CardContent className="py-8 text-center">
            <p className="text-destructive text-body">
              Erro ao carregar configuracoes de monitoramento.
            </p>
            <p className="text-foreground-muted text-body-small mt-2">
              Tente recarregar a pagina.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (monitoredCount === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-h2 text-foreground">Monitoramento</h2>
          <p className="text-body-small text-foreground-muted mt-1">
            Configure a frequencia de monitoramento e visualize o status atual.
          </p>
        </div>
        <EmptyState />
      </div>
    );
  }

  const estimatedCost = calculateMonthlyCost(monitoredCount, displayFrequency);

  const handleSave = () => {
    if (selectedFrequency) {
      updateFrequency.mutate(selectedFrequency, {
        onSuccess: () => setSelectedFrequency(null),
      });
    }
  };

  const runStatusLabel = config?.runStatus === "running" ? "Em execucao" : "Ocioso";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-h2 text-foreground">Monitoramento</h2>
        <p className="text-body-small text-foreground-muted mt-1">
          Configure a frequencia de monitoramento e visualize o status atual.
        </p>
      </div>

      {/* Card 1: Configuracao */}
      <Card data-testid="config-card">
        <CardHeader>
          <CardTitle>Configuracao</CardTitle>
          <CardDescription>
            Defina a frequencia de verificacao de novos posts no LinkedIn.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label
                htmlFor="frequency-select"
                className="text-body-small font-medium text-foreground"
              >
                Frequencia de verificacao
              </label>
              <Select
                value={displayFrequency}
                onValueChange={(value) =>
                  setSelectedFrequency(value as MonitoringFrequency)
                }
              >
                <SelectTrigger
                  id="frequency-select"
                  className="w-[200px]"
                  data-testid="frequency-select"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly">
                    {monitoringFrequencyLabels.weekly}
                  </SelectItem>
                  <SelectItem value="biweekly">
                    {monitoringFrequencyLabels.biweekly}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={handleSave}
              disabled={!hasChanged || updateFrequency.isPending}
              className="w-fit"
              data-testid="save-frequency-btn"
            >
              {updateFrequency.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Card 2: Status do Monitoramento */}
      <Card data-testid="status-card">
        <CardHeader>
          <CardTitle>Status do Monitoramento</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-body-small text-foreground-muted">
                Leads monitorados
              </p>
              <p
                className="text-body font-medium text-foreground"
                data-testid="monitored-count"
              >
                {monitoredCount}/{maxMonitored}
              </p>
            </div>
            <div>
              <p className="text-body-small text-foreground-muted">Status</p>
              <p
                className="text-body font-medium text-foreground"
                data-testid="run-status"
              >
                {runStatusLabel}
              </p>
            </div>
            <div>
              <p className="text-body-small text-foreground-muted">
                Ultima execucao
              </p>
              <p
                className="text-body font-medium text-foreground"
                data-testid="last-run"
              >
                {config?.lastRunAt
                  ? formatDatePtBr(config.lastRunAt)
                  : "Nenhuma execucao realizada"}
              </p>
            </div>
            <div>
              <p className="text-body-small text-foreground-muted">
                Proxima execucao
              </p>
              <p
                className="text-body font-medium text-foreground"
                data-testid="next-run"
              >
                {config?.nextRunAt
                  ? formatDatePtBr(config.nextRunAt)
                  : "Nao agendado"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Card 3: Estimativa de Custo */}
      <Card data-testid="cost-card">
        <CardHeader>
          <CardTitle>Estimativa de Custo</CardTitle>
          <CardDescription>
            Estimativa baseada no preco publico do Apify (~$1 por 1.000 posts)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-2">
            <p className="text-h2 text-foreground" data-testid="estimated-cost">
              ${estimatedCost.toFixed(2)}/mes
            </p>
            <p className="text-body-small text-foreground-muted">
              {monitoredCount} leads × $
              {COST_PER_LEAD.toFixed(3)}/lead ×{" "}
              {RUNS_PER_MONTH[displayFrequency]} execucoes/mes
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
