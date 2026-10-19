/**
 * Copy Reviewer Tests — Story 24.9
 *
 * Matriz I/O: aprovado, reescrito, revisao humana, falha, reprovado sem motivos,
 * clean aplicado, reescrita vazia, custo e log.
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

const mockLogApiUsage = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/services/usage-logger", () => ({
  logApiUsage: (...args: unknown[]) => mockLogApiUsage(...args),
}));

import { reviewEmailCopy, logCopyReview, type CopyReviewInput } from "@/lib/ai/copy-reviewer";
import { calculateReviewCost } from "@/lib/ai/copy-review-config";
import type { CopyReviewResult } from "@/types/copy-review";

// ==============================================
// HELPERS
// ==============================================

function respond(content: unknown, usage = { prompt_tokens: 100, completion_tokens: 20 }) {
  mockCreate.mockResolvedValueOnce({
    choices: [{ message: { content: typeof content === "string" ? content : JSON.stringify(content) } }],
    usage,
  });
}

const APPROVED = { approved: true, reasons: [] };
const REJECTED = {
  approved: false,
  reasons: [{ check: "cliche", detail: "\"solucao inovadora\" e frase feita" }],
};

const INPUT: CopyReviewInput = {
  subject: "Assunto original",
  body: "Oi {{first_name}}, corpo original.\n\n{{ice_breaker}}",
  emailMode: "initial",
  context: {
    audience: "Cargos: CTO",
    productName: "Produto X",
    productDescription: "Seguranca de rede",
    targetIndustries: "Fintech",
    painPoints: "Vazamento de dados",
    icpSummary: "Empresas medias",
    authorizedProofs: "",
  },
};

describe("reviewEmailCopy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("aprovado na 1a revisao: approved, texto original, 1 chamada", async () => {
    respond(APPROVED);
    const result = await reviewEmailCopy(INPUT, { apiKey: "k" });
    expect(result.status).toBe("approved");
    expect(result.subject).toBe(INPUT.subject);
    expect(result.body).toBe(INPUT.body);
    expect(result.reasons).toEqual([]);
    expect(result.calls).toBe(1);
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it("monta o pedido com o modelo do revisor, json_object e o contexto (provas vazias)", async () => {
    respond(APPROVED);
    await reviewEmailCopy(INPUT, { apiKey: "k" });
    const [req, opts] = mockCreate.mock.calls[0];
    expect(req.model).toBe("gpt-5.4-mini");
    expect(req.response_format).toEqual({ type: "json_object" });
    expect(req).not.toHaveProperty("temperature");
    expect(opts.signal).toBeDefined();
    const user = req.messages[1].content as string;
    expect(user).toContain("Cargos: CTO");
    expect(user).toContain("nenhuma");
    expect(user).toContain("{{first_name}}");
    expect(user).toContain("Assunto original");
  });

  it("reprova -> reescreve -> aprova: rewritten, texto da reescrita passado pelo clean, 3 chamadas", async () => {
    respond(REJECTED);
    respond({
      subject: "RE: Novo assunto",
      body: "Oi {{first_name}}, novo corpo [Seu Nome]\n\n{{ice_breaker}}",
    });
    respond(APPROVED);
    const clean = vi.fn((s: string, b: string) => ({
      subject: s.replace(/^RE:\s*/, ""),
      body: b.replace(/\s*\[[^\]]*\]/g, ""),
    }));

    const result = await reviewEmailCopy(INPUT, { apiKey: "k", clean });

    expect(result.status).toBe("rewritten");
    expect(result.subject).toBe("Novo assunto");
    expect(result.body).toBe("Oi {{first_name}}, novo corpo\n\n{{ice_breaker}}");
    expect(result.reasons).toEqual([]);
    expect(result.calls).toBe(3);
    expect(clean).toHaveBeenCalledTimes(1);
    // a 2a revisao recebe o texto ja limpo
    const secondReviewUser = mockCreate.mock.calls[2][0].messages[1].content as string;
    expect(secondReviewUser).toContain("Oi {{first_name}}, novo corpo");
    expect(secondReviewUser).not.toContain("[Seu Nome]");
    // a reescrita recebe os motivos
    const rewriteUser = mockCreate.mock.calls[1][0].messages[1].content as string;
    expect(rewriteUser).toContain("[cliche]");
  });

  it("reprova 3x: needs_human_review, texto da 2a reescrita, motivos da ultima revisao, 5 chamadas", async () => {
    respond(REJECTED);
    respond({ subject: "S1", body: "B1 {{first_name}} {{ice_breaker}}" });
    respond(REJECTED);
    respond({ subject: "S2", body: "B2 {{first_name}} {{ice_breaker}}" });
    respond({
      approved: false,
      reasons: [
        { check: "cta", detail: "pede reuniao de 30 min" },
        { check: "unsupported_claim", detail: "cita 40%" },
      ],
    });

    const result = await reviewEmailCopy(INPUT, { apiKey: "k" });

    expect(result.status).toBe("needs_human_review");
    expect(result.subject).toBe("S2");
    expect(result.body).toBe("B2 {{first_name}} {{ice_breaker}}");
    expect(result.calls).toBe(5);
    expect(result.reasons).toHaveLength(2);
    expect(result.reasons[0]).toContain("pede reuniao de 30 min");
    expect(result.reasons[1]).toContain("cita 40%");
  });

  it("reprovado sem motivos conta como aprovado", async () => {
    respond({ approved: false, reasons: [] });
    const result = await reviewEmailCopy(INPUT, { apiKey: "k" });
    expect(result.status).toBe("approved");
    expect(result.body).toBe(INPUT.body);
  });

  it("JSON invalido: not_reviewed com o texto ORIGINAL e reasons []", async () => {
    respond("isto nao e json");
    const result = await reviewEmailCopy(INPUT, { apiKey: "k" });
    expect(result.status).toBe("not_reviewed");
    expect(result.subject).toBe(INPUT.subject);
    expect(result.body).toBe(INPUT.body);
    expect(result.reasons).toEqual([]);
    expect(result.calls).toBe(1);
  });

  it("schema invalido (approved ausente): not_reviewed", async () => {
    respond({ reasons: [] });
    const result = await reviewEmailCopy(INPUT, { apiKey: "k" });
    expect(result.status).toBe("not_reviewed");
  });

  it("falha no meio (erro de rede na reescrita): not_reviewed com o ORIGINAL", async () => {
    respond(REJECTED);
    mockCreate.mockRejectedValueOnce(new Error("network down"));
    const result = await reviewEmailCopy(INPUT, { apiKey: "k" });
    expect(result.status).toBe("not_reviewed");
    expect(result.subject).toBe(INPUT.subject);
    expect(result.body).toBe(INPUT.body);
    expect(result.calls).toBe(2);
  });

  it("timeout (AbortError): not_reviewed, nunca lanca", async () => {
    const abort = new Error("aborted");
    abort.name = "AbortError";
    mockCreate.mockRejectedValueOnce(abort);
    await expect(reviewEmailCopy(INPUT, { apiKey: "k" })).resolves.toMatchObject({
      status: "not_reviewed",
      body: INPUT.body,
    });
  });

  it("reescrita vazia depois do clean conta como falha", async () => {
    respond(REJECTED);
    respond({ subject: "S", body: "[Seu Nome]" });
    const clean = (s: string, b: string) => ({ subject: s, body: b.replace(/\[[^\]]*\]/g, "") });
    const result = await reviewEmailCopy(INPUT, { apiKey: "k", clean });
    expect(result.status).toBe("not_reviewed");
    expect(result.body).toBe(INPUT.body);
    expect(result.calls).toBe(2);
  });

  it("reescrita que perde variavel do original: not_reviewed com o ORIGINAL", async () => {
    respond(REJECTED);
    // {{ice_breaker}} do original sumiu na reescrita
    respond({ subject: "Novo", body: "Oi {{first_name}}, corpo novo" });
    const result = await reviewEmailCopy(INPUT, { apiKey: "k" });
    expect(result.status).toBe("not_reviewed");
    expect(result.subject).toBe(INPUT.subject);
    expect(result.body).toBe(INPUT.body);
    expect(result.calls).toBe(2);
  });

  it("reescrita que cria variavel nova: not_reviewed com o ORIGINAL", async () => {
    const followUp: CopyReviewInput = {
      ...INPUT,
      body: "Oi {{first_name}}, follow-up original.",
      emailMode: "follow-up",
    };
    respond(REJECTED);
    // {{ice_breaker}} nao existia no follow-up original
    respond({ subject: "Novo", body: "Oi {{first_name}}, corpo novo\n\n{{ice_breaker}}" });
    const result = await reviewEmailCopy(followUp, { apiKey: "k" });
    expect(result.status).toBe("not_reviewed");
    expect(result.body).toBe(followUp.body);
    expect(result.calls).toBe(2);
  });

  it("variavel com espacos na reescrita conta como a mesma variavel", async () => {
    respond(REJECTED);
    respond({ subject: "Novo", body: "Oi {{ first_name }}, corpo novo\n\n{{ice_breaker}}" });
    respond(APPROVED);
    const result = await reviewEmailCopy(INPUT, { apiKey: "k" });
    expect(result.status).toBe("rewritten");
  });

  it("reescrita que mantem todas as variaveis segue o ciclo", async () => {
    respond(REJECTED);
    respond({ subject: "Novo", body: "Oi {{first_name}}, corpo novo\n\n{{ice_breaker}}" });
    respond(APPROVED);
    const result = await reviewEmailCopy(INPUT, { apiKey: "k" });
    expect(result.status).toBe("rewritten");
  });

  it("motivos fora dos 6 criterios sao ignorados (sobrar nenhum = aprovado)", async () => {
    respond({
      approved: false,
      reasons: [{ check: "style", detail: "poderia ser mais caloroso" }],
    });
    const result = await reviewEmailCopy(INPUT, { apiKey: "k" });
    expect(result.status).toBe("approved");
    expect(result.body).toBe(INPUT.body);
    expect(result.calls).toBe(1);
  });

  it("motivos desconhecidos nao entram nos motivos da revisao humana", async () => {
    const mixed = {
      approved: false,
      reasons: [
        { check: "tone", detail: "estilo" },
        { check: "length", detail: "180 palavras" },
      ],
    };
    respond(mixed);
    respond({ subject: "S1", body: "B1 {{first_name}} {{ice_breaker}}" });
    respond(mixed);
    respond({ subject: "S2", body: "B2 {{first_name}} {{ice_breaker}}" });
    respond(mixed);
    const result = await reviewEmailCopy(INPUT, { apiKey: "k" });
    expect(result.status).toBe("needs_human_review");
    expect(result.reasons).toHaveLength(1);
    expect(result.reasons[0]).toContain("180 palavras");
  });

  it("sem chave: not_reviewed sem chamada", async () => {
    const result = await reviewEmailCopy(INPUT, { apiKey: "" });
    expect(result.status).toBe("not_reviewed");
    expect(result.calls).toBe(0);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("soma tokens e custo de todas as chamadas", async () => {
    respond(REJECTED, { prompt_tokens: 1000, completion_tokens: 100 });
    respond(
      { subject: "S", body: "B {{first_name}} {{ice_breaker}}" },
      { prompt_tokens: 1200, completion_tokens: 200 }
    );
    respond(APPROVED, { prompt_tokens: 900, completion_tokens: 50 });
    const result = await reviewEmailCopy(INPUT, { apiKey: "k" });
    expect(result.promptTokens).toBe(3100);
    expect(result.completionTokens).toBe(350);
    expect(result.estimatedCost).toBeCloseTo(calculateReviewCost(3100, 350));
  });
});

