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
      // Story 22.17: espelha o contrato publico do BaseStep.
      requiresPostApproval = () => true;
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
      // Story 22.17: espelha o contrato publico do BaseStep.
      requiresPostApproval = () => true;
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
      // Story 22.17: espelha o contrato publico do BaseStep.
      requiresPostApproval = () => true;
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
      // Story 22.17: espelha o contrato publico do BaseStep.
      requiresPostApproval = () => true;
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
      // Story 22.17: espelha o contrato publico do BaseStep.
      requiresPostApproval = () => false;
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

const mockAddAccountsToCampaign = vi.fn();

vi.mock("@/lib/services/instantly", () => ({
  InstantlyService: class MockInstantlyService {
    addAccountsToCampaign = mockAddAccountsToCampaign;
  },
}));

const mockGetServiceApiKey = vi.fn().mockResolvedValue("decrypted-instantly-key");

vi.mock("@/lib/agent/steps/step-utils", () => ({
  getServiceApiKey: (...args: unknown[]) => mockGetServiceApiKey(...args),
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

    it("does NOT show 'Tente novamente' when the error is non-retryable (Story 22.12 AC5)", async () => {
      // Erro nao-retryable cuja mensagem embute "Tente novamente" (ex.: INTERNAL_ERROR
      // generico do base-service). O texto embutido contradiz o "Entre em contato com
      // o suporte." do retryPart — deve ser sanitizado.
      const pipelineError: PipelineError = {
        code: "STEP_EXECUTION_ERROR",
        message: "Erro interno. Tente novamente.",
        stepNumber: 5,
        stepType: "activate",
        isRetryable: false,
      };
      mockActivateRun.mockRejectedValue(pipelineError);

      const prevStepChain = createChainBuilder({
        data: { output: { externalCampaignId: "camp-123", campaignName: "C" } },
        error: null,
      });
      const stepsChain = createChainBuilder({
        data: { id: "step-5", execution_id: "exec-001", step_number: 5, step_type: "activate", status: "pending" },
        error: null,
      });
      let stepsCallCount = 0;
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "agent_executions") return mockSupabase.executionsChain;
        if (table === "agent_steps") {
          stepsCallCount++;
          if (stepsCallCount === 1) return stepsChain;
          if (stepsCallCount === 2) return prevStepChain;
          // Story 22.17: a 3a leitura de agent_steps e o sendSummaryMessage (o activate
          // guiado agora FECHA a execucao) — precisa devolver um array.
          return createChainBuilder({ data: [], error: null });
        }
        if (table === "agent_messages") return mockSupabase.messagesChain;
        return createChainBuilder();
      });

      await expect(orchestrator.executeStep("exec-001", 5)).rejects.toBeDefined();

      const errorInsert = mockSupabase.messagesChain.insert.mock.calls
        .map((c: unknown[]) => c[0] as Record<string, unknown>)
        .find((m) => (m.metadata as Record<string, unknown>)?.messageType === "error");
      expect(errorInsert).toBeDefined();
      const content = errorInsert!.content as string;
      // coerencia: nao-retryable -> sem "tente novamente", com "Entre em contato com o suporte."
      expect(content.toLowerCase()).not.toContain("tente novamente");
      expect(content).toContain("Entre em contato com o suporte.");
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
          // Story 22.17: a 3a leitura de agent_steps e o sendSummaryMessage (o activate
          // guiado agora FECHA a execucao) — precisa devolver um array.
          return createChainBuilder({ data: [], error: null });
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
          // Story 22.17: a 3a leitura de agent_steps e o sendSummaryMessage (o activate
          // guiado agora FECHA a execucao) — precisa devolver um array.
          return createChainBuilder({ data: [], error: null });
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
          // Story 22.17: a 3a leitura de agent_steps e o sendSummaryMessage (o activate
          // guiado agora FECHA a execucao) — precisa devolver um array.
          return createChainBuilder({ data: [], error: null });
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

      // Story 17.10: 3rd call checks if all prev are skipped — return pending (not all skipped)
      const allPrevNotSkippedChain = createChainBuilder({
        data: [{ status: "pending" }],
        error: null,
      });

      let stepsCallCount = 0;
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "agent_executions") return mockSupabase.executionsChain;
        if (table === "agent_steps") {
          stepsCallCount++;
          if (stepsCallCount === 1) return stepsChain;
          if (stepsCallCount === 2) return prevStepChain;
          if (stepsCallCount === 3) return allPrevNotSkippedChain;
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
          // Story 22.17: a 3a leitura de agent_steps e o sendSummaryMessage (o activate
          // guiado agora FECHA a execucao) — precisa devolver um array.
          return createChainBuilder({ data: [], error: null });
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
          // Story 22.17: a 3a leitura de agent_steps e o sendSummaryMessage (o activate
          // guiado agora FECHA a execucao) — precisa devolver um array.
          return createChainBuilder({ data: [], error: null });
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

    /**
     * Story 22.17 (AC2): ANTES desta story este teste afirmava o BUG — "guided nunca
     * completa no ultimo step". A execucao ficava `running` para sempre depois de uma
     * ativacao REAL bem-sucedida no Instantly. A aprovacao do activate e EX-ANTE (o
     * clique em "Ativar Campanha" no gate do export), entao o ultimo step guiado que
     * nao exige post-approval FECHA a execucao, igual ao autopilot.
     */
    it("marks execution as completed when the last GUIDED step needs no post-approval (Story 22.17 AC2)", async () => {
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

      const allStepsChain = createChainBuilder({
        data: [
          { step_number: 5, step_type: "activate", status: "completed", output: { activated: true } },
        ],
        error: null,
      });

      let stepsCallCount = 0;
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "agent_executions") return mockSupabase.executionsChain;
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

      expect(mockSupabase.executionsChain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "completed",
          completed_at: expect.any(String),
        })
      );
      // CAS da 22.10 preservado — um cancel concorrente continua prevalecendo.
      expect(mockSupabase.executionsChain.neq).toHaveBeenCalledWith("status", "cancelled");
      // Resumo final do pipeline (o mesmo do autopilot) chega ao chat.
      expect(mockSupabase.messagesChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining("Pipeline concluido"),
          metadata: expect.objectContaining({ messageType: "summary" }),
        })
      );
    });

    /**
     * Story 22.17 (code review): o supabase-js NAO lanca em erro de query — devolve
     * `{ error }`. Sem checar, uma falha na escrita de `completed` passava batida e o
     * "Pipeline concluido com sucesso!" ia para o chat de uma execucao que continuou
     * `running`. O irmao do ramo defer (22.12) ja levantava ORCHESTRATOR_COMPLETION_FAILED.
     */
    it("levanta ORCHESTRATOR_COMPLETION_FAILED e nao manda resumo quando a escrita de completed falha (Story 22.17 review)", async () => {
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

      const failingCompletion = createChainBuilder({
        data: null,
        error: { message: "permission denied for table agent_executions" },
      });
      const pausedChain = createChainBuilder({ data: null, error: null });

      let execCallCount = 0;
      let stepsCallCount = 0;
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "agent_executions") {
          execCallCount++;
          // 1: fetch da execucao | 2: escrita de completed (falha) | 3+: paused
          if (execCallCount === 1) return mockSupabase.executionsChain;
          if (execCallCount === 2) return failingCompletion;
          return pausedChain;
        }
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

      await expect(orchestrator.executeStep("exec-001", 5)).rejects.toMatchObject({
        code: "ORCHESTRATOR_COMPLETION_FAILED",
      });

      // Nenhum "Pipeline concluido com sucesso!" sobre uma execucao que nao completou.
      const summaryInserts = mockSupabase.messagesChain.insert.mock.calls
        .map((call: unknown[]) => call[0] as Record<string, unknown>)
        .filter(
          (arg) =>
            typeof arg.content === "string" &&
            (arg.content as string).includes("Pipeline concluido")
        );
      expect(summaryInserts).toHaveLength(0);

      // Caminho de erro padrao do orchestrator: 'paused', NUNCA 'failed' direto.
      expect(pausedChain.update).toHaveBeenCalledWith(
        expect.objectContaining({ status: "paused" })
      );
    });

    it("does NOT mark execution as completed when the last guided step DOES need post-approval (Story 22.17 AC5)", async () => {
      // Default mock execution has mode: "guided"
      const prevStepChain = createChainBuilder({
        data: { output: { campaignId: "camp-1", campaignName: "Test" } },
        error: null,
      });

      const stepsChain = createChainBuilder({
        data: {
          id: "step-5",
          execution_id: "exec-001",
          step_number: 5,
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
          // Story 22.17: a 3a leitura de agent_steps e o sendSummaryMessage (o activate
          // guiado agora FECHA a execucao) — precisa devolver um array.
          return createChainBuilder({ data: [], error: null });
        }
        if (table === "agent_messages") return mockSupabase.messagesChain;
        return createChainBuilder();
      });

      mockExportRun.mockResolvedValue({
        success: true,
        data: { externalCampaignId: "camp-ext", leadsUploaded: 3 },
      });

      await orchestrator.executeStep("exec-001", 5);

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
          // Story 22.17: a 3a leitura de agent_steps e o sendSummaryMessage (o activate
          // guiado agora FECHA a execucao) — precisa devolver um array.
          return createChainBuilder({ data: [], error: null });
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
          // Story 22.17: a 3a leitura de agent_steps e o sendSummaryMessage (o activate
          // guiado agora FECHA a execucao) — precisa devolver um array.
          return createChainBuilder({ data: [], error: null });
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
          // Story 22.17: a 3a leitura de agent_steps e o sendSummaryMessage (o activate
          // guiado agora FECHA a execucao) — precisa devolver um array.
          return createChainBuilder({ data: [], error: null });
        }
        if (table === "agent_messages") return mockSupabase.messagesChain;
        return createChainBuilder();
      });

      const result = await orchestrator.executeStep("exec-001", 5);

      // ActivateStep.run() should NOT have been called
      expect(mockActivateRun).not.toHaveBeenCalled();
      expect(result.data).toMatchObject({ skipped: true, reason: "activation_deferred" });
    });

    // ==============================================
    // Story 22.18 (code review, D1): carimbo `deferred` mora AQUI, nao no approve
    // ==============================================
    //
    // A AC3 mandava carimbar no `approve`, sob o argumento de que "ali o approve E a acao
    // completa". Falso: anexar contas, pular o step e concluir a execucao e tudo o que
    // acontece NESTE ramo, disparado pelo `execute` — o approve responde antes. Carimbado
    // la, um `execute` que falhasse deixava o card desabilitado sobre um step ainda
    // `pending`, com a retomada da AC2 inalcancavel atras dele.
    it("D1: carimba activationOutcome='deferred' no gate do export DEPOIS de concluir", async () => {
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

      // O gate do export precisa existir para o helper achar o que carimbar.
      const gateChain = createChainBuilder({
        data: [
          {
            id: "gate-msg-1",
            metadata: {
              messageType: "approval_gate",
              stepNumber: 4,
              approvalData: { stepType: "export" },
            },
          },
        ],
        error: null,
      });

      let stepsCallCount = 0;
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "agent_executions") return mockSupabase.executionsChain;
        if (table === "agent_steps") {
          stepsCallCount++;
          if (stepsCallCount === 1) return stepsChain;
          if (stepsCallCount === 2) return prevStepChain;
          return createChainBuilder({ data: [], error: null });
        }
        if (table === "agent_messages") return gateChain;
        return createChainBuilder();
      });

      await orchestrator.executeStep("exec-001", 5);

      const stamped = gateChain.update.mock.calls
        .map((call: unknown[]) => call[0] as Record<string, unknown>)
        .some(
          (arg) =>
            (arg.metadata as Record<string, unknown> | undefined)?.activationOutcome ===
            "deferred"
        );
      expect(stamped).toBe(true);
    });

    // Guardrail invertido do D1: o carimbo e auditoria — nao pode derrubar um defer que
    // deu certo (mesmo fail-open dos outros carimbos desta story).
    it("D1: falha no carimbo NAO transforma um defer bem-sucedido em erro (fail-open)", async () => {
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

      const gateChain = createChainBuilder({
        data: [
          {
            id: "gate-msg-1",
            metadata: {
              messageType: "approval_gate",
              stepNumber: 4,
              approvalData: { stepType: "export" },
            },
          },
        ],
        error: null,
      });
      gateChain.update = vi.fn().mockImplementation(() => {
        throw new Error("boom");
      });

      let stepsCallCount = 0;
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "agent_executions") return mockSupabase.executionsChain;
        if (table === "agent_steps") {
          stepsCallCount++;
          if (stepsCallCount === 1) return stepsChain;
          if (stepsCallCount === 2) return prevStepChain;
          return createChainBuilder({ data: [], error: null });
        }
        if (table === "agent_messages") return gateChain;
        return createChainBuilder();
      });

      const result = await orchestrator.executeStep("exec-001", 5);

      expect(result.success).toBe(true);
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
          // Story 22.17: a 3a leitura de agent_steps e o sendSummaryMessage (o activate
          // guiado agora FECHA a execucao) — precisa devolver um array.
          return createChainBuilder({ data: [], error: null });
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

    it("calls addAccountsToCampaign with selectedAccounts before skipping (Story 17.9)", async () => {
      mockAddAccountsToCampaign.mockResolvedValue({ success: true, accountsAdded: 1 });

      const prevStepChain = createChainBuilder({
        data: {
          output: {
            externalCampaignId: "camp-123",
            campaignName: "Test Campaign",
            activationDeferred: true,
            selectedAccounts: ["sender1@company.com"],
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
          // Story 22.17: a 3a leitura de agent_steps e o sendSummaryMessage (o activate
          // guiado agora FECHA a execucao) — precisa devolver um array.
          return createChainBuilder({ data: [], error: null });
        }
        if (table === "agent_messages") return mockSupabase.messagesChain;
        return createChainBuilder();
      });

      await orchestrator.executeStep("exec-001", 5);

      // addAccountsToCampaign called with selected accounts
      expect(mockAddAccountsToCampaign).toHaveBeenCalledWith({
        apiKey: "decrypted-instantly-key",
        campaignId: "camp-123",
        accountEmails: ["sender1@company.com"],
      });

      // ActivateStep.run() should NOT have been called (still skipped)
      expect(mockActivateRun).not.toHaveBeenCalled();
    });

    it("degrades gracefully when addAccountsToCampaign fails in defer path (Story 22.12 AC3)", async () => {
      // Attach falha (ex.: o 404 real) — a etapa NAO deve falhar; o defer conclui.
      mockAddAccountsToCampaign.mockRejectedValue(new Error("attach boom"));

      const prevStepChain = createChainBuilder({
        data: {
          output: {
            externalCampaignId: "camp-123",
            campaignName: "Test Campaign",
            activationDeferred: true,
            selectedAccounts: ["sender1@company.com"],
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

      const stepsUpdateChain = createChainBuilder({ data: null, error: null });
      const stepsUpdateFn = vi.fn().mockReturnValue(stepsUpdateChain);

      let stepsCallCount = 0;
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "agent_executions") return mockSupabase.executionsChain;
        if (table === "agent_steps") {
          stepsCallCount++;
          if (stepsCallCount === 1) return stepsChain;
          if (stepsCallCount === 2) return prevStepChain;
          return { update: stepsUpdateFn };
        }
        if (table === "agent_messages") return mockSupabase.messagesChain;
        return createChainBuilder();
      });

      const result = await orchestrator.executeStep("exec-001", 5);

      // Etapa NAO falha: skip conclui, execucao completa (nao paused)
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        skipped: true,
        reason: "activation_deferred",
        accountsAttachFailed: true,
      });

      // step skipped carrega a flag
      expect(stepsUpdateFn).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "skipped",
          output: expect.objectContaining({ accountsAttachFailed: true }),
        })
      );

      // execucao completada com a flag no result_summary
      expect(mockSupabase.executionsChain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "completed",
          result_summary: expect.objectContaining({
            activationDeferred: true,
            accountsAttachFailed: true,
          }),
        })
      );

      // mensagem-resumo avisa que as contas NAO foram anexadas
      const insertCalls = mockSupabase.messagesChain.insert.mock.calls;
      const warned = insertCalls.some((c: unknown[]) => {
        const content = (c[0] as Record<string, unknown>).content;
        return typeof content === "string" && content.toLowerCase().includes("anexar");
      });
      expect(warned).toBe(true);

      // NUNCA marca paused nesse caminho
      const statusUpdates = mockSupabase.executionsChain.update.mock.calls.map(
        (call: unknown[]) => (call[0] as Record<string, unknown>).status
      );
      expect(statusUpdates).not.toContain("paused");
    });

    it("does NOT call addAccountsToCampaign when no selectedAccounts in deferred output", async () => {
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
          // Story 22.17: a 3a leitura de agent_steps e o sendSummaryMessage (o activate
          // guiado agora FECHA a execucao) — precisa devolver um array.
          return createChainBuilder({ data: [], error: null });
        }
        if (table === "agent_messages") return mockSupabase.messagesChain;
        return createChainBuilder();
      });

      await orchestrator.executeStep("exec-001", 5);

      expect(mockAddAccountsToCampaign).not.toHaveBeenCalled();
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
          // Story 22.17: a 3a leitura de agent_steps e o sendSummaryMessage (o activate
          // guiado agora FECHA a execucao) — precisa devolver um array.
          return createChainBuilder({ data: [], error: null });
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
          // Story 22.17: a 3a leitura de agent_steps e o sendSummaryMessage (o activate
          // guiado agora FECHA a execucao) — precisa devolver um array.
          return createChainBuilder({ data: [], error: null });
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

    /**
     * Story 22.17 (code review): a AC4 matou o "com 1 leads" do activate, mas a AC2 fez
     * ESTE resumo aparecer no guiado pela primeira vez — com os mesmos plurais cravados,
     * uma bolha abaixo da string corrigida. No cenario do smoke (1 lead) o usuario lia
     * "ativa no Instantly com 1 lead" seguido de "exportada para Instantly com 1 leads".
     */
    it("pluraliza o resumo final — 1 lead / 1 contato / 1 email no singular (Story 22.17 review)", async () => {
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
          { step_number: 1, step_type: "search_companies", status: "completed", output: { totalFound: 1 } },
          { step_number: 2, step_type: "search_leads", status: "completed", output: { totalFound: 1 } },
          {
            step_number: 3,
            step_type: "create_campaign",
            status: "completed",
            output: { campaignName: "Campanha X", structure: { totalEmails: 1 } },
          },
          { step_number: 4, step_type: "export", status: "completed", output: { leadsUploaded: 1 } },
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
        data: { companies: [], totalFound: 1 },
      });

      await orchestrator.executeStep("exec-001", 1);

      const summaryInsert = mockSupabase.messagesChain.insert.mock.calls
        .map((call: unknown[]) => call[0] as Record<string, unknown>)
        .find(
          (arg) =>
            (arg.metadata as Record<string, unknown> | undefined)?.messageType === "summary"
        );
      const content = summaryInsert?.content as string;

      expect(content).toContain("1 encontrada via TheirStack");
      expect(content).toContain("1 contato encontrado via Apollo");
      expect(content).toContain("criada com 1 email na sequencia");
      expect(content).toContain("com 1 lead");
      // O defeito exato que a AC4 mata — em nenhuma das linhas.
      expect(content).not.toContain("1 leads");
      expect(content).not.toContain("1 contatos");
      expect(content).not.toContain("1 emails");
      expect(content).not.toContain("1 encontradas");
    });

    it("mantem o plural quando ha mais de um (Story 22.17 review)", async () => {
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
          { step_number: 1, step_type: "export", status: "completed", output: { leadsUploaded: 7 } },
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

      mockSearchCompaniesRun.mockResolvedValue({ success: true, data: { totalFound: 7 } });

      await orchestrator.executeStep("exec-001", 1);

      const summaryInsert = mockSupabase.messagesChain.insert.mock.calls
        .map((call: unknown[]) => call[0] as Record<string, unknown>)
        .find(
          (arg) =>
            (arg.metadata as Record<string, unknown> | undefined)?.messageType === "summary"
        );
      expect(summaryInsert?.content as string).toContain("com 7 leads");
    });

    // Story 22.17 (code review): o titulo antigo era "does NOT send summary message in
    // guided mode" — regra que a 22.17 DELETOU (o guiado passa a mandar resumo quando o
    // ultimo step nao exige post-approval). O corpo sempre foi sobre step intermediario.
    it("does NOT send summary message for a non-last step in guided mode", async () => {
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

  describe("all previous steps skipped — direct entry (Story 17.10 - Task 3)", () => {
    it("allows step execution with previousStepOutput=undefined when all prev steps are skipped", async () => {
      const skipBriefing: ParsedBriefing = { ...mockBriefing, technology: null, skipSteps: ["search_companies"] };
      const executionChain = createChainBuilder({
        data: {
          id: "exec-001",
          tenant_id: "tenant-1",
          user_id: "user-1",
          status: "running",
          mode: "guided",
          briefing: skipBriefing,
          current_step: 2,
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

      // Step 2 record (search_leads)
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

      // Previous step query returns null (no completed/approved steps)
      const prevStepChain = createChainBuilder({
        data: null,
        error: null,
      });

      // All-previous-steps query returns all skipped
      const allPrevStepsChain = createChainBuilder({
        data: [{ status: "skipped" }],
        error: null,
      });

      let stepsCallCount = 0;
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "agent_executions") return executionChain;
        if (table === "agent_steps") {
          stepsCallCount++;
          if (stepsCallCount === 1) return stepsChain;       // fetch step record
          if (stepsCallCount === 2) return prevStepChain;     // prev completed/approved
          if (stepsCallCount === 3) return allPrevStepsChain; // all prev check
          return createChainBuilder({ data: { id: "step-x" }, error: null });
        }
        if (table === "agent_messages") return mockSupabase.messagesChain;
        return createChainBuilder();
      });

      mockSearchLeadsRun.mockResolvedValue({
        success: true,
        data: { leads: [], totalFound: 0, jobTitles: ["CTO"], domainsSearched: [] },
      });

      const result = await orchestrator.executeStep("exec-001", 2);

      expect(result.success).toBe(true);
      expect(mockSearchLeadsRun).toHaveBeenCalled();
      // previousStepOutput should be undefined
      const runCallArg = mockSearchLeadsRun.mock.calls[0][0];
      expect(runCallArg.previousStepOutput).toBeUndefined();
    });

    it("still throws ORCHESTRATOR_STEP_NOT_READY when prev steps are not all skipped", async () => {
      const executionChain = createChainBuilder({
        data: {
          id: "exec-001",
          tenant_id: "tenant-1",
          user_id: "user-1",
          status: "running",
          mode: "guided",
          briefing: mockBriefing,
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

      const prevStepChain = createChainBuilder({
        data: null,
        error: null,
      });

      // Mix of skipped and pending — NOT all skipped
      const allPrevStepsChain = createChainBuilder({
        data: [{ status: "skipped" }, { status: "pending" }],
        error: null,
      });

      let stepsCallCount = 0;
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "agent_executions") return executionChain;
        if (table === "agent_steps") {
          stepsCallCount++;
          if (stepsCallCount === 1) return stepsChain;
          if (stepsCallCount === 2) return prevStepChain;
          if (stepsCallCount === 3) return allPrevStepsChain;
          return createChainBuilder({ data: { id: "step-x" }, error: null });
        }
        if (table === "agent_messages") return mockSupabase.messagesChain;
        return createChainBuilder();
      });

      await expect(orchestrator.executeStep("exec-001", 3)).rejects.toMatchObject({
        code: "ORCHESTRATOR_STEP_NOT_READY",
      });
    });
  });
});
