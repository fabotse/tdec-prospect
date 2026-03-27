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
const mockCreateCampaignRun = vi.fn();
const mockExportRun = vi.fn();
const mockActivateRun = vi.fn();

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

vi.mock("@/lib/agent/steps/create-campaign-step", () => {
  return {
    CreateCampaignStep: class MockCreateCampaignStep {
      run = mockCreateCampaignRun;
      stepNumber: number;
      stepType: string;
      constructor(stepNumber: number) {
        this.stepNumber = stepNumber;
        this.stepType = "create_campaign";
      }
    },
  };
});

vi.mock("@/lib/agent/steps/export-step", () => {
  return {
    ExportStep: class MockExportStep {
      run = mockExportRun;
      stepNumber: number;
      stepType: string;
      constructor(stepNumber: number) {
        this.stepNumber = stepNumber;
        this.stepType = "export";
      }
    },
  };
});

vi.mock("@/lib/agent/steps/activate-step", () => {
  return {
    ActivateStep: class MockActivateStep {
      run = mockActivateRun;
      stepNumber: number;
      stepType: string;
      constructor(stepNumber: number) {
        this.stepNumber = stepNumber;
        this.stepType = "activate";
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

    it("throws for unknown step types", async () => {
      mockSupabase.stepsChain = createChainBuilder({
        data: {
          id: "step-99",
          execution_id: "exec-001",
          step_number: 1,
          step_type: "unknown_type",
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
        code: "ORCHESTRATOR_INVALID_STEP",
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

  // ==============================================
  // Story 17.3 Tests
  // ==============================================

  describe("create_campaign dispatch (Story 17.3 - 4.16)", () => {
    it("dispatches to CreateCampaignStep for step_type create_campaign", async () => {
      const prevStepChain = createChainBuilder({
        data: { output: { leads: [{ name: "John" }], totalFound: 1 } },
        error: null,
      });

      const stepsChain = createChainBuilder({
        data: {
          id: "step-3",
          execution_id: "exec-001",
          step_number: 3,
          step_type: "create_campaign",
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

      mockCreateCampaignRun.mockResolvedValue({
        success: true,
        data: { campaignName: "Test Campaign", totalLeads: 1 },
        cost: { openai_structure: 1, openai_emails: 3, openai_icebreakers: 1 },
      });

      const result = await orchestrator.executeStep("exec-001", 3);

      expect(mockCreateCampaignRun).toHaveBeenCalled();
      expect(result.success).toBe(true);
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

  // ==============================================
  // Story 17.4 Tests
  // ==============================================

  // 5.20 - Dispatch export
  describe("export dispatch (Story 17.4 - 5.20)", () => {
    it("dispatches to ExportStep for step_type export", async () => {
      const prevStepChain = createChainBuilder({
        data: { output: { campaignName: "Test", emailBlocks: [], leadsWithIcebreakers: [] } },
        error: null,
      });

      const stepsChain = createChainBuilder({
        data: {
          id: "step-4",
          execution_id: "exec-001",
          step_number: 4,
          step_type: "export",
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

      mockExportRun.mockResolvedValue({
        success: true,
        data: { externalCampaignId: "camp-123", platform: "instantly" },
        cost: { instantly_create: 1, instantly_leads: 10 },
      });

      const result = await orchestrator.executeStep("exec-001", 4);

      expect(mockExportRun).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });
  });

  // 5.21 - Dispatch activate
  describe("activate dispatch (Story 17.4 - 5.21)", () => {
    it("dispatches to ActivateStep for step_type activate", async () => {
      const prevStepChain = createChainBuilder({
        data: { output: { externalCampaignId: "camp-123", campaignName: "Test" } },
        error: null,
      });

      const stepsChain = createChainBuilder({
        data: {
          id: "step-5",
          execution_id: "exec-001",
          step_number: 5,
          step_type: "activate",
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

      mockActivateRun.mockResolvedValue({
        success: true,
        data: { externalCampaignId: "camp-123", activated: true },
        cost: { instantly_activate: 1 },
      });

      const result = await orchestrator.executeStep("exec-001", 5);

      expect(mockActivateRun).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });
  });

  // 5.22 - Execution marked as 'completed' after activate (last step)
  describe("execution completion (Story 17.4 - 5.22)", () => {
    it("marks execution as completed when last step succeeds in autopilot mode", async () => {
      // Override execution to autopilot mode
      const autopilotExecution = createChainBuilder({
        data: {
          id: "exec-001",
          tenant_id: "tenant-1",
          user_id: "user-1",
          status: "running",
          mode: "autopilot",
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

      const prevStepChain = createChainBuilder({
        data: { output: { externalCampaignId: "camp-123", campaignName: "Test" } },
        error: null,
      });

      const stepsChain = createChainBuilder({
        data: {
          id: "step-5",
          execution_id: "exec-001",
          step_number: 5,
          step_type: "activate",
          status: "pending",
        },
        error: null,
      });

      // Summary query fetches all steps as array
      const allStepsChain = createChainBuilder({
        data: [
          { step_number: 5, step_type: "activate", status: "completed", output: { activated: true } },
        ],
        error: null,
      });

      let stepsCallCount = 0;
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "agent_executions") return autopilotExecution;
        if (table === "agent_steps") {
          stepsCallCount++;
          if (stepsCallCount === 1) return stepsChain;
          if (stepsCallCount === 2) return prevStepChain;
          if (stepsCallCount === 3) return allStepsChain;
          return createChainBuilder({ data: { id: "step-x" }, error: null });
        }
        if (table === "agent_messages") return mockSupabase.messagesChain;
        return createChainBuilder();
      });

      mockActivateRun.mockResolvedValue({
        success: true,
        data: { activated: true },
        cost: { instantly_activate: 1 },
      });

      await orchestrator.executeStep("exec-001", 5);

      // Verify execution was updated to 'completed'
      expect(autopilotExecution.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "completed",
          completed_at: expect.any(String),
        })
      );
    });

    it("does NOT mark execution as completed for last step in guided mode", async () => {
      // Default mock execution has mode: "guided"
      const prevStepChain = createChainBuilder({
        data: { output: { externalCampaignId: "camp-123", campaignName: "Test" } },
        error: null,
      });

      const stepsChain = createChainBuilder({
        data: {
          id: "step-5",
          execution_id: "exec-001",
          step_number: 5,
          step_type: "activate",
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

      mockActivateRun.mockResolvedValue({
        success: true,
        data: { activated: true },
        cost: { instantly_activate: 1 },
      });

      await orchestrator.executeStep("exec-001", 5);

      // Should NOT mark as completed — guided mode waits for user approval
      const updateCalls = mockSupabase.executionsChain.update.mock.calls;
      const completedCalls = updateCalls.filter(
        (call: unknown[]) => (call[0] as Record<string, unknown>).status === "completed"
      );
      expect(completedCalls).toHaveLength(0);
    });

    it("does NOT mark execution as completed for non-last steps", async () => {
      // Step 1 of 5 — should NOT mark as completed
      await orchestrator.executeStep("exec-001", 1);

      const updateCalls = mockSupabase.executionsChain.update.mock.calls;
      const completedCalls = updateCalls.filter(
        (call: unknown[]) => (call[0] as Record<string, unknown>).status === "completed"
      );
      expect(completedCalls).toHaveLength(0);
    });
  });

  // ==============================================
  // Story 17.5 Tests
  // ==============================================

  // 9.10 - previousStepOutput accepts 'approved' status
  describe("previousStepOutput with approved status (Story 17.5 - 9.10)", () => {
    it("accepts step with status 'approved' as previousStepOutput", async () => {
      const prevStepChain = createChainBuilder({
        data: { output: { companies: [{ domain: "acme.com" }], totalFound: 1 }, status: "approved" },
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

      const result = await orchestrator.executeStep("exec-001", 2);
      expect(result.success).toBe(true);
      expect(mockSearchLeadsRun).toHaveBeenCalled();
    });
  });

  // 9.11 - previousStepOutput with approvedLeads uses filtered leads
  describe("previousStepOutput with approvedLeads (Story 17.5 - 9.11)", () => {
    it("replaces leads with approvedLeads when present", async () => {
      const approvedLeads = [{ name: "Alice", email: "alice@acme.com" }];
      const prevStepChain = createChainBuilder({
        data: {
          output: {
            leads: [
              { name: "Alice", email: "alice@acme.com" },
              { name: "Bob", email: "bob@tech.com" },
            ],
            totalFound: 2,
            approvedLeads,
          },
          status: "approved",
        },
        error: null,
      });

      const stepsChain = createChainBuilder({
        data: {
          id: "step-3",
          execution_id: "exec-001",
          step_number: 3,
          step_type: "create_campaign",
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

      mockCreateCampaignRun.mockResolvedValue({
        success: true,
        data: { campaignName: "Test" },
      });

      await orchestrator.executeStep("exec-001", 3);

      // Verify leads were replaced with approvedLeads
      const runCallArg = mockCreateCampaignRun.mock.calls[0][0];
      expect(runCallArg.previousStepOutput.leads).toEqual(approvedLeads);
      expect(runCallArg.previousStepOutput.totalFound).toBe(1);
    });
  });

  // 9.12 - Orchestrator passes mode in StepInput
  describe("mode in StepInput (Story 17.5 - 9.12)", () => {
    it("passes execution.mode in StepInput", async () => {
      await orchestrator.executeStep("exec-001", 1);

      const runCallArg = mockSearchCompaniesRun.mock.calls[0][0];
      expect(runCallArg.mode).toBe("guided");
    });
  });

  // ==============================================
  // Story 17.6 Tests
  // ==============================================

  // Task 9 - Activation deferred: skip activate step
  describe("activation deferred (Story 17.6 - Task 9)", () => {
    it("skips ActivateStep when previousStepOutput has activationDeferred:true", async () => {
      const prevStepChain = createChainBuilder({
        data: {
          output: {
            externalCampaignId: "camp-123",
            campaignName: "Test Campaign",
            activationDeferred: true,
          },
          status: "approved",
        },
        error: null,
      });

      const stepsChain = createChainBuilder({
        data: {
          id: "step-5",
          execution_id: "exec-001",
          step_number: 5,
          step_type: "activate",
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

      const result = await orchestrator.executeStep("exec-001", 5);

      // ActivateStep.run() should NOT have been called
      expect(mockActivateRun).not.toHaveBeenCalled();
      expect(result.data).toMatchObject({ skipped: true, reason: "activation_deferred" });
    });

    it("marks step as skipped and execution as completed when activation deferred", async () => {
      const prevStepChain = createChainBuilder({
        data: {
          output: {
            externalCampaignId: "camp-123",
            campaignName: "Test Campaign",
            activationDeferred: true,
          },
          status: "approved",
        },
        error: null,
      });

      const stepsChain = createChainBuilder({
        data: {
          id: "step-5",
          execution_id: "exec-001",
          step_number: 5,
          step_type: "activate",
          status: "pending",
        },
        error: null,
      });

      // Track all update calls from agent_steps
      const stepsUpdateChain = createChainBuilder({ data: null, error: null });
      const stepsUpdateFn = vi.fn().mockReturnValue(stepsUpdateChain);

      let stepsCallCount = 0;
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "agent_executions") return mockSupabase.executionsChain;
        if (table === "agent_steps") {
          stepsCallCount++;
          if (stepsCallCount === 1) return stepsChain;
          if (stepsCallCount === 2) return prevStepChain;
          // Third call is the update for marking as skipped
          return { update: stepsUpdateFn };
        }
        if (table === "agent_messages") return mockSupabase.messagesChain;
        return createChainBuilder();
      });

      await orchestrator.executeStep("exec-001", 5);

      // Step marked as skipped
      expect(stepsUpdateFn).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "skipped",
          output: { skipped: true, reason: "activation_deferred" },
        })
      );

      // Execution marked as completed with activationDeferred
      expect(mockSupabase.executionsChain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "completed",
          completed_at: expect.any(String),
          result_summary: { activationDeferred: true },
        })
      );
    });

    it("sends summary message when activation is deferred", async () => {
      const prevStepChain = createChainBuilder({
        data: {
          output: {
            externalCampaignId: "camp-123",
            campaignName: "Test Campaign",
            activationDeferred: true,
          },
          status: "approved",
        },
        error: null,
      });

      const stepsChain = createChainBuilder({
        data: {
          id: "step-5",
          execution_id: "exec-001",
          step_number: 5,
          step_type: "activate",
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

      await orchestrator.executeStep("exec-001", 5);

      // Summary message sent
      expect(mockSupabase.messagesChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining("Ativacao adiada"),
          metadata: expect.objectContaining({ messageType: "summary" }),
        })
      );
    });

    it("keeps activationDeferred logic intact even with empty skipSteps", async () => {
      const prevStepChain = createChainBuilder({
        data: {
          output: {
            externalCampaignId: "camp-123",
            campaignName: "Test Campaign",
            // no activationDeferred flag
          },
          status: "approved",
        },
        error: null,
      });

      const stepsChain = createChainBuilder({
        data: {
          id: "step-5",
          execution_id: "exec-001",
          step_number: 5,
          step_type: "activate",
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

      mockActivateRun.mockResolvedValue({
        success: true,
        data: { activated: true },
        cost: { instantly_activate: 1 },
      });

      await orchestrator.executeStep("exec-001", 5);

      // ActivateStep.run() should have been called
      expect(mockActivateRun).toHaveBeenCalled();
    });
  });

  // ==============================================
  // Story 17.7 Tests
  // ==============================================

  describe("shouldSkip() (Story 17.7 - AC #3)", () => {
    it("returns true when stepType is in briefing.skipSteps", () => {
      const briefing: ParsedBriefing = { ...mockBriefing, skipSteps: ["export", "activate"] };
      expect(orchestrator.shouldSkip("export", briefing)).toBe(true);
      expect(orchestrator.shouldSkip("activate", briefing)).toBe(true);
    });

    it("returns false when stepType is NOT in briefing.skipSteps", () => {
      const briefing: ParsedBriefing = { ...mockBriefing, skipSteps: ["export"] };
      expect(orchestrator.shouldSkip("search_companies", briefing)).toBe(false);
    });

    it("returns false when skipSteps is empty", () => {
      const briefing: ParsedBriefing = { ...mockBriefing, skipSteps: [] };
      expect(orchestrator.shouldSkip("search_companies", briefing)).toBe(false);
    });

    it("returns false when skipSteps is undefined", () => {
      const briefing = { ...mockBriefing, skipSteps: undefined as unknown as string[] };
      expect(orchestrator.shouldSkip("search_companies", briefing)).toBe(false);
    });
  });

  describe("generic skip via briefing.skipSteps (Story 17.7 - Task 1.2)", () => {
    it("skips step and inserts skip message when step in skipSteps", async () => {
      const skipBriefing: ParsedBriefing = { ...mockBriefing, skipSteps: ["search_companies"] };
      const executionWithSkip = createChainBuilder({
        data: {
          id: "exec-001",
          tenant_id: "tenant-1",
          user_id: "user-1",
          status: "running",
          mode: "guided",
          briefing: skipBriefing,
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

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "agent_executions") return executionWithSkip;
        if (table === "agent_steps") return mockSupabase.stepsChain;
        if (table === "agent_messages") return mockSupabase.messagesChain;
        return createChainBuilder();
      });

      const result = await orchestrator.executeStep("exec-001", 1);

      // Step should be skipped — run() NOT called
      expect(mockSearchCompaniesRun).not.toHaveBeenCalled();
      expect(result.data).toMatchObject({ skipped: true, reason: "briefing_skip" });

      // Step marked as skipped in DB
      expect(mockSupabase.stepsChain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "skipped",
          output: { skipped: true, reason: "briefing_skip" },
        })
      );

      // Skip message inserted
      expect(mockSupabase.messagesChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining("pulada"),
          metadata: expect.objectContaining({ messageType: "skip" }),
        })
      );
    });

    it("executes step normally when NOT in skipSteps", async () => {
      // Default mockBriefing has skipSteps: []
      const result = await orchestrator.executeStep("exec-001", 1);

      expect(mockSearchCompaniesRun).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it("skipped step does not break previousStepOutput for next step", async () => {
      // Step 1 was completed, step 2 was skipped, now executing step 3
      // Step 3 should get output from step 1 (last non-skipped)
      const skipBriefing: ParsedBriefing = { ...mockBriefing, skipSteps: [] };
      const executionChain = createChainBuilder({
        data: {
          id: "exec-001",
          tenant_id: "tenant-1",
          user_id: "user-1",
          status: "running",
          mode: "guided",
          briefing: skipBriefing,
          current_step: 3,
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

      // The prev step query now uses lt + order + limit to find last completed/approved
      const prevStepChain = createChainBuilder({
        data: { output: { leads: [{ name: "Alice" }], totalFound: 1 }, status: "completed" },
        error: null,
      });

      const stepsChain = createChainBuilder({
        data: {
          id: "step-3",
          execution_id: "exec-001",
          step_number: 3,
          step_type: "create_campaign",
          status: "pending",
        },
        error: null,
      });

      let stepsCallCount = 0;
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "agent_executions") return executionChain;
        if (table === "agent_steps") {
          stepsCallCount++;
          if (stepsCallCount === 1) return stepsChain;
          if (stepsCallCount === 2) return prevStepChain;
          return createChainBuilder({ data: { id: "step-x" }, error: null });
        }
        if (table === "agent_messages") return mockSupabase.messagesChain;
        return createChainBuilder();
      });

      mockCreateCampaignRun.mockResolvedValue({
        success: true,
        data: { campaignName: "Test" },
      });

      await orchestrator.executeStep("exec-001", 3);

      const runCallArg = mockCreateCampaignRun.mock.calls[0][0];
      expect(runCallArg.previousStepOutput).toEqual({
        leads: [{ name: "Alice" }],
        totalFound: 1,
      });
    });
  });

  describe("autopilot summary message (Story 17.7 - AC #2)", () => {
    it("sends summary message when last step completes in autopilot mode", async () => {
      const autopilotExecution = createChainBuilder({
        data: {
          id: "exec-001",
          tenant_id: "tenant-1",
          user_id: "user-1",
          status: "running",
          mode: "autopilot",
          briefing: mockBriefing,
          current_step: 1,
          total_steps: 1,
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

      // Summary fetches all steps
      const allStepsChain = createChainBuilder({
        data: [
          {
            step_number: 1,
            step_type: "search_companies",
            status: "completed",
            output: { totalFound: 10 },
          },
        ],
        error: null,
      });

      let stepsCallCount = 0;
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "agent_executions") return autopilotExecution;
        if (table === "agent_steps") {
          stepsCallCount++;
          // First call: fetch step record (step 1)
          if (stepsCallCount === 1) return mockSupabase.stepsChain;
          // Second call: sendSummaryMessage fetches all steps
          if (stepsCallCount === 2) return allStepsChain;
          return createChainBuilder({ data: { id: "step-x" }, error: null });
        }
        if (table === "agent_messages") return mockSupabase.messagesChain;
        return createChainBuilder();
      });

      mockSearchCompaniesRun.mockResolvedValue({
        success: true,
        data: { companies: [], totalFound: 10 },
      });

      await orchestrator.executeStep("exec-001", 1);

      // Summary message should be inserted
      expect(mockSupabase.messagesChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining("Pipeline concluido"),
          metadata: expect.objectContaining({ messageType: "summary" }),
        })
      );
    });

    it("does NOT send summary message in guided mode", async () => {
      // Default mock execution is guided, total_steps=5
      // Step 1 of 5 = not last step → no summary regardless
      await orchestrator.executeStep("exec-001", 1);

      const insertCalls = mockSupabase.messagesChain.insert.mock.calls;
      const summaryCalls = insertCalls.filter(
        (call: unknown[]) =>
          (call[0] as Record<string, unknown>).metadata &&
          ((call[0] as Record<string, unknown>).metadata as Record<string, unknown>).messageType === "summary"
      );
      expect(summaryCalls).toHaveLength(0);
    });

    it("includes skipped steps in summary", async () => {
      const autopilotExecution = createChainBuilder({
        data: {
          id: "exec-001",
          tenant_id: "tenant-1",
          user_id: "user-1",
          status: "running",
          mode: "autopilot",
          briefing: mockBriefing,
          current_step: 1,
          total_steps: 1,
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

      const allStepsChain = createChainBuilder({
        data: [
          {
            step_number: 1,
            step_type: "search_companies",
            status: "skipped",
            output: { skipped: true, reason: "briefing_skip" },
          },
        ],
        error: null,
      });

      let stepsCallCount = 0;
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "agent_executions") return autopilotExecution;
        if (table === "agent_steps") {
          stepsCallCount++;
          if (stepsCallCount === 1) return mockSupabase.stepsChain;
          if (stepsCallCount === 2) return allStepsChain;
          return createChainBuilder({ data: { id: "step-x" }, error: null });
        }
        if (table === "agent_messages") return mockSupabase.messagesChain;
        return createChainBuilder();
      });

      mockSearchCompaniesRun.mockResolvedValue({
        success: true,
        data: { companies: [], totalFound: 0 },
      });

      await orchestrator.executeStep("exec-001", 1);

      expect(mockSupabase.messagesChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining("pulada"),
        })
      );
    });
  });
});