describe("logCopyReview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const base: CopyReviewResult = {
    subject: "S",
    body: "B",
    status: "rewritten",
    reasons: [],
    calls: 3,
    promptTokens: 300,
    completionTokens: 60,
    estimatedCost: 0.0005,
  };

  it("grava uma linha copy_review com custo, tokens, modelo e origem", async () => {
    await logCopyReview(base, {
      tenantId: "t1",
      source: "agent",
      executionId: "exec-1",
      emailPosition: 2,
    });
    expect(mockLogApiUsage).toHaveBeenCalledWith({
      tenantId: "t1",
      serviceName: "openai",
      requestType: "copy_review",
      estimatedCost: 0.0005,
      status: "success",
      metadata: {
        model: "gpt-5.4-mini",
        calls: 3,
        promptTokens: 300,
        completionTokens: 60,
        reviewStatus: "rewritten",
        source: "agent",
        executionId: "exec-1",
        emailPosition: 2,
      },
    });
  });

  it("not_reviewed com chamada loga failed; sem executionId nao grava a chave", async () => {
    await logCopyReview(
      { ...base, status: "not_reviewed", calls: 1 },
      { tenantId: "t1", source: "manual", emailPosition: 1 }
    );
    const params = mockLogApiUsage.mock.calls[0][0];
    expect(params.status).toBe("failed");
    expect(params.metadata).not.toHaveProperty("executionId");
    expect(params.metadata.source).toBe("manual");
  });

  it("sem chamada nao loga", async () => {
    await logCopyReview(
      { ...base, status: "not_reviewed", calls: 0 },
      { tenantId: "t1", source: "manual", emailPosition: 1 }
    );
    expect(mockLogApiUsage).not.toHaveBeenCalled();
  });
});
