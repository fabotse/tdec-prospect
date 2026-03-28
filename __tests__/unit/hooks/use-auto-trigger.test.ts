/**
 * Unit Tests for useAutoTrigger hook
 * Story 17.7 - AC #1
 *
 * Tests: autopilot auto-trigger, guided no-trigger, last step, running guard, race condition
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useAutoTrigger } from "@/hooks/use-auto-trigger";
import type { AgentStep } from "@/types/agent";

// === Mock fetch ===

let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ success: true })));
});

afterEach(() => {
  fetchSpy.mockRestore();
});

// === Helpers ===

function makeStep(overrides: Partial<AgentStep> & { step_number: number; status: string }): AgentStep {
  return {
    id: `step-${overrides.step_number}`,
    execution_id: "exec-001",
    step_type: "search_companies",
    input: null,
    output: null,
    cost: null,
    error_message: null,
    started_at: null,
    completed_at: null,
    created_at: "2026-03-26T10:00:00Z",
    ...overrides,
  } as AgentStep;
}

// === Tests ===

describe("useAutoTrigger (Story 17.7 - AC #1)", () => {
  it("triggers next step when step completes in autopilot mode", () => {
    const steps = [
      makeStep({ step_number: 1, status: "completed" }),
      makeStep({ step_number: 2, status: "pending" }),
      makeStep({ step_number: 3, status: "pending" }),
    ];

    renderHook(() =>
      useAutoTrigger({ executionId: "exec-001", steps, mode: "autopilot" })
    );

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/agent/executions/exec-001/steps/2/execute",
      { method: "POST" }
    );
  });

  it("does NOT trigger next step in guided mode after completed step (approval gate handles it)", () => {
    const steps = [
      makeStep({ step_number: 1, status: "completed" }),
      makeStep({ step_number: 2, status: "pending" }),
    ];

    renderHook(() =>
      useAutoTrigger({ executionId: "exec-001", steps, mode: "guided" })
    );

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("DOES trigger next step in guided mode after skipped step (Story 17.10)", () => {
    const steps = [
      makeStep({ step_number: 1, status: "skipped" }),
      makeStep({ step_number: 2, status: "pending" }),
      makeStep({ step_number: 3, status: "pending" }),
    ];

    renderHook(() =>
      useAutoTrigger({ executionId: "exec-001", steps, mode: "guided" })
    );

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/agent/executions/exec-001/steps/2/execute",
      { method: "POST" }
    );
  });

  it("does NOT trigger when last step completes (execution finished)", () => {
    const steps = [
      makeStep({ step_number: 1, status: "completed" }),
      makeStep({ step_number: 2, status: "completed" }),
    ];

    renderHook(() =>
      useAutoTrigger({ executionId: "exec-001", steps, mode: "autopilot" })
    );

    // All steps are completed — no next step to trigger
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("does NOT trigger when a step is already running", () => {
    const steps = [
      makeStep({ step_number: 1, status: "completed" }),
      makeStep({ step_number: 2, status: "running" }),
      makeStep({ step_number: 3, status: "pending" }),
    ];

    renderHook(() =>
      useAutoTrigger({ executionId: "exec-001", steps, mode: "autopilot" })
    );

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("handles race condition: two rapid updates only dispatch once", () => {
    const steps1 = [
      makeStep({ step_number: 1, status: "completed" }),
      makeStep({ step_number: 2, status: "pending" }),
    ];

    const { rerender } = renderHook(
      ({ steps }) => useAutoTrigger({ executionId: "exec-001", steps, mode: "autopilot" }),
      { initialProps: { steps: steps1 } }
    );

    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Second render with same completed step — should NOT trigger again
    rerender({ steps: steps1 });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("does NOT trigger when executionId is null", () => {
    const steps = [
      makeStep({ step_number: 1, status: "completed" }),
      makeStep({ step_number: 2, status: "pending" }),
    ];

    renderHook(() =>
      useAutoTrigger({ executionId: null, steps, mode: "autopilot" })
    );

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("skips over skipped steps correctly", () => {
    const steps = [
      makeStep({ step_number: 1, status: "completed" }),
      makeStep({ step_number: 2, status: "skipped" }),
      makeStep({ step_number: 3, status: "pending" }),
    ];

    renderHook(() =>
      useAutoTrigger({ executionId: "exec-001", steps, mode: "autopilot" })
    );

    // Last completed/skipped is step 2, so next is step 3
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/agent/executions/exec-001/steps/3/execute",
      { method: "POST" }
    );
  });
});
