/**
 * Tests for Opportunity Next Step Generator
 * Story 21.5: Ações do Card + Próximo Passo por IA — AC #1, #5, #6, #7
 *
 * Espelha approach-suggestion.test.ts (mesmo molde: fetch stub + chain builder).
 * Cobre: happy path (wire OpenAI), guard sem chave, erro OpenAI, retorno vazio,
 * degradação source='engagement' (reply_text null), fallback de prompt por código.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createChainBuilder } from "../../../helpers/mock-supabase";
import { generateOpportunityNextStep } from "@/lib/utils/opportunity-suggestion";
import type {
  OpportunityContextForSuggestion,
  LeadContextForSuggestion,
  KBContextForSuggestion,
} from "@/lib/utils/opportunity-suggestion";

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
    typeof generateOpportunityNextStep
  >[4];
  return { supabase, mockFrom };
}

function createOppContext(
  overrides: Partial<OpportunityContextForSuggestion> = {}
): OpportunityContextForSuggestion {
  return {
    replyText: "Tenho interesse, podemos conversar semana que vem?",
    replySubject: "Re: Automação de vendas",
    intent: "interessado",
    ...overrides,
  };
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
    companyName: "TDec",
    companyContext: "Empresa de automação B2B",
    productsServices: "CRM, automação de vendas",
    competitiveAdvantages: "IA integrada, preço competitivo",
    icpSummary: "CTOs de startups",
    toneDescription: "Tom casual e amigável",
    toneStyle: "casual",
    ...overrides,
  };
}

function mockOpenAISuccess(text: string = "Rascunho gerado.") {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () =>
      Promise.resolve({
        choices: [{ message: { content: text } }],
        usage: { prompt_tokens: 800, completion_tokens: 200 },
      }),
  });
}

function setupSupabaseForCodeDefault(mockFrom: ReturnType<typeof vi.fn>) {
  // Tenant e global retornam null → cai no code default
  const emptyChain = createChainBuilder({ data: null, error: { code: "PGRST116" } });
  mockFrom.mockReturnValue(emptyChain);
}

function lastPrompt(): string {
  const body = JSON.parse(mockFetch.mock.calls[0][1].body);
  return body.messages[0].content;
}

// ==============================================
// TESTS
// ==============================================

beforeEach(() => {
  vi.clearAllMocks();
});

describe("generateOpportunityNextStep", () => {
  it("retorna rascunho trimado + tokens quando geração OK (AC1)", async () => {
    const { supabase, mockFrom } = createMockSupabase();
    setupSupabaseForCodeDefault(mockFrom);
    mockOpenAISuccess("  Olá João, que bom que se interessou. Que tal quinta às 10h?  ");

    const result = await generateOpportunityNextStep(
      createOppContext(),
      createLeadContext(),
      createKBContext(),
      "sk-test-key",
      supabase,
      "tenant-1"
    );

    expect(result.suggestion).toBe(
      "Olá João, que bom que se interessou. Que tal quinta às 10h?"
    );
    expect(result.promptTokens).toBe(800);
    expect(result.completionTokens).toBe(200);
    expect(result.error).toBeUndefined();
  });

  it("interpola o NOME da empresa no prompt (senão a IA escreve '[Sua Empresa]')", async () => {
    // O `company_name` é obrigatório na KB (CompanyProfile) mas era DESCARTADO pelo
    // loadKBContext — a IA não tinha como se referir à própria empresa e caía no
    // placeholder. Provado em produção: "Na [Sua Empresa], trabalhamos com...".
    const { supabase, mockFrom } = createMockSupabase();
    setupSupabaseForCodeDefault(mockFrom);
    mockOpenAISuccess("Rascunho");

    await generateOpportunityNextStep(
      createOppContext(),
      createLeadContext(),
      createKBContext({ companyName: "TDec" }),
      "sk-test-key",
      supabase,
      "tenant-1"
    );

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    const prompt = body.messages[0].content;
    expect(prompt).toContain("TDec");
    expect(prompt).not.toContain("{{company_name}}");
  });

  it("instrui a NÃO assinar (o remetente não está no contexto — origem do '[Seu Nome]')", async () => {
    // O prompt pedia uma mensagem pronta de vendedor, proibia inventar fatos E
    // proibia placeholders — sem nunca dizer quem é o vendedor. Armadilha lógica:
    // na hora de assinar não havia saída legal. A regra agora é não assinar.
    const { supabase, mockFrom } = createMockSupabase();
    setupSupabaseForCodeDefault(mockFrom);
    mockOpenAISuccess("Rascunho");

    await generateOpportunityNextStep(
      createOppContext(),
      createLeadContext(),
      createKBContext(),
      "sk-test-key",
      supabase,
      "tenant-1"
    );

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    const prompt = body.messages[0].content;
    expect(prompt).toContain("NÃO ASSINE");
  });

  it("usa o wire de texto livre: gpt-4o-mini, temp 0.7, max_tokens 500, SEM response_format", async () => {
    const { supabase, mockFrom } = createMockSupabase();
    setupSupabaseForCodeDefault(mockFrom);
    mockOpenAISuccess("Rascunho");

    await generateOpportunityNextStep(
      createOppContext(),
      createLeadContext(),
      createKBContext(),
      "sk-test-key",
      supabase,
      "tenant-1"
    );

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.model).toBe("gpt-4o-mini");
    expect(body.temperature).toBe(0.7);
    expect(body.max_tokens).toBe(500);
    expect(body.response_format).toBeUndefined();
  });

  it("retorna suggestion=null e NÃO chama OpenAI quando a chave está ausente (AC5 — sem custo)", async () => {
    const { supabase } = createMockSupabase();

    const result = await generateOpportunityNextStep(
      createOppContext(),
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

  it("retorna suggestion=null quando OpenAI falha com HTTP error (AC5)", async () => {
    const { supabase, mockFrom } = createMockSupabase();
    setupSupabaseForCodeDefault(mockFrom);
    mockFetch.mockResolvedValueOnce({ ok: false, status: 429 });

    const result = await generateOpportunityNextStep(
      createOppContext(),
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

  it("retorna suggestion=null quando OpenAI rejeita (timeout/AbortError)", async () => {
    const { supabase, mockFrom } = createMockSupabase();
    setupSupabaseForCodeDefault(mockFrom);
    mockFetch.mockRejectedValueOnce(
      new DOMException("The operation was aborted.", "AbortError")
    );

    const result = await generateOpportunityNextStep(
      createOppContext(),
      createLeadContext(),
      createKBContext(),
      "sk-test-key",
      supabase,
      "tenant-1"
    );

    expect(result.suggestion).toBeNull();
    expect(result.error).toBe("The operation was aborted.");
  });

  it("retorna suggestion=null quando OpenAI retorna texto vazio", async () => {
    const { supabase, mockFrom } = createMockSupabase();
    setupSupabaseForCodeDefault(mockFrom);
    mockOpenAISuccess("   ");

    const result = await generateOpportunityNextStep(
      createOppContext(),
      createLeadContext(),
      createKBContext(),
      "sk-test-key",
      supabase,
      "tenant-1"
    );

    expect(result.suggestion).toBeNull();
    expect(result.error).toBe("Rascunho vazio retornado");
    expect(result.promptTokens).toBe(800);
    expect(result.completionTokens).toBe(200);
  });

  it("interpola lead, tom, assunto, resposta e rótulo pt-BR da intenção", async () => {
    const { supabase, mockFrom } = createMockSupabase();
    setupSupabaseForCodeDefault(mockFrom);
    mockOpenAISuccess("Rascunho");

    await generateOpportunityNextStep(
      createOppContext({
        replyText: "Qual o preço?",
        replySubject: "Re: Proposta",
        intent: "pediu_info",
      }),
      createLeadContext({
        leadName: "Maria Souza",
        leadTitle: "CEO",
        leadCompany: "DataCorp",
        leadIndustry: "Analytics",
      }),
      createKBContext({ toneDescription: "Tom formal", toneStyle: "formal" }),
      "sk-test-key",
      supabase,
      "tenant-1"
    );

    const prompt = lastPrompt();
    expect(prompt).toContain("Maria Souza");
    expect(prompt).toContain("CEO");
    expect(prompt).toContain("DataCorp");
    expect(prompt).toContain("Analytics");
    expect(prompt).toContain("Tom formal");
    expect(prompt).toContain("Re: Proposta");
    expect(prompt).toContain("Qual o preço?");
    // intent vira rótulo legível (não o valor cru do enum)
    expect(prompt).toContain("Pediu informações");
  });

  it("intent null → rótulo 'Não classificado' (degradação real: 21.3 fail-open)", async () => {
    const { supabase, mockFrom } = createMockSupabase();
    setupSupabaseForCodeDefault(mockFrom);
    mockOpenAISuccess("Rascunho");

    await generateOpportunityNextStep(
      createOppContext({ intent: null }),
      createLeadContext(),
      createKBContext(),
      "sk-test-key",
      supabase,
      "tenant-1"
    );

    expect(lastPrompt()).toContain("Não classificado");
  });

  it("degradação source='engagement' (reply_text null) → gera mesmo assim, interpola vazio (AC5)", async () => {
    const { supabase, mockFrom } = createMockSupabase();
    setupSupabaseForCodeDefault(mockFrom);
    mockOpenAISuccess("Vi que você abriu o e-mail algumas vezes...");

    const result = await generateOpportunityNextStep(
      createOppContext({ replyText: null, replySubject: null, intent: null }),
      createLeadContext(),
      createKBContext(),
      "sk-test-key",
      supabase,
      "tenant-1"
    );

    expect(result.suggestion).toBe("Vi que você abriu o e-mail algumas vezes...");
    expect(mockFetch).toHaveBeenCalledOnce();
    const prompt = lastPrompt();
    // Nenhum placeholder cru sobra no prompt enviado
    expect(prompt).not.toContain("{{reply_text}}");
    expect(prompt).not.toContain("{{reply_subject}}");
  });

  it("trunca reply_text longo em 4000 chars (guarda de custo — decisão #1)", async () => {
    const { supabase, mockFrom } = createMockSupabase();
    setupSupabaseForCodeDefault(mockFrom);
    mockOpenAISuccess("Rascunho");

    await generateOpportunityNextStep(
      createOppContext({ replyText: "A".repeat(5000) }),
      createLeadContext(),
      createKBContext(),
      "sk-test-key",
      supabase,
      "tenant-1"
    );

    const prompt = lastPrompt();
    expect(prompt).not.toContain("A".repeat(5000));
    expect(prompt).toContain("A".repeat(4000) + "...");
  });

  it("carrega o prompt do tenant quando disponível (fallback 3 níveis)", async () => {
    const { supabase, mockFrom } = createMockSupabase();
    const tenantPromptChain = createChainBuilder({
      data: {
        prompt_template: "Template customizado: {{reply_text}}",
        model_preference: "gpt-4o",
        metadata: { temperature: 0.5, maxTokens: 300 },
      },
      error: null,
    });
    mockFrom.mockReturnValue(tenantPromptChain);
    mockOpenAISuccess("Rascunho custom");

    const result = await generateOpportunityNextStep(
      createOppContext({ replyText: "Oi" }),
      createLeadContext(),
      createKBContext(),
      "sk-test-key",
      supabase,
      "tenant-1"
    );

    expect(result.suggestion).toBe("Rascunho custom");
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.model).toBe("gpt-4o");
    expect(body.temperature).toBe(0.5);
    expect(body.max_tokens).toBe(300);
    expect(body.messages[0].content).toBe("Template customizado: Oi");
  });

  it("busca o prompt pela key opportunity_next_step (não a do approach-suggestion)", async () => {
    const { supabase, mockFrom } = createMockSupabase();
    const chain = createChainBuilder({ data: null, error: { code: "PGRST116" } });
    mockFrom.mockReturnValue(chain);
    mockOpenAISuccess("Rascunho");

    await generateOpportunityNextStep(
      createOppContext(),
      createLeadContext(),
      createKBContext(),
      "sk-test-key",
      supabase,
      "tenant-1"
    );

    expect(mockFrom).toHaveBeenCalledWith("ai_prompts");
    expect(chain.eq).toHaveBeenCalledWith("prompt_key", "opportunity_next_step");
  });
});
