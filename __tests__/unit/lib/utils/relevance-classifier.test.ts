/**
 * Tests for Relevance Classifier
 * Story 13.4: Filtro de Relevância por IA — AC #12
 *
 * Tests: parseClassificationResponse, interpolateTemplate, calculateClassificationCost,
 * classifyPostRelevance (fallbacks, OpenAI integration, prompt loading).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createChainBuilder } from "../../../helpers/mock-supabase";
import {
  parseClassificationResponse,
  interpolateTemplate,
  calculateClassificationCost,
  classifyPostRelevance,
} from "@/lib/utils/relevance-classifier";
import type { KBContextForClassification } from "@/lib/utils/relevance-classifier";

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
    typeof classifyPostRelevance
  >[4];
  return { supabase, mockFrom };
}

function createKBContext(
  overrides: Partial<KBContextForClassification> = {}
): KBContextForClassification {
  return {
    companyContext: "Empresa de tecnologia B2B",
    productsServices: "CRM, automação de vendas",
    competitiveAdvantages: "IA integrada, preço competitivo",
    icpSummary: "CTOs de startups",
    ...overrides,
  };
}

// ==============================================
// parseClassificationResponse
// ==============================================

describe("parseClassificationResponse", () => {
  it("retorna classificação de JSON válido relevante", () => {
    const result = parseClassificationResponse(
      '{"isRelevant": true, "reasoning": "Post sobre IA em vendas"}'
    );

    expect(result.isRelevant).toBe(true);
    expect(result.reasoning).toBe("Post sobre IA em vendas");
  });

  it("retorna classificação de JSON válido não relevante", () => {
    const result = parseClassificationResponse(
      '{"isRelevant": false, "reasoning": "Post sobre culinária"}'
    );

    expect(result.isRelevant).toBe(false);
    expect(result.reasoning).toBe("Post sobre culinária");
  });

  it("retorna fail-open para JSON inválido", () => {
    const result = parseClassificationResponse("not json at all");

    expect(result.isRelevant).toBe(true);
    expect(result.reasoning).toContain("JSON inválido");
  });

  it("retorna fail-open se isRelevant não é boolean", () => {
    const result = parseClassificationResponse(
      '{"isRelevant": "yes", "reasoning": "reason"}'
    );

    expect(result.isRelevant).toBe(true);
    expect(result.reasoning).toContain("sem campo isRelevant");
  });

  it("retorna reasoning vazio se reasoning não é string", () => {
    const result = parseClassificationResponse(
      '{"isRelevant": true, "reasoning": 123}'
    );

    expect(result.isRelevant).toBe(true);
    expect(result.reasoning).toBe("");
  });

  it("lida com JSON com campos extras", () => {
    const result = parseClassificationResponse(
      '{"isRelevant": false, "reasoning": "Não relevante", "confidence": 0.9}'
    );

    expect(result.isRelevant).toBe(false);
    expect(result.reasoning).toBe("Não relevante");
  });

  it("lida com JSON com markdown wrapping", () => {
    const result = parseClassificationResponse(
      '```json\n{"isRelevant": true, "reasoning": "Relevante"}\n```'
    );

    expect(result.isRelevant).toBe(true);
    expect(result.reasoning).toBe("Relevante");
  });

  it("lida com espaços e newlines ao redor do JSON", () => {
    const result = parseClassificationResponse(
      '  \n  {"isRelevant": false, "reasoning": "Teste"}  \n  '
    );

    expect(result.isRelevant).toBe(false);
    expect(result.reasoning).toBe("Teste");
  });
});

// ==============================================
// interpolateTemplate
// ==============================================

describe("interpolateTemplate", () => {
  it("substitui variáveis simples", () => {
    const result = interpolateTemplate("Olá {{name}}", { name: "João" });
    expect(result).toBe("Olá João");
  });

  it("mantém placeholder se variável não encontrada", () => {
    const result = interpolateTemplate("Olá {{name}}", {});
    expect(result).toBe("Olá {{name}}");
  });

  it("substitui múltiplas ocorrências", () => {
    const result = interpolateTemplate(
      "{{greeting}} {{name}}, bem-vindo à {{company}}",
      { greeting: "Oi", name: "Maria", company: "TDEC" }
    );
    expect(result).toBe("Oi Maria, bem-vindo à TDEC");
  });

  it("substitui mesma variável múltiplas vezes", () => {
    const result = interpolateTemplate("{{x}} e {{x}}", { x: "test" });
    expect(result).toBe("test e test");
  });

  it("retorna string original se nenhum placeholder", () => {
    const result = interpolateTemplate("Sem variáveis", { name: "João" });
    expect(result).toBe("Sem variáveis");
  });

  it("lida com string vazia", () => {
    const result = interpolateTemplate("", { name: "João" });
    expect(result).toBe("");
  });
});

// ==============================================
// calculateClassificationCost
// ==============================================

describe("calculateClassificationCost", () => {
  it("calcula custo com tokens separados (150 prompt, 50 completion)", () => {
    const cost = calculateClassificationCost(150, 50);

    // 150 * $0.15/M + 50 * $0.60/M
    const expected = (150 * 0.15 + 50 * 0.6) / 1_000_000;
    expect(cost).toBeCloseTo(expected, 10);
  });

  it("retorna 0 para 0 tokens", () => {
    expect(calculateClassificationCost(0, 0)).toBe(0);
  });

  it("calcula custo para 750 prompt + 250 completion tokens", () => {
    const cost = calculateClassificationCost(750, 250);
    expect(cost).toBeGreaterThan(0);
    expect(cost).toBeLessThan(0.001);
  });

  it("calcula custo correto quando apenas prompt tokens", () => {
    const cost = calculateClassificationCost(200, 0);
    const expected = (200 * 0.15) / 1_000_000;
    expect(cost).toBeCloseTo(expected, 10);
  });
});

// ==============================================
// classifyPostRelevance
// ==============================================

describe("classifyPostRelevance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retorna relevante quando KB não configurado (fallback)", async () => {
    const { supabase } = createMockSupabase();

    const result = await classifyPostRelevance(
      "Post sobre IA",
      "https://linkedin.com/posts/1",
      null, // kbContext = null
      "openai-key",
      supabase,
      "tenant-1"
    );

    expect(result.isRelevant).toBe(true);
    expect(result.reasoning).toContain("KB não configurado");
    expect(result.promptTokens).toBe(0);
    expect(result.completionTokens).toBe(0);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("retorna relevante quando OpenAI key ausente (fallback)", async () => {
    const { supabase } = createMockSupabase();
    const kbContext = createKBContext();

    const result = await classifyPostRelevance(
      "Post sobre IA",
      "https://linkedin.com/posts/1",
      kbContext,
      null, // openaiKey = null
      supabase,
      "tenant-1"
    );

    expect(result.isRelevant).toBe(true);
    expect(result.reasoning).toContain("OpenAI key não configurada");
    expect(result.promptTokens).toBe(0);
    expect(result.completionTokens).toBe(0);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("retorna não relevante para post com texto vazio", async () => {
    const { supabase } = createMockSupabase();
    const kbContext = createKBContext();

    const result = await classifyPostRelevance(
      "",
      "https://linkedin.com/posts/1",
      kbContext,
      "openai-key",
      supabase,
      "tenant-1"
    );

    expect(result.isRelevant).toBe(false);
    expect(result.reasoning).toContain("texto vazio ou muito curto");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("retorna não relevante para post com texto muito curto", async () => {
    const { supabase } = createMockSupabase();
    const kbContext = createKBContext();

    const result = await classifyPostRelevance(
      "Hi",
      "https://linkedin.com/posts/1",
      kbContext,
      "openai-key",
      supabase,
      "tenant-1"
    );

    expect(result.isRelevant).toBe(false);
    expect(result.reasoning).toContain("texto vazio ou muito curto");
  });

  it("retorna relevante quando OpenAI falha (fail-open)", async () => {
    const { supabase, mockFrom } = createMockSupabase();
    const kbContext = createKBContext();

    // Mock prompt loading — code default (no DB prompts)
    const promptChain = createChainBuilder({ data: null, error: { code: "PGRST116" } });
    mockFrom.mockReturnValue(promptChain);

    // Mock fetch failure
    mockFetch.mockResolvedValue({ ok: false, status: 429 });

    const result = await classifyPostRelevance(
      "Um post longo o suficiente para classificação de relevância",
      "https://linkedin.com/posts/1",
      kbContext,
      "openai-key",
      supabase,
      "tenant-1"
    );

    expect(result.isRelevant).toBe(true);
    expect(result.reasoning).toContain("Erro na classificação");
    expect(result.reasoning).toContain("fail-open");
    expect(result.promptTokens).toBe(0);
    expect(result.completionTokens).toBe(0);
  });

  it("retorna relevante quando fetch lança exceção (timeout)", async () => {
    const { supabase, mockFrom } = createMockSupabase();
    const kbContext = createKBContext();

    const promptChain = createChainBuilder({ data: null, error: { code: "PGRST116" } });
    mockFrom.mockReturnValue(promptChain);

    mockFetch.mockRejectedValue(new Error("AbortError: timeout"));

    const result = await classifyPostRelevance(
      "Um post longo o suficiente para classificação de relevância",
      "https://linkedin.com/posts/1",
      kbContext,
      "openai-key",
      supabase,
      "tenant-1"
    );

    expect(result.isRelevant).toBe(true);
    expect(result.reasoning).toContain("fail-open");
  });

  it("chama OpenAI e retorna classificação quando tudo disponível", async () => {
    const { supabase, mockFrom } = createMockSupabase();
    const kbContext = createKBContext();

    // Mock prompt loading — code default
    const promptChain = createChainBuilder({ data: null, error: { code: "PGRST116" } });
    mockFrom.mockReturnValue(promptChain);

    // Mock successful OpenAI response
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [
            {
              message: {
                content: '{"isRelevant": false, "reasoning": "Post genérico"}',
              },
            },
          ],
          usage: { prompt_tokens: 150, completion_tokens: 50 },
        }),
    });

    const result = await classifyPostRelevance(
      "Um post longo o suficiente para classificação de relevância",
      "https://linkedin.com/posts/1",
      kbContext,
      "openai-key-test",
      supabase,
      "tenant-1"
    );

    expect(result.isRelevant).toBe(false);
    expect(result.reasoning).toBe("Post genérico");
    expect(result.promptTokens).toBe(150);
    expect(result.completionTokens).toBe(50);

    // Verify OpenAI was called with correct parameters
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.openai.com/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer openai-key-test",
        }),
      })
    );

    // Verify model used is gpt-4o-mini
    const fetchBody = JSON.parse(
      (mockFetch.mock.calls[0][1] as { body: string }).body
    );
    expect(fetchBody.model).toBe("gpt-4o-mini");
    expect(fetchBody.response_format).toEqual({ type: "json_object" });
  });

  it("usa prompt do tenant quando disponível", async () => {
    const { supabase, mockFrom } = createMockSupabase();
    const kbContext = createKBContext();

    // Mock tenant prompt found
    const promptChain = createChainBuilder({
      data: {
        prompt_template: "Custom prompt: {{post_text}}",
        model_preference: "gpt-4o",
        metadata: { temperature: 0.5, maxTokens: 300 },
      },
      error: null,
    });
    mockFrom.mockReturnValue(promptChain);

    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [
            {
              message: {
                content: '{"isRelevant": true, "reasoning": "Relevante"}',
              },
            },
          ],
          usage: { prompt_tokens: 100, completion_tokens: 50 },
        }),
    });

    const result = await classifyPostRelevance(
      "Um post longo o suficiente para classificação",
      "https://linkedin.com/posts/1",
      kbContext,
      "openai-key",
      supabase,
      "tenant-1"
    );

    expect(result.isRelevant).toBe(true);

    // Verify model from tenant prompt was used
    const fetchBody = JSON.parse(
      (mockFetch.mock.calls[0][1] as { body: string }).body
    );
    expect(fetchBody.model).toBe("gpt-4o");
    expect(fetchBody.temperature).toBe(0.5);
    expect(fetchBody.max_tokens).toBe(300);
  });

  it("trunca posts longos para evitar token limit", async () => {
    const { supabase, mockFrom } = createMockSupabase();
    const kbContext = createKBContext();

    const promptChain = createChainBuilder({ data: null, error: { code: "PGRST116" } });
    mockFrom.mockReturnValue(promptChain);

    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [
            {
              message: {
                content: '{"isRelevant": true, "reasoning": "OK"}',
              },
            },
          ],
          usage: { prompt_tokens: 400, completion_tokens: 100 },
        }),
    });

    // Create post longer than 4000 chars
    const longPost = "A".repeat(5000);

    await classifyPostRelevance(
      longPost,
      "https://linkedin.com/posts/1",
      kbContext,
      "openai-key",
      supabase,
      "tenant-1"
    );

    const fetchBody = JSON.parse(
      (mockFetch.mock.calls[0][1] as { body: string }).body
    );
    const promptText = fetchBody.messages[0].content;

    // Post should be truncated to 4000 chars + "..."
    expect(promptText).not.toContain("A".repeat(5000));
    expect(promptText).toContain("A".repeat(4000));
    expect(promptText).toContain("...");
  });
});
