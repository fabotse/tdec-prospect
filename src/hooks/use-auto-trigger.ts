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
    if (!executionId || steps.length === 0) return;

    // Guard: guided mode only auto-triggers after skipped steps (approval gates handle the rest)
    // Autopilot mode auto-triggers after completed, approved, or skipped steps
    if (mode !== "autopilot" && mode !== "guided") return;

    // Guard: don't trigger if any step is already running
    const hasRunning = steps.some((s) => s.status === "running");
    if (hasRunning) return;

    // Guard: don't trigger if execution is already completed (all steps done)
    const allDone = steps.every(
      (s) => s.status === "completed" || s.status === "approved" || s.status === "skipped" || s.status === "failed"
    );
    if (allDone) return;

    // Story 17.10: In guided mode, only auto-advance after skipped steps
    // (approval gates handle progression after completed/approved steps)
    const triggerAfterStatuses = mode === "autopilot"
      ? ["completed", "approved", "skipped"]
      : ["skipped"];

    const eligibleSteps = steps
      .filter((s) => triggerAfterStatuses.includes(s.status))
      .sort((a, b) => b.step_number - a.step_number);

    if (eligibleSteps.length === 0) return;

    const lastEligible = eligibleSteps[0];
    const nextStepNumber = lastEligible.step_number + 1;

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
