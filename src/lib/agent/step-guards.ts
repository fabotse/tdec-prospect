/**
 * Step guards — fonte UNICA da regra de step "rejeitado".
 * Story 24.2 - AC2/AC3/AC5
 *
 * Nao existe status `rejected` no enum de `agent_steps` (e nao deve existir: o
 * orchestrator resolve `previousStepOutput` por status). Um step rejeitado e:
 *
 *   `agent_steps.status = 'awaiting_approval'` **E** a mensagem `approval_gate` MAIS
 *   RECENTE daquele step tem `metadata.rejected === true` — o carimbo duravel que o
 *   `POST .../reject` escreve (Story 22.13). E o equivalente no SERVIDOR (por step) do
 *   sinal que o `AgentChat` usa para reentrar no ajuste — nao o mesmo codigo: o chat olha
 *   o gate mais recente da execucao inteira (filtrado por `approvalData`), aqui o filtro
 *   e o gate mais recente DESTE step.
 *
 * Fail-CLOSED: qualquer erro de query responde `false` ("nao rejeitado"). Quem consome
 * (execute/PATCH de briefing) devolve 409 nesse caso — degradacao segura, porque nao
 * cobra nada. O residual conhecido (carimbo best-effort no /reject) e o mesmo.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * O gate mais recente do step foi carimbado como rejeitado?
 * Mesma query do carimbo no `POST .../reject`.
 */
export async function isStepRejected(
  supabase: SupabaseClient,
  executionId: string,
  stepNumber: number
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("agent_messages")
      .select("id, metadata")
      .eq("execution_id", executionId)
      .eq("metadata->>messageType", "approval_gate")
      .eq("metadata->>stepNumber", String(stepNumber))
      .order("created_at", { ascending: false })
      .limit(1);

    if (error || !Array.isArray(data)) return false;
    const gate = data[0] as { metadata?: unknown } | undefined;
    const metadata =
      gate?.metadata && typeof gate.metadata === "object"
        ? (gate.metadata as Record<string, unknown>)
        : null;
    return metadata?.rejected === true;
  } catch {
    return false;
  }
}

/**
 * A execucao tem ao menos um step rejeitado (`awaiting_approval` x `isStepRejected`)?
 */
export async function hasRejectedStep(
  supabase: SupabaseClient,
  executionId: string
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("agent_steps")
      .select("step_number")
      .eq("execution_id", executionId)
      .eq("status", "awaiting_approval");

    if (error || !Array.isArray(data)) return false;

    for (const row of data as Array<{ step_number?: unknown }>) {
      if (typeof row.step_number !== "number") continue;
      if (await isStepRejected(supabase, executionId, row.step_number)) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}
