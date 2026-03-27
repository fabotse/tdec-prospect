/**
 * Client-side utilities for agent pipeline
 * Story 17.7 - AC #6
 */

/**
 * Trigger the next step in a pipeline execution.
 * Guards: does not trigger if currentStepNumber >= totalSteps.
 */
export async function triggerNextStep(
  executionId: string,
  currentStepNumber: number,
  totalSteps: number
): Promise<Response | null> {
  if (currentStepNumber >= totalSteps) return null;

  const nextStep = currentStepNumber + 1;
  return fetch(
    `/api/agent/executions/${executionId}/steps/${nextStep}/execute`,
    { method: "POST" }
  );
}
