/**
 * Tests for Approach Suggestion Generator
 * Story 13.5: Geração de Sugestão de Abordagem — AC #8
 *
 * Tests: generateApproachSuggestion (success, failures, template interpolation,
 * prompt loading fallback, truncation), calculateSuggestionCost.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createChainBuilder } from "../../../helpers/mock-supabase";
import {
  generateApproachSuggestion,
  calculateSuggestionCost,
} from "@/lib/utils/approach-suggestion";
import type {
  LeadContextForSuggestion,
  KBContextForSuggestion,
} from "@/lib/utils/approach-suggestion";

// ==============================================
// MOCKS
// ==============================================

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// ==============================================
// HELPERS
// ==============================================

function createMockSupabase() {
  const mockFrom = vi.fn();
  const supabase = { from: mockFrom } as unknown as Parameters<
    typeof generateApproachSuggestion
  >[5];
  return { supabase, mockFrom };
}

function createLeadContext(
  overrides: Partial<LeadContextForSuggestion> = {}
): LeadContextForSuggestion {
  return {
    leadName: "João Silva",
    leadTitle: "CTO",
    leadCompany: "TechCorp",
    leadIndustry: "Tecnologia",
    ...overrides,
  };
}

function createKBContext(
  overrides: Partial<KBContextForSuggestion> = {}
): KBContextForSuggestion {
  return {
    companyContext: "Empresa de automação B2B",
    productsServices: "CRM, automação de vendas",
    competitiveAdvantages: "IA integrada, preço competitivo",
    icpSummary: "CTOs de startups",
    toneDescription: "Tom casual e amigável",
    toneStyle: "casual",
    ...overrides,
  };
}

function mockOpenAISuccess(text: string = "Sugestão de abordagem gerada.") {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () =>
      Promise.resolve({
        choices: [{ message: { content: text } }],
        usage: { prompt_tokens: 450, completion_tokens: 150 },
      }),
  });
}

function mockOpenAIError(status: number = 429) {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    status,
  });
}

function setupSupabaseForCodeDefault(mockFrom: ReturnType<typeof vi.fn>) {
  // Both tenant and global prompts return null → falls back to code default
  const emptyChain = createChainBuilder({ data: null, error: { code: "PGRST116" } });
  mockFrom.mockReturnValue(emptyChain);
}

// ==============================================
// TESTS
// ==============================================

beforeEach(() => {
  vi.clearAllMocks();
});

describe("generateApproachSuggestion", () => {
  it("retorna sugestão quando geração OK", async () => {
    const { supabase, mockFrom } = createMockSupabase();
    setupSupabaseForCodeDefault(mockFrom);
    mockOpenAISuccess("O post do lead sobre IA conecta com nosso produto de automação.");

    const result = await generateApproachSuggestion(
      "Post sobre IA em vendas B2B",
      "https://linkedin.com/posts/1",
      createLeadContext(),
      createKBContext(),
      "sk-test-key",
      supabase,
      "tenant-1"
    );

    expect(result.suggestion).toBe(
      "O post do lead sobre IA conecta com nosso produto de automação."
    );
    expect(result.promptTokens).toBe(450);
    expect(result.completionTokens).toBe(150);
    expect(result.error).toBeUndefined();
  });

  it("retorna suggestion=null quando OpenAI key ausente", async () => {
    const { supabase } = createMockSupabase();

    const result = await generateApproachSuggestion(
      "Post sobre IA",
      "https://linkedin.com/posts/1",
      createLeadContext(),
      createKBContext(),
      null,
      supabase,
      "tenant-1"
    );

    expect(result.suggestion).toBeNull();
    expect(result.error).toBe("OpenAI key não configurada");
    expect(result.promptTokens).toBe(0);
    expect(result.completionTokens).toBe(0);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("retorna suggestion=null quando OpenAI falha (HTTP error)", async () => {
    const { supabase, mockFrom } = createMockSupabase();
    setupSupabaseForCodeDefault(mockFrom);
    mockOpenAIError(429);

    const result = await generateApproachSuggestion(
      "Post sobre vendas",
      "https://linkedin.com/posts/1",
      createLeadContext(),
      createKBContext(),
      "sk-test-key",
      supabase,
      "tenant-1"
    );

    expect(result.suggestion).toBeNull();
    expect(result.error).toBe("OpenAI API error: 429");
    expect(result.promptTokens).toBe(0);
    expect(result.completionTokens).toBe(0);
  });

  it("retorna suggestion=null quando OpenAI retorna texto vazio", async () => {
    const { supabase, mockFrom } = createMockSupabase();
    setupSupabaseForCodeDefault(mockFrom);
    mockOpenAISuccess("   ");

    const result = await generateApproachSuggestion(
      "Post sobre marketing",
      "https://linkedin.com/posts/1",
      createLeadContext(),
      createKBContext(),
      "sk-test-key",
      supabase,
      "tenant-1"
    );

    expect(result.suggestion).toBeNull();
    expect(result.error).toBe("Sugestão vazia retornada");
    expect(result.promptTokens).toBe(450);
    expect(result.completionTokens).toBe(150);
  });

  it("retorna suggestion=null quando OpenAI timeout (AbortError)", async () => {
    const { supabase, mockFrom } = createMockSupabase();
    setupSupabaseForCodeDefault(mockFrom);
    mockFetch.mockRejectedValueOnce(
      new DOMException("The operation was aborted.", "AbortError")
    );

    const result = await generateApproachSuggestion(
      "Post sobre vendas",
      "https://linkedin.com/posts/1",
      createLeadContext(),
      createKBContext(),
      "sk-test-key",
      supabase,
      "tenant-1"
    );

    expect(result.suggestion).toBeNull();
    expect(result.error).toBe("The operation was aborted.");
    expect(result.promptTokens).toBe(0);
    expect(result.completionTokens).toBe(0);
  });

  it("retorna suggestion=null quando OpenAI retorna content missing", async () => {
    const { supabase, mockFrom } = createMockSupabase();
    setupSupabaseForCodeDefault(mockFrom);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [{ message: {} }],
          usage: { prompt_tokens: 0, completion_tokens: 0 },
        }),
    });

    const result = await generateApproachSuggestion(
      "Post",
      "https://linkedin.com/posts/1",
      createLeadContext(),
      createKBContext(),
      "sk-test-key",
      supabase,
      "tenant-1"
    );

    expect(result.suggestion).toBeNull();
    expect(result.error).toBe("OpenAI response missing choices[0].message.content");
  });

  it("interpola variáveis do lead no template", async () => {
    const { supabase, mockFrom } = createMockSupabase();
    setupSupabaseForCodeDefault(mockFrom);
    mockOpenAISuccess("Sugestão personalizada");

    await generateApproachSuggestion(
      "Post sobre dados",
      "https://linkedin.com/posts/1",
      createLeadContext({
        leadName: "Maria Souza",
        leadTitle: "CEO",
        leadCompany: "DataCorp",
        leadIndustry: "Analytics",
      }),
      createKBContext(),
      "sk-test-key",
      supabase,
      "tenant-1"
    );

    expect(mockFetch).toHaveBeenCalledOnce();
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    const prompt = body.messages[0].content;
    expect(prompt).toContain("Maria Souza");
    expect(prompt).toContain("CEO");
    expect(prompt).toContain("DataCorp");
    expect(prompt).toContain("Analytics");
  });

  it("interpola variáveis de tom de voz no template", async () => {
    const { supabase, mockFrom } = createMockSupabase();
    setupSupabaseForCodeDefault(mockFrom);
    mockOpenAISuccess("Sugestão formal");

    await generateApproachSuggestion(
      "Post sobre estratégia",
      "https://linkedin.com/posts/1",
      createLeadContext(),
      createKBContext({
        toneDescription: "Tom formal e corporativo",
        toneStyle: "formal",
      }),
      "sk-test-key",
      supabase,
      "tenant-1"
    );

    expect(mockFetch).toHaveBeenCalledOnce();
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    const prompt = body.messages[0].content;
    expect(prompt).toContain("Tom formal e corporativo");
    expect(prompt).toContain("formal");
  });

  it("trunca post longo (>4000 chars)", async () => {
    const { supabase, mockFrom } = createMockSupabase();
    setupSupabaseForCodeDefault(mockFrom);
    mockOpenAISuccess("Sugestão para post longo");

    const longPost = "A".repeat(5000);

    await generateApproachSuggestion(
      longPost,
      "https://linkedin.com/posts/1",
      createLeadContext(),
      createKBContext(),
      "sk-test-key",
      supabase,
      "tenant-1"
    );

    expect(mockFetch).toHaveBeenCalledOnce();
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    const prompt = body.messages[0].content;
    // Truncated to 4000 chars + "..."
    expect(prompt).not.toContain("A".repeat(5000));
    expect(prompt).toContain("A".repeat(4000) + "...");
  });

  it("usa fallback code default quando prompt não encontrado no DB", async () => {
    const { supabase, mockFrom } = createMockSupabase();
    // Both tenant and global return null → code default is used
    setupSupabaseForCodeDefault(mockFrom);
    mockOpenAISuccess("Sugestão com default");

    const result = await generateApproachSuggestion(
      "Post relevante",
      "https://linkedin.com/posts/1",
      createLeadContext(),
      createKBContext(),
      "sk-test-key",
      supabase,
      "tenant-1"
    );

    expect(result.suggestion).toBe("Sugestão com default");
    // Code default uses gpt-4o-mini
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.model).toBe("gpt-4o-mini");
    expect(body.temperature).toBe(0.7);
    expect(body.max_tokens).toBe(500);
  });

  it("usa prompt do tenant quando disponível no DB", async () => {
    const { supabase, mockFrom } = createMockSupabase();
    const tenantPromptChain = createChainBuilder({
      data: {
        prompt_template: "Template customizado: {{post_text}}",
        model_preference: "gpt-4o",
        metadata: { temperature: 0.5, maxTokens: 300 },
      },
      error: null,
    });
    mockFrom.mockReturnValue(tenantPromptChain);
    mockOpenAISuccess("Sugestão com template custom");

    const result = await generateApproachSuggestion(
      "Post sobre vendas",
      "https://linkedin.com/posts/1",
      createLeadContext(),
      createKBContext(),
      "sk-test-key",
      supabase,
      "tenant-1"
    );

    expect(result.suggestion).toBe("Sugestão com template custom");
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.model).toBe("gpt-4o");
    expect(body.temperature).toBe(0.5);
    expect(body.max_tokens).toBe(300);
  });

  it("não inclui response_format JSON — retorno é texto livre", async () => {
    const { supabase, mockFrom } = createMockSupabase();
    setupSupabaseForCodeDefault(mockFrom);
    mockOpenAISuccess("Texto livre");

    await generateApproachSuggestion(
      "Post",
      "https://linkedin.com/posts/1",
      createLeadContext(),
      createKBContext(),
      "sk-test-key",
      supabase,
      "tenant-1"
    );

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.response_format).toBeUndefined();
  });
});

describe("calculateSuggestionCost", () => {
  it("calcula custo com promptTokens e completionTokens", () => {
    // 500 prompt * 0.15 + 200 completion * 0.60 = 75 + 120 = 195 / 1_000_000 = 0.000195
    const cost = calculateSuggestionCost(500, 200);
    expect(cost).toBeCloseTo(0.000195, 6);
  });

  it("retorna 0 para 0 tokens", () => {
    const cost = calculateSuggestionCost(0, 0);
    expect(cost).toBe(0);
  });
});
