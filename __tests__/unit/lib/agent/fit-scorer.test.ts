/**
 * Fit Scorer — Story 24.16
 *
 * Matriz: LLM ok, LLM parcial (indice omitido / grade invalida / motivo vazio),
 * falha (timeout, erro HTTP, JSON invalido), sem chave, entrada sem nome/e-mail,
 * teto de 100 leads e corte das dores.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCreate = vi.fn();

vi.mock("openai", () => ({
  default: class MockOpenAI {
    chat = {
      completions: {
        create: mockCreate,
      },
    };
  },
}));

import { scoreLeads, type ScoreLeadsParams } from "@/lib/agent/fit-scorer";
import { FIT_SCORE_MODEL, FIT_SCORE_TIMEOUT_MS, buildFitScoreRequest } from "@/lib/ai/fit-score-config";
import { EMPTY_TENANT_ICP } from "@/lib/agent/icp-briefing";
import type { LeadRow } from "@/types/lead";

// ==============================================
// HELPERS
// ==============================================

function leadRow(i: number, title: string, hasEmail = true): LeadRow {
  return {
    id: `lead-${i}`,
    tenant_id: "tenant-1",
    apollo_id: `apollo-${i}`,
    first_name: `Nome${i}`,
    last_name: "Secreto",
    email: `pessoa${i}@empresa.com`,
    phone: null,
    company_name: `Empresa ${i}`,
    company_size: null,
    industry: null,
    location: null,
    title,
    linkedin_url: null,
    photo_url: null,
    status: "novo",
    has_email: hasEmail,
    has_direct_phone: "No",
    created_at: "2026-10-22T00:00:00Z",
    updated_at: "2026-10-22T00:00:00Z",
    icebreaker: null,
    icebreaker_generated_at: null,
    linkedin_posts_cache: null,
    is_monitored: false,
  } as LeadRow;
}

function params(overrides: Partial<ScoreLeadsParams> = {}): ScoreLeadsParams {
  return {
    leads: [leadRow(0, "CISO"), leadRow(1, "Diretor Financeiro"), leadRow(2, "Analista")],
    briefing: { jobTitles: ["CISO"], industry: "fintech", location: "Sao Paulo", companySize: null },
    icp: { ...EMPTY_TENANT_ICP, industries: ["Financeiro"], painPoints: "Vazamento de dados" },
    apiKey: "sk-test",
    tenantId: "tenant-1",
    executionId: "exec-1",
    ...overrides,
  };
}

function respond(content: unknown, usage = { prompt_tokens: 500, completion_tokens: 80 }) {
  mockCreate.mockResolvedValueOnce({
    choices: [{ message: { content: typeof content === "string" ? content : JSON.stringify(content) } }],
    usage,
  });
}

function userMessage(): string {
  const request = mockCreate.mock.calls[0][0] as { messages: Array<{ role: string; content: string }> };
  return request.messages.find((m) => m.role === "user")?.content ?? "";
}

// ==============================================
// TESTS
// ==============================================

describe("scoreLeads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("LLM ok: notas e motivos do LLM para todos, source llm, tokens no usage", async () => {
    respond({
      scores: [
        { i: 0, grade: "A", reason: "CISO em fintech, dor de vazamento" },
        { i: 1, grade: "C", reason: "Financeiro, fora de seguranca" },
        { i: 2, grade: "B", reason: "Analista de seguranca influencia a compra" },
      ],
    });

    const result = await scoreLeads(params());

    expect(result.source).toBe("llm");
    expect(result.attempted).toBe(true);
    expect(result.succeeded).toBe(true);
    expect(result.results.map((r) => r.fitScore)).toEqual(["A", "C", "B"]);
    expect(result.results[0].fitReason).toBe("CISO em fintech, dor de vazamento");
    expect(result.usage).toMatchObject({ promptTokens: 500, completionTokens: 80, llmScored: 3 });
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it("LLM parcial: indice omitido, grade 'D' e motivo vazio ficam com as regras", async () => {
    const leads = [
      leadRow(0, "CISO"),
      leadRow(1, "Analista"),
      leadRow(2, "Analista"),
      leadRow(3, "Diretor Financeiro"),
      leadRow(4, "CISO", false),
    ];
    respond({
      scores: [
        { i: 0, grade: "B", reason: "Empresa pequena demais" },
        { i: 1, grade: "a", reason: "Analista lider do time de seguranca" },
        { i: 2, grade: "A", reason: "   " },
        { i: 4, grade: "D", reason: "nota invalida" },
        { i: 99, grade: "A", reason: "indice inexistente" },
      ],
    });

    const result = await scoreLeads(params({ leads }));

    expect(result.source).toBe("llm");
    expect(result.results[0]).toEqual({ fitScore: "B", fitReason: "Empresa pequena demais" });
    expect(result.results[1].fitScore).toBe("A"); // grade em minuscula e aceita
    expect(result.results[2]).toEqual({ fitScore: "C", fitReason: "Cargo fora do perfil pedido" });
    expect(result.results[3]).toEqual({
      fitScore: "B",
      fitReason: "Cargo senior (Diretor), fora da lista pedida",
    });
    expect(result.results[4].fitScore).toBe("B"); // regras: forte sem e-mail
  });

  it("motivo do LLM cortado em 120 caracteres", async () => {
    respond({ scores: [{ i: 0, grade: "A", reason: "x".repeat(300) }] });
    const result = await scoreLeads(params());
    expect(result.results[0].fitReason).toHaveLength(120);
  });

  it("sem chave: so regras, nao tentado, nenhuma chamada", async () => {
    const result = await scoreLeads(params({ apiKey: undefined }));

    expect(mockCreate).not.toHaveBeenCalled();
    expect(result.attempted).toBe(false);
    expect(result.source).toBe("rules");
    expect(result.results.map((r) => r.fitScore)).toEqual(["A", "B", "C"]);
  });

  it.each([
    ["timeout/abort", () => mockCreate.mockRejectedValueOnce(new Error("Request was aborted."))],
    ["erro HTTP", () => mockCreate.mockRejectedValueOnce(Object.assign(new Error("500"), { status: 500 }))],
    ["JSON invalido", () => respond("isto nao e json")],
    ["formato errado", () => respond({ notas: [] })],
    ["resposta vazia", () => respond("")],
  ])("falha (%s): todos por regras, tentado, sem lancar", async (_label, arrange) => {
    arrange();

    const result = await scoreLeads(params());

    expect(result.attempted).toBe(true);
    expect(result.succeeded).toBe(false);
    expect(result.source).toBe("rules");
    expect(result.usage.errorMessage).toBeTruthy();
    expect(result.results.map((r) => r.fitScore)).toEqual(["A", "B", "C"]);
  });

  it("entrada do LLM: cargo, empresa e regras — sem nome nem e-mail; dores e cargos do ICP", async () => {
    respond({ scores: [] });
    await scoreLeads(
      params({ icp: { ...EMPTY_TENANT_ICP, jobTitles: ["Head de Seguranca"], painPoints: "p".repeat(3000) } })
    );

    const content = userMessage();
    expect(content).toContain("CISO");
    expect(content).toContain("Empresa 0");
    expect(content).toContain('"regra":"A"');
    expect(content).toContain("Head de Seguranca");
    expect(content).not.toContain("Nome0");
    expect(content).not.toContain("Secreto");
    expect(content).not.toContain("pessoa0@empresa.com");
    expect(content).toContain("p".repeat(1500));
    expect(content).not.toContain("p".repeat(1501));
  });

  it("cargo do ICP conta como cargo pedido nas regras", async () => {
    const result = await scoreLeads(
      params({
        apiKey: undefined,
        leads: [leadRow(0, "Head de Seguranca")],
        icp: { ...EMPTY_TENANT_ICP, jobTitles: ["Head de Segurança"] },
      })
    );
    expect(result.results[0].fitScore).toBe("A");
  });

  it("no maximo 100 leads na chamada; o resto fica com as regras", async () => {
    const leads = Array.from({ length: 120 }, (_, i) => leadRow(i, "Analista"));
    respond({ scores: leads.map((_, i) => ({ i, grade: "A", reason: "ok" })) });

    const result = await scoreLeads(params({ leads }));

    expect(userMessage()).toContain("LEADS (100)");
    expect(result.results).toHaveLength(120);
    expect(result.results[99].fitScore).toBe("A");
    expect(result.results[100].fitScore).toBe("C");
    expect(result.usage.llmScored).toBe(100);
  });

  it("request: modelo da config, json_object e sem temperature em gpt-5", async () => {
    respond({ scores: [] });
    await scoreLeads(params());

    const request = mockCreate.mock.calls[0][0];
    expect(request.model).toBe(FIT_SCORE_MODEL);
    expect(request.response_format).toEqual({ type: "json_object" });
    expect(request).not.toHaveProperty("temperature");
    expect(buildFitScoreRequest([]).model).toBe("gpt-5.4-mini");
  });

  it("LLM valido mas sem nenhuma entrada aproveitavel: source rules, mas succeeded", async () => {
    respond({ scores: [{ i: 0, grade: "Z", reason: "x" }] });
    const result = await scoreLeads(params());
    expect(result.source).toBe("rules");
    expect(result.succeeded).toBe(true);
  });

  it("LLM manda 'A' para lead sem e-mail: teto B, mantendo o motivo do LLM", async () => {
    respond({ scores: [{ i: 0, grade: "A", reason: "CISO decisor no ICP" }] });

    const result = await scoreLeads(params({ leads: [leadRow(0, "CISO", false)] }));

    expect(result.results[0]).toEqual({ fitScore: "B", fitReason: "CISO decisor no ICP" });
  });

  it("indice como string numerica ('0') e aceito", async () => {
    respond({ scores: [{ i: "0", grade: "C", reason: "Empresa fora do perfil" }] });

    const result = await scoreLeads(params());

    expect(result.results[0]).toEqual({ fitScore: "C", fitReason: "Empresa fora do perfil" });
    expect(result.source).toBe("llm");
  });

  it("passa um AbortSignal e aborta em FIT_SCORE_TIMEOUT_MS: so regras, succeeded false", async () => {
    vi.useFakeTimers();
    try {
      mockCreate.mockImplementationOnce(
        (_request: unknown, options: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            options.signal.addEventListener("abort", () => reject(new Error("Request was aborted.")));
          })
      );

      const pending = scoreLeads(params());
      expect(mockCreate.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
      expect(mockCreate.mock.calls[0][1].signal.aborted).toBe(false);

      await vi.advanceTimersByTimeAsync(FIT_SCORE_TIMEOUT_MS);
      const result = await pending;

      expect(mockCreate.mock.calls[0][1].signal.aborted).toBe(true);
      expect(result.attempted).toBe(true);
      expect(result.succeeded).toBe(false);
      expect(result.source).toBe("rules");
      expect(result.results.map((r) => r.fitScore)).toEqual(["A", "B", "C"]);
    } finally {
      vi.useRealTimers();
    }
  });
});
