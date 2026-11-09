/**
 * Story 24.24 — POST /api/agent/executions/[executionId]/conversation
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/agent/executions/[executionId]/conversation/route";
import { createChainBuilder, type ChainBuilder } from "../../../helpers/mock-supabase";
import { FACTS, buildSteps } from "../../../helpers/conversation-fixtures";
import type { ConversationStep } from "@/lib/agent/conversation/context";

const mockGetCurrentUserProfile = vi.fn();
vi.mock("@/lib/supabase/tenant", () => ({
  getCurrentUserProfile: () => mockGetCurrentUserProfile(),
}));

const mockFrom = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({ from: mockFrom })),
}));

const mockReadServiceApiKey = vi.fn();
vi.mock("@/lib/agent/service-keys", () => ({
  readServiceApiKey: (...args: unknown[]) => mockReadServiceApiKey(...args),
}));

const mockLogAgentUsage = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/agent/agent-usage", () => ({
  logAgentUsage: (...args: unknown[]) => mockLogAgentUsage(...args),
}));

const mockReadDossierFacts = vi.fn();
vi.mock("@/lib/agent/dossier/repository", () => ({
  readDossierFacts: (...args: unknown[]) => mockReadDossierFacts(...args),
}));

const mockEnsureCostModels = vi.fn();
const mockIsTregConfigured = vi.fn();
const mockEstimateCosts = vi.fn();
vi.mock("@/lib/services/agent-cost-estimator", () => ({
  CostEstimatorService: {
    ensureCostModels: (...args: unknown[]) => mockEnsureCostModels(...args),
    isTregConfigured: (...args: unknown[]) => mockIsTregConfigured(...args),
    estimateCosts: (...args: unknown[]) => mockEstimateCosts(...args),
  },
}));

const mockLoadCopyReviewContext = vi.fn();
vi.mock("@/lib/agent/conversation/kb-review-context", () => ({
  loadCopyReviewContext: (...args: unknown[]) => mockLoadCopyReviewContext(...args),
}));

const mockReviewEmailCopy = vi.fn();
const mockLogCopyReview = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/ai/copy-reviewer", () => ({
  reviewEmailCopy: (...args: unknown[]) => mockReviewEmailCopy(...args),
  logCopyReview: (...args: unknown[]) => mockLogCopyReview(...args),
}));

// LLM: o SDK `openai` vira um fake com respostas em fila.
const mockCreate = vi.fn();
vi.mock("openai", () => ({
  default: class {
    chat = { completions: { create: (...args: unknown[]) => mockCreate(...args) } };
  },
}));

const EXEC_ID = "550e8400-e29b-41d4-a716-446655440000";
const BRIEFING = {
  technology: null,
  jobTitles: ["CISO"],
  location: "Sao Paulo",
  companySize: null,
  industry: null,
  productSlug: null,
  mode: "guided",
  skipSteps: ["search_companies"],
};

let execution: Record<string, unknown> | null;
let steps: ConversationStep[];
let tableCalls: string[];

function llmReply(content: unknown) {
  mockCreate.mockResolvedValueOnce({
    choices: [{ message: { content: typeof content === "string" ? content : JSON.stringify(content) } }],
    usage: { prompt_tokens: 1000, completion_tokens: 100 },
  });
}

function call(body: unknown) {
  return POST(
    new Request("http://localhost/x", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    { params: Promise.resolve({ executionId: EXEC_ID }) }
  );
}

async function data(response: Response) {
  expect(response.status).toBe(200);
  return (await response.json()).data;
}

describe("POST conversation (24.24)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentUserProfile.mockResolvedValue({ id: "u", tenant_id: "tenant-1" });
    execution = { id: EXEC_ID, status: "running", briefing: BRIEFING };
    steps = buildSteps();
    tableCalls = [];
    mockFrom.mockImplementation((table: string) => {
      tableCalls.push(table);
      if (table === "agent_executions") return createChainBuilder({ data: execution, error: null });
      if (table === "agent_steps") return createChainBuilder({ data: steps, error: null });
      if (table === "agent_messages") {
        // Ordem desc (mais nova primeiro): a mensagem atual ja gravada vem no topo.
        return createChainBuilder({
          data: [
            { role: "user", content: "por que o Joao?" },
            { role: "agent", content: "Campanha criada." },
          ],
          error: null,
        });
      }
      return createChainBuilder();
    });
    mockReadServiceApiKey.mockResolvedValue({ status: "ok", apiKey: "sk-test" });
    mockReadDossierFacts.mockImplementation(async (_s: unknown, _t: unknown, id: string) => ({
      facts: FACTS[id as keyof typeof FACTS] ?? [],
    }));
    mockEnsureCostModels.mockResolvedValue(new Map([["apollo", 0.5]]));
    mockIsTregConfigured.mockResolvedValue(true);
    mockEstimateCosts.mockReturnValue({ total: 12.34, steps: {}, currency: "BRL" });
    mockLoadCopyReviewContext.mockResolvedValue({
      audience: "Cargos: CISO",
      productName: "",
      productDescription: "",
      targetIndustries: "",
      painPoints: "",
      icpSummary: "",
      authorizedProofs: "",
    });
    mockReviewEmailCopy.mockImplementation(async (input: { subject: string; body: string }) => ({
      subject: input.subject,
      body: input.body,
      status: "approved",
      reasons: [],
      calls: 1,
      promptTokens: 10,
      completionTokens: 5,
      estimatedCost: 0.0001,
    }));
  });

  // --- auth / validacao ---

  it("401 sem sessao", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(null);
    expect((await call({ message: "oi" })).status).toBe(401);
  });

  it("404 quando a execucao nao e do tenant (filtro tenant_id explicito)", async () => {
    execution = null;
    const response = await call({ message: "oi" });
    expect(response.status).toBe(404);
    const execChain = mockFrom.mock.results[0].value as ChainBuilder;
    expect(execChain.eq).toHaveBeenCalledWith("tenant_id", "tenant-1");
  });

  it("400 com mensagem vazia, longa demais ou JSON invalido", async () => {
    expect((await call({ message: "  " })).status).toBe(400);
    expect((await call({ message: "x".repeat(2001) })).status).toBe(400);
    expect((await call("{nao json")).status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  // --- fallback ---

  it("sem output nos steps: fallback sem chamar o LLM", async () => {
    steps = [{ step_number: 1, step_type: "search_leads", status: "running", output: null }];
    expect(await data(await call({ message: "e agora?" }))).toEqual({ kind: "fallback" });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("sem chave da OpenAI: fallback", async () => {
    mockReadServiceApiKey.mockResolvedValue({ status: "missing" });
    expect(await data(await call({ message: "por que o Joao?" }))).toEqual({ kind: "fallback" });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("timeout do LLM: fallback e a falha vai para o log", async () => {
    mockCreate.mockRejectedValueOnce(new Error("Request was aborted."));
    expect(await data(await call({ message: "por que o Joao?" }))).toEqual({ kind: "fallback" });
    expect(mockLogAgentUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-1",
        executionId: EXEC_ID,
        serviceName: "openai",
        requestType: "agent_conversation",
        status: "failed",
        calls: 1,
      })
    );
  });

  it("JSON invalido do LLM: fallback", async () => {
    llmReply("isto nao e json");
    expect(await data(await call({ message: "por que o Joao?" }))).toEqual({ kind: "fallback" });
    expect(mockLogAgentUsage).toHaveBeenCalledWith(expect.objectContaining({ status: "failed" }));
  });

  it("erro de banco nos steps: fallback, nunca 500", async () => {
    mockFrom.mockImplementation((table: string) =>
      table === "agent_executions"
        ? createChainBuilder({ data: execution, error: null })
        : createChainBuilder({ data: null, error: { message: "db down" } })
    );
    expect(await data(await call({ message: "por que o Joao?" }))).toEqual({ kind: "fallback" });
  });

  it("erro de banco ao ler a execucao: fallback, nao 404", async () => {
    mockFrom.mockImplementation(() => createChainBuilder({ data: null, error: { message: "db down" } }));
    expect(await data(await call({ message: "por que o Joao?" }))).toEqual({ kind: "fallback" });
  });

  it("excecao na sessao ou no client: fallback, nunca 500", async () => {
    mockGetCurrentUserProfile.mockRejectedValue(new Error("cookies down"));
    expect(await data(await call({ message: "por que o Joao?" }))).toEqual({ kind: "fallback" });
  });

  it("erro ao ler o historico: fallback sem chamar o LLM", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "agent_executions") return createChainBuilder({ data: execution, error: null });
      if (table === "agent_steps") return createChainBuilder({ data: steps, error: null });
      return createChainBuilder({ data: null, error: { message: "db down" } });
    });
    expect(await data(await call({ message: "por que o Joao?" }))).toEqual({ kind: "fallback" });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("erro ao ler os fatos do dossie: fallback sem chamar o LLM", async () => {
    mockReadDossierFacts.mockResolvedValue({ facts: [], error: "db down" });
    expect(await data(await call({ message: "por que o Joao?" }))).toEqual({ kind: "fallback" });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("reescrita com a KB fora do ar: fallback sem gerar o e-mail", async () => {
    mockLoadCopyReviewContext.mockResolvedValue(null);
    llmReply({ intent: "rewrite", position: 3 });
    expect(await data(await call({ message: "reescreve o e-mail 3" }))).toEqual({ kind: "fallback" });
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  // --- pergunta ---

  it("pergunta: answer com base no score, justificativa, gatilho e fatos; loga o uso", async () => {
    llmReply({ intent: "answer", reply: "Joao e A: CISO de banco medio em SP." });
    const result = await data(await call({ message: "por que o Joao?" }));
    expect(result).toEqual({ kind: "answer", reply: "Joao e A: CISO de banco medio em SP." });

    const prompt = mockCreate.mock.calls[0][0].messages[1].content as string;
    expect(prompt).toContain("CISO de banco medio em SP, igual ao ICP");
    expect(prompt).toContain("Vaga: Banco X contrata analista de SOC");
    expect(prompt).toContain("Banco X anuncia expansao digital");
    // O historico traz o turno anterior, mas nao repete a mensagem atual (ja gravada).
    expect(prompt).toContain("Campanha criada.");
    expect(prompt.split("por que o Joao?")).toHaveLength(2);
    expect(mockReadDossierFacts).toHaveBeenCalledWith(expect.anything(), "tenant-1", "dos-1");
    expect(mockLogAgentUsage).toHaveBeenCalledWith(
      expect.objectContaining({ requestType: "agent_conversation", status: "success", executionId: EXEC_ID })
    );
    // Nenhuma escrita: so leituras de execucao, steps e mensagens.
    expect(new Set(tableCalls)).toEqual(new Set(["agent_executions", "agent_steps", "agent_messages"]));
  });

  // --- reescrita ---

  it("reescrita com gate aberto: card com original, proposta, revisor e canApply", async () => {
    llmReply({ intent: "rewrite", position: 3 });
    llmReply({ subject: "Ultima ideia curta", body: "Fecho, {{first_name}}. Faz sentido?" });
    const result = await data(await call({ message: "reescreve o e-mail 3 mais curto" }));
    expect(result.kind).toBe("rewrite");
    expect(result.proposal).toMatchObject({
      stepNumber: 3,
      position: 3,
      blockPosition: 5,
      emailMode: "follow-up",
      original: { subject: "Ultima ideia", body: "Fecho por aqui, {{first_name}}." },
      proposed: { subject: "Ultima ideia curta", body: "Fecho, {{first_name}}. Faz sentido?" },
      review: { status: "approved", reasons: [] },
      canApply: true,
      blockedReason: null,
    });
    expect(result.reply).toContain("todos os leads");
    expect(mockLogAgentUsage).toHaveBeenCalledWith(
      expect.objectContaining({ requestType: "agent_conversation_rewrite", status: "success" })
    );
    expect(mockLogCopyReview).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ source: "agent", executionId: EXEC_ID, emailPosition: 3 })
    );
  });

  it("reescrita com revisor sem chave/timeout: card mostra not_reviewed", async () => {
    mockReviewEmailCopy.mockImplementationOnce(async (input: { subject: string; body: string }) => ({
      ...input,
      status: "not_reviewed",
      reasons: [],
      calls: 0,
      promptTokens: 0,
      completionTokens: 0,
      estimatedCost: 0,
    }));
    llmReply({ intent: "rewrite", position: 1 });
    llmReply({ subject: "Novo", body: "Oi {{first_name}}" });
    const result = await data(await call({ message: "reescreve o e-mail 1" }));
    expect(result.proposal.review.status).toBe("not_reviewed");
    expect(result.proposal.canApply).toBe(true);
  });

  it("reescrita depois do export: so Copiar, com o motivo", async () => {
    steps = buildSteps({ campaignStatus: "completed" });
    llmReply({ intent: "rewrite", position: 1 });
    llmReply({ subject: "Novo", body: "Oi {{first_name}}" });
    const result = await data(await call({ message: "reescreve o e-mail 1" }));
    expect(result.proposal.canApply).toBe(false);
    expect(result.proposal.blockedReason).toContain("aprovada e enviada ao Instantly");
  });

  it("posicao inexistente: answer com as posicoes, sem card e sem reescrever", async () => {
    llmReply({ intent: "rewrite", position: 9 });
    const result = await data(await call({ message: "reescreve o e-mail 9" }));
    expect(result.kind).toBe("answer");
    expect(result.reply).toContain("1, 2, 3");
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it("sem campanha: answer dizendo que nao ha e-mails", async () => {
    steps = buildSteps({ withCampaign: false });
    llmReply({ intent: "rewrite", position: 1 });
    const result = await data(await call({ message: "reescreve o e-mail 1" }));
    expect(result).toEqual({ kind: "answer", reply: expect.stringContaining("Ainda nao ha e-mails") });
  });

  it("reescrita com o LLM falhando: fallback", async () => {
    llmReply({ intent: "rewrite", position: 1 });
    mockCreate.mockRejectedValueOnce(new Error("timeout"));
    expect(await data(await call({ message: "reescreve o e-mail 1" }))).toEqual({ kind: "fallback" });
    expect(mockLogAgentUsage).toHaveBeenCalledWith(
      expect.objectContaining({ requestType: "agent_conversation_rewrite", status: "failed" })
    );
  });

  // --- mais leads ---

  it("mais leads com a execucao terminada: card com N, referencia, custo e canStart", async () => {
    execution = { id: EXEC_ID, status: "completed", briefing: BRIEFING };
    llmReply({ intent: "more_leads", count: 2, referenceName: "Joao Silva" });
    const result = await data(await call({ message: "traz mais 2 parecidos com o Joao" }));
    expect(result.kind).toBe("more_leads");
    expect(result.proposal).toMatchObject({
      count: 2,
      referenceName: "Joao Silva",
      estimatedCostBRL: 12.34,
      canStart: true,
      blockedReason: null,
      briefing: { jobTitles: ["CISO"], leadCount: 2 },
    });
    const [, estimateBriefing, options] = mockEstimateCosts.mock.calls[0];
    expect(estimateBriefing.leadCount).toBe(2);
    expect(options).toEqual({ tregConfigured: true });
  });

  it("mais leads com a execucao em andamento: botao desabilitado com o motivo", async () => {
    llmReply({ intent: "more_leads", count: 2 });
    const result = await data(await call({ message: "traz mais 2" }));
    expect(result.proposal.canStart).toBe(false);
    expect(result.proposal.blockedReason).toBe("Disponivel quando esta execucao terminar.");
  });

  it("mais leads com leads importados: answer sem card e sem custo", async () => {
    execution = { id: EXEC_ID, status: "completed", briefing: { ...BRIEFING, importedLeads: [{ name: "X" }] } };
    llmReply({ intent: "more_leads", count: 2 });
    const result = await data(await call({ message: "traz mais 2" }));
    expect(result.kind).toBe("answer");
    expect(result.reply).toContain("leads importados");
    expect(mockEstimateCosts).not.toHaveBeenCalled();
  });

  it.each(["failed", "cancelled"])("mais leads com a execucao %s: canStart true", async (status) => {
    execution = { id: EXEC_ID, status, briefing: BRIEFING };
    llmReply({ intent: "more_leads", count: 3 });
    const result = await data(await call({ message: "traz mais 3" }));
    expect(result.proposal).toMatchObject({ count: 3, canStart: true, blockedReason: null });
  });

  it("reescrita com a campanha em outro status (ex.: failed): motivo generico, sem Substituir", async () => {
    steps = buildSteps({ campaignStatus: "failed" });
    llmReply({ intent: "rewrite", position: 1 });
    llmReply({ subject: "Novo", body: "Oi {{first_name}}" });
    const result = await data(await call({ message: "reescreve o e-mail 1" }));
    expect(result.proposal.canApply).toBe(false);
    expect(result.proposal.blockedReason).toBe(
      "A campanha nao esta aguardando aprovacao, entao a previa nao pode ser trocada."
    );
  });
});
