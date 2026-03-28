/**
 * API Route: POST /api/agent/executions/[executionId]/confirm
 * Story 16.5: Plano de Execucao & Estimativa de Custo
 *
 * AC: #4 - Confirma execucao, cria agent_steps e salva cost_estimate
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserProfile } from "@/lib/supabase/tenant";
import { createClient } from "@/lib/supabase/server";
import { CostEstimatorService } from "@/lib/services/agent-cost-estimator";
import { PlanGeneratorService } from "@/lib/services/agent-plan-generator";
import type { ParsedBriefing } from "@/types/agent";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ executionId: string }> }
) {
  const profile = await getCurrentUserProfile();
  if (!profile) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Nao autenticado" } },
      { status: 401 }
    );
  }

  const { executionId } = await params;
  const supabase = await createClient();

  // Buscar execucao
  const { data: execution } = await supabase
    .from("agent_executions")
    .select("id, briefing, status")
    .eq("id", executionId)
    .single();

  if (!execution) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Execucao nao encontrada" } },
      { status: 404 }
    );
  }

  if (execution.status !== "pending") {
    return NextResponse.json(
      { error: { code: "ALREADY_CONFIRMED", message: "Execucao ja confirmada" } },
      { status: 400 }
    );
  }

  // Validar briefing antes de gerar plano (Story 17.10: technology pode ser null em direct entry)
  const briefing = execution.briefing as ParsedBriefing | null;
  const hasMinimumFields = briefing && (briefing.technology || (briefing.jobTitles && briefing.jobTitles.length > 0));
  if (!hasMinimumFields) {
    return NextResponse.json(
      { error: { code: "INVALID_BRIEFING", message: "Briefing incompleto ou ausente" } },
      { status: 400 }
    );
  }

  // Re-gerar plano (consistencia)
  const costModels = await CostEstimatorService.ensureCostModels(supabase, profile.tenant_id);
  const costEstimate = CostEstimatorService.estimateCosts(costModels, briefing);
  const steps = PlanGeneratorService.generatePlan(briefing, costEstimate);

  // Story 17.10: Criar agent_steps para TODOS os steps (skipped ficam como "pending"
  // e o orchestrator marca como "skipped" na execucao via shouldSkip)
  const stepsToInsert = steps.map((step) => ({
    execution_id: executionId,
    step_number: step.stepNumber,
    step_type: step.stepType,
    status: "pending",
  }));

  const { error: stepsError } = await supabase
    .from("agent_steps")
    .insert(stepsToInsert);

  if (stepsError) {
    console.error("[Agent Confirm API] Insert steps error:", stepsError);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro ao criar steps da execucao" } },
      { status: 500 }
    );
  }

  // Atualizar execucao com cost_estimate e total_steps
  const { data: updated, error: updateError } = await supabase
    .from("agent_executions")
    .update({
      cost_estimate: costEstimate,
      total_steps: steps.length,
    })
    .eq("id", executionId)
    .select()
    .single();

  if (updateError) {
    console.error("[Agent Confirm API] Update execution error:", updateError);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro ao atualizar execucao" } },
      { status: 500 }
    );
  }

  return NextResponse.json({ data: updated });
}
