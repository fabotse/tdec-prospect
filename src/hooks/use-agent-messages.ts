/**
 * @deprecated Use use-agent-execution.ts instead.
 * Re-export mantido para backward compatibility durante transicao.
 * Refator: Retro Epic 16 — Action Item Debito Tecnico #5
 */

"use client";

import { useAgentExecution } from "./use-agent-execution";

export { useSendMessage } from "./use-agent-execution";
export type { SendMessageParams } from "./use-agent-execution";

/**
 * @deprecated Use useAgentExecution() instead.
 * Wrapper que retorna apenas messages (sem steps) para compat.
 */
export function useAgentMessages(executionId: string | null) {
  const { messages, isLoading, isConnected } = useAgentExecution(executionId);
  return { messages, isLoading, isConnected };
}
