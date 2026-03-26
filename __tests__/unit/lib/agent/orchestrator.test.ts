/**
 * Unit Tests for DeterministicOrchestrator
 * Story 17.1 - AC: #5
 * Story 17.2 - AC: #1 (search_leads dispatch + previousStepOutput)
 *
 * Tests: dispatch, sendErrorMessage, status 'paused' on failure, step registry
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { DeterministicOrchestrator } from "@/lib/agent/orchestrator";
import { createChainBuilder } from "../../../helpers/mock-supabase";
import type { PipelineError, ParsedBriefing } from "@/types/agent";

// ==============================================
// MOCKS
// ==============================================

const mockSearchCompaniesRun = vi.fn();
const mockSearchLeadsRun = vi.fn();

vi.mock("@/lib/agent/steps/search-companies-step", () => {
  return {
    SearchCompaniesStep: class MockSearchCompaniesStep {
      run = mockSearchCompaniesRun;
      stepNumber: number;
      stepType: string;
      constructor(stepNumber: number) {
        this.stepNumber = stepNumber;
        this.stepType = "search_companies";
      }
    },
  };
});

vi.mock("@/lib/agent/steps/search-leads-step", () => {
  return {
    SearchLeadsStep: class MockSearchLeadsStep {
      run = mockSearchLeadsRun;
      stepNumber: number;
      stepType: string;
      constructor(stepNumber: number) {
        this.stepNumber = stepNumber;
        this.stepType = "search_leads";
      }
    },
  };
});

const mockGeneratePlan = vi.fn();

vi.mock("@/lib/services/agent-plan-generator", () => ({
  PlanGeneratorService: {
    generatePlan: (...args: unknown[]) => mockGeneratePlan(...args),
  },
}));

// ==============================================
// HELPERS
// ==============================================

function createMockSupabase() {
  const executionsChain = createChainBuilder({
    data: {
      id: "exec-001",
      tenant_id: "tenant-1",
      user_id: "user-1",
      status: "running",
      mode: "guided",
      briefing: mockBriefing,
      current_step: 1,
      total_steps: 5,
      cost_estimate: null,
      cost_actual: null,
      result_summary: null,
      error_message: null,
      started_at: "2026-03-26T10:00:00Z",
      completed_at: null,
      created_at: "2026-03-26T10:00:00Z",
      updated_at: "2026-03-26T10:00:00Z",
    },
    error: null,
  });

  const stepsChain = createChainBuilder({
    data: {
      id: "step-1",
      execution_id: "exec-001",
      step_number: 1,
      step_type: "search_companies",
      status: "pending",
      input: null,
      output: null,
      cost: null,
      error_message: null,
      started_at: null,
      completed_at: null,
      created_at: "2026-03-26T10:00:00Z",
    },
    error: null,
  });

  const messagesChain = createChainBuilder({ data: { id: "msg-1" }, error: null });

  const mockFrom = vi.fn().mockImplementation((table: string) => {
    if (table === "agent_executions") return executionsChain;
    if (table === "agent_steps") return stepsChain;
    if (table === "agent_messages") return messagesChain;
    return createChainBuilder();
  });

  return { from: mockFrom, executionsChain, stepsChain, messagesChain };
}

const mockBriefing: ParsedBriefing = {
  technology: "React",
  jobTitles: ["CTO"],
  location: "Brasil",
  companySize: "50-200",
  industry: "saas",
  productSlug: null,
  mode: "guided",
  skipSteps: [],
};

const API_KEY = "test-api-key";

// ==============================================
// TESTS
// ==============================================

describe("DeterministicOrchestrator (AC #5)", () => {
  let orchestrator: DeterministicOrchestrator;
  let mockSupabase: ReturnType<typeof createMockSupabase>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase = createMockSupabase();
    orchestrator = new DeterministicOrchestrator(mockSupabase as never, API_KEY);

    mockSearchCompaniesRun.mockResolvedValue({
      success: true,
      data: { companies: [], totalFound: 0 },
      cost: { theirstack_search: 0 },
    });
  });

  describe("step registry (4.2)", () => {
    it("has search_companies step registered", async () => {
      await orchestrator.executeStep("exec-001", 1);
      expect(mockSearchCompaniesRun).toHaveBeenCalled();
    });

    it("throws for unimplemented step types", async () => {
      // Mock step with step_type = 'create_campaign' (not yet implemented)
      mockSupabase.stepsChain = createChainBuilder({
        data: {
          id: "step-3",
          execution_id: "exec-001",
          step_number: 1,
          step_type: "create_campaign",
          status: "pending",
        },
        error: null,
      });
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "agent_executions") return mockSupabase.executionsChain;
        if (table === "agent_steps") return mockSupabase.stepsChain;
        if (table === "agent_messages") return mockSupabase.messagesChain;
        return createChainBuilder();
      });

      await expect(orchestrator.executeStep("exec-001", 1)).rejects.toMatchObject({
        code: "ORCHESTRATOR_STEP_NOT_READY",
      });
    });
  });

  describe("executeStep() (4.3)", () => {
    it("dispatches to correct step and returns result", async () => {
      const result = await orchestrator.executeStep("exec-001", 1);

      expect(result.success).toBe(true);
    });

    it("on failure: sets execution status to paused, sends error message, throws", async () => {
      const pipelineError: PipelineError = {
        code: "STEP_SEARCH_COMPANIES_ERROR",
        message: "Rate limited",
        stepNumber: 1,
        stepType: "search_companies",
        isRetryable: true,
        externalService: "theirstack",
      };
      mockSearchCompaniesRun.mockRejectedValue(pipelineError);

      await expect(orchestrator.executeStep("exec-001", 1)).rejects.toMatchObject({
        code: "STEP_SEARCH_COMPANIES_ERROR",
      });

      // Status set to 'paused' (4.7)
      expect(mockSupabase.executionsChain.update).toHaveBeenCalledWith(
        expect.objectContaining({ status: "paused" })
      );

      // sendErrorMessage called (4.6)
      expect(mockSupabase.from).toHaveBeenCalledWith("agent_messages");
    });
  });

  describe("planExecution() (4.4)", () => {
    it("delegates to PlanGeneratorService", async () => {
      const mockSteps = [
        { stepNumber: 1, stepType: "search_companies", title: "Buscar", description: "desc", skipped: false, estimatedCost: 0, costDescription: "" },
      ];
      mockGeneratePlan.mockReturnValue(mockSteps);

      const result = await orchestrator.planExecution(mockBriefing);

      expect(mockGeneratePlan).toHaveBeenCalledWith(mockBriefing, expect.anything());
      expect(result).toEqual(mockSteps);
    });
  });

  describe("getExecution() (4.5)", () => {
    it("returns execution with steps", async () => {
      const result = await orchestrator.getExecution("exec-001");

      expect(result).toBeDefined();
      expect(result?.id).toBe("exec-001");
      expect(mockSupabase.from).toHaveBeenCalledWith("agent_executions");
    });

    it("returns null when execution not found", async () => {
      mockSupabase.executionsChain = createChainBuilder({ data: null, error: null });
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "agent_executions") return mockSupabase.executionsChain;
        return createChainBuilder();
      });

      const result = await orchestrator.getExecution("non-existent");
      expect(result).toBeNull();
    });
  });

  describe("sendErrorMessage() (4.6)", () => {
    it("inserts error message in PT-BR with external service name", async () => {
      const pipelineError: PipelineError = {
        code: "STEP_SEARCH_COMPANIES_ERROR",
        message: "Rate limited",
        stepNumber: 1,
        stepType: "search_companies",
        isRetryable: true,
        externalService: "theirstack",
      };
      mockSearchCompaniesRun.mockRejectedValue(pipelineError);

      await expect(orchestrator.executeStep("exec-001", 1)).rejects.toBeDefined();

      expect(mockSupabase.messagesChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          execution_id: "exec-001",
          role: "system",
          content: expect.stringContaining("theirstack"),
        })
      );
    });
  });

  describe("status paused rule (4.7)", () => {
    it("never sets execution status to failed directly", async () => {
      const pipelineError: PipelineError = {
        code: "STEP_EXECUTION_ERROR",
        message: "Fatal error",
        stepNumber: 1,
        stepType: "search_companies",
        isRetryable: false,
      };
      mockSearchCompaniesRun.mockRejectedValue(pipelineError);

      await expect(orchestrator.executeStep("exec-001", 1)).rejects.toBeDefined();

      // Should be 'paused', NEVER 'failed' directly
      const updateCalls = mockSupabase.executionsChain.update.mock.calls;
      const statusUpdates = updateCalls.map(
        (call: unknown[]) => (call[0] as Record<string, unknown>).status
      );
      expect(statusUpdates).not.toContain("failed");
      expect(statusUpdates).toContain("paused");
    });
  });

  // ==============================================
  // Story 17.2 Tests
  // ==============================================

  describe("search_leads dispatch (Story 17.2 - 4.9)", () => {
    it("dispatches to SearchLeadsStep for step_type search_leads", async () => {
      // Configure step 2 as search_leads with previousStepOutput
      const prevStepChain = createChainBuilder({
        data: { output: { companies: [{ domain: "acme.com" }], totalFound: 1 } },
        error: null,
      });

      const stepsChain = createChainBuilder({
        data: {
          id: "step-2",
          execution_id: "exec-001",
          step_number: 2,
          step_type: "search_leads",
          status: "pending",
        },
        error: null,
      });

      // Track call count to return different chains
      let stepsCallCount = 0;
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "agent_executions") return mockSupabase.executionsChain;
        if (table === "agent_steps") {
          stepsCallCount++;
          // First call: fetch step record; Second call: fetch previous step output
          // Third+: BaseStep internal calls (updateStepStatus, saveCheckpoint, etc.)
          if (stepsCallCount === 1) return stepsChain;
          if (stepsCallCount === 2) return prevStepChain;
          return createChainBuilder({ data: { id: "step-x" }, error: null });
        }
        if (table === "agent_messages") return mockSupabase.messagesChain;
        return createChainBuilder();
      });

      mockSearchLeadsRun.mockResolvedValue({
        success: true,
        data: { leads: [], totalFound: 0 },
        cost: { apollo_search: 0 },
      });

      const result = await orchestrator.executeStep("exec-001", 2);

      expect(mockSearchLeadsRun).toHaveBeenCalled();
      expect(result.success).toBe(true);

      // Verify StepInput was constructed correctly with previousStepOutput
      const runCallArg = mockSearchLeadsRun.mock.calls[0][0];
      expect(runCallArg.executionId).toBe("exec-001");
      expect(runCallArg.briefing).toBeDefined();
      expect(runCallArg.previousStepOutput).toEqual({
        companies: [{ domain: "acme.com" }],
        totalFound: 1,
      });
    });
  });

  describe("previousStepOutput (Story 17.2 - 4.10)", () => {
    it("passes previousStepOutput in StepInput for step > 1", async () => {
      const prevOutput = { companies: [{ domain: "acme.com" }], totalFound: 1 };
      const prevStepChain = createChainBuilder({
        data: { output: prevOutput },
        error: null,
      });

      const stepsChain = createChainBuilder({
        data: {
          id: "step-2",
          execution_id: "exec-001",
          step_number: 2,
          step_type: "search_leads",
          status: "pending",
        },
        error: null,
      });

      let stepsCallCount = 0;
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "agent_executions") return mockSupabase.executionsChain;
        if (table === "agent_steps") {
          stepsCallCount++;
          if (stepsCallCount === 1) return stepsChain;
          if (stepsCallCount === 2) return prevStepChain;
          return createChainBuilder({ data: { id: "step-x" }, error: null });
        }
        if (table === "agent_messages") return mockSupabase.messagesChain;
        return createChainBuilder();
      });

      mockSearchLeadsRun.mockResolvedValue({
        success: true,
        data: { leads: [], totalFound: 0 },
      });

      await orchestrator.executeStep("exec-001", 2);

      // Verify run() was called with input containing previousStepOutput
      const runCallArg = mockSearchLeadsRun.mock.calls[0][0];
      expect(runCallArg.previousStepOutput).toEqual(prevOutput);
    });
  });

  describe("previousStepOutput missing (Story 17.2 - 4.11)", () => {
    it("throws ORCHESTRATOR_STEP_NOT_READY when previous step not completed", async () => {
      const prevStepChain = createChainBuilder({
        data: null,
        error: null,
      });

      const stepsChain = createChainBuilder({
        data: {
          id: "step-2",
          execution_id: "exec-001",
          step_number: 2,
          step_type: "search_leads",
          status: "pending",
        },
        error: null,
      });

      let stepsCallCount = 0;
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "agent_executions") return mockSupabase.executionsChain;
        if (table === "agent_steps") {
          stepsCallCount++;
          if (stepsCallCount === 1) return stepsChain;
          if (stepsCallCount === 2) return prevStepChain;
          return createChainBuilder({ data: { id: "step-x" }, error: null });
        }
        if (table === "agent_messages") return mockSupabase.messagesChain;
        return createChainBuilder();
      });

      await expect(orchestrator.executeStep("exec-001", 2)).rejects.toMatchObject({
        code: "ORCHESTRATOR_STEP_NOT_READY",
        message: "Step anterior nao concluido",
      });
    });
  });
});
