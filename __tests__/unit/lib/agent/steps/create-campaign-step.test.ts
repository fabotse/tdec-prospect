/**
 * Unit Tests for CreateCampaignStep
 * Story 17.3 - AC: #1, #2, #3, #4
 *
 * Tests: happy path, input validation, KB loading, AI generation,
 * icebreaker batching, error handling (retryable/terminal), cost calculation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CreateCampaignStep } from "@/lib/agent/steps/create-campaign-step";
import { createChainBuilder } from "../../../../helpers/mock-supabase";
import { FakeDb, createFakeSupabase } from "../../../../helpers/fake-leads-db";
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

/**
 * Story 22.9: as chaves de servico (openai/apify/apollo) passam a ser lidas via
 * SERVICE-ROLE pelo helper `service-keys`. O client de SESSAO do step continua
 * valendo para o resto (agent_steps/agent_messages/knowledge_base/products), mas
 * `api_configs` pela sessao devolve ZERO linhas neste arquivo — e a RLS admin-only
 * vista por um `sdr`. Regressao para a leitura de sessao = "chave nao configurada".
 */
let adminApiConfigsChain: unknown = null;

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: () => adminApiConfigsChain }),
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

// Story 22.2: Apify service + usage logger mocks (premium icebreaker path)
const mockFetchLinkedInPosts = vi.fn();
vi.mock("@/lib/services/apify", () => ({
  ApifyService: class {
    fetchLinkedInPosts = (...args: unknown[]) => mockFetchLinkedInPosts(...args);
  },
}));

// Story 22.15: Apollo mockado para exercitar o REVEAL (enrichment) antes da persistencia.
const mockEnrichPerson = vi.fn();
vi.mock("@/lib/services/apollo", () => ({
  ApolloService: class {
    enrichPerson = (...args: unknown[]) => mockEnrichPerson(...args);
  },
}));

// Story 22.15: a persistencia em "Meus Leads" e mockada aqui (tem suite propria em
// lead-persistence.test.ts). O que este arquivo protege e o CONTRATO do step: o que ele
// entrega ao helper e o que ele faz quando o helper falha ou degrada.
const mockPersistApprovedLeads = vi.fn();
vi.mock("@/lib/agent/lead-persistence", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/agent/lead-persistence")>();
  return {
    ...actual,
    persistApprovedLeads: (...args: unknown[]) => mockPersistApprovedLeads(...args),
  };
});

const mockLogApifySuccess = vi.fn().mockResolvedValue(undefined);
const mockLogApifyFailure = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/services/usage-logger", () => ({
  logApifySuccess: (...args: unknown[]) => mockLogApifySuccess(...args),
  logApifyFailure: (...args: unknown[]) => mockLogApifyFailure(...args),
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

// `apolloId` presente de proposito: sem ele a costura step->persistApprovedLeads nunca
// exercitava a gravacao de `apollo_id` (nem o unique parcial, nem o dedupe por apollo),
// e uma regressao que parasse de repassar o campo passaria verde. Nome e email vem
// revelados, entao o enrichment continua sendo pulado.
const MOCK_LEADS: SearchLeadResult[] = [
  { name: "John Doe", title: "CTO", companyName: "Acme Corp", email: "john@acme.com", linkedinUrl: null, apolloId: "apollo-john" },
  { name: "Jane Smith", title: "VP Engineering", companyName: "Beta Inc", email: "jane@beta.io", linkedinUrl: "https://linkedin.com/in/jane", apolloId: "apollo-jane" },
];

// Story 22.2: posts do LinkedIn retornados pelo Apify mock
const MOCK_POSTS = [
  {
    postUrl: "https://linkedin.com/posts/1",
    text: "Escalando nossa plataforma de dados para 10M de usuarios",
    publishedAt: "2026-01-10",
    likesCount: 120,
    commentsCount: 15,
  },
];

/**
 * Story 22.2: chain api_configs stateful — resolve por service_name.
 * Permite openai presente + apify ausente no mesmo mock (getOpenAIApiKey ok, getApifyApiKey null).
 */
function createStatefulApiConfigs(byService: Record<string, { encrypted_key: string } | null>) {
  const chain: Record<string, unknown> = {};
  let service: string | null = null;
  for (const m of ["select", "eq", "single", "maybeSingle", "order", "limit"]) {
    chain[m] = vi.fn((...args: unknown[]) => {
      if (m === "eq" && args[0] === "service_name") service = args[1] as string;
      return chain;
    });
  }
  (chain as { then: unknown }).then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve({ data: service ? byService[service] ?? null : null, error: null }).then(resolve);
  return chain;
}

/**
 * Story 22.15: com `leadsDb`, as tabelas de Meus Leads (`leads`/`segments`/
 * `lead_segments`) passam a ser servidas pelo banco fake — e a costura step -> helper
 * roda de verdade. Sem ele, o comportamento e exatamente o de antes.
 */
