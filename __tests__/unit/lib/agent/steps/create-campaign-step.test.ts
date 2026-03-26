/**
 * Unit Tests for CreateCampaignStep
 * Story 17.3 - AC: #1, #2, #3, #4
 *
 * Tests: happy path, input validation, KB loading, AI generation,
 * icebreaker batching, error handling (retryable/terminal), cost calculation
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { CreateCampaignStep } from "@/lib/agent/steps/create-campaign-step";
import { createChainBuilder } from "../../../../helpers/mock-supabase";
import type { StepInput, SearchLeadResult } from "@/types/agent";
import { ExternalServiceError } from "@/lib/services/base-service";

// ==============================================
// MOCKS
// ==============================================

const mockRenderPrompt = vi.fn();
const mockGenerateText = vi.fn();
const mockCreateAIProvider = vi.fn();
const mockDecryptApiKey = vi.fn();
const mockBuildAIVariables = vi.fn();
const mockTransformProductRow = vi.fn();

vi.mock("@/lib/ai", () => ({
  promptManager: {
    renderPrompt: (...args: unknown[]) => mockRenderPrompt(...args),
  },
  createAIProvider: (...args: unknown[]) => mockCreateAIProvider(...args),
  AIProviderError: class AIProviderError extends Error {
    readonly code: string;
    readonly provider: string;
    readonly userMessage: string;
    constructor(provider: string, code: string, message?: string) {
      super(message ?? "AI error");
      this.provider = provider;
      this.code = code;
      this.userMessage = message ?? "AI error";
    }
  },
}));

vi.mock("@/lib/crypto/encryption", () => ({
  decryptApiKey: (...args: unknown[]) => mockDecryptApiKey(...args),
}));

vi.mock("@/lib/services/knowledge-base-context", () => ({
  buildAIVariables: (...args: unknown[]) => mockBuildAIVariables(...args),
}));

vi.mock("@/types/product", () => ({
  transformProductRow: (...args: unknown[]) => mockTransformProductRow(...args),
}));

vi.mock("@/types/ai-prompt", () => ({
  ICEBREAKER_CATEGORY_INSTRUCTIONS: {
    lead: "FOCO: PESSOA (Lead)",
    empresa: "FOCO: EMPRESA",
    cargo: "FOCO: CARGO",
    post: "FOCO: POST",
  },
}));

// ==============================================
// HELPERS
// ==============================================

const TENANT_ID = "tenant-001";

const DEFAULT_AI_VARS = {
  company_context: "Empresa de tecnologia",
  products_services: "",
  competitive_advantages: "",
  product_name: "",
  product_description: "",
  product_features: "",
  product_differentials: "",
  product_target_audience: "",
  tone_description: "Profissional",
  tone_style: "casual",
  writing_guidelines: "",
  icp_summary: "",
  target_industries: "Tecnologia",
  target_titles: "CTO",
  pain_points: "",
  successful_examples: "",
  lead_name: "Nome",
  lead_title: "Cargo",
  lead_company: "Empresa",
  lead_industry: "Tecnologia",
  lead_location: "Brasil",
  email_objective: "Prospecção inicial",
  icebreaker: "",
};

const VALID_STRUCTURE_JSON = JSON.stringify({
  items: [
    { position: 0, type: "email", context: "Primeiro contato", emailMode: "initial" },
    { position: 1, type: "delay", days: 3 },
    { position: 2, type: "email", context: "Follow-up", emailMode: "follow-up" },
  ],
});

const MOCK_LEADS: SearchLeadResult[] = [
  { name: "John Doe", title: "CTO", companyName: "Acme Corp", email: "john@acme.com", linkedinUrl: null },
  { name: "Jane Smith", title: "VP Engineering", companyName: "Beta Inc", email: "jane@beta.io", linkedinUrl: "https://linkedin.com/in/jane" },
];

function createMockSupabase() {
  const stepsChain = createChainBuilder({ data: { id: "step-1" }, error: null });
  const messagesChain = createChainBuilder({ data: { id: "msg-1" }, error: null });
  const kbChain = createChainBuilder({ data: null, error: null });
  const productsChain = createChainBuilder({ data: null, error: null });
  const apiConfigsChain = createChainBuilder({
    data: { encrypted_key: "encrypted-key-123" },
    error: null,
  });
  const icebreakerExamplesChain = createChainBuilder({ data: [], error: null });

  const mockFrom = vi.fn().mockImplementation((table: string) => {
    if (table === "agent_steps") return stepsChain;
    if (table === "agent_messages") return messagesChain;
    if (table === "knowledge_base") return kbChain;
    if (table === "products") return productsChain;
    if (table === "api_configs") return apiConfigsChain;
    if (table === "icebreaker_examples") return icebreakerExamplesChain;
    return createChainBuilder();
  });

  return { from: mockFrom, stepsChain, messagesChain, kbChain, productsChain, apiConfigsChain, icebreakerExamplesChain };
}

function createInput(
  overrides: Partial<StepInput["briefing"]> = {},
  previousStepOutput?: Record<string, unknown>
): StepInput {
  return {
    executionId: "exec-001",
    briefing: {
      technology: "React",
      jobTitles: ["CTO", "VP Engineering"],
      location: "Brasil",
      companySize: "50-200",
      industry: "saas",
      productSlug: null,
      mode: "guided",
      skipSteps: [],
      ...overrides,
    },
    previousStepOutput: previousStepOutput ?? {
      leads: MOCK_LEADS,
      totalFound: 2,
      jobTitles: ["CTO", "VP Engineering"],
      domainsSearched: ["acme.com", "beta.io"],
    },
  };
}

function setupDefaultMocks() {
  mockBuildAIVariables.mockReturnValue(DEFAULT_AI_VARS);
  mockDecryptApiKey.mockReturnValue("decrypted-openai-key");
  mockCreateAIProvider.mockReturnValue({ generateText: mockGenerateText });

  // Structure generation
  mockGenerateText.mockResolvedValue({
    text: VALID_STRUCTURE_JSON,
    model: "gpt-4o",
    usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
  });

  // Icebreaker + email prompts
  mockRenderPrompt.mockResolvedValue({
    content: "rendered prompt content",
    modelPreference: "gpt-4o",
    metadata: { temperature: 0.7, maxTokens: 500 },
    source: "default",
  });
}

// ==============================================
// TESTS
// ==============================================

describe("CreateCampaignStep (AC #1, #2, #3, #4)", () => {
  let step: CreateCampaignStep;
  let mockSupabase: ReturnType<typeof createMockSupabase>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase = createMockSupabase();
    step = new CreateCampaignStep(3, mockSupabase as never, TENANT_ID);
    setupDefaultMocks();
  });

  // 4.1 - Happy path
  describe("happy path", () => {
    it("generates complete campaign output with leads, icebreakers, and emails", async () => {
      // generateText returns different values based on call order:
      // 1st call: structure JSON
      // subsequent: icebreaker text or email content
      let callCount = 0;
      mockGenerateText.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            text: VALID_STRUCTURE_JSON,
            model: "gpt-4o",
            usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
          });
        }
        // Icebreakers and email content
        return Promise.resolve({
          text: `Generated content ${callCount}`,
          model: "gpt-4o",
          usage: { promptTokens: 50, completionTokens: 30, totalTokens: 80 },
        });
      });

      const input = createInput();
      const result = await step.run(input);

      expect(result.success).toBe(true);

      const data = result.data as Record<string, unknown>;
      expect(data.campaignName).toBeDefined();
      expect(data.totalLeads).toBe(2);
      expect((data.emailBlocks as unknown[]).length).toBe(2);
      expect((data.delayBlocks as unknown[]).length).toBe(1);
      expect((data.leadsWithIcebreakers as unknown[]).length).toBe(2);

      const stats = data.icebreakerStats as { generated: number; failed: number; skipped: number };
      expect(stats.generated).toBe(2);
      expect(stats.failed).toBe(0);
    });
  });

  // 4.2 - No previousStepOutput
  describe("input validation - no previousStepOutput", () => {
    it("throws when previousStepOutput is undefined", async () => {
      const input = createInput();
      input.previousStepOutput = undefined;

      await expect(step.run(input)).rejects.toMatchObject({
        code: expect.any(String),
        stepNumber: 3,
      });
    });
  });

  // 4.3 - No leads in previousStepOutput
  describe("input validation - no leads", () => {
    it("throws when previousStepOutput has no leads field", async () => {
      const input = createInput({}, { totalFound: 0 });

      await expect(step.run(input)).rejects.toMatchObject({
        code: expect.any(String),
        stepNumber: 3,
      });
    });
  });

  // 4.4 - Empty leads array
  describe("input validation - empty leads array", () => {
    it("throws when leads array is empty", async () => {
      const input = createInput({}, { leads: [], totalFound: 0 });

      await expect(step.run(input)).rejects.toMatchObject({
        code: expect.any(String),
        stepNumber: 3,
      });
    });
  });

  // 4.5 - KB not configured (graceful degradation)
  describe("KB not configured", () => {
    it("uses defaults via buildAIVariables(null) when KB is empty", async () => {
      let callCount = 0;
      mockGenerateText.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({ text: VALID_STRUCTURE_JSON, model: "gpt-4o", usage: {} });
        }
        return Promise.resolve({ text: `Content ${callCount}`, model: "gpt-4o", usage: {} });
      });

      const input = createInput();
      const result = await step.run(input);

      expect(result.success).toBe(true);
      // buildAIVariables is called with null KB context (from supabase returning null)
      expect(mockBuildAIVariables).toHaveBeenCalledWith(null, null);
    });
  });

  // 4.6 - Product not found
  describe("product not found", () => {
    it("continues without product when productSlug is invalid", async () => {
      let callCount = 0;
      mockGenerateText.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({ text: VALID_STRUCTURE_JSON, model: "gpt-4o", usage: {} });
        }
        return Promise.resolve({ text: `Content ${callCount}`, model: "gpt-4o", usage: {} });
      });

      const input = createInput({ productSlug: "non-existent-id" });
      const result = await step.run(input);

      expect(result.success).toBe(true);
      // buildAIVariables called with null product
      expect(mockBuildAIVariables).toHaveBeenCalledWith(null, null);
    });
  });

  // 4.7 - AI returns invalid JSON (retryable — retry may produce valid JSON)
  describe("AI returns invalid JSON", () => {
    it("throws retryable PipelineError when AI returns non-JSON", async () => {
      mockGenerateText.mockResolvedValueOnce({
        text: "This is not valid JSON",
        model: "gpt-4o",
        usage: {},
      });

      const input = createInput();
      await expect(step.run(input)).rejects.toMatchObject({
        message: expect.stringContaining("Formato invalido"),
        stepNumber: 3,
        isRetryable: true,
        externalService: "openai",
        code: "STEP_CREATE_CAMPAIGN_ERROR",
      });
    });
  });

  // 4.8 - AI returns structure without emails (retryable)
  describe("AI returns structure without emails", () => {
    it("throws retryable PipelineError when structure has no email items", async () => {
      mockGenerateText.mockResolvedValueOnce({
        text: JSON.stringify({ items: [{ position: 0, type: "delay", days: 3 }] }),
        model: "gpt-4o",
        usage: {},
      });

      const input = createInput();
      await expect(step.run(input)).rejects.toMatchObject({
        message: expect.stringContaining("sem emails"),
        stepNumber: 3,
        isRetryable: true,
        externalService: "openai",
        code: "STEP_CREATE_CAMPAIGN_ERROR",
      });
    });
  });

  // 4.9 - Icebreaker fails for 1 lead
  describe("icebreaker partial failure", () => {
    it("continues with null icebreaker when generation fails for one lead", async () => {
      let callCount = 0;
      mockGenerateText.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // Structure generation
          return Promise.resolve({ text: VALID_STRUCTURE_JSON, model: "gpt-4o", usage: {} });
        }
        if (callCount === 2) {
          // First icebreaker - success
          return Promise.resolve({ text: "Great icebreaker", model: "gpt-4o", usage: {} });
        }
        if (callCount === 3) {
          // Second icebreaker - fails
          return Promise.reject(new Error("AI generation failed"));
        }
        // Email generation
        return Promise.resolve({ text: `Email content ${callCount}`, model: "gpt-4o", usage: {} });
      });

      const input = createInput();
      const result = await step.run(input);

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      const stats = data.icebreakerStats as { generated: number; failed: number; skipped: number };
      expect(stats.generated).toBe(1);
      expect(stats.failed).toBe(1);

      const leads = data.leadsWithIcebreakers as Array<{ icebreaker: string | null }>;
      expect(leads[0].icebreaker).toBe("Great icebreaker");
      expect(leads[1].icebreaker).toBeNull();
    });
  });

  // 4.10 - All icebreakers fail
  describe("all icebreakers fail", () => {
    it("step continues when all icebreakers fail (icebreakers are optional)", async () => {
      let callCount = 0;
      mockGenerateText.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({ text: VALID_STRUCTURE_JSON, model: "gpt-4o", usage: {} });
        }
        // First 2 calls after structure are icebreakers - fail
        if (callCount <= 3) {
          return Promise.reject(new Error("AI generation failed"));
        }
        // Email generation
        return Promise.resolve({ text: `Email content ${callCount}`, model: "gpt-4o", usage: {} });
      });

      const input = createInput();
      const result = await step.run(input);

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      const stats = data.icebreakerStats as { generated: number; failed: number; skipped: number };
      expect(stats.failed).toBe(2);
      expect(stats.generated).toBe(0);
    });
  });

  // 4.11 - Retryable OpenAI error (429)
  describe("error handling - retryable (429)", () => {
    it("converts ExternalServiceError 429 to retryable PipelineError", async () => {
      mockGenerateText.mockRejectedValue(
        new ExternalServiceError("openai", 429, "Rate limited")
      );

      const input = createInput();
      await expect(step.run(input)).rejects.toMatchObject({
        isRetryable: true,
        externalService: "openai",
        code: "STEP_CREATE_CAMPAIGN_ERROR",
      });
    });
  });

  // 4.12 - Terminal OpenAI error (401)
  describe("error handling - terminal (401)", () => {
    it("converts ExternalServiceError 401 to non-retryable PipelineError", async () => {
      mockGenerateText.mockRejectedValue(
        new ExternalServiceError("openai", 401, "Invalid key")
      );

      const input = createInput();
      await expect(step.run(input)).rejects.toMatchObject({
        isRetryable: false,
        externalService: "openai",
        code: "STEP_CREATE_CAMPAIGN_ERROR",
      });
    });
  });

  // 4.13 - Cost calculation
  describe("cost calculation", () => {
    it("calculates cost correctly (1 structure + N emails + M icebreakers)", async () => {
      let callCount = 0;
      mockGenerateText.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({ text: VALID_STRUCTURE_JSON, model: "gpt-4o", usage: {} });
        }
        return Promise.resolve({ text: `Content ${callCount}`, model: "gpt-4o", usage: {} });
      });

      const input = createInput();
      const result = await step.run(input);

      expect(result.cost).toBeDefined();
      expect(result.cost?.openai_structure).toBe(1);
      expect(result.cost?.openai_emails).toBe(2); // 2 emails in structure
      expect(result.cost?.openai_icebreakers).toBe(2); // 2 leads, both succeed
    });
  });

  // 4.14 - Progress message
  describe("progress message", () => {
    it("sends progress message with lead count", async () => {
      let callCount = 0;
      mockGenerateText.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({ text: VALID_STRUCTURE_JSON, model: "gpt-4o", usage: {} });
        }
        return Promise.resolve({ text: `Content ${callCount}`, model: "gpt-4o", usage: {} });
      });

      const input = createInput();
      await step.run(input);

      expect(mockSupabase.messagesChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          execution_id: "exec-001",
          role: "system",
          content: "Etapa 3/5: Criando campanha com emails personalizados para 2 leads...",
          metadata: expect.objectContaining({
            stepNumber: 3,
            messageType: "progress",
          }),
        })
      );
    });
  });

  // 4.15 - Follow-up uses separate prompts for subject and body
  describe("follow-up email generation", () => {
    it("calls follow_up_subject_generation and follow_up_email_generation separately", async () => {
      let callCount = 0;
      mockGenerateText.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({ text: VALID_STRUCTURE_JSON, model: "gpt-4o", usage: {} });
        }
        return Promise.resolve({ text: `Content ${callCount}`, model: "gpt-4o", usage: {} });
      });

      const input = createInput();
      await step.run(input);

      // Verify follow_up_subject_generation is called
      const subjectCalls = mockRenderPrompt.mock.calls.filter(
        (call: unknown[]) => call[0] === "follow_up_subject_generation"
      );
      expect(subjectCalls.length).toBeGreaterThanOrEqual(1);
      const subjectVars = subjectCalls[0][1] as Record<string, string>;
      expect(subjectVars.previous_email_subject).toBeDefined();
      expect(subjectVars.previous_email_body).toBeDefined();
      expect(subjectVars.sequence_position).toBeDefined();

      // Verify follow_up_email_generation is called separately for body
      const bodyCalls = mockRenderPrompt.mock.calls.filter(
        (call: unknown[]) => call[0] === "follow_up_email_generation"
      );
      expect(bodyCalls.length).toBeGreaterThanOrEqual(1);
      const bodyVars = bodyCalls[0][1] as Record<string, string>;
      expect(bodyVars.previous_email_subject).toBeDefined();
      expect(bodyVars.previous_email_body).toBeDefined();
      expect(bodyVars.email_objective).toBeDefined();
    });
  });

  // L1 - campaignName generation paths
  describe("campaignName generation", () => {
    it("uses campaignDescription when provided in briefing", async () => {
      let callCount = 0;
      mockGenerateText.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({ text: VALID_STRUCTURE_JSON, model: "gpt-4o", usage: {} });
        }
        return Promise.resolve({ text: `Content ${callCount}`, model: "gpt-4o", usage: {} });
      });

      const input = createInput();
      (input.briefing as unknown as Record<string, unknown>).campaignDescription = "SaaS Decision Makers Q1";
      const result = await step.run(input);

      const data = result.data as Record<string, unknown>;
      expect(data.campaignName).toBe("Campanha - SaaS Decision Makers Q1");
    });

    it("falls back to technology + date when no campaignDescription", async () => {
      let callCount = 0;
      mockGenerateText.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({ text: VALID_STRUCTURE_JSON, model: "gpt-4o", usage: {} });
        }
        return Promise.resolve({ text: `Content ${callCount}`, model: "gpt-4o", usage: {} });
      });

      const input = createInput();
      const result = await step.run(input);

      const data = result.data as Record<string, unknown>;
      expect(data.campaignName).toMatch(/^Campanha React - /);
    });
  });

  // H3 - Icebreaker examples loaded from DB
  describe("icebreaker examples from database", () => {
    it("queries icebreaker_examples table for tenant", async () => {
      let callCount = 0;
      mockGenerateText.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({ text: VALID_STRUCTURE_JSON, model: "gpt-4o", usage: {} });
        }
        return Promise.resolve({ text: `Content ${callCount}`, model: "gpt-4o", usage: {} });
      });

      const input = createInput();
      await step.run(input);

      // Verify icebreaker_examples table was queried
      expect(mockSupabase.from).toHaveBeenCalledWith("icebreaker_examples");
    });
  });

  // H3 - formatIcebreakerExamples static method
  describe("formatIcebreakerExamples", () => {
    it("returns empty string for empty examples array", () => {
      expect(CreateCampaignStep.formatIcebreakerExamples([], "lead")).toBe("");
    });

    it("formats examples with category labels", () => {
      const examples = [
        { id: "1", tenant_id: "t1", text: "Great icebreaker", category: "lead" as const, created_at: "", updated_at: "" },
      ];
      const result = CreateCampaignStep.formatIcebreakerExamples(examples, "lead");
      expect(result).toContain("Exemplo 1:");
      expect(result).toContain("Great icebreaker");
      expect(result).toContain("Lead");
    });

    it("prioritizes same-category then null-category, max 3", () => {
      const examples = [
        { id: "1", tenant_id: "t1", text: "Lead 1", category: "lead" as const, created_at: "", updated_at: "" },
        { id: "2", tenant_id: "t1", text: "Lead 2", category: "lead" as const, created_at: "", updated_at: "" },
        { id: "3", tenant_id: "t1", text: "General", category: null, created_at: "", updated_at: "" },
        { id: "4", tenant_id: "t1", text: "Empresa", category: "empresa" as const, created_at: "", updated_at: "" },
        { id: "5", tenant_id: "t1", text: "General 2", category: null, created_at: "", updated_at: "" },
      ];
      const result = CreateCampaignStep.formatIcebreakerExamples(examples, "lead");
      expect(result).toContain("Lead 1");
      expect(result).toContain("Lead 2");
      expect(result).toContain("General");
      expect(result).not.toContain("Empresa");
      expect(result).not.toContain("General 2");
    });
  });

  // API key not configured
  describe("API key not configured", () => {
    it("throws when OpenAI API key is not found", async () => {
      mockSupabase.apiConfigsChain = createChainBuilder({ data: null, error: null });
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "agent_steps") return mockSupabase.stepsChain;
        if (table === "agent_messages") return mockSupabase.messagesChain;
        if (table === "knowledge_base") return mockSupabase.kbChain;
        if (table === "products") return mockSupabase.productsChain;
        if (table === "api_configs") return mockSupabase.apiConfigsChain;
        return createChainBuilder();
      });

      const input = createInput();
      await expect(step.run(input)).rejects.toMatchObject({
        message: expect.stringContaining("API key do OpenAI"),
        stepNumber: 3,
      });
    });
  });
});
