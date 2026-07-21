/**
 * AgentExecutionPlan
 * Story 16.5: Plano de Execucao & Estimativa de Custo
 *
 * AC: #1 - Exibe etapas em ordem com indicador de puladas
 * AC: #2 - Exibe custo estimado por etapa e total
 * AC: #4 - Botao Iniciar confirma execucao
 * AC: #5 - Botao Cancelar sem criar steps
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import { Building2, Users, Mail, Upload, Play, Loader2, AlertCircle, RotateCcw, Linkedin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { PlannedStep, CostEstimate } from "@/types/agent";

// Story 22.2: custo Apify estimado por lead (espelha DEFAULT_COSTS.apify no cost estimator).
// Valor autoritativo e recomputado no confirm; aqui e apenas a estimativa exibida ao usuario.
const APIFY_COST_PER_LEAD = 0.15;
// Story 22.2: volume estimado de leads (espelha ESTIMATED_COMPANIES × ESTIMATED_LEADS_PER_COMPANY do cost estimator).
const ESTIMATED_LEADS = 60;

interface AgentExecutionPlanProps {
  executionId: string;
  onConfirm: (premiumIcebreakers: boolean) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}

interface PlanData {
  steps: PlannedStep[];
  costEstimate: CostEstimate;
  totalActiveSteps: number;
}

const STEP_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  search_companies: Building2,
  search_leads: Users,
  create_campaign: Mail,
  export: Upload,
  activate: Play,
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

export function AgentExecutionPlan({
  executionId,
  onConfirm,
  onCancel,
  isSubmitting,
}: AgentExecutionPlanProps) {
  const [plan, setPlan] = useState<PlanData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Story 22.2: toggle de icebreaker premium (LinkedIn), default DESLIGADO.
  const [premiumIcebreakers, setPremiumIcebreakers] = useState(false);

  const fetchPlan = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/agent/executions/${executionId}/plan`
      );
      if (!response.ok) {
        throw new Error("Erro ao gerar plano");
      }
      const result = await response.json();
      setPlan(result.data);
    } catch {
      setError("Erro ao gerar plano de execucao. Tente novamente.");
    } finally {
      setIsLoading(false);
    }
  }, [executionId]);

  useEffect(() => {
    // Fetch-on-mount intencional: o plano e carregado do servidor ao abrir o componente.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchPlan();
  }, [fetchPlan]);

  // Loading state
  if (isLoading) {
    return (
      <div
        className="border-t border-border px-6 py-4 flex items-center justify-center gap-2"
        data-testid="agent-execution-plan"
      >
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        <span className="text-body-small text-muted-foreground">
          Gerando plano de execucao...
        </span>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div
        className="border-t border-border px-6 py-4 flex flex-col items-center gap-3"
        data-testid="agent-execution-plan"
      >
        <div className="flex items-center gap-2 text-destructive">
          <AlertCircle className="h-4 w-4" />
          <span className="text-body-small">{error}</span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchPlan}
          data-testid="plan-retry-btn"
        >
          <RotateCcw className="h-3 w-3 mr-1" />
          Tentar novamente
        </Button>
      </div>
    );
  }

  if (!plan) return null;

  // Story 22.2: total exibido inclui a estimativa Apify quando o toggle esta ligado.
  // Este numero e uma ESTIMATIVA client-side; o valor autoritativo e recomputado no confirm (route).
  const estimatedApifyCost = premiumIcebreakers ? ESTIMATED_LEADS * APIFY_COST_PER_LEAD : 0;
  const displayedTotal = plan.costEstimate.total + estimatedApifyCost;

  return (
    <div
      className="border-t border-border px-6 py-4"
      data-testid="agent-execution-plan"
    >
      <p className="text-body-small font-medium text-foreground mb-3">
        Plano de Execucao
      </p>

      {/* Steps list */}
      <div className="flex flex-col gap-2 mb-4">
        {plan.steps.map((step) => {
          const Icon = STEP_ICONS[step.stepType] ?? Play;
          return (
            <div
              key={step.stepNumber}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 border border-border",
                step.skipped && "opacity-50"
              )}
              data-testid={`plan-step-${step.stepNumber}`}
            >
              <span className="text-caption text-muted-foreground w-5 text-center shrink-0">
                {step.stepNumber}
              </span>
              <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <span
                  className={cn(
                    "text-body-small text-foreground",
                    step.skipped && "line-through"
                  )}
                >
                  {step.title}
                </span>
                <p className="text-caption text-muted-foreground truncate">
                  {step.description}
                </p>
              </div>
              <span className="text-caption text-muted-foreground shrink-0">
                {step.skipped
                  ? "Pulado"
                  : step.estimatedCost === 0
                    ? "Gratuito"
                    : formatCurrency(step.estimatedCost)}
              </span>
            </div>
          );
        })}
      </div>

      {/* Story 22.2: Toggle de icebreaker premium (LinkedIn) — default desligado */}
      <div
        className="flex items-start justify-between gap-3 rounded-md border border-border px-3 py-3 mb-4"
        data-testid="plan-premium-toggle"
      >
        <div className="flex flex-col gap-1 min-w-0">
          <div className="flex items-center gap-2">
            <Linkedin className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-body-small font-medium text-foreground">
              Icebreakers premium (LinkedIn)
            </span>
          </div>
          <p className="text-caption text-muted-foreground">
            Consulta posts reais do LinkedIn via Apify para personalizar a abertura de
            cada email — custo extra de aproximadamente R$ 0,15 por lead.
          </p>
        </div>
        <Switch
          checked={premiumIcebreakers}
          onCheckedChange={setPremiumIcebreakers}
          disabled={isSubmitting}
          aria-label="Ativar icebreakers premium com LinkedIn"
          data-testid="plan-premium-switch"
        />
      </div>

      {/* Total cost */}
      <div
        className="flex items-center justify-between border-t border-border pt-3 mb-4"
        data-testid="plan-total-cost"
      >
        <span className="text-body-small font-medium text-foreground">
          Custo estimado
        </span>
        <span className="text-body-small font-medium text-foreground">
          {formatCurrency(displayedTotal)}
        </span>
      </div>

      {/* Action buttons */}
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          onClick={onCancel}
          disabled={isSubmitting}
          data-testid="plan-cancel-btn"
        >
          Cancelar
        </Button>
        <Button
          onClick={() => onConfirm(premiumIcebreakers)}
          disabled={isSubmitting}
          data-testid="plan-confirm-btn"
        >
          {isSubmitting ? "Iniciando..." : "Iniciar Execucao"}
        </Button>
      </div>
    </div>
  );
}
