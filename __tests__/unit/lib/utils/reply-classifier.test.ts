/**
 * Tests for reply-classifier.ts
 * Story 21.3 — Classificação de Intenção por IA (Task 7)
 *
 * Cobre: parseIntentResponse (5 intents + fail-open), normalizeLtInterestStatus,
 * isEnsembleDivergent, resolveLeadStatusTransition (promote-only), classifyReplyIntent
 * (wire OpenAI, guards, fail-open), classifyPendingReplies (seleção, idempotência,
 * fail-open per-tenant, custo, AC6, ensemble, transição de status).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createChainBuilder, type ChainBuilder } from "../../../helpers/mock-supabase";

// ==============================================
// MOCKS
// ==============================================

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const mockGetApiKey = vi.fn();
const mockLogUsage = vi.fn();
vi.mock("@/lib/utils/monitoring-processor", () => ({
  getApiKey: (...args: unknown[]) => mockGetApiKey(...args),
  logMonitoringUsage: (...args: unknown[]) => mockLogUsage(...args),
}));

import {
  parseIntentResponse,
  normalizeLtInterestStatus,
  isEnsembleDivergent,
  resolveLeadStatusTransition,
  classifyReplyIntent,
  classifyPendingReplies,
  INTENT_TO_LEAD_STATUS,
  LT_INTEREST_TO_INTENT,
} from "@/lib/utils/reply-classifier";
import type { OpportunityIntent } from "@/types/opportunity";

// ==============================================
// HELPERS
// ==============================================

/** Mock supabase mínimo p/ classifyReplyIntent (só toca ai_prompts). */
function createPromptOnlySupabase(): {
  supabase: SupabaseClient;
  mockFrom: ReturnType<typeof vi.fn>;
} {
  const mockFrom = vi.fn();
  const supabase = { from: mockFrom } as unknown as SupabaseClient;
  return { supabase, mockFrom };
}

/** Resposta OpenAI bem-sucedida com um intent dado. */
function okOpenAI(intent: string, reasoning = "ok", pt = 120, ct = 20) {
  return {
    ok: true,
    json: () =>
      Promise.resolve({
        choices: [{ message: { content: JSON.stringify({ intent, reasoning }) } }],
        usage: { prompt_tokens: pt, completion_tokens: ct },
      }),
  };
}

interface PendingOpp {
  id: string;
  tenant_id: string;
  lead_id: string | null;
  reply_text: string | null;
  reply_subject: string | null;
  lt_interest_status: number | null;
}

interface ClassifierResponses {
  pending?: PendingOpp[];
  pendingError?: { message: string };
  leadStatus?: string | null;
}

/**
 * Mock supabase p/ classifyPendingReplies. `opportunities` compartilha o mesmo chain para o
 * SELECT (pendentes) e o UPDATE (persist) — o default { data:[opps], error:null } serve os
 * dois (SELECT lê data, UPDATE só checa error). ai_prompts → code default. leads → status.
 */
function makeClassifierSupabase(responses: ClassifierResponses): {
  supabase: SupabaseClient;
  chains: Record<string, ChainBuilder>;
} {
  const chains: Record<string, ChainBuilder> = {};
  const from = vi.fn((table: string): ChainBuilder => {
    if (table in chains) return chains[table];

    if (table === "opportunities") {
      const data = responses.pending ?? [];
      const error = responses.pendingError ?? null;
      chains[table] = createChainBuilder({ data, error });
      return chains[table];
    }
    if (table === "leads") {
      const leadData =
        responses.leadStatus === undefined ? null : { status: responses.leadStatus };
      chains[table] = createChainBuilder({ data: leadData, error: null });
      return chains[table];
    }
    if (table === "ai_prompts") {
      // code default (sem prompt no DB)
      chains[table] = createChainBuilder({ data: null, error: { code: "PGRST116" } });
      return chains[table];
    }
    chains[table] = createChainBuilder({ data: null, error: null });
    return chains[table];
  });

  return { supabase: { from } as unknown as SupabaseClient, chains };
}

function makeOpp(overrides: Partial<PendingOpp> = {}): PendingOpp {
  return {
    id: "opp-1",
    tenant_id: "tenant-1",
    lead_id: "lead-1",
    reply_text: "Olá, tenho interesse e gostaria de agendar uma conversa esta semana.",
    reply_subject: "Re: proposta",
    lt_interest_status: null,
    ...overrides,
  };
}

const LONG_REPLY = "Olá, tenho bastante interesse na proposta e gostaria de conversar.";

