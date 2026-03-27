/**
 * useAutoTrigger — Auto-trigger next step in Autopilot mode
 * Story 17.7 - AC #1, #5
 *
 * Monitors step status changes via Realtime (already received by useAgentExecution).
 * When a step completes in autopilot mode, dispatches the next step automatically.
 * Guards: no dispatch if step already running, execution completed, or race condition.
 */

"use client";

import { useEffect, useRef, useCallback } from "react";
import type { AgentStep, ExecutionMode } from "@/types/agent";

interface UseAutoTriggerOptions {
  executionId: string | null;
  steps: AgentStep[];
  mode: ExecutionMode | null;
}

export function useAutoTrigger({ executionId, steps, mode }: UseAutoTriggerOptions) {
  const lastTriggeredRef = useRef<number>(0);

  const triggerStep = useCallback(
    async (stepNumber: number) => {
      if (!executionId) return;
      await fetch(
        `/api/agent/executions/${executionId}/steps/${stepNumber}/execute`,
        { method: "POST" }
      );
    },
    [executionId]
  );

  useEffect(() => {
    if (!executionId || mode !== "autopilot" || steps.length === 0) return;

    // Guard: don't trigger if any step is already running
    const hasRunning = steps.some((s) => s.status === "running");
    if (hasRunning) return;

    // Guard: don't trigger if execution is already completed (all steps done)
    const allDone = steps.every(
      (s) => s.status === "completed" || s.status === "approved" || s.status === "skipped" || s.status === "failed"
    );
    if (allDone) return;

    // Find the last completed step
    const completedSteps = steps
      .filter((s) => s.status === "completed" || s.status === "approved" || s.status === "skipped")
      .sort((a, b) => b.step_number - a.step_number);

    if (completedSteps.length === 0) return;

    const lastCompleted = completedSteps[0];
    const nextStepNumber = lastCompleted.step_number + 1;

    // Guard: already triggered this step
    if (nextStepNumber <= lastTriggeredRef.current) return;

    // Guard: next step must exist in the list
    const nextStep = steps.find((s) => s.step_number === nextStepNumber);
    if (!nextStep) return;

    // Guard: next step must be pending
    if (nextStep.status !== "pending") return;

    lastTriggeredRef.current = nextStepNumber;
    triggerStep(nextStepNumber).catch(() => {});
  }, [executionId, steps, mode, triggerStep]);
}
