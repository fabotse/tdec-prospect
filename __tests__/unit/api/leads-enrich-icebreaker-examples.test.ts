/**
 * Icebreaker Examples Integration Tests
 * Story 9.2: Exemplos de Referencia para Ice Breakers no Knowledge Base
 *
 * AC: #3 - Examples injected in prompt via {{icebreaker_examples}}
 * AC: #4 - Graceful degradation when no examples exist
 *
 * Tests that icebreaker examples are fetched, formatted, and passed
 * to the prompt correctly during icebreaker generation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/leads/enrich-icebreaker/route";
import { createChainBuilder } from "../../helpers/mock-supabase";

// Use vi.hoisted for mocks
const {
  mockGetCurrentUserProfile,
  mockFrom,
  mockRenderPrompt,
  mockGenerateText,
  mockFetchLinkedInPosts,
  mockDecryptApiKey,
} = vi.hoisted(() => ({
  mockGetCurrentUserProfile: vi.fn(),
  mockFrom: vi.fn(),
  mockRenderPrompt: vi.fn(),
  mockGenerateText: vi.fn(),
  mockFetchLinkedInPosts: vi.fn(),
  mockDecryptApiKey: vi.fn(),
}));

vi.mock("@/lib/supabase/tenant", () => ({
  getCurrentUserProfile: () => mockGetCurrentUserProfile(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve({ from: mockFrom })),
}));

vi.mock("@/lib/crypto/encryption", () => ({
  decryptApiKey: (encrypted: string) => mockDecryptApiKey(encrypted),
}));

vi.mock("@/lib/services/apify", () => ({
  ApifyService: class MockApifyService {
    fetchLinkedInPosts = mockFetchLinkedInPosts;
  },
}));

vi.mock("@/lib/ai/prompt-manager", () => ({
  PromptManager: vi.fn().mockImplementation(() => ({
    renderPrompt: mockRenderPrompt,
  })),
  promptManager: {
    renderPrompt: mockRenderPrompt,
  },
}));

vi.mock("@/lib/ai/providers", () => ({
  createAIProvider: vi.fn(() => ({
    generateText: mockGenerateText,
  })),
}));

describe("Story 9.2: Icebreaker Examples in Generation", () => {
  const tenantId = "tenant-123";
  const userId = "user-456";
  const leadId = "550e8400-e29b-41d4-a716-446655440001";

  const mockLead = {
    id: leadId,
    tenant_id: tenantId,
    first_name: "Joao",
    last_name: "Silva",
    email: "joao@example.com",
    linkedin_url: "https://linkedin.com/in/joaosilva",
    title: "CTO",
    company_name: "TechCorp",
    industry: "Tecnologia",
    icebreaker: null,
    icebreaker_generated_at: null,
    linkedin_posts_cache: null,
  };

  const mockIcebreakerExamples = [
    {
      id: "ib-1",
      tenant_id: tenantId,
      text: "Vi que a Acme está expandindo para SaaS.",
      category: "empresa",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
    {
      id: "ib-2",
      tenant_id: tenantId,
      text: "Como Head de Vendas, você deve lidar com escala.",
      category: "cargo",
      created_at: "2026-01-02T00:00:00Z",
      updated_at: "2026-01-02T00:00:00Z",
    },
    {
      id: "ib-3",
      tenant_id: tenantId,
      text: "A trajetória da sua empresa no fintech me chamou atenção.",
      category: "empresa",
      created_at: "2026-01-03T00:00:00Z",
      updated_at: "2026-01-03T00:00:00Z",
    },
    {
      id: "ib-4",
      tenant_id: tenantId,
      text: "Exemplo genérico sem categoria.",
      category: null,
      created_at: "2026-01-04T00:00:00Z",
      updated_at: "2026-01-04T00:00:00Z",
    },
  ];

  const createRequest = (body: unknown) => {
    return new NextRequest("http://localhost/api/leads/enrich-icebreaker", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    });
  };

  function setupMocks(options?: { icebreakerExamples?: typeof mockIcebreakerExamples }) {
    const ibExamples = options?.icebreakerExamples ?? mockIcebreakerExamples;

    mockGetCurrentUserProfile.mockResolvedValue({
      tenant_id: tenantId,
      user_id: userId,
      role: "user",
    });

    mockDecryptApiKey.mockImplementation((encrypted: string) => `decrypted-${encrypted}`);

    mockFrom.mockImplementation((table: string) => {
      if (table === "api_configs") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { encrypted_key: "encrypted-key" },
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      if (table === "leads") {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: [mockLead],
                error: null,
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              error: null,
            }),
          }),
        };
      }
      if (table === "knowledge_base") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { content: { company_name: "TestCorp", preset: "casual" } },
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      if (table === "icebreaker_examples") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: ibExamples,
                error: null,
              }),
            }),
          }),
        };
      }
      return createChainBuilder();
    });

    mockRenderPrompt.mockResolvedValue({
      content: "Generate icebreaker",
      modelPreference: "gpt-4o-mini",
      metadata: { temperature: 0.7, maxTokens: 200 },
      source: "default",
    });

    mockGenerateText.mockResolvedValue({
      text: "Generated icebreaker text!",
      model: "gpt-4o-mini",
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    setupMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ==============================================
  // AC #3: Icebreaker examples injected in prompt
  // ==============================================

  describe("AC #3: Examples injected in prompt", () => {
    it("passes icebreaker_examples variable to prompt for empresa category", async () => {
      const request = createRequest({ leadIds: [leadId], category: "empresa" });
      await POST(request);

      expect(mockRenderPrompt).toHaveBeenCalledWith(
        "icebreaker_generation",
        expect.objectContaining({
          icebreaker_examples: expect.stringContaining("Acme"),
        }),
        { tenantId }
      );
    });

    it("prioritizes same-category examples (empresa)", async () => {
      const request = createRequest({ leadIds: [leadId], category: "empresa" });
      await POST(request);

      const callArgs = mockRenderPrompt.mock.calls[0];
      const ibExamples = callArgs[1].icebreaker_examples;

      // Should contain empresa examples first
      expect(ibExamples).toContain("Acme");
      expect(ibExamples).toContain("fintech");
    });

    it("limits examples to max 3", async () => {
      const manyExamples = [
        ...mockIcebreakerExamples,
        { id: "ib-5", tenant_id: tenantId, text: "Extra 1", category: "empresa", created_at: "2026-01-05T00:00:00Z", updated_at: "2026-01-05T00:00:00Z" },
        { id: "ib-6", tenant_id: tenantId, text: "Extra 2", category: "empresa", created_at: "2026-01-06T00:00:00Z", updated_at: "2026-01-06T00:00:00Z" },
      ];
      setupMocks({ icebreakerExamples: manyExamples });

      const request = createRequest({ leadIds: [leadId], category: "empresa" });
      await POST(request);

      const callArgs = mockRenderPrompt.mock.calls[0];
      const ibExamples = callArgs[1].icebreaker_examples;

      // Count "Exemplo" occurrences — should be exactly 3
      const exampleCount = (ibExamples.match(/Exemplo \d+:/g) || []).length;
      expect(exampleCount).toBe(3);
    });

    it("fills with null-category examples when not enough same-category", async () => {
      // Only 1 lead-category example, plus null-category should fill
      const sparseExamples = [
        { id: "ib-1", tenant_id: tenantId, text: "Lead example", category: "lead", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" },
        { id: "ib-2", tenant_id: tenantId, text: "Generic example", category: null, created_at: "2026-01-02T00:00:00Z", updated_at: "2026-01-02T00:00:00Z" },
      ];
      setupMocks({ icebreakerExamples: sparseExamples });

      const request = createRequest({ leadIds: [leadId], category: "lead" });
      await POST(request);

      const callArgs = mockRenderPrompt.mock.calls[0];
      const ibExamples = callArgs[1].icebreaker_examples;

      expect(ibExamples).toContain("Lead example");
      expect(ibExamples).toContain("Generic example");
    });
  });

  // ==============================================
  // AC #4: Graceful degradation
  // ==============================================

  describe("AC #4: Graceful degradation without examples", () => {
    it("passes empty string when no icebreaker examples exist", async () => {
      setupMocks({ icebreakerExamples: [] });

      const request = createRequest({ leadIds: [leadId], category: "empresa" });
      await POST(request);

      expect(mockRenderPrompt).toHaveBeenCalledWith(
        "icebreaker_generation",
        expect.objectContaining({
          icebreaker_examples: "",
        }),
        { tenantId }
      );
    });

    it("still generates icebreaker successfully without examples", async () => {
      setupMocks({ icebreakerExamples: [] });

      const request = createRequest({ leadIds: [leadId], category: "empresa" });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.results[0].success).toBe(true);
      expect(data.results[0].icebreaker).toBe("Generated icebreaker text!");
    });

    it("passes empty string when DB query for examples fails", async () => {
      // Override icebreaker_examples table to return error
      const originalMockFrom = mockFrom.getMockImplementation();
      mockFrom.mockImplementation((table: string) => {
        if (table === "icebreaker_examples") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: null,
                  error: new Error("DB error"),
                }),
              }),
            }),
          };
        }
        // Delegate to original for other tables
        return originalMockFrom!(table);
      });

      const request = createRequest({ leadIds: [leadId], category: "empresa" });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.results[0].success).toBe(true);
    });
  });

  // ==============================================
  // Format validation
  // ==============================================

  describe("Category filtering edge cases", () => {
    it("returns empty string when all examples have different category than requested", async () => {
      // Only "cargo" examples, but requesting "lead" — no match, no null-category fallback
      const onlyCargo = [
        { id: "ib-1", tenant_id: tenantId, text: "Cargo only", category: "cargo", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" },
      ];
      setupMocks({ icebreakerExamples: onlyCargo });

      const request = createRequest({ leadIds: [leadId], category: "lead" });
      await POST(request);

      const callArgs = mockRenderPrompt.mock.calls[0];
      const ibExamples = callArgs[1].icebreaker_examples;

      expect(ibExamples).toBe("");
    });

    it("works correctly with cargo category", async () => {
      const cargoExamples = [
        { id: "ib-1", tenant_id: tenantId, text: "Cargo example text", category: "cargo", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" },
      ];
      setupMocks({ icebreakerExamples: cargoExamples });

      const request = createRequest({ leadIds: [leadId], category: "cargo" });
      await POST(request);

      const callArgs = mockRenderPrompt.mock.calls[0];
      const ibExamples = callArgs[1].icebreaker_examples;

      expect(ibExamples).toContain("Cargo example text");
      expect(ibExamples).toContain("Categoria: Cargo");
    });
  });

  describe("Example formatting", () => {
    it("formats examples with Exemplo N, Texto, and Categoria", async () => {
      const singleExample = [
        { id: "ib-1", tenant_id: tenantId, text: "Test text", category: "empresa", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" },
      ];
      setupMocks({ icebreakerExamples: singleExample });

      const request = createRequest({ leadIds: [leadId], category: "empresa" });
      await POST(request);

      const callArgs = mockRenderPrompt.mock.calls[0];
      const ibExamples = callArgs[1].icebreaker_examples;

      expect(ibExamples).toContain("Exemplo 1:");
      expect(ibExamples).toContain("Texto: Test text");
      expect(ibExamples).toContain("Categoria: Empresa");
    });

    it("formats null category as Geral", async () => {
      const nullCatExample = [
        { id: "ib-1", tenant_id: tenantId, text: "Generic", category: null, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" },
      ];
      setupMocks({ icebreakerExamples: nullCatExample });

      const request = createRequest({ leadIds: [leadId], category: "empresa" });
      await POST(request);

      const callArgs = mockRenderPrompt.mock.calls[0];
      const ibExamples = callArgs[1].icebreaker_examples;

      expect(ibExamples).toContain("Categoria: Geral");
    });
  });
});