beforeEach(() => {
  vi.clearAllMocks();
  mockGetApiKey.mockResolvedValue("openai-key");
  mockLogUsage.mockResolvedValue(undefined);
});

// ==============================================
// parseIntentResponse
// ==============================================

describe("parseIntentResponse", () => {
  const intents: OpportunityIntent[] = [
    "interessado",
    "pediu_info",
    "objecao",
    "nao_agora",
    "opt_out",
  ];

  it.each(intents)("faz parse de intent válido: %s", (intent) => {
    const result = parseIntentResponse(`{"intent": "${intent}", "reasoning": "motivo"}`);
    expect(result.intent).toBe(intent);
    expect(result.reasoning).toBe("motivo");
  });

  it("fail-open (intent null) para JSON inválido", () => {
    const result = parseIntentResponse("não é json");
    expect(result.intent).toBeNull();
    expect(result.reasoning).toContain("JSON inválido");
  });

  it("fail-open (intent null) para intent fora do enum", () => {
    const result = parseIntentResponse('{"intent": "talvez", "reasoning": "x"}');
    expect(result.intent).toBeNull();
  });

  it("fail-open (intent null) quando campo intent ausente", () => {
    const result = parseIntentResponse('{"reasoning": "sem intent"}');
    expect(result.intent).toBeNull();
    expect(result.reasoning).toBe("sem intent");
  });

  it("lida com markdown wrapping", () => {
    const result = parseIntentResponse('```json\n{"intent": "opt_out", "reasoning": "parar"}\n```');
    expect(result.intent).toBe("opt_out");
  });
});

// ==============================================
// normalizeLtInterestStatus (Task 7.2)
// ==============================================

describe("normalizeLtInterestStatus", () => {
  it("string numérica '1' → 1", () => expect(normalizeLtInterestStatus("1")).toBe(1));
  it("string negativa '-1' → -1", () => expect(normalizeLtInterestStatus("-1")).toBe(-1));
  it("number 1 → 1", () => expect(normalizeLtInterestStatus(1)).toBe(1));
  it("number 0 → 0", () => expect(normalizeLtInterestStatus(0)).toBe(0));
  it("string '0' → 0", () => expect(normalizeLtInterestStatus("0")).toBe(0));
  it("string vazia → null", () => expect(normalizeLtInterestStatus("")).toBeNull());
  it("'abc' → null", () => expect(normalizeLtInterestStatus("abc")).toBeNull());
  it("null → null", () => expect(normalizeLtInterestStatus(null)).toBeNull());
  it("undefined → null", () => expect(normalizeLtInterestStatus(undefined)).toBeNull());
  it("NaN → null", () => expect(normalizeLtInterestStatus(NaN)).toBeNull());
});

// ==============================================
// isEnsembleDivergent (Task 7.3)
// ==============================================

describe("isEnsembleDivergent", () => {
  it("IA=interessado + lt=-1 (Not Interested) → divergente", () => {
    expect(isEnsembleDivergent("interessado", -1)).toBe(true);
  });
  it("IA=pediu_info + lt=-3 (Lost) → divergente", () => {
    expect(isEnsembleDivergent("pediu_info", -3)).toBe(true);
  });
  it("IA=opt_out + lt=1 (Interested) → divergente", () => {
    expect(isEnsembleDivergent("opt_out", 1)).toBe(true);
  });
  it("IA=interessado + lt=1 → NÃO divergente", () => {
    expect(isEnsembleDivergent("interessado", 1)).toBe(false);
  });
  it("IA=nao_agora + lt=-1 → NÃO divergente (intent não é positivo)", () => {
    expect(isEnsembleDivergent("nao_agora", -1)).toBe(false);
  });
});

// ==============================================
// resolveLeadStatusTransition + INTENT_TO_LEAD_STATUS (Task 7.4)
// ==============================================

