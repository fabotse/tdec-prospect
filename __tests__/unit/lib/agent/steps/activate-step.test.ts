/**
 * Unit Tests for ActivateStep
 * Story 17.4 - AC: #3, #4
 *
 * Tests: happy path, input validation, API key missing,
 * Instantly API errors, confirmation message, cost calculation
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { ActivateStep } from "@/lib/agent/steps/activate-step";
import { createChainBuilder } from "../../../../helpers/mock-supabase";
import type { StepInput } from "@/types/agent";
import { ExternalServiceError } from "@/lib/services/base-service";

// ==============================================
// MOCKS
// ==============================================

const mockActivateCampaign = vi.fn();
const mockAddAccountsToCampaign = vi.fn();

vi.mock("@/lib/services/instantly", () => ({
  InstantlyService: class MockInstantlyService {
    activateCampaign = mockActivateCampaign;
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

const TENANT_ID = "tenant-001";
const EXECUTION_ID = "exec-001";

const defaultBriefing = {
  technology: "React",
  jobTitles: ["CTO"],
  location: "Brasil",
  companySize: "50-200",
  industry: "saas",
  productSlug: null,
  mode: "guided" as const,
  skipSteps: [],
};

function createPreviousStepOutput() {
  return {
    externalCampaignId: "instantly-camp-123",
    campaignName: "Campanha React Outbound",
    leadsUploaded: 15,
    duplicatedLeads: 0,
    invalidEmails: 0,
    accountsAdded: 2,
    platform: "instantly",
  };
}

function createMockSupabase(apiConfigData: unknown = { encrypted_key: "enc-key" }) {
  const apiConfigsChain = createChainBuilder({
    data: apiConfigData,
    error: null,
  });

  const messagesChain = createChainBuilder({ data: { id: "msg-1" }, error: null });
  const stepsChain = createChainBuilder({ data: { id: "step-5" }, error: null });

  const mockFrom = vi.fn().mockImplementation((table: string) => {
    if (table === "api_configs") return apiConfigsChain;
    if (table === "agent_messages") return messagesChain;
    if (table === "agent_steps") return stepsChain;
    return createChainBuilder();
  });

  return { from: mockFrom, apiConfigsChain, messagesChain, stepsChain };
}

function createDefaultInput(previousStepOutput?: Record<string, unknown>): StepInput {
  return {
    executionId: EXECUTION_ID,
    briefing: defaultBriefing,
    previousStepOutput: previousStepOutput ?? createPreviousStepOutput() as unknown as Record<string, unknown>,
  };
}

// ==============================================
// TESTS
// ==============================================

describe("ActivateStep (Story 17.4 AC #3, #4)", () => {
  let mockSupabase: ReturnType<typeof createMockSupabase>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase = createMockSupabase();
    mockActivateCampaign.mockResolvedValue({ success: true });
    mockAddAccountsToCampaign.mockResolvedValue({ success: true, accountsAdded: 2 });
  });

  // 5.14 - Happy path
  describe("happy path", () => {
    it("activates campaign and returns output with activated: true", async () => {
      const step = new ActivateStep(5, mockSupabase as never, TENANT_ID);
      const input = createDefaultInput();

      const result = await step.run(input);

      expect(result.success).toBe(true);

      const data = result.data as Record<string, unknown>;
      expect(data.externalCampaignId).toBe("instantly-camp-123");
      expect(data.campaignName).toBe("Campanha React Outbound");
      expect(data.activated).toBe(true);
      expect(data.activatedAt).toBeDefined();
      expect(typeof data.activatedAt).toBe("string");
    });

    it("calls activateCampaign with correct params", async () => {
      const step = new ActivateStep(5, mockSupabase as never, TENANT_ID);
      const input = createDefaultInput();

      await step.run(input);

      expect(mockActivateCampaign).toHaveBeenCalledWith({
        apiKey: "decrypted-instantly-key",
        campaignId: "instantly-camp-123",
      });
    });
  });

  // 5.15 - Input validation: no externalCampaignId
  describe("input validation", () => {
    it("throws when previousStepOutput is missing", async () => {
      const step = new ActivateStep(5, mockSupabase as never, TENANT_ID);
      const input: StepInput = {
        executionId: EXECUTION_ID,
        briefing: defaultBriefing,
        previousStepOutput: undefined,
      };

      await expect(step.run(input)).rejects.toMatchObject({
        code: "STEP_EXECUTION_ERROR",
        message: "Output do step anterior e obrigatorio para ativacao",
        isRetryable: false,
      });
    });

    it("throws when externalCampaignId is missing", async () => {
      const step = new ActivateStep(5, mockSupabase as never, TENANT_ID);
      const prevOutput = createPreviousStepOutput();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (prevOutput as any).externalCampaignId;
      const input = createDefaultInput(prevOutput as unknown as Record<string, unknown>);

      await expect(step.run(input)).rejects.toMatchObject({
        code: "STEP_EXECUTION_ERROR",
        message: "externalCampaignId e obrigatorio no output do step anterior",
        isRetryable: false,
      });
    });

    it("throws when campaignName is missing", async () => {
      const step = new ActivateStep(5, mockSupabase as never, TENANT_ID);
      const prevOutput = createPreviousStepOutput();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (prevOutput as any).campaignName;
      const input = createDefaultInput(prevOutput as unknown as Record<string, unknown>);

      await expect(step.run(input)).rejects.toMatchObject({
        code: "STEP_EXECUTION_ERROR",
        message: "campaignName e obrigatorio no output do step anterior",
        isRetryable: false,
      });
    });
  });

  // 5.16 - Instantly API error -> retryable
  describe("Instantly API errors", () => {
    it("maps Instantly API error to retryable PipelineError", async () => {
      mockActivateCampaign.mockRejectedValue(
        new ExternalServiceError("instantly", 502, "Bad gateway")
      );

      const step = new ActivateStep(5, mockSupabase as never, TENANT_ID);
      const input = createDefaultInput();

      await expect(step.run(input)).rejects.toMatchObject({
        code: "STEP_ACTIVATE_ERROR",
        isRetryable: true,
        externalService: "instantly",
      });
    });
  });

  // 5.17 - API key not configured
  describe("API key errors", () => {
    it("throws terminal error when Instantly API key not configured", async () => {
      mockGetServiceApiKey.mockRejectedValueOnce(
        new Error("API key do Instantly nao configurada")
      );
      const step = new ActivateStep(5, mockSupabase as never, TENANT_ID);
      const input = createDefaultInput();

      await expect(step.run(input)).rejects.toMatchObject({
        code: "STEP_EXECUTION_ERROR",
        message: "API key do Instantly nao configurada",
        isRetryable: false,
      });
    });
  });

  // 5.18 - Confirmation message sent
  describe("confirmation message", () => {
    it("sends confirmation message to agent_messages", async () => {
      const step = new ActivateStep(5, mockSupabase as never, TENANT_ID);
      const input = createDefaultInput();

      await step.run(input);

      // Should insert two messages: progress + confirmation
      const insertCalls = mockSupabase.messagesChain.insert.mock.calls;
      const messages = insertCalls.map((call: unknown[]) => call[0] as Record<string, unknown>);

      const progressMsg = messages.find(
        (m) => (m.content as string).includes("Ativando campanha")
      );
      expect(progressMsg).toBeDefined();
      expect(progressMsg?.role).toBe("system");

      const confirmMsg = messages.find(
        (m) => (m.content as string).includes("ativa no Instantly com 15 leads")
      );
      expect(confirmMsg).toBeDefined();
      expect(confirmMsg?.role).toBe("agent");
      expect(confirmMsg?.content).toBe(
        "Campanha 'Campanha React Outbound' ativa no Instantly com 15 leads"
      );
    });
  });

  // ==============================================
  // Story 22.17
  // ==============================================

  describe("Story 22.17 - pluralizacao (AC4)", () => {
    it("diz 'com 1 lead' no singular", async () => {
      const step = new ActivateStep(5, mockSupabase as never, TENANT_ID);
      const input = createDefaultInput({
        ...(createPreviousStepOutput() as unknown as Record<string, unknown>),
        leadsUploaded: 1,
      });

      await step.run(input);

      const contents = mockSupabase.messagesChain.insert.mock.calls.map(
        (call: unknown[]) => String((call[0] as Record<string, unknown>).content)
      );
      expect(contents).toContain(
        "Campanha 'Campanha React Outbound' ativa no Instantly com 1 lead"
      );
    });

    it("diz 'com N leads' no plural (e 0 leads)", async () => {
      const step = new ActivateStep(5, mockSupabase as never, TENANT_ID);

      await step.run(createDefaultInput());
      const contents = mockSupabase.messagesChain.insert.mock.calls.map(
        (call: unknown[]) => String((call[0] as Record<string, unknown>).content)
      );
      expect(contents).toContain(
        "Campanha 'Campanha React Outbound' ativa no Instantly com 15 leads"
      );

      vi.clearAllMocks();
      mockSupabase = createMockSupabase();
      mockActivateCampaign.mockResolvedValue({ success: true });
      const zeroStep = new ActivateStep(5, mockSupabase as never, TENANT_ID);
      await zeroStep.run(
        createDefaultInput({
          ...(createPreviousStepOutput() as unknown as Record<string, unknown>),
          leadsUploaded: 0,
          selectedAccounts: undefined,
        })
      );
      const zeroContents = mockSupabase.messagesChain.insert.mock.calls.map(
        (call: unknown[]) => String((call[0] as Record<string, unknown>).content)
      );
      expect(zeroContents).toContain(
        "Campanha 'Campanha React Outbound' ativa no Instantly com 0 leads"
      );
    });
  });

  describe("Story 22.17 - aprovacao ex-ante (AC2)", () => {
    it("nao exige post-approval (a aprovacao foi no gate de ativacao)", () => {
      const step = new ActivateStep(5, mockSupabase as never, TENANT_ID);
      expect(step.requiresPostApproval()).toBe(false);
    });

    it("em modo guiado conclui o step e NAO abre um novo gate", async () => {
      const step = new ActivateStep(5, mockSupabase as never, TENANT_ID);
      const input = { ...createDefaultInput(), mode: "guided" as const };

      await step.run(input);

      const statuses = mockSupabase.stepsChain.update.mock.calls.map(
        (call: unknown[]) => (call[0] as Record<string, unknown>).status
      );
      expect(statuses).toContain("completed");
      expect(statuses).not.toContain("awaiting_approval");

      const gateInsert = mockSupabase.messagesChain.insert.mock.calls
        .map((call: unknown[]) => call[0] as Record<string, unknown>)
        .find(
          (arg) =>
            (arg.metadata as Record<string, unknown> | undefined)?.messageType ===
            "approval_gate"
        );
      expect(gateInsert).toBeUndefined();
    });
  });

  // 5.19 - Cost calculated correctly
  describe("cost calculation", () => {
    it("calculates cost correctly", async () => {
      const step = new ActivateStep(5, mockSupabase as never, TENANT_ID);
      const input = createDefaultInput();

      const result = await step.run(input);

      expect(result.cost).toEqual({
        instantly_activate: 1,
      });
    });
  });

  // ==============================================
  // Story 17.9: selectedAccounts handling
  // ==============================================

  describe("Story 17.9 - selectedAccounts", () => {
    it("calls addAccountsToCampaign with selectedAccounts before activating (AC #2)", async () => {
      const step = new ActivateStep(5, mockSupabase as never, TENANT_ID);
      const prevOutput = {
        ...createPreviousStepOutput(),
        selectedAccounts: ["sender1@company.com", "sender2@company.com"],
      };
      const input = createDefaultInput(prevOutput as unknown as Record<string, unknown>);

      await step.run(input);

      expect(mockAddAccountsToCampaign).toHaveBeenCalledWith({
        apiKey: "decrypted-instantly-key",
        campaignId: "instantly-camp-123",
        accountEmails: ["sender1@company.com", "sender2@company.com"],
      });
      // addAccountsToCampaign called BEFORE activateCampaign
      const addOrder = mockAddAccountsToCampaign.mock.invocationCallOrder[0];
      const activateOrder = mockActivateCampaign.mock.invocationCallOrder[0];
      expect(addOrder).toBeLessThan(activateOrder);
    });

    it("does NOT call addAccountsToCampaign when selectedAccounts is absent (autopilot, AC #3)", async () => {
      const step = new ActivateStep(5, mockSupabase as never, TENANT_ID);
      const input = createDefaultInput();

      await step.run(input);

      expect(mockAddAccountsToCampaign).not.toHaveBeenCalled();
      expect(mockActivateCampaign).toHaveBeenCalled();
    });

    it("does NOT call addAccountsToCampaign when selectedAccounts is empty", async () => {
      const step = new ActivateStep(5, mockSupabase as never, TENANT_ID);
      const prevOutput = {
        ...createPreviousStepOutput(),
        selectedAccounts: [],
      };
      const input = createDefaultInput(prevOutput as unknown as Record<string, unknown>);

      await step.run(input);

      expect(mockAddAccountsToCampaign).not.toHaveBeenCalled();
    });
  });

  // ==============================================
  // Story 22.12: attach de contas na ativacao real FALHA-RAPIDO com msg especifica
  // ==============================================

  describe("Story 22.12 - attach failure on real activation (AC #4, #5)", () => {
    it("blocks activation with a SPECIFIC message when attach fails (not 'Erro interno')", async () => {
      mockAddAccountsToCampaign.mockRejectedValue(
        new ExternalServiceError("instantly", 404, "Erro interno. Tente novamente.")
      );

      const step = new ActivateStep(5, mockSupabase as never, TENANT_ID);
      const prevOutput = {
        ...createPreviousStepOutput(),
        selectedAccounts: ["sender1@company.com"],
      };
      const input = createDefaultInput(prevOutput as unknown as Record<string, unknown>);

      await expect(step.run(input)).rejects.toMatchObject({
        message: expect.stringContaining("anexar as contas de envio"),
      });

      // fail-fast: ativar sem conta = campanha inerte -> NAO ativa
      expect(mockActivateCampaign).not.toHaveBeenCalled();
    });

    it("does not leak the generic 'Erro interno. Tente novamente.' message on attach failure", async () => {
      mockAddAccountsToCampaign.mockRejectedValue(
        new ExternalServiceError("instantly", 404, "Erro interno. Tente novamente.")
      );

      const step = new ActivateStep(5, mockSupabase as never, TENANT_ID);
      const prevOutput = {
        ...createPreviousStepOutput(),
        selectedAccounts: ["sender1@company.com"],
      };
      const input = createDefaultInput(prevOutput as unknown as Record<string, unknown>);

      let caught: unknown;
      try {
        await step.run(input);
      } catch (e) {
        caught = e;
      }
      const message = (caught as { message: string }).message;
      expect(message).not.toContain("Erro interno");
    });

    it("preserves retryability of the underlying attach error (502 -> retryable)", async () => {
      mockAddAccountsToCampaign.mockRejectedValue(
        new ExternalServiceError("instantly", 502, "Bad gateway")
      );

      const step = new ActivateStep(5, mockSupabase as never, TENANT_ID);
      const prevOutput = {
        ...createPreviousStepOutput(),
        selectedAccounts: ["sender1@company.com"],
      };
      const input = createDefaultInput(prevOutput as unknown as Record<string, unknown>);

      await expect(step.run(input)).rejects.toMatchObject({
        code: "STEP_ACTIVATE_ERROR",
        isRetryable: true,
        externalService: "instantly",
        message: expect.stringContaining("anexar as contas de envio"),
      });
    });
  });
});
