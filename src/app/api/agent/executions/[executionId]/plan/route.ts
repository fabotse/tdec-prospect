/**
 * API Route: GET /api/agent/executions/[executionId]/plan
 * Story 16.5: Plano de Execucao & Estimativa de Custo
 *
 * AC: #1 - Retorna plano de execucao com etapas em ordem
 * AC: #2 - Retorna estimativa de custo por etapa e total
 * AC: #3 - Usa cost_models do banco (lazy seed)
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserProfile } from "@/lib/supabase/tenant";
import { createClient } from "@/lib/supabase/server";
import { CostEstimatorService } from "@/lib/services/agent-cost-estimator";
import { PlanGeneratorService } from "@/lib/services/agent-plan-generator";
import type { ParsedBriefing } from "@/types/agent";

export async function GET(
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

  // Buscar execucao (RLS filtra por tenant)
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

  // Verificar briefing preenchido
  const briefing = execution.briefing as ParsedBriefing | null;
  if (!briefing || !briefing.technology) {
    return NextResponse.json(
      { error: { code: "INVALID_BRIEFING", message: "Briefing incompleto ou ausente" } },
      { status: 400 }
    );
  }

  // Buscar/criar cost models
  const costModels = await CostEstimatorService.ensureCostModels(supabase, profile.tenant_id);

  // Calcular custos
  const costEstimate = CostEstimatorService.estimateCosts(costModels, briefing);

  // Gerar plano
  const steps = PlanGeneratorService.generatePlan(briefing, costEstimate);
  const totalActiveSteps = steps.filter((s) => !s.skipped).length;

  return NextResponse.json({
    data: { steps, costEstimate, totalActiveSteps },
  });
}