describe("resolveLeadStatusTransition (promote-only)", () => {
  it("interessado + lead 'novo' → interessado", () => {
    expect(resolveLeadStatusTransition("novo", "interessado")).toBe("interessado");
  });
  it("pediu_info + lead 'em_campanha' → interessado", () => {
    expect(resolveLeadStatusTransition("em_campanha", "pediu_info")).toBe("interessado");
  });
  it("interessado + lead 'oportunidade' → null (não rebaixa o funil)", () => {
    expect(resolveLeadStatusTransition("oportunidade", "interessado")).toBeNull();
  });
  it("interessado + lead 'nao_interessado' → null (não regride)", () => {
    expect(resolveLeadStatusTransition("nao_interessado", "interessado")).toBeNull();
  });
  it("opt_out + lead 'novo' → nao_interessado", () => {
    expect(resolveLeadStatusTransition("novo", "opt_out")).toBe("nao_interessado");
  });
  it("opt_out + lead 'oportunidade' → null (terminal exceto oportunidade)", () => {
    expect(resolveLeadStatusTransition("oportunidade", "opt_out")).toBeNull();
  });
  it("objecao → null (não altera status)", () => {
    expect(resolveLeadStatusTransition("novo", "objecao")).toBeNull();
  });
  it("nao_agora → null (não altera status)", () => {
    expect(resolveLeadStatusTransition("novo", "nao_agora")).toBeNull();
  });
  it("interessado + lead já 'interessado' → null (sem no-op update)", () => {
    expect(resolveLeadStatusTransition("interessado", "interessado")).toBeNull();
  });

  it("mapa INTENT_TO_LEAD_STATUS e LT_INTEREST_TO_INTENT conforme spec", () => {
    expect(INTENT_TO_LEAD_STATUS).toEqual({
      interessado: "interessado",
      pediu_info: "interessado",
      objecao: null,
      nao_agora: null,
      opt_out: "nao_interessado",
    });
    // Só sinais positivos mapeiam (conservador — AC6).
    expect(LT_INTEREST_TO_INTENT[1]).toBe("interessado");
    expect(LT_INTEREST_TO_INTENT[4]).toBe("interessado");
    expect(LT_INTEREST_TO_INTENT[-1]).toBeUndefined();
    expect(LT_INTEREST_TO_INTENT[0]).toBeUndefined();
  });
});

// ==============================================
// classifyReplyIntent (Task 7.1)
// ==============================================