function createMockSupabase(leadsDb?: FakeDb) {
  const stepsChain = createChainBuilder({ data: { id: "step-1" }, error: null });
  const messagesChain = createChainBuilder({ data: { id: "msg-1" }, error: null });
  const kbChain = createChainBuilder({ data: null, error: null });
  const productsChain = createChainBuilder({ data: null, error: null });
  // Story 22.9: a leitura de api_configs pela SESSAO devolve zero linhas (RLS
  // admin-only vista por um `sdr`). A chave real chega pelo client admin.
  const apiConfigsChain = createChainBuilder({ data: null, error: null });
  const icebreakerExamplesChain = createChainBuilder({ data: [], error: null });

  const leadsFrom = leadsDb ? (createFakeSupabase(leadsDb).from as (t: string) => unknown) : null;

  const mockFrom = vi.fn().mockImplementation((table: string) => {
    if (leadsFrom && (table === "leads" || table === "segments" || table === "lead_segments")) {
      return leadsFrom(table);
    }
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
  // Story 22.15: sem person devolvida, o step segue com os dados que ja tem.
  mockEnrichPerson.mockResolvedValue({ person: null });
  mockPersistApprovedLeads.mockResolvedValue({
    segmentId: "segment-1",
    segmentName: "Campanha React - 01/01/2026",
    inserted: 2,
    reused: 0,
    associated: 2,
    skipped: 0,
    degraded: false,
  });
  mockBuildAIVariables.mockReturnValue(DEFAULT_AI_VARS);
  mockDecryptApiKey.mockReturnValue("decrypted-openai-key");
  // Story 22.9: por padrao TODAS as chaves existem no tenant (equivalente ao mock
  // anterior, que devolvia a mesma linha para qualquer service_name).
  adminApiConfigsChain = createChainBuilder({
    data: { encrypted_key: "encrypted-key-123" },
    error: null,
  });
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

      // Story 22.5: campo agora tipado em ParsedBriefing (antes lido via cast briefingRecord)
      const input = createInput({ campaignDescription: "SaaS Decision Makers Q1" });
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

  // Story 22.5 - variaveis de campanha propagadas ao prompt campaign_structure_generation
  describe("campaign_structure_generation variables (22.5)", () => {
    function getStructureVars(): Record<string, string> {
      const call = mockRenderPrompt.mock.calls.find(
        (c: unknown[]) => c[0] === "campaign_structure_generation"
      );
      return (call?.[1] ?? {}) as Record<string, string>;
    }

    it("propaga objective/urgency do briefing ao render (AC4/AC5)", async () => {
      const input = createInput({ objective: "REENGAGEMENT", urgency: "HIGH" });
      await step.run(input);

      const vars = getStructureVars();
      expect(vars.objective).toBe("REENGAGEMENT");
      expect(vars.urgency).toBe("HIGH");
    });

    it("aplica defaults COLD_OUTREACH/MEDIUM quando objective/urgency ausentes (AC3/D1)", async () => {
      const input = createInput(); // sem objective/urgency (undefined)
      await step.run(input);

      const vars = getStructureVars();
      expect(vars.objective).toBe("COLD_OUTREACH");
      expect(vars.urgency).toBe("MEDIUM");
    });

    it("alimenta additional_description com campaignDescription (variavel antes orfa)", async () => {
      const input = createInput({ campaignDescription: "Black Friday" });
      await step.run(input);

      expect(getStructureVars().additional_description).toBe("Black Friday");
    });

    it("passa email_count como string quando emailCount informado (AC4)", async () => {
      const input = createInput({ emailCount: 3 });
      await step.run(input);

      expect(getStructureVars().email_count).toBe("3");
    });

    it("passa email_count vazio quando emailCount ausente (heuristica por objetivo, AC4)", async () => {
      const input = createInput();
      await step.run(input);

      // vazio -> o bloco {{#if email_count}} do template nao ativa (fallback por objetivo)
      expect(getStructureVars().email_count).toBe("");
      expect(getStructureVars().additional_description).toBe("");
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
      // Story 22.9: ausencia REAL da linha, vista pelo client admin (service-role).
      adminApiConfigsChain = createChainBuilder({ data: null, error: null });

      const input = createInput();
      await expect(step.run(input)).rejects.toMatchObject({
        message: expect.stringContaining("API key do OpenAI"),
        stepNumber: 3,
      });
    });
  });

  // ==============================================
  // Story 17.11: IMPORTED LEADS FLOW
  // ==============================================

  describe("imported leads flow (Story 17.11)", () => {
    const IMPORTED_LEADS: SearchLeadResult[] = [
      { name: "Joao Silva", title: "CTO", companyName: "Empresa X", email: "joao@empresa.com", linkedinUrl: null, apolloId: null },
      { name: "Maria Santos", title: null, companyName: null, email: "maria@acme.com", linkedinUrl: null, apolloId: null },
    ];

    it("deve usar briefing.importedLeads quando previousStepOutput=undefined (AC: 17.11#3)", async () => {
      const input = createInput(
        {
          skipSteps: ["search_companies", "search_leads"],
          importedLeads: IMPORTED_LEADS,
        },
        undefined as unknown as Record<string, unknown>
      );
      // Override previousStepOutput to undefined
      input.previousStepOutput = undefined;

      await step.run(input);

      // Should have created campaign with imported leads — verify progress message was sent
      const insertCalls = mockSupabase.messagesChain.insert.mock.calls;
      expect(insertCalls.length).toBeGreaterThan(0);
      const progressMsg = insertCalls[0][0];
      expect(progressMsg.content).toContain("2 leads");
    });

    it("deve lancar erro quando briefing.importedLeads vazio E previousStepOutput undefined (AC: 17.11#3)", async () => {
      const input = createInput(
        {
          skipSteps: ["search_companies", "search_leads"],
          importedLeads: [],
        },
        undefined as unknown as Record<string, unknown>
      );
      input.previousStepOutput = undefined;

      await expect(step.run(input)).rejects.toMatchObject({
        message: expect.stringContaining("Lista de leads importados esta vazia"),
      });
    });

    it("deve manter fluxo normal com previousStepOutput (regressao)", async () => {
      const input = createInput();

      await step.run(input);

      const insertCalls = mockSupabase.messagesChain.insert.mock.calls;
      expect(insertCalls.length).toBeGreaterThan(0);
      const progressMsg = insertCalls[0][0];
      expect(progressMsg.content).toContain("2 leads");
    });

    it("deve NAO tentar enrichment para leads sem apolloId (AC: 17.11#3)", async () => {
      // IMPORTED_LEADS have apolloId: null — enrichment should be skipped entirely
      const input = createInput(
        {
          skipSteps: ["search_companies", "search_leads"],
          importedLeads: IMPORTED_LEADS,
        },
        undefined as unknown as Record<string, unknown>
      );
      input.previousStepOutput = undefined;

      const result = await step.run(input);

      // Assert DIRETO no colaborador: o mecanismo antigo ("sem mock, enrichPerson
      // lancaria") nunca funcionou — a chamada e envolvida num `catch {}` que engoliria o
      // throw. Sem estas duas linhas, remover o guard `typedLead.apolloId &&` queimaria um
      // credito do Apollo por lead importado e o teste continuaria verde.
      expect(mockEnrichPerson).not.toHaveBeenCalled();
      expect(result.cost?.apollo_enrich ?? 0).toBe(0);

      const insertCalls = mockSupabase.messagesChain.insert.mock.calls;
      expect(insertCalls.length).toBeGreaterThan(0);
    });

    it("deve gerar icebreakers com dados parciais — so nome + email (AC: 17.11#5)", async () => {
      const partialLeads: SearchLeadResult[] = [
        { name: "Joao", title: null, companyName: null, email: "joao@empresa.com", linkedinUrl: null, apolloId: null },
      ];

      const input = createInput(
        {
          skipSteps: ["search_companies", "search_leads"],
          importedLeads: partialLeads,
        },
        undefined as unknown as Record<string, unknown>
      );
      input.previousStepOutput = undefined;

      await step.run(input);

      // Verify icebreaker prompt was rendered with partial data (title/company as empty strings)
      const icebreakerCalls = mockRenderPrompt.mock.calls.filter(
        (call: unknown[]) => call[0] === "icebreaker_generation"
      );
      expect(icebreakerCalls.length).toBe(1);
      const variables = icebreakerCalls[0][1] as Record<string, string>;
      expect(variables.lead_name).toBe("Joao");
      expect(variables.lead_title).toBe("");
      expect(variables.lead_company).toBe("");
    });

    it("deve usar contagem dinamica de steps na progress message (AC: 17.11#3)", async () => {
      // Mock agent_steps query to return 3 active steps (2 skipped)
      const stepsData = [
        { status: "skipped" },
        { status: "skipped" },
        { status: "completed" },
        { status: "running" },
        { status: "pending" },
      ];
      const stepsQueryChain = createChainBuilder({ data: stepsData, error: null });
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "agent_steps") return stepsQueryChain;
        if (table === "agent_messages") return mockSupabase.messagesChain;
        if (table === "knowledge_base") return mockSupabase.kbChain;
        if (table === "products") return mockSupabase.productsChain;
        if (table === "api_configs") return mockSupabase.apiConfigsChain;
        if (table === "icebreaker_examples") return mockSupabase.icebreakerExamplesChain;
        return createChainBuilder();
      });

      const input = createInput(
        {
          skipSteps: ["search_companies", "search_leads"],
          importedLeads: IMPORTED_LEADS,
        },
        undefined as unknown as Record<string, unknown>
      );
      input.previousStepOutput = undefined;

      await step.run(input);

      const insertCalls = mockSupabase.messagesChain.insert.mock.calls;
      expect(insertCalls.length).toBeGreaterThan(0);
      const progressMsg = insertCalls[0][0];
      // 3 active steps (not skipped), completed+running = 2 non-pending active steps
      expect(progressMsg.content).toMatch(/Etapa 2\/3/);
    });
  });

  // ==============================================
  // Story 22.2: PREMIUM ICEBREAKERS (LinkedIn via Apify)
  // ==============================================

  describe("premium icebreakers (Story 22.2)", () => {
    // Helper: generateText → structure JSON na 1a chamada, conteudo nas demais
    function setupStructureThenContent() {
      let callCount = 0;
      mockGenerateText.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({ text: VALID_STRUCTURE_JSON, model: "gpt-4o", usage: {} });
        }
        return Promise.resolve({ text: `Icebreaker/email ${callCount}`, model: "gpt-4o", usage: {} });
      });
    }

    // NUCLEO (RED→GREEN): toggle ligado + lead com LinkedIn → caminho premium chamado
    it("usa Apify + icebreaker_premium_generation para lead com LinkedIn quando toggle ligado", async () => {
      setupStructureThenContent();
      mockFetchLinkedInPosts.mockResolvedValue({
        success: true,
        posts: MOCK_POSTS,
        profileUrl: "https://linkedin.com/in/jane",
        fetchedAt: "2026-01-10T00:00:00Z",
      });

      const input = createInput({ premiumIcebreakers: true });
      const result = await step.run(input);

      // Apify chamado UMA vez (so Jane tem linkedinUrl; John nao tem)
      expect(mockFetchLinkedInPosts).toHaveBeenCalledTimes(1);
      expect(mockFetchLinkedInPosts).toHaveBeenCalledWith(
        "decrypted-openai-key",
        "https://linkedin.com/in/jane",
        3
      );

      // prompt premium renderizado
      const premiumCalls = mockRenderPrompt.mock.calls.filter(
        (call: unknown[]) => call[0] === "icebreaker_premium_generation"
      );
      expect(premiumCalls.length).toBe(1);

      const data = result.data as Record<string, unknown>;
      const stats = data.icebreakerStats as { generated: number; premium: number; standard: number; failed: number };
      expect(stats.premium).toBe(1); // Jane via posts reais
      expect(stats.standard).toBe(1); // John sem LinkedIn → standard
      expect(stats.generated).toBe(2);
      expect(stats.failed).toBe(0);

      // custo real conta a chamada Apify
      expect(result.cost?.apify).toBe(1);
    });

    // AC5: toggle desligado (default) → ZERO Apify, comportamento standard
    it("NAO chama Apify quando toggle desligado (default) e conta tudo como standard", async () => {
      setupStructureThenContent();

      const input = createInput(); // sem premiumIcebreakers
      const result = await step.run(input);

      expect(mockFetchLinkedInPosts).not.toHaveBeenCalled();

      const data = result.data as Record<string, unknown>;
      const stats = data.icebreakerStats as { generated: number; premium: number; standard: number };
      expect(stats.premium).toBe(0);
      expect(stats.standard).toBe(2);
      expect(stats.generated).toBe(2);

      // sem premium → sem custo apify
      expect(result.cost?.apify).toBeUndefined();
    });

    // AC3 fallback: Apify retorna success:false → standard
    it("cai no standard quando Apify retorna success:false (nao conta como failed)", async () => {
      setupStructureThenContent();
      mockFetchLinkedInPosts.mockResolvedValue({
        success: false,
        posts: [],
        error: "Erro Apify",
        profileUrl: "https://linkedin.com/in/jane",
        fetchedAt: "2026-01-10T00:00:00Z",
      });

      const input = createInput({ premiumIcebreakers: true });
      const result = await step.run(input);

      expect(mockFetchLinkedInPosts).toHaveBeenCalledTimes(1);
      const data = result.data as Record<string, unknown>;
      const stats = data.icebreakerStats as { premium: number; standard: number; failed: number };
      expect(stats.premium).toBe(0);
      expect(stats.standard).toBe(2); // Jane cai pro standard, John standard
      expect(stats.failed).toBe(0);
      // chamada Apify feita mesmo com fallback → custo contabilizado
      expect(result.cost?.apify).toBe(1);
    });

    // AC3 fallback: Apify retorna posts vazios → standard
    it("cai no standard quando Apify retorna posts vazios", async () => {
      setupStructureThenContent();
      mockFetchLinkedInPosts.mockResolvedValue({
        success: true,
        posts: [],
        profileUrl: "https://linkedin.com/in/jane",
        fetchedAt: "2026-01-10T00:00:00Z",
      });

      const input = createInput({ premiumIcebreakers: true });
      const result = await step.run(input);

      const data = result.data as Record<string, unknown>;
      const stats = data.icebreakerStats as { premium: number; standard: number };
      expect(stats.premium).toBe(0);
      expect(stats.standard).toBe(2);
      // prompt premium NAO deve ter sido renderizado (sem posts)
      const premiumCalls = mockRenderPrompt.mock.calls.filter(
        (call: unknown[]) => call[0] === "icebreaker_premium_generation"
      );
      expect(premiumCalls.length).toBe(0);
    });

    // AC3 fallback: lead sem linkedinUrl → standard, sem chamar Apify
    it("nao chama Apify para leads sem linkedinUrl (fallback standard)", async () => {
      setupStructureThenContent();
      const noUrlLeads: SearchLeadResult[] = [
        { name: "Sem Link", title: "CTO", companyName: "X", email: "x@x.com", linkedinUrl: null, apolloId: "apollo-sem-link" },
      ];

      const input = createInput({ premiumIcebreakers: true }, {
        leads: noUrlLeads,
        totalFound: 1,
        jobTitles: ["CTO"],
        domainsSearched: [],
      });
      const result = await step.run(input);

      expect(mockFetchLinkedInPosts).not.toHaveBeenCalled();
      const data = result.data as Record<string, unknown>;
      const stats = data.icebreakerStats as { premium: number; standard: number };
      expect(stats.premium).toBe(0);
      expect(stats.standard).toBe(1);
    });

    // AC3 fallback: toggle ligado mas SEM Apify key → tudo standard, sem chamar Apify
    it("cai tudo no standard quando toggle ligado mas Apify key ausente", async () => {
      setupStructureThenContent();

      // api_configs (via service-role, Story 22.9): openai presente, apify ausente
      adminApiConfigsChain = createStatefulApiConfigs({
        openai: { encrypted_key: "enc-openai" },
        apollo: { encrypted_key: "enc-apollo" },
        apify: null,
      });

      const input = createInput({ premiumIcebreakers: true });
      const result = await step.run(input);

      expect(mockFetchLinkedInPosts).not.toHaveBeenCalled();
      const data = result.data as Record<string, unknown>;
      const stats = data.icebreakerStats as { premium: number; standard: number };
      expect(stats.premium).toBe(0);
      expect(stats.standard).toBe(2);
      expect(result.cost?.apify).toBeUndefined();
    });
  });

  // ==============================================
  // Story 22.15: persistencia em "Meus Leads"
  // ==============================================

  describe("persistencia em Meus Leads (Story 22.15)", () => {
    // O caminho de fail-open loga com console.error de proposito — silenciado aqui para
    // nao poluir a saida da suite. O restore e obrigatorio: `vi.clearAllMocks()` do
    // beforeEach externo NAO desinstala o spy, e ele vazaria para os testes seguintes.
    beforeEach(() => {
      vi.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    function setupStructureThenContent() {
      let callCount = 0;
      mockGenerateText.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({ text: VALID_STRUCTURE_JSON, model: "gpt-4o", usage: {} });
        }
        return Promise.resolve({ text: `Icebreaker/email ${callCount}`, model: "gpt-4o", usage: {} });
      });
    }

    /**
     * Bolhas escritas pelo step EXCLUINDO as do ciclo de vida (`progress` do inicio e
     * `step_complete` do fim, ambas do BaseStep). Sobra exatamente o que a persistencia
     * emitiu.
     *
     * Filtro ESTRUTURAL de proposito: filtrar por uma frase ("Meus Leads") torna o teste
     * de "sucesso limpo nao polui a conversa" cego para qualquer bolha sem aquela frase —
     * inclusive as que o proprio codigo emite. Aqui o inverso: qualquer bolha nova,
     * escreva o que escrever, aparece.
     */
    const LIFECYCLE_MESSAGE_TYPES = ["progress", "step_complete"];

    function myLeadsMessages(): string[] {
      return mockSupabase.messagesChain.insert.mock.calls
        .map((call: unknown[]) => call[0] as { content?: string; metadata?: { messageType?: string } })
        .filter((row) => !LIFECYCLE_MESSAGE_TYPES.includes(row?.metadata?.messageType ?? ""))
        .map((row) => row?.content ?? "");
    }

    it("chama a persistencia com os leads REVELADOS (pos-enrichment) e com icebreaker", async () => {
      setupStructureThenContent();
      // Lead mascarado, como a tabela de revisao mostra: sem email e com "*" no nome.
      mockEnrichPerson.mockResolvedValue({
        person: { email: "amanda@acme.com", first_name: "Amanda", last_name: "Rebel" },
      });

      const input = createInput({}, {
        leads: [
          {
            name: "Amanda Re***l",
            title: "CTO",
            companyName: "Acme",
            email: null,
            linkedinUrl: null,
            apolloId: "apollo-amanda",
          },
        ],
        totalFound: 1,
        jobTitles: ["CTO"],
        domainsSearched: [],
      });

      const result = await step.run(input);
      expect(result.success).toBe(true);

      expect(mockPersistApprovedLeads).toHaveBeenCalledTimes(1);
      const args = mockPersistApprovedLeads.mock.calls[0][0] as {
        tenantId: string;
        segmentName: string;
        leads: Array<{
          name: string;
          email: string | null;
          icebreaker: string | null;
          apolloId?: string | null;
        }>;
      };

      expect(args.tenantId).toBe(TENANT_ID);
      // Dados REVELADOS: jamais o valor mascarado.
      expect(args.leads[0].name).toBe("Amanda Rebel");
      expect(args.leads[0].email).toBe("amanda@acme.com");
      expect(args.leads[0].icebreaker).toBeTruthy();
      // `apolloId` faz parte do contrato: e a chave de dedupe do helper. Um lead cujo
      // reveal falhasse (email null) so seria identificavel por ele.
      expect(args.leads[0].apolloId).toBe("apollo-amanda");
    });

    it("sem segmentName no briefing, usa o nome da campanha", async () => {
      setupStructureThenContent();

      await step.run(createInput());

      const args = mockPersistApprovedLeads.mock.calls[0][0] as { segmentName: string };
      expect(args.segmentName).toContain("Campanha React");
    });

    it("segmentName pedido na conversa vence o nome da campanha", async () => {
      setupStructureThenContent();

      await step.run(createInput({ segmentName: "  Teste Atibaia  " }));

      const args = mockPersistApprovedLeads.mock.calls[0][0] as { segmentName: string };
      expect(args.segmentName).toBe("Teste Atibaia");
    });

    it("segmentName nao-string no JSONB nao escapa do fail-open (cai no nome da campanha)", async () => {
      setupStructureThenContent();

      const input = createInput();
      // O briefing vem de um JSONB com mais de um escritor: o valor pode ser qualquer coisa.
      (input.briefing as unknown as Record<string, unknown>).segmentName = { nome: "x" };

      const result = await step.run(input);

      expect(result.success).toBe(true);
      const args = mockPersistApprovedLeads.mock.calls[0][0] as { segmentName: string };
      expect(args.segmentName).toContain("Campanha React");
    });

    it("falha da persistencia NAO derruba o step e escreve a bolha de aviso", async () => {
      setupStructureThenContent();
      mockPersistApprovedLeads.mockRejectedValue(new Error("permission denied for table leads"));

      const result = await step.run(createInput());

      // A campanha ja estava pronta: o efeito colateral nao pode custar a execucao paga.
      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).campaignName).toBeDefined();

      const messages = myLeadsMessages();
      expect(messages).toHaveLength(1);
      expect(messages[0]).toMatch(/nao consegui salvar/i);
      expect(messages[0]).toMatch(/importe-os manualmente/i);
    });

    it("bolha de aviso que tambem falha nao derruba o step (try aninhado)", async () => {
      setupStructureThenContent();
      mockPersistApprovedLeads.mockRejectedValue(new Error("falhou"));
      // So a bolha de aviso falha (a de progresso, escrita antes, segue funcionando).
      mockSupabase.messagesChain.insert.mockImplementation((payload: { content?: string }) => {
        if ((payload?.content ?? "").includes("Meus Leads")) {
          throw new Error("agent_messages indisponivel");
        }
        return mockSupabase.messagesChain;
      });

      const result = await step.run(createInput());
      expect(result.success).toBe(true);
    });

    it("skipped > 0 gera bolha INFORMATIVA, nunca a de falha total", async () => {
      setupStructureThenContent();
      mockPersistApprovedLeads.mockResolvedValue({
        segmentId: "segment-1",
        segmentName: "Teste Atibaia",
        inserted: 1,
        reused: 0,
        associated: 1,
        skipped: 1,
        degraded: false,
      });

      const result = await step.run(createInput());
      expect(result.success).toBe(true);

      const messages = myLeadsMessages();
      expect(messages).toHaveLength(1);
      expect(messages[0]).toContain("Teste Atibaia");
      expect(messages[0]).toMatch(/ficou de fora/i);
      // O usuario NAO pode ser mandado reimportar leads que estao salvos.
      expect(messages[0]).not.toMatch(/importe-os manualmente/i);
      expect(messages[0]).not.toMatch(/nao consegui salvar/i);
    });

    it("degraded gera bolha INFORMATIVA de verdade parcial, nunca a de falha total", async () => {
      setupStructureThenContent();
      mockPersistApprovedLeads.mockResolvedValue({
        segmentId: "segment-1",
        segmentName: "Teste Atibaia",
        inserted: 2,
        reused: 0,
        associated: 0,
        skipped: 0,
        degraded: true,
      });

      const result = await step.run(createInput());
      expect(result.success).toBe(true);

      const messages = myLeadsMessages();
      expect(messages).toHaveLength(1);
      expect(messages[0]).toMatch(/parte da gravacao falhou/i);
      expect(messages[0]).not.toMatch(/importe-os manualmente/i);
    });

    it("degraded SEM segmento criado nao manda o usuario procurar uma lista inexistente", async () => {
      setupStructureThenContent();
      // Estado real e alcancavel (ver lead-persistence.test.ts, "falha no segmento com
      // leads JA na base"): leads salvos, segmento NUNCA criado.
      mockPersistApprovedLeads.mockResolvedValue({
        segmentId: null,
        segmentName: "Teste Atibaia",
        inserted: 0,
        reused: 2,
        associated: 0,
        skipped: 0,
        degraded: true,
      });

      const result = await step.run(createInput());
      expect(result.success).toBe(true);

      const messages = myLeadsMessages();
      expect(messages).toHaveLength(1);
      // Diz a verdade: leads na base, segmento nao criado.
      expect(messages[0]).toMatch(/nao consegui criar o segmento "Teste Atibaia"/i);
      expect(messages[0]).toMatch(/2 leads/);
      // e NAO afirma que eles estao no segmento
      expect(messages[0]).not.toMatch(/no segmento "Teste Atibaia"[.,]/);
      expect(messages[0]).not.toMatch(/importe-os manualmente/i);
      // Com `inserted: 0` NADA foi gravado nesta execucao: "Salvei" seria uma escrita
      // anunciada que nao houve, numa story cuja premissa e a mensagem honesta.
      expect(messages[0]).not.toMatch(/Salvei/i);
      expect(messages[0]).toMatch(/ja estavam em meus leads/i);
    });

    it("com leads REALMENTE gravados a bolha diz 'Salvei'", async () => {
      setupStructureThenContent();
      mockPersistApprovedLeads.mockResolvedValue({
        segmentId: null,
        segmentName: "Teste Atibaia",
        inserted: 2,
        reused: 0,
        associated: 0,
        skipped: 0,
        degraded: true,
      });

      await step.run(createInput());

      const messages = myLeadsMessages();
      expect(messages).toHaveLength(1);
      expect(messages[0]).toMatch(/salvei 2 leads em meus leads/i);
    });

    it("degraded COM segmento e inserted 0 nao anuncia escrita nem agrupamento que nao houve", async () => {
      setupStructureThenContent();
      // Todos os leads ja existiam e a associacao falhou (Fase 4): o segmento existe, mas
      // esta VAZIO. A frase fixa "Salvei os leads em Meus Leads no segmento X" afirmava as
      // duas coisas que nao aconteceram e mandava o usuario abrir uma lista sem os leads.
      mockPersistApprovedLeads.mockResolvedValue({
        segmentId: "segment-1",
        segmentName: "Teste Atibaia",
        inserted: 0,
        reused: 2,
        associated: 0,
        skipped: 0,
        degraded: true,
      });

      const result = await step.run(createInput());
      expect(result.success).toBe(true);

      const messages = myLeadsMessages();
      expect(messages).toHaveLength(1);
      expect(messages[0]).not.toMatch(/Salvei/i);
      expect(messages[0]).toMatch(/ja estavam em meus leads/i);
      expect(messages[0]).toMatch(/parte da gravacao falhou/i);
      // Nao afirma o agrupamento — ele e justamente o que pode ter faltado.
      expect(messages[0]).not.toMatch(/em meus leads no segmento "Teste Atibaia"/i);
      expect(messages[0]).not.toMatch(/importe-os manualmente/i);
    });

    it("degradado sem NENHUM lead resolvido nao inventa 'Seus 0 leads' nem manda reimportar", async () => {
      setupStructureThenContent();
      // Estado real (ver lead-persistence.test.ts, "insert sem RETURNING utilizavel"): o
      // insert pode ter gravado e nao devolvido os ids. Contar leads aqui produzia
      // "Seus 0 leads ja estavam em Meus Leads ... eles estao na base" — absurdo e
      // contraditorio na mesma frase.
      mockPersistApprovedLeads.mockResolvedValue({
        segmentId: null,
        segmentName: "Teste Atibaia",
        inserted: 0,
        reused: 0,
        associated: 0,
        skipped: 0,
        degraded: true,
      });

      const result = await step.run(createInput());
      expect(result.success).toBe(true);

      const messages = myLeadsMessages();
      expect(messages).toHaveLength(1);
      expect(messages[0]).not.toMatch(/0 leads?/);
      expect(messages[0]).toMatch(/nao consegui confirmar/i);
      // Pode ter sido gravado: mandar reimportar duplicaria a base.
      expect(messages[0]).not.toMatch(/importe-os manualmente/i);
    });

    it("falha da BOLHA informativa nao vira a bolha de falha total sobre leads salvos", async () => {
      setupStructureThenContent();
      mockPersistApprovedLeads.mockResolvedValue({
        segmentId: "segment-1",
        segmentName: "Teste Atibaia",
        inserted: 2,
        reused: 0,
        associated: 2,
        skipped: 1,
        degraded: false,
      });
      // A escrita da bolha informativa falha DEPOIS dos leads gravados. Estando ela dentro
      // do try da persistencia, o catch anunciava "importe-os manualmente" sobre leads que
      // ESTAO em Meus Leads — a reimportacao duplica a base que a story existe para organizar.
      let seen = 0;
      mockSupabase.messagesChain.insert.mockImplementation((payload: { content?: string }) => {
        if ((payload?.content ?? "").includes("Meus Leads")) {
          seen += 1;
          if (seen === 1) throw new Error("agent_messages indisponivel");
        }
        return mockSupabase.messagesChain;
      });

      const result = await step.run(createInput());
      expect(result.success).toBe(true);
      // Uma unica tentativa: a informativa. A de falha total nem chega a ser montada.
      expect(seen).toBe(1);
      expect(myLeadsMessages().some((m) => /importe-os manualmente/i.test(m))).toBe(false);
    });

    it("nada salvo com leads pulados: a bolha diz explicitamente que NADA foi para Meus Leads", async () => {
      setupStructureThenContent();
      mockPersistApprovedLeads.mockResolvedValue({
        segmentId: null,
        segmentName: "Teste Atibaia",
        inserted: 0,
        reused: 0,
        associated: 0,
        skipped: 2,
        degraded: false,
      });

      const result = await step.run(createInput());
      expect(result.success).toBe(true);

      const messages = myLeadsMessages();
      expect(messages).toHaveLength(1);
      // Sem esta frase o usuario supoe que o "resto" foi salvo — nao havia resto.
      expect(messages[0]).toMatch(/nenhum lead foi salvo em meus leads/i);
      expect(messages[0]).toMatch(/ficaram de fora/i);
      expect(messages[0]).not.toMatch(/Salvei/i);
    });

    it("sucesso limpo nao polui a conversa com bolha nenhuma", async () => {
      setupStructureThenContent();

      await step.run(createInput());

      expect(myLeadsMessages()).toHaveLength(0);
    });

    // ==============================================
    // Costura step -> helper REAL (sem mock da persistencia)
    // ==============================================

    describe("contra o helper REAL (FakeDb)", () => {
      let db: FakeDb;

      beforeEach(async () => {
        db = new FakeDb();
        // Roteia leads/segments/lead_segments para o banco fake; o resto do step
        // (agent_steps, agent_messages, knowledge_base, products) segue nos chains.
        mockSupabase = createMockSupabase(db);
        step = new CreateCampaignStep(3, mockSupabase as never, TENANT_ID);
        setupDefaultMocks();

        const actual = await vi.importActual<typeof import("@/lib/agent/lead-persistence")>(
          "@/lib/agent/lead-persistence"
        );
        mockPersistApprovedLeads.mockImplementation(actual.persistApprovedLeads);
      });

      it("grava de fato os leads, o segmento e as associacoes em Meus Leads", async () => {
        setupStructureThenContent();

        const result = await step.run(createInput());
        expect(result.success).toBe(true);

        expect(db.leads).toHaveLength(2);
        expect(db.leads.map((l) => l.email).sort()).toEqual(["jane@beta.io", "john@acme.com"]);
        // `apollo_id` atravessa a costura: e a chave do unique parcial e do dedupe da
        // proxima execucao. Sem este assert, parar de repassar o campo passaria verde.
        expect(db.leads.map((l) => l.apollo_id).sort()).toEqual(["apollo-jane", "apollo-john"]);
        expect(db.leads.every((l) => l.first_name !== "")).toBe(true);
        expect(db.leads.every((l) => Boolean(l.icebreaker))).toBe(true);
        expect(db.leads.every((l) => l.tenant_id === TENANT_ID)).toBe(true);

        expect(db.segments).toHaveLength(1);
        expect(db.segments[0].name).toContain("Campanha React");
        expect(db.associations).toHaveLength(2);

        // sucesso limpo: nenhuma bolha
        expect(myLeadsMessages()).toHaveLength(0);
      });

      it("re-executar o step (ajuste pos-rejeicao) nao duplica lead nem associacao", async () => {
        setupStructureThenContent();
        await step.run(createInput());

        setupStructureThenContent();
        const second = await step.run(createInput());

        expect(second.success).toBe(true);
        expect(db.leads).toHaveLength(2);
        expect(db.segments).toHaveLength(1);
        expect(db.associations).toHaveLength(2);
      });

      it("usa o segmento pedido na conversa e o reusa na re-execucao", async () => {
        setupStructureThenContent();
        await step.run(createInput({ segmentName: "Teste Atibaia" }));

        expect(db.segments).toHaveLength(1);
        expect(db.segments[0].name).toBe("Teste Atibaia");

        // caixa diferente no turno seguinte (o LLM varia): mesmo segmento
        setupStructureThenContent();
        await step.run(createInput({ segmentName: "teste atibaia" }));

        expect(db.segments).toHaveLength(1);
        expect(db.associations).toHaveLength(2);
      });

      it("falha real do banco nao derruba o step e produz a bolha honesta", async () => {
        setupStructureThenContent();
        db.fail("leads", "select", { code: "42501", message: "permission denied for table leads" }, 5);

        const result = await step.run(createInput());

        expect(result.success).toBe(true);
        expect(db.leads).toHaveLength(0);
        const messages = myLeadsMessages();
        expect(messages).toHaveLength(1);
        expect(messages[0]).toMatch(/nao consegui salvar/i);
      });
    });
  });
});
