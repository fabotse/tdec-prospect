/**
 * Story 24.3 — regra UNICA de "esta falha de disparo precisa de aviso no chat?".
 *
 * Usada pelos gates (approve → proximo step), pelo auto-trigger e pelos botoes
 * "Tentar novamente". So vira aviso a falha que:
 * - nao foi reportada no chat pelo orchestrator (`alreadyReported` — a bolha ja existe);
 * - nao e um 409 de concorrencia (`superseded` — outro executor cuidou do step).
 */

import { useAgentStore } from "@/stores/use-agent-store";
import type { TriggerNextStepOutcome } from "@/lib/agent/client-utils";

/** Devolve `true` quando gravou um aviso no store. */
export function reportTriggerFailure(
  outcome: TriggerNextStepOutcome,
  executionId: string,
  stepNumber: number
): boolean {
  const store = useAgentStore.getState();

  if (outcome.status === "ok") {
    // Um disparo bem-sucedido do MESMO step aposenta o aviso antigo dele.
    const current = store.stepTriggerFailure;
    if (
      current &&
      current.executionId === executionId &&
      current.stepNumber === stepNumber
    ) {
      store.clearStepTriggerFailure();
    }
    return false;
  }

  if (outcome.status !== "failed") return false;
  if (outcome.alreadyReported || outcome.superseded) return false;

  store.setStepTriggerFailure({
    executionId,
    stepNumber,
    message: outcome.message,
    retryable: outcome.retryable,
  });
  return true;
}