describe("classifyReplyIntent", () => {
  it("chama OpenAI com o wire correto (gpt-4o-mini + json_object + Bearer)", async () => {
    const { supabase, mockFrom } = createPromptOnlySupabase();
    mockFrom.mockReturnValue(createChainBuilder({ data: null, error: { code: "PGRST116" } }));
    mockFetch.mockResolvedValue(okOpenAI("interessado"));

    const result = await classifyReplyIntent(LONG_REPLY, "Re: x", "openai-key-test", supabase, "tenant-1");

    expect(result.intent).toBe("interessado");
    expect(result.promptTokens).toBe(120);
    expect(result.completionTokens).toBe(20);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.openai.com/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer openai-key-test" }),
      })
    );
    const body = JSON.parse((mockFetch.mock.calls[0][1] as { body: string }).body);
    expect(body.model).toBe("gpt-4o-mini");
    expect(body.response_format).toEqual({ type: "json_object" });
  });

  it.each(["interessado", "pediu_info", "objecao", "nao_agora", "opt_out"] as const)(
    "faz parse do intent %s vindo da IA",
    async (intent) => {
      const { supabase, mockFrom } = createPromptOnlySupabase();
      mockFrom.mockReturnValue(createChainBuilder({ data: null, error: { code: "PGRST116" } }));
      mockFetch.mockResolvedValue(okOpenAI(intent));

      const result = await classifyReplyIntent(LONG_REPLY, "s", "key", supabase, "tenant-1");
      expect(result.intent).toBe(intent);
    }
  );

  it("fail-open (intent null) quando OpenAI retorna HTTP 429", async () => {
    const { supabase, mockFrom } = createPromptOnlySupabase();
    mockFrom.mockReturnValue(createChainBuilder({ data: null, error: { code: "PGRST116" } }));
    mockFetch.mockResolvedValue({ ok: false, status: 429 });

    const result = await classifyReplyIntent(LONG_REPLY, "s", "key", supabase, "tenant-1");
    expect(result.intent).toBeNull();
    expect(result.promptTokens).toBe(0);
  });

  it("fail-open (intent null) quando fetch lança (timeout)", async () => {
    const { supabase, mockFrom } = createPromptOnlySupabase();
    mockFrom.mockReturnValue(createChainBuilder({ data: null, error: { code: "PGRST116" } }));
    mockFetch.mockRejectedValue(new Error("AbortError"));

    const result = await classifyReplyIntent(LONG_REPLY, "s", "key", supabase, "tenant-1");
    expect(result.intent).toBeNull();
  });

  it("fail-open (intent null) para intent fora do enum", async () => {
    const { supabase, mockFrom } = createPromptOnlySupabase();
    mockFrom.mockReturnValue(createChainBuilder({ data: null, error: { code: "PGRST116" } }));
    mockFetch.mockResolvedValue(okOpenAI("comprou_ja"));

    const result = await classifyReplyIntent(LONG_REPLY, "s", "key", supabase, "tenant-1");
    expect(result.intent).toBeNull();
  });

  it("guard: sem key OpenAI → intent null, NÃO chama fetch", async () => {
    const { supabase } = createPromptOnlySupabase();
    const result = await classifyReplyIntent(LONG_REPLY, "s", null, supabase, "tenant-1");
    expect(result.intent).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("guard: texto curto → intent null, NÃO chama fetch", async () => {
    const { supabase } = createPromptOnlySupabase();
    const result = await classifyReplyIntent("Hi", "s", "key", supabase, "tenant-1");
    expect(result.intent).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("usa prompt do tenant quando disponível (override)", async () => {
    const { supabase, mockFrom } = createPromptOnlySupabase();
    mockFrom.mockReturnValue(
      createChainBuilder({
        data: {
          prompt_template: "Classifique: {{reply_text}}",
          model_preference: "gpt-4o",
          metadata: { temperature: 0.4, maxTokens: 200 },
        },
        error: null,
      })
    );
    mockFetch.mockResolvedValue(okOpenAI("objecao"));

    await classifyReplyIntent(LONG_REPLY, "s", "key", supabase, "tenant-1");
    const body = JSON.parse((mockFetch.mock.calls[0][1] as { body: string }).body);
    expect(body.model).toBe("gpt-4o");
    expect(body.temperature).toBe(0.4);
    expect(body.max_tokens).toBe(200);
  });

  it("trunca textos longos (>4000 chars)", async () => {
    const { supabase, mockFrom } = createPromptOnlySupabase();
    mockFrom.mockReturnValue(createChainBuilder({ data: null, error: { code: "PGRST116" } }));
    mockFetch.mockResolvedValue(okOpenAI("interessado"));

    await classifyReplyIntent("A".repeat(5000), "s", "key", supabase, "tenant-1");
    const body = JSON.parse((mockFetch.mock.calls[0][1] as { body: string }).body);
    const prompt = body.messages[0].content;
    expect(prompt).toContain("A".repeat(4000));
    expect(prompt).not.toContain("A".repeat(5000));
    expect(prompt).toContain("...");
  });
});

// ==============================================
// classifyPendingReplies (Task 7.6 / 7.5 / integração 7.3+7.4)
// ==============================================

describe("classifyPendingReplies", () => {
  it("seleciona só source='reply' + intent IS NULL e classifica (happy path + custo)", async () => {
    const { supabase, chains } = makeClassifierSupabase({
      pending: [makeOpp()],
      leadStatus: "novo",
    });
    mockFetch.mockResolvedValue(okOpenAI("interessado"));

    const result = await classifyPendingReplies(supabase, { tenantId: "tenant-1" });

    expect(result.classified).toBe(1);
    expect(result.skipped).toBe(0);
    // Filtros da seleção
    expect(chains.opportunities.eq).toHaveBeenCalledWith("source", "reply");
    expect(chains.opportunities.is).toHaveBeenCalledWith("intent", null);
    // Persiste o intent classificado
    expect(chains.opportunities.update).toHaveBeenCalledWith({ intent: "interessado" });
    // Custo registrado em api_usage_logs (service openai + request_type correto) — NFR6
    expect(mockLogUsage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        serviceName: "openai",
        requestType: "reply_intent_classification",
        status: "success",
      })
    );
  });

  it("idempotência: 2ª execução sem pendentes não reclassifica (classified=0, sem fetch)", async () => {
    const { supabase, chains } = makeClassifierSupabase({ pending: [] });

    const result = await classifyPendingReplies(supabase, { tenantId: "tenant-1" });

    expect(result.classified).toBe(0);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(chains.opportunities.update).not.toHaveBeenCalled();
  });

  it("fail-open per-tenant: sem key OpenAI → pula (intent segue null, sem fetch)", async () => {
    mockGetApiKey.mockResolvedValue(null);
    const { supabase, chains } = makeClassifierSupabase({ pending: [makeOpp()] });

    const result = await classifyPendingReplies(supabase, { tenantId: "tenant-1" });

    expect(result.classified).toBe(0);
    expect(result.skipped).toBe(1);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(chains.opportunities.update).not.toHaveBeenCalled();
  });

  it("fail-open: IA falha → intent null → NÃO persiste (reentra no próximo ciclo)", async () => {
    const { supabase, chains } = makeClassifierSupabase({ pending: [makeOpp()], leadStatus: "novo" });
    mockFetch.mockResolvedValue({ ok: false, status: 500 });

    const result = await classifyPendingReplies(supabase, { tenantId: "tenant-1" });

    expect(result.classified).toBe(0);
    expect(result.skipped).toBe(1);
    expect(chains.opportunities.update).not.toHaveBeenCalled();
    // Custo é logado como 'failed' apenas se houve tokens; com HTTP 500 (0 tokens), não loga.
    expect(mockLogUsage).not.toHaveBeenCalled();
  });

  it("AC6: sem reply_text + lt_interest_status=1 → interessado SEM chamar OpenAI", async () => {
    const { supabase, chains } = makeClassifierSupabase({
      pending: [makeOpp({ reply_text: null, lt_interest_status: 1 })],
      leadStatus: "novo",
    });

    const result = await classifyPendingReplies(supabase, { tenantId: "tenant-1" });

    expect(result.classified).toBe(1);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(chains.opportunities.update).toHaveBeenCalledWith({ intent: "interessado" });
  });

  it("AC6: sem reply_text + lt_interest_status=-1 → intent null (sem persistir)", async () => {
    const { supabase, chains } = makeClassifierSupabase({
      pending: [makeOpp({ reply_text: null, lt_interest_status: -1 })],
    });

    const result = await classifyPendingReplies(supabase, { tenantId: "tenant-1" });

    expect(result.classified).toBe(0);
    expect(result.skipped).toBe(1);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(chains.opportunities.update).not.toHaveBeenCalled();
  });

  it("ensemble: IA=interessado + lt=-1 → intent fica interessado (IA prevalece) + logWarn", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { supabase, chains } = makeClassifierSupabase({
      pending: [makeOpp({ lt_interest_status: -1 })],
      leadStatus: "novo",
    });
    mockFetch.mockResolvedValue(okOpenAI("interessado"));

    await classifyPendingReplies(supabase, { tenantId: "tenant-1" });

    // IA prevalece: persiste interessado apesar do sinal negativo do Instantly.
    expect(chains.opportunities.update).toHaveBeenCalledWith({ intent: "interessado" });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("ensemble divergence"),
      expect.objectContaining({ aiIntent: "interessado", ltInterestStatus: -1 })
    );
    warnSpy.mockRestore();
  });

  it("sem divergência (lt=1) → sem warn de ensemble", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { supabase } = makeClassifierSupabase({
      pending: [makeOpp({ lt_interest_status: 1 })],
      leadStatus: "novo",
    });
    mockFetch.mockResolvedValue(okOpenAI("interessado"));

    await classifyPendingReplies(supabase, { tenantId: "tenant-1" });

    const divergenceWarns = warnSpy.mock.calls.filter((c) =>
      String(c[0]).includes("ensemble divergence")
    );
    expect(divergenceWarns).toHaveLength(0);
    warnSpy.mockRestore();
  });

  it("transição de status: opt_out atualiza o lead para nao_interessado", async () => {
    const { supabase, chains } = makeClassifierSupabase({
      pending: [makeOpp()],
      leadStatus: "em_campanha",
    });
    mockFetch.mockResolvedValue(okOpenAI("opt_out"));

    await classifyPendingReplies(supabase, { tenantId: "tenant-1" });

    expect(chains.leads.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "nao_interessado" })
    );
  });

  it("transição de status: objecao NÃO altera o status do lead", async () => {
    const { supabase, chains } = makeClassifierSupabase({
      pending: [makeOpp()],
      leadStatus: "novo",
    });
    mockFetch.mockResolvedValue(okOpenAI("objecao"));

    await classifyPendingReplies(supabase, { tenantId: "tenant-1" });

    expect(chains.opportunities.update).toHaveBeenCalledWith({ intent: "objecao" });
    // objecao mapeia para null em INTENT_TO_LEAD_STATUS → nem toca a tabela leads.
    expect(chains.leads).toBeUndefined();
  });

  it("lead_id null → classifica opportunity sem tentar update de status", async () => {
    const { supabase, chains } = makeClassifierSupabase({
      pending: [makeOpp({ lead_id: null })],
    });
    mockFetch.mockResolvedValue(okOpenAI("interessado"));

    const result = await classifyPendingReplies(supabase, { tenantId: "tenant-1" });

    expect(result.classified).toBe(1);
    expect(chains.opportunities.update).toHaveBeenCalledWith({ intent: "interessado" });
    expect(chains.leads).toBeUndefined();
  });

  it("erro no SELECT de pendentes → surface no resumo, sem quebrar", async () => {
    const { supabase } = makeClassifierSupabase({ pendingError: { message: "db down" } });

    const result = await classifyPendingReplies(supabase, { tenantId: "tenant-1" });

    expect(result.classified).toBe(0);
    expect(result.errors[0].error).toBe("db down");
  });
});
