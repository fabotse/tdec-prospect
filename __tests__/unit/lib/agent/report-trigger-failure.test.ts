/**
 * Story 24.3 — regra unica de aviso de falha de disparo.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { reportTriggerFailure } from "@/lib/agent/report-trigger-failure";
import { useAgentStore } from "@/stores/use-agent-store";
import type { StepTriggerFailedOutcome } from "@/lib/agent/client-utils";

const failed = (over: Partial<StepTriggerFailedOutcome> = {}): StepTriggerFailedOutcome => ({
  status: "failed",
  message: "API key do TheirStack nao configurada",
  alreadyReported: false,
  code: "API_KEY_NOT_FOUND",
  retryable: true,
  superseded: false,
  ...over,
});

describe("reportTriggerFailure", () => {
  beforeEach(() => {
    useAgentStore.setState({ stepTriggerFailure: null });
  });

  it("falha pre-orchestrator grava o aviso", () => {
    expect(reportTriggerFailure(failed(), "exec-1", 3)).toBe(true);
    expect(useAgentStore.getState().stepTriggerFailure).toEqual({
      executionId: "exec-1",
      stepNumber: 3,
      message: "API key do TheirStack nao configurada",
      retryable: true,
    });
  });

  it("nao retryable grava com retryable false", () => {
    reportTriggerFailure(failed({ retryable: false, code: "EXECUTION_NOT_ACTIVE" }), "exec-1", 3);
    expect(useAgentStore.getState().stepTriggerFailure?.retryable).toBe(false);
  });

  it("ja reportada no chat nao grava", () => {
    expect(reportTriggerFailure(failed({ alreadyReported: true }), "exec-1", 3)).toBe(false);
    expect(useAgentStore.getState().stepTriggerFailure).toBeNull();
  });

  it("superseded (409 concorrente) nao grava", () => {
    expect(reportTriggerFailure(failed({ superseded: true }), "exec-1", 3)).toBe(false);
    expect(useAgentStore.getState().stepTriggerFailure).toBeNull();
  });

  it("skipped nao grava", () => {
    expect(reportTriggerFailure({ status: "skipped" }, "exec-1", 3)).toBe(false);
    expect(useAgentStore.getState().stepTriggerFailure).toBeNull();
  });

  it("ok do mesmo step limpa o aviso antigo; ok de outro step nao", () => {
    reportTriggerFailure(failed(), "exec-1", 3);
    reportTriggerFailure({ status: "ok" }, "exec-1", 4);
    expect(useAgentStore.getState().stepTriggerFailure).not.toBeNull();
    reportTriggerFailure({ status: "ok" }, "exec-1", 3);
    expect(useAgentStore.getState().stepTriggerFailure).toBeNull();
  });
});
