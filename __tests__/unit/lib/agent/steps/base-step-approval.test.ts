/**
 * Unit Tests for BaseStep Approval Gate Lifecycle
 * Story 17.5 - AC: #1, #3
 *
 * Tests: guided mode -> awaiting_approval, autopilot -> completed (unchanged),
 * sendApprovalGateMessage, saveAwaitingApproval, buildPreviewData
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { BaseStep } from "@/lib/agent/steps/base-step";
import { createChainBuilder } from "../../../../helpers/mock-supabase";
import type { StepInput, StepOutput, PipelineError } from "@/types/agent";

// ==============================================
// CONCRETE IMPLEMENTATION FOR TESTING
// ==============================================

class TestStep extends BaseStep {
  public executeResult: StepOutput = {
    success: true,
    data: { companies: [{ name: "Acme" }], totalFound: 1 },
  };
  public shouldThrow: Error | null = null;

  protected async executeInternal(_input: StepInput): Promise<StepOutput> {
    if (this.shouldThrow) throw this.shouldThrow;
    return this.executeResult;
  }

  public testToPipelineError(error: unknown): PipelineError {
    return this.toPipelineError(error);
  }
}

class TestStepWithCustomPreview extends BaseStep {
  public executeResult: StepOutput = {
    success: true,
    data: { companies: [{ name: "Acme", extra: "data" }], totalFound: 1 },
  };

  protected async executeInternal(_input: StepInput): Promise<StepOutput> {
    return this.executeResult;
  }

  protected buildPreviewData(result: StepOutput): unknown {
    return { totalFound: (result.data as Record<string, unknown>).totalFound };
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

const baseInput: StepInput = {
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

describe("BaseStep Approval Gate (Story 17.5)", () => {
  let step: TestStep;
  let mockSupabase: ReturnType<typeof createMockSupabase>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase = createMockSupabase();
    step = new TestStep(1, "search_companies", mockSupabase as never);
  });

  // 9.1 - Guided mode -> awaiting_approval + approval_gate message
  describe("guided mode (9.1, 9.3)", () => {
    it("sets status awaiting_approval and inserts approval_gate message", async () => {
      const input: StepInput = { ...baseInput, mode: "guided" };

      await step.run(input);

      // saveAwaitingApproval: status='awaiting_approval', no completed_at
      const updateCalls = mockSupabase.stepsChain.update.mock.calls;
      const awaitingCall = updateCalls.find(
        (call: unknown[]) =>
          (call[0] as Record<string, unknown>).status === "awaiting_approval"
      );
      expect(awaitingCall).toBeDefined();
      expect(awaitingCall[0]).toMatchObject({
        output: { companies: [{ name: "Acme" }], totalFound: 1 },
        status: "awaiting_approval",
      });
      // No completed_at
      expect(awaitingCall[0]).not.toHaveProperty("completed_at");

      // sendApprovalGateMessage: inserts agent message
      expect(mockSupabase.messagesChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          execution_id: "exec-001",
          role: "agent",
          content: expect.stringContaining("Busca de Empresas"),
          metadata: expect.objectContaining({
            stepNumber: 1,
            messageType: "approval_gate",
            approvalData: {
              stepType: "search_companies",
              previewData: { companies: [{ name: "Acme" }], totalFound: 1 },
            },
          }),
        })
      );
    });

    it("does NOT call saveCheckpoint in guided mode", async () => {
      const input: StepInput = { ...baseInput, mode: "guided" };

      await step.run(input);

      const updateCalls = mockSupabase.stepsChain.update.mock.calls;
      const completedCall = updateCalls.find(
        (call: unknown[]) =>
          (call[0] as Record<string, unknown>).status === "completed"
      );
      expect(completedCall).toBeUndefined();
    });
  });

  // 9.2 - Autopilot mode -> completed (unchanged)
  describe("autopilot mode (9.2)", () => {
    it("saves checkpoint with status completed (unchanged behavior)", async () => {
      const input: StepInput = { ...baseInput, mode: "autopilot" };

      await step.run(input);

      const updateCalls = mockSupabase.stepsChain.update.mock.calls;
      const completedCall = updateCalls.find(
        (call: unknown[]) =>
          (call[0] as Record<string, unknown>).status === "completed"
      );
      expect(completedCall).toBeDefined();
      expect(completedCall[0]).toMatchObject({
        output: { companies: [{ name: "Acme" }], totalFound: 1 },
        status: "completed",
        completed_at: expect.any(String),
      });
    });

    it("does NOT insert approval_gate message in autopilot mode", async () => {
      const input: StepInput = { ...baseInput, mode: "autopilot" };

      await step.run(input);

      // logStep inserts a "progress" message, but NOT an "approval_gate" message
      const insertCalls = mockSupabase.messagesChain.insert.mock.calls;
      const approvalGateCall = insertCalls.find(
        (call: unknown[]) =>
          (call[0] as Record<string, unknown>).metadata &&
          ((call[0] as Record<string, Record<string, unknown>>).metadata as Record<string, unknown>).messageType === "approval_gate"
      );
      expect(approvalGateCall).toBeUndefined();
    });
  });

  // 9.2 continued - No mode (undefined) -> completed (backward compat)
  describe("no mode (backward compatibility)", () => {
    it("defaults to saveCheckpoint when mode is undefined", async () => {
      const input: StepInput = { ...baseInput };
      // mode is not set

      await step.run(input);

      const updateCalls = mockSupabase.stepsChain.update.mock.calls;
      const completedCall = updateCalls.find(
        (call: unknown[]) =>
          (call[0] as Record<string, unknown>).status === "completed"
      );
      expect(completedCall).toBeDefined();
    });
  });

  // 9.3 - sendApprovalGateMessage metadata
  describe("sendApprovalGateMessage (9.3)", () => {
    it("inserts message with correct stepType and previewData", async () => {
      const leadsStep = new TestStep(2, "search_leads", mockSupabase as never);
      leadsStep.executeResult = {
        success: true,
        data: { leads: [{ name: "John" }], totalFound: 1 },
      };

      const input: StepInput = { ...baseInput, mode: "guided" };
      await leadsStep.run(input);

      expect(mockSupabase.messagesChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            approvalData: {
              stepType: "search_leads",
              previewData: { leads: [{ name: "John" }], totalFound: 1 },
            },
          }),
        })
      );
    });
  });

  // buildPreviewData override
  describe("buildPreviewData override", () => {
    it("allows subclass to customize preview data", async () => {
      const customStep = new TestStepWithCustomPreview(
        1,
        "search_companies",
        mockSupabase as never
      );

      const input: StepInput = { ...baseInput, mode: "guided" };
      await customStep.run(input);

      expect(mockSupabase.messagesChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            approvalData: {
              stepType: "search_companies",
              previewData: { totalFound: 1 },
            },
          }),
        })
      );
    });
  });

  // logStep still called in guided mode
  describe("logStep in guided mode", () => {
    it("calls logStep after approval gate flow", async () => {
      const input: StepInput = { ...baseInput, mode: "guided" };

      await step.run(input);

      // Should have 2 inserts: approval_gate message + logStep progress message
      expect(mockSupabase.messagesChain.insert).toHaveBeenCalledTimes(2);
    });
  });
});
