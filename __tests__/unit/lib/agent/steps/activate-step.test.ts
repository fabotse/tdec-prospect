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

vi.mock("@/lib/services/instantly", () => ({
  InstantlyService: class MockInstantlyService {
    activateCampaign = mockActivateCampaign;
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
});
