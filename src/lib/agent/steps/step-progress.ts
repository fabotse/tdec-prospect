/**
 * Total de etapas da execucao para o texto "Etapa N/M".
 * Story: 24.19 - Dossie da conta (o pipeline passou de 5 para 6 etapas)
 *
 * Le `agent_executions.total_steps`. Fallback 5 (o total anterior) em qualquer falha:
 * e so texto de progresso, nunca pode derrubar o step.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

const FALLBACK_TOTAL_STEPS = 5;

export async function readTotalSteps(
  supabase: SupabaseClient,
  executionId: string
): Promise<number> {
  try {
    const { data, error } = await supabase
      .from("agent_executions")
      .select("total_steps")
      .eq("id", executionId)
      .single();
    const total = Number((data as { total_steps?: unknown } | null)?.total_steps);
    if (error || !Number.isInteger(total) || total < 1) return FALLBACK_TOTAL_STEPS;
    return total;
  } catch {
    return FALLBACK_TOTAL_STEPS;
  }
}
