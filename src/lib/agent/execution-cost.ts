/**
 * recordExecutionCost — Story 24.10
 *
 * Grava o custo REAL da execucao em `agent_executions.cost_actual` e manda para o chat a
 * mensagem "Custo — estimado R$ X · real R$ Y". Chamado na conclusao (orquestrador,
 * ramo defer e approve do ultimo step) e na pausa (depois da bolha de erro).
 *
 * Fail-open TOTAL: nunca lanca e nunca muda o status da execucao. O custo e recalculado
 * do zero a cada chamada, a partir dos steps concluidos — retry nunca duplica.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { CostEstimatorService } from "@/lib/services/agent-cost-estimator";
import {
  computeActualCost,
  formatCostLine,
  resolveUnitPrices,
  type CostPhase,
  type StepCostRow,
} from "@/lib/agent/agent-pricing";
import type { CostActual, CostEstimate } from "@/types/agent";

export interface RecordExecutionCostOptions {
  phase: CostPhase;
  /** Step a que a mensagem fica associada no chat (opcional). */
  stepNumber?: number;
}

export async function recordExecutionCost(
  supabase: SupabaseClient,
  executionId: string,
  options: RecordExecutionCostOptions
): Promise<CostActual | null> {
  try {
    const { data: steps, error: stepsError } = await supabase
      .from("agent_steps")
      .select("step_number, step_type, status, cost")
      .eq("execution_id", executionId);
    if (stepsError || !Array.isArray(steps)) {
      console.error(
        `[recordExecutionCost] Falha ao ler os steps (execution=${executionId}):`,
        stepsError?.message ?? "sem dados"
      );
      return null;
    }

    const { data: execution, error: executionError } = await supabase
      .from("agent_executions")
      .select("cost_estimate")
      .eq("id", executionId)
      .single();
    if (executionError) {
      // Sem a estimativa ainda da para mostrar o real.
      console.error(
        `[recordExecutionCost] Falha ao ler a estimativa (execution=${executionId}):`,
        executionError.message
      );
    }

    const costModels = await CostEstimatorService.getCostModels(supabase);
    const prices = resolveUnitPrices(costModels);
    const costActual = computeActualCost(steps as StepCostRow[], prices);

    const { error: updateError } = await supabase
      .from("agent_executions")
      .update({ cost_actual: costActual })
      .eq("id", executionId);
    if (updateError) {
      console.error(
        `[recordExecutionCost] Falha ao gravar cost_actual (execution=${executionId}):`,
        updateError.message
      );
    }

    const estimate = (execution as { cost_estimate?: CostEstimate | null } | null)?.cost_estimate;
    const estimateTotal =
      estimate && typeof estimate.total === "number" && Number.isFinite(estimate.total)
        ? estimate.total
        : null;

    const { error: messageError } = await supabase.from("agent_messages").insert({
      execution_id: executionId,
      role: "agent",
      content: formatCostLine(options.phase, estimateTotal, costActual.total),
      metadata: {
        ...(options.stepNumber !== undefined ? { stepNumber: options.stepNumber } : {}),
        messageType: "cost_estimate",
        costPhase: options.phase,
        costActual,
        costEstimateTotal: estimateTotal,
      },
    });
    if (messageError) {
      console.error(
        `[recordExecutionCost] Falha ao gravar a mensagem de custo (execution=${executionId}):`,
        messageError.message
      );
    }

    return costActual;
  } catch (error) {
    console.error(
      `[recordExecutionCost] Erro inesperado (execution=${executionId}):`,
      error instanceof Error ? error.message : error
    );
    return null;
  }
}
