/**
 * useStepExecution - Hook para executar steps do pipeline
 * Story 17.1 - AC: #1, #2
 *
 * Integra com useAgentExecution existente (steps ja vem via Realtime).
 */

"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import type { StepOutput } from "@/types/agent";

export function useStepExecution() {
  const [isExecuting, setIsExecuting] = useState(false);

  /**
   * Execute a step via POST API route.
   * (7.1, 7.2, 7.3)
   */
  const executeStep = useCallback(
    async (executionId: string, stepNumber: number): Promise<StepOutput> => {
      setIsExecuting(true);

      try {
        const response = await fetch(
          `/api/agent/executions/${executionId}/steps/${stepNumber}/execute`,
          { method: "POST" }
        );

        const result = await response.json();

        // 7.2 - Check response.ok
        if (!response.ok) {
          throw new Error(result.error?.message ?? "Erro ao executar step");
        }

        return result.data;
      } catch (error) {
        // 7.3 - Network error toast
        if (error instanceof TypeError) {
          toast.error("Erro de conexao");
        }
        throw error;
      } finally {
        setIsExecuting(false);
      }
    },
    []
  );

  return { executeStep, isExecuting };
}
