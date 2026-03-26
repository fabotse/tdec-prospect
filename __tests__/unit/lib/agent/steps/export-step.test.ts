/**
 * Unit Tests for ExportStep
 * Story 17.4 - AC: #1, #2
 *
 * Tests: happy path, input validation, API key missing, no accounts,
 * leads without email, Instantly API errors, cost calculation,
 * convertToInstantlySequences, progress message
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { ExportStep, convertToInstantlySequences } from "@/lib/agent/steps/export-step";
import { createChainBuilder } from "../../../../helpers/mock-supabase";
import type { StepInput } from "@/types/agent";
import { ExternalServiceError } from "@/lib/services/base-service";

// ==============================================
// MOCKS
// ==============================================

const mockCreateCampaign = vi.fn();
const mockListAccounts = vi.fn();
const mockAddAccountsToCampaign = vi.fn();
const mockAddLeadsToCampaign = vi.fn();
const mockTextToEmailHtml = vi.fn((text: string) => text);

vi.mock("@/lib/services/instantly", () => ({
  InstantlyService: class MockInstantlyService {
    createCampaign = mockCreateCampaign;
    listAccounts = mockListAccounts;
    addAccountsToCampaign = mockAddAccountsToCampaign;
    addLeadsToCampaign = mockAddLeadsToCampaign;
  },
  textToEmailHtml: (...args: unknown[]) => mockTextToEmailHtml(...args),
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
    campaignName: "Campanha React Outbound",
    emailBlocks: [
      { position: 0, subject: "Ola {{firstName}}", body: "Texto inicial", emailMode: "initial" },
      { position: 2, subject: "Follow-up", body: "Texto follow-up", emailMode: "follow-up" },
    ],
    delayBlocks: [
      { position: 1, delayDays: 3 },
    ],
    leadsWithIcebreakers: [
      { name: "Joao Silva", title: "CTO", companyName: "Acme", email: "joao@acme.com", linkedinUrl: "https://linkedin.com/in/joao", icebreaker: "Vi seu post sobre React" },
      { name: "Maria Santos", title: "VP Eng", companyName: "Beta", email: "maria@beta.io", linkedinUrl: null, icebreaker: null },
    ],
    totalLeads: 2,
  };
}

function createMockSupabase(apiConfigData: unknown = { encrypted_key: "enc-key" }) {
  const apiConfigsChain = createChainBuilder({
    data: apiConfigData,
    error: null,
  });

  const messagesChain = createChainBuilder({ data: { id: "msg-1" }, error: null });

  // BaseStep internal chains
  const stepsChain = createChainBuilder({ data: { id: "step-4" }, error: null });

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

function setupHappyPathMocks() {
  mockCreateCampaign.mockResolvedValue({
    campaignId: "instantly-camp-123",
    name: "Campanha React Outbound",
    status: 0,
  });

  mockListAccounts.mockResolvedValue({
    accounts: [
      { email: "sender1@company.com", first_name: "Sender" },
      { email: "sender2@company.com", first_name: "Sender2" },
    ],
    totalCount: 2,
  });

  mockAddAccountsToCampaign.mockResolvedValue({
    success: true,
    accountsAdded: 2,
  });

  mockAddLeadsToCampaign.mockResolvedValue({
    leadsUploaded: 2,
    duplicatedLeads: 0,
    invalidEmails: 0,
    remainingInPlan: 998,
  });
}

// ==============================================
// TESTS
// ==============================================

describe("ExportStep (Story 17.4 AC #1, #2)", () => {
  let mockSupabase: ReturnType<typeof createMockSupabase>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase = createMockSupabase();
    setupHappyPathMocks();
  });

  // 5.1 - Happy path
  describe("happy path", () => {
    it("exports campaign to Instantly with complete output", async () => {
      const step = new ExportStep(4, mockSupabase as never, TENANT_ID);
      const input = createDefaultInput();

      const result = await step.run(input);

      expect(result.success).toBe(true);

      const data = result.data as Record<string, unknown>;
      expect(data.externalCampaignId).toBe("instantly-camp-123");
      expect(data.campaignName).toBe("Campanha React Outbound");
      expect(data.leadsUploaded).toBe(2);
      expect(data.duplicatedLeads).toBe(0);
      expect(data.invalidEmails).toBe(0);
      expect(data.accountsAdded).toBe(2);
      expect(data.platform).toBe("instantly");
    });

    it("calls InstantlyService methods in correct order", async () => {
      const step = new ExportStep(4, mockSupabase as never, TENANT_ID);
      const input = createDefaultInput();

      await step.run(input);

      expect(mockGetServiceApiKey).toHaveBeenCalledWith(
        expect.anything(),
        TENANT_ID,
        "instantly"
      );
      expect(mockCreateCampaign).toHaveBeenCalledWith(
        expect.objectContaining({
          apiKey: "decrypted-instantly-key",
          name: "Campanha React Outbound",
        })
      );
      expect(mockListAccounts).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: "decrypted-instantly-key" })
      );
      expect(mockAddAccountsToCampaign).toHaveBeenCalledWith(
        expect.objectContaining({
          apiKey: "decrypted-instantly-key",
          campaignId: "instantly-camp-123",
          accountEmails: ["sender1@company.com", "sender2@company.com"],
        })
      );
      expect(mockAddLeadsToCampaign).toHaveBeenCalledWith(
        expect.objectContaining({
          apiKey: "decrypted-instantly-key",
          campaignId: "instantly-camp-123",
        })
      );
    });
  });

  // 5.2 - Input validation: no previousStepOutput
  describe("input validation", () => {
    it("throws when previousStepOutput is missing", async () => {
      const step = new ExportStep(4, mockSupabase as never, TENANT_ID);
      const input: StepInput = {
        executionId: EXECUTION_ID,
        briefing: defaultBriefing,
        previousStepOutput: undefined,
      };

      await expect(step.run(input)).rejects.toMatchObject({
        code: "STEP_EXECUTION_ERROR",
        message: "Output do step anterior e obrigatorio para exportacao",
        isRetryable: false,
      });
    });

    // 5.3 - No emailBlocks
    it("throws when emailBlocks is missing", async () => {
      const step = new ExportStep(4, mockSupabase as never, TENANT_ID);
      const prevOutput = createPreviousStepOutput();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (prevOutput as any).emailBlocks;
      const input = createDefaultInput(prevOutput as unknown as Record<string, unknown>);

      await expect(step.run(input)).rejects.toMatchObject({
        code: "STEP_EXECUTION_ERROR",
        message: "emailBlocks e obrigatorio no output do step anterior",
        isRetryable: false,
      });
    });

    // 5.4 - leadsWithIcebreakers empty
    it("throws when leadsWithIcebreakers is empty", async () => {
      const step = new ExportStep(4, mockSupabase as never, TENANT_ID);
      const prevOutput = createPreviousStepOutput();
      prevOutput.leadsWithIcebreakers = [];
      const input = createDefaultInput(prevOutput as unknown as Record<string, unknown>);

      await expect(step.run(input)).rejects.toMatchObject({
        code: "STEP_EXECUTION_ERROR",
        message: "leadsWithIcebreakers e obrigatorio no output do step anterior",
        isRetryable: false,
      });
    });
  });

  // 5.5 - API key not configured
  describe("API key errors", () => {
    it("throws terminal error when Instantly API key not configured", async () => {
      mockGetServiceApiKey.mockRejectedValueOnce(
        new Error("API key do Instantly nao configurada")
      );
      const step = new ExportStep(4, mockSupabase as never, TENANT_ID);
      const input = createDefaultInput();

      await expect(step.run(input)).rejects.toMatchObject({
        code: "STEP_EXECUTION_ERROR",
        message: "API key do Instantly nao configurada",
        isRetryable: false,
      });
    });
  });

  // 5.6 - No sending accounts
  describe("sending accounts", () => {
    it("throws terminal error when no sending accounts available", async () => {
      mockListAccounts.mockResolvedValue({
        accounts: [],
        totalCount: 0,
      });

      const step = new ExportStep(4, mockSupabase as never, TENANT_ID);
      const input = createDefaultInput();

      await expect(step.run(input)).rejects.toMatchObject({
        code: "STEP_EXECUTION_ERROR",
        message: "Nenhuma sending account configurada no Instantly",
        isRetryable: false,
      });
    });
  });

  // 5.7 - Instantly 429 rate limit
  describe("Instantly API errors", () => {
    it("maps 429 rate limit to retryable PipelineError", async () => {
      mockCreateCampaign.mockRejectedValue(
        new ExternalServiceError("instantly", 429, "Rate limit exceeded")
      );

      const step = new ExportStep(4, mockSupabase as never, TENANT_ID);
      const input = createDefaultInput();

      await expect(step.run(input)).rejects.toMatchObject({
        code: "STEP_EXPORT_ERROR",
        isRetryable: true,
        externalService: "instantly",
      });
    });

    // 5.8 - Instantly 401 invalid key
    it("maps 401 invalid key to non-retryable PipelineError", async () => {
      mockCreateCampaign.mockRejectedValue(
        new ExternalServiceError("instantly", 401, "Unauthorized")
      );

      const step = new ExportStep(4, mockSupabase as never, TENANT_ID);
      const input = createDefaultInput();

      await expect(step.run(input)).rejects.toMatchObject({
        code: "STEP_EXPORT_ERROR",
        isRetryable: false,
        externalService: "instantly",
      });
    });
  });

  // 5.9 - Leads without email are filtered
  describe("lead mapping", () => {
    it("filters leads without email", async () => {
      const step = new ExportStep(4, mockSupabase as never, TENANT_ID);
      const prevOutput = createPreviousStepOutput();
      prevOutput.leadsWithIcebreakers.push(
        { name: "Sem Email", title: "Dev", companyName: "Corp", email: null, linkedinUrl: null, icebreaker: null }
      );
      const input = createDefaultInput(prevOutput as unknown as Record<string, unknown>);

      await step.run(input);

      const leadsArg = mockAddLeadsToCampaign.mock.calls[0][0].leads;
      expect(leadsArg).toHaveLength(2);
      expect(leadsArg.every((l: { email: string }) => l.email)).toBe(true);
    });

    it("throws when all leads have no email", async () => {
      const step = new ExportStep(4, mockSupabase as never, TENANT_ID);
      const prevOutput = createPreviousStepOutput();
      prevOutput.leadsWithIcebreakers = [
        { name: "No Email", title: "Dev", companyName: "Corp", email: null, linkedinUrl: null, icebreaker: null },
      ];
      const input = createDefaultInput(prevOutput as unknown as Record<string, unknown>);

      await expect(step.run(input)).rejects.toMatchObject({
        code: "STEP_EXECUTION_ERROR",
        message: "Nenhum lead com email valido para exportar",
        isRetryable: false,
      });
    });

    it("maps lead name to firstName/lastName correctly", async () => {
      const step = new ExportStep(4, mockSupabase as never, TENANT_ID);
      const input = createDefaultInput();

      await step.run(input);

      const leadsArg = mockAddLeadsToCampaign.mock.calls[0][0].leads;
      expect(leadsArg[0]).toMatchObject({
        email: "joao@acme.com",
        firstName: "Joao",
        lastName: "Silva",
        companyName: "Acme",
        title: "CTO",
        icebreaker: "Vi seu post sobre React",
      });
      expect(leadsArg[1]).toMatchObject({
        email: "maria@beta.io",
        firstName: "Maria",
        lastName: "Santos",
      });
    });
  });

  // L3 - Single email without delay blocks
  describe("single email edge case", () => {
    it("exports campaign with single email and no delay blocks", async () => {
      const step = new ExportStep(4, mockSupabase as never, TENANT_ID);
      const prevOutput = createPreviousStepOutput();
      prevOutput.emailBlocks = [
        { position: 0, subject: "Unico email", body: "Body", emailMode: "initial" },
      ];
      prevOutput.delayBlocks = [];
      const input = createDefaultInput(prevOutput as unknown as Record<string, unknown>);

      const result = await step.run(input);

      expect(result.success).toBe(true);
      expect(mockCreateCampaign).toHaveBeenCalledWith(
        expect.objectContaining({
          sequences: [{ subject: "Unico email", body: "Body", delayDays: 0 }],
        })
      );
    });
  });

  // 5.12 - Cost calculated correctly
  describe("cost calculation", () => {
    it("calculates cost correctly", async () => {
      const step = new ExportStep(4, mockSupabase as never, TENANT_ID);
      const input = createDefaultInput();

      const result = await step.run(input);

      expect(result.cost).toEqual({
        instantly_create: 1,
        instantly_leads: 2,
      });
    });
  });

  // 5.13 - Progress message sent
  describe("progress message", () => {
    it("sends progress message to agent_messages", async () => {
      const step = new ExportStep(4, mockSupabase as never, TENANT_ID);
      const input = createDefaultInput();

      await step.run(input);

      expect(mockSupabase.from).toHaveBeenCalledWith("agent_messages");
      expect(mockSupabase.messagesChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          execution_id: EXECUTION_ID,
          role: "system",
          content: "Etapa 4/5: Exportando campanha para o Instantly...",
        })
      );
    });
  });
});

// ==============================================
// convertToInstantlySequences Tests (5.10, 5.11)
// ==============================================

describe("convertToInstantlySequences", () => {
  // 5.10 - First email delayDays=0, follow-ups use delay blocks
  it("sets first email delayDays=0 and follow-ups use delay blocks", () => {
    const emailBlocks = [
      { position: 0, subject: "Email 1", body: "Body 1", emailMode: "initial" },
      { position: 2, subject: "Email 2", body: "Body 2", emailMode: "follow-up" },
      { position: 4, subject: "Email 3", body: "Body 3", emailMode: "follow-up" },
    ];
    const delayBlocks = [
      { position: 1, delayDays: 3 },
      { position: 3, delayDays: 5 },
    ];

    const result = convertToInstantlySequences(emailBlocks, delayBlocks);

    expect(result).toHaveLength(3);
    expect(result[0].delayDays).toBe(0);
    expect(result[1].delayDays).toBe(3);
    expect(result[2].delayDays).toBe(5);
  });

  it("defaults to 1 day delay when delay block is missing", () => {
    const emailBlocks = [
      { position: 0, subject: "Email 1", body: "Body 1", emailMode: "initial" },
      { position: 2, subject: "Email 2", body: "Body 2", emailMode: "follow-up" },
    ];
    const delayBlocks: Array<{ position: number; delayDays: number }> = [];

    const result = convertToInstantlySequences(emailBlocks, delayBlocks);

    expect(result[0].delayDays).toBe(0);
    expect(result[1].delayDays).toBe(1);
  });

  // 5.11 - textToEmailHtml applied to body
  it("applies textToEmailHtml to email bodies", () => {
    mockTextToEmailHtml.mockImplementation((text: string) => `<p>${text}</p>`);

    const emailBlocks = [
      { position: 0, subject: "Sub", body: "Plain text body", emailMode: "initial" },
    ];

    const result = convertToInstantlySequences(emailBlocks, []);

    expect(mockTextToEmailHtml).toHaveBeenCalledWith("Plain text body");
    expect(result[0].body).toBe("<p>Plain text body</p>");
  });

  it("sorts emails by position", () => {
    const emailBlocks = [
      { position: 4, subject: "Email 3", body: "Body 3", emailMode: "follow-up" },
      { position: 0, subject: "Email 1", body: "Body 1", emailMode: "initial" },
      { position: 2, subject: "Email 2", body: "Body 2", emailMode: "follow-up" },
    ];

    const result = convertToInstantlySequences(emailBlocks, []);

    expect(result[0].subject).toBe("Email 1");
    expect(result[1].subject).toBe("Email 2");
    expect(result[2].subject).toBe("Email 3");
  });
});
