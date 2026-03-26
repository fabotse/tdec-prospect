/**
 * Unit Tests for BaseStep
 * Story 17.1 - AC: #4
 *
 * Tests: template method run(), saveCheckpoint(), saveFailure(),
 * updateStepStatus(), logStep(), toPipelineError(), retryStep(), isRetryableStatus()
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { BaseStep } from "@/lib/agent/steps/base-step";
import { createChainBuilder } from "../../../../helpers/mock-supabase";
import type { StepInput, StepOutput, PipelineError } from "@/types/agent";
import { ExternalServiceError } from "@/lib/services/base-service";

// ==============================================
// CONCRETE IMPLEMENTATION FOR TESTING
// ==============================================

class TestStep extends BaseStep {
  public executeResult: StepOutput = { success: true, data: { test: true } };
  public shouldThrow: Error | null = null;
  public callCount = 0;

  protected async executeInternal(_input: StepInput): Promise<StepOutput> {
    this.callCount++;
    if (this.shouldThrow) throw this.shouldThrow;
    return this.executeResult;
  }

  // Expose protected method for direct testing
  public testToPipelineError(error: unknown): PipelineError {
    return this.toPipelineError(error);
  }
}

// ==============================================
// HELPERS
// ==============================================

function createMockSupabase() {
  const stepsChain = createChainBuilder({ data: { id: "step-1" }, error: null });
  const messagesChain = createChainBuilder({ data: { id: "msg-1" }, error: null });

  const mockFrom = vi.fn().mockImplementation((table: string) => {
    if (table === "agent_steps") return stepsChain;
    if (table === "agent_messages") return messagesChain;
    return createChainBuilder();
  });

  return { from: mockFrom, stepsChain, messagesChain };
}

const mockInput: StepInput = {
  executionId: "exec-001",
  briefing: {
    technology: "React",
    jobTitles: ["CTO"],
    location: "Brasil",
    companySize: null,
    industry: null,
    productSlug: null,
    mode: "guided",
    skipSteps: [],
  },
};

// ==============================================
// TESTS
// ==============================================

describe("BaseStep (AC #4)", () => {
  let step: TestStep;
  let mockSupabase: ReturnType<typeof createMockSupabase>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockSupabase = createMockSupabase();
    step = new TestStep(
      1,
      "search_companies",
      mockSupabase as never
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("run() template method (2.1, 2.2)", () => {
    it("executes happy path: updateStatus -> executeInternal -> saveCheckpoint -> logStep", async () => {
      const result = await step.run(mockInput);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ test: true });

      // updateStepStatus('running') called
      expect(mockSupabase.from).toHaveBeenCalledWith("agent_steps");
      // saveCheckpoint called
      expect(mockSupabase.stepsChain.update).toHaveBeenCalled();
      // logStep called
      expect(mockSupabase.from).toHaveBeenCalledWith("agent_messages");
    });

    it("catches errors, converts via toPipelineError, saves failure, and throws", async () => {
      step.shouldThrow = new Error("Something broke");

      await expect(step.run(mockInput)).rejects.toMatchObject({
        code: expect.any(String),
        message: expect.any(String),
        stepNumber: 1,
        stepType: "search_companies",
      });
    });

    it("converts ExternalServiceError to PipelineError with externalService", async () => {
      step.shouldThrow = new ExternalServiceError("theirstack", 429, "Rate limited");

      await expect(step.run(mockInput)).rejects.toMatchObject({
        externalService: "theirstack",
        isRetryable: true,
        stepNumber: 1,
      });
    });

    it("converts generic error to non-retryable PipelineError", async () => {
      step.shouldThrow = new Error("Unknown failure");

      await expect(step.run(mockInput)).rejects.toMatchObject({
        isRetryable: false,
        stepNumber: 1,
        stepType: "search_companies",
      });
    });
  });

  describe("toPipelineError() (2.3)", () => {
    it("converts ExternalServiceError with retryable status and dynamic code", () => {
      const error = new ExternalServiceError("theirstack", 429, "Rate limited");
      const pipelineError = step.testToPipelineError(error);

      expect(pipelineError).toMatchObject({
        code: "STEP_SEARCH_COMPANIES_ERROR",
        message: "Rate limited",
        stepNumber: 1,
        stepType: "search_companies",
        isRetryable: true,
        externalService: "theirstack",
      });
    });

    it("derives code from stepType for different step types", () => {
      const leadsStep = new TestStep(2, "search_leads", mockSupabase as never);
      const error = new ExternalServiceError("snovio", 503, "Service down");
      const pipelineError = leadsStep.testToPipelineError(error);

      expect(pipelineError.code).toBe("STEP_SEARCH_LEADS_ERROR");
    });

    it("converts ExternalServiceError with terminal status", () => {
      const error = new ExternalServiceError("theirstack", 401, "Unauthorized");
      const pipelineError = step.testToPipelineError(error);

      expect(pipelineError.isRetryable).toBe(false);
    });

    it("converts generic Error", () => {
      const error = new Error("Something failed");
      const pipelineError = step.testToPipelineError(error);

      expect(pipelineError).toMatchObject({
        code: "STEP_EXECUTION_ERROR",
        isRetryable: false,
        externalService: undefined,
      });
    });
  });

  describe("retryStep() (2.8)", () => {
    it("returns result on first attempt if successful", async () => {
      const result = await step.retryStep(mockInput);

      expect(result.success).toBe(true);
      expect(step.callCount).toBe(1);
    });

    it("retries on retryable error and succeeds on second attempt", async () => {
      let attempt = 0;

      // Override executeInternal to succeed on 2nd attempt
      vi.spyOn(step as never, "executeInternal" as never).mockImplementation(
        async () => {
          attempt++;
          if (attempt === 1) {
            throw new ExternalServiceError("theirstack", 429, "Rate limited");
          }
          return { success: true, data: { test: true } };
        }
      );

      const retryPromise = step.retryStep(mockInput);
      // Advance past delay [0, 2000]
      await vi.advanceTimersByTimeAsync(3000);

      const result = await retryPromise;

      expect(result.success).toBe(true);
      expect(attempt).toBe(2);
    });

    it("throws immediately on non-retryable error without retrying", async () => {
      step.shouldThrow = new Error("Fatal error");

      await expect(step.retryStep(mockInput)).rejects.toMatchObject({
        isRetryable: false,
      });
      // run() called once, no retries
      expect(step.callCount).toBe(1);
    });

    it("exhausts all 3 retries and throws last error", async () => {
      vi.useRealTimers(); // Use real timers for this test — delays are 0+2000+5000=7s
      step.shouldThrow = new ExternalServiceError("theirstack", 503, "Unavailable");

      await expect(step.retryStep(mockInput)).rejects.toMatchObject({
        isRetryable: true,
        externalService: "theirstack",
      });
      expect(step.callCount).toBe(3);
    }, 10000);
  });

  describe("isRetryableStatus() (2.9)", () => {
    it("returns true for retryable HTTP status codes", () => {
      expect(BaseStep.isRetryableStatus(0)).toBe(true);
      expect(BaseStep.isRetryableStatus(408)).toBe(true);
      expect(BaseStep.isRetryableStatus(429)).toBe(true);
      expect(BaseStep.isRetryableStatus(502)).toBe(true);
      expect(BaseStep.isRetryableStatus(503)).toBe(true);
      expect(BaseStep.isRetryableStatus(504)).toBe(true);
    });

    it("returns false for non-retryable status codes", () => {
      expect(BaseStep.isRetryableStatus(400)).toBe(false);
      expect(BaseStep.isRetryableStatus(401)).toBe(false);
      expect(BaseStep.isRetryableStatus(403)).toBe(false);
      expect(BaseStep.isRetryableStatus(404)).toBe(false);
      expect(BaseStep.isRetryableStatus(500)).toBe(false);
    });
  });

  describe("saveCheckpoint() (2.4)", () => {
    it("updates agent_steps with output, status completed, and completed_at", async () => {
      await step.run(mockInput);

      const updateCalls = mockSupabase.stepsChain.update.mock.calls;
      const checkpointCall = updateCalls.find(
        (call: unknown[]) => (call[0] as Record<string, unknown>).status === "completed"
      );
      expect(checkpointCall).toBeDefined();
      expect(checkpointCall[0]).toMatchObject({
        output: { test: true },
        status: "completed",
        completed_at: expect.any(String),
      });
    });
  });

  describe("saveFailure() (2.5)", () => {
    it("updates agent_steps with failed status and error info on error", async () => {
      step.shouldThrow = new Error("Failure");

      await expect(step.run(mockInput)).rejects.toBeDefined();

      const updateCalls = mockSupabase.stepsChain.update.mock.calls;
      const failureCall = updateCalls.find(
        (call: unknown[]) => (call[0] as Record<string, unknown>).status === "failed"
      );
      expect(failureCall).toBeDefined();
      expect(failureCall[0]).toMatchObject({
        status: "failed",
        error_message: expect.any(String),
      });
    });
  });

  describe("updateStepStatus() (2.6)", () => {
    it("updates agent_steps status to running at start", async () => {
      await step.run(mockInput);

      const updateCalls = mockSupabase.stepsChain.update.mock.calls;
      const runningCall = updateCalls.find(
        (call: unknown[]) => (call[0] as Record<string, unknown>).status === "running"
      );
      expect(runningCall).toBeDefined();
      expect(runningCall[0]).toMatchObject({
        status: "running",
        started_at: expect.any(String),
      });
    });
  });

  describe("logStep() (2.7)", () => {
    it("inserts agent_messages with step metadata", async () => {
      await step.run(mockInput);

      expect(mockSupabase.from).toHaveBeenCalledWith("agent_messages");
      expect(mockSupabase.messagesChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          execution_id: "exec-001",
          role: "system",
          metadata: expect.objectContaining({
            stepNumber: 1,
            messageType: "progress",
          }),
        })
      );
    });
  });
});
