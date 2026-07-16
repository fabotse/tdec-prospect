/**
 * Tests for POST /api/opportunities/:opportunityId/suggestion
 * Story 21.5: Ações do Card + Próximo Passo por IA — AC #1, #5, #6, #7
 *
 * Cobre: auth, 404 tenant-scoped, cache-hit (sem IA/sem custo), regenerate
 * (bypassa cache + grava), fail-open sem chave OpenAI (200 sem custo),
 * sucesso (grava suggestion + loga custo em api_usage_logs).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockGetCurrentUserProfile = vi.fn();
const mockFrom = vi.fn();
const mockGetApiKey = vi.fn();
const mockLoadKBContext = vi.fn();
const mockLoadToneContext = vi.fn();
const mockLogMonitoringUsage = vi.fn();
const mockGenerate = vi.fn();
const mockCreateAdminClient = vi.fn();

vi.mock("@/lib/supabase/tenant", () => ({
  getCurrentUserProfile: () => mockGetCurrentUserProfile(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({ from: mockFrom })),
}));

// A chave OpenAI (`api_configs`) e a KB (`knowledge_base`) são admin-gated
// (00005:14-20 / 00007:41-47 exigem `is_admin()` = gestor|diretor — 00053:64-78).
// A rota lê as duas com o client ADMIN, senão o rascunho morre para o SDR, que é
// o dono declarado da Central (Sidebar.tsx:61). O mock devolve um client
// distinguível p/ provar QUAL client vai em cada leitura.
const mockAdminClient = { from: vi.fn(), __isAdmin: true };
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => mockCreateAdminClient(),
}));

vi.mock("@/lib/utils/monitoring-processor", () => ({
  getApiKey: (...args: unknown[]) => mockGetApiKey(...args),
  loadKBContext: (...args: unknown[]) => mockLoadKBContext(...args),
  loadToneContext: (...args: unknown[]) => mockLoadToneContext(...args),
  logMonitoringUsage: (...args: unknown[]) => mockLogMonitoringUsage(...args),
}));

vi.mock("@/lib/utils/opportunity-suggestion", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/utils/opportunity-suggestion")
  >("@/lib/utils/opportunity-suggestion");
  return {
    ...actual,
    generateOpportunityNextStep: (...args: unknown[]) => mockGenerate(...args),
  };
});

import { POST } from "@/app/api/opportunities/[opportunityId]/suggestion/route";

const mockProfile = { tenant_id: "tenant-1", id: "user-1" };
const OPP_ID = "opp-uuid-123";

const baseRow = {
  id: OPP_ID,
  tenant_id: "tenant-1",
  lead_id: "lead-1",
  campaign_id: "camp-1",
  source: "reply",
  reply_text: "Tenho interesse!",
  reply_subject: "Re: Proposta",
  intent: "interessado",
  suggestion: null,
  status: "viewed",
  lead: {
    id: "lead-1",
    first_name: "João",
    last_name: "Silva",
    company_name: "TechCorp",
    title: "CTO",
  },
};

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/opportunities/test/suggestion", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function makeParams(opportunityId: string) {
  return { params: Promise.resolve({ opportunityId }) };
}

/**
 * Chain do UPDATE: `.update().eq().eq()` só resolve no await final — por isso
 * `eq` encadeia e o objeto é thenable (o await no fim da cadeia dispara o then).
 */
function makeUpdateChain(error: unknown = null) {
  const chain = {
    update: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    then: (resolve: (value: { error: unknown }) => unknown) => resolve({ error }),
  };
  return chain;
}

/** Chain do SELECT da oportunidade + chain do UPDATE (tabela `opportunities`). */
function setupOpportunity(
  row: unknown,
  error: unknown = null,
  updateError: unknown = null
) {
  const selectChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: row, error }),
  };
  const updateChain = makeUpdateChain(updateError);
  let call = 0;
  mockFrom.mockImplementation((table: string) => {
    if (table !== "opportunities") return { insert: vi.fn().mockResolvedValue({ error: null }) };
    call += 1;
    return call === 1 ? selectChain : updateChain;
  });
  return { selectChain, updateChain };
}

describe("POST /api/opportunities/:opportunityId/suggestion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateAdminClient.mockReturnValue(mockAdminClient);
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
    mockGetApiKey.mockResolvedValue("sk-test-key");
    mockLoadKBContext.mockResolvedValue({
      companyContext: "Empresa B2B",
      productsServices: "CRM",
      competitiveAdvantages: "IA",
      icpSummary: "CTOs",
    });
    mockLoadToneContext.mockResolvedValue({
      toneDescription: "Casual",
      toneStyle: "casual",
    });
    mockGenerate.mockResolvedValue({
      suggestion: "Rascunho gerado pela IA",
      promptTokens: 800,
      completionTokens: 200,
    });
  });

  it("retorna 401 quando não autenticado", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(null);

    const response = await POST(makeRequest({}), makeParams(OPP_ID));
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json.error.code).toBe("UNAUTHORIZED");
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it("retorna 400 para body JSON inválido", async () => {
    const request = new NextRequest("http://localhost/api/opportunities/test/suggestion", {
      method: "POST",
      body: "not-json",
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(request, makeParams(OPP_ID));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });

  it("retorna 404 quando a oportunidade não existe / é de outro tenant (PGRST116)", async () => {
    setupOpportunity(null, { code: "PGRST116" });

    const response = await POST(makeRequest({}), makeParams(OPP_ID));
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.error.code).toBe("NOT_FOUND");
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it("filtra por id E tenant_id ao carregar a oportunidade (isolamento)", async () => {
    const { selectChain } = setupOpportunity(baseRow);

    await POST(makeRequest({}), makeParams(OPP_ID));

    expect(selectChain.eq).toHaveBeenCalledWith("id", OPP_ID);
    expect(selectChain.eq).toHaveBeenCalledWith("tenant_id", "tenant-1");
  });

  it("CACHE-HIT: suggestion presente + regenerate=false → devolve cache sem IA e sem custo (AC1)", async () => {
    setupOpportunity({ ...baseRow, suggestion: "Rascunho já cacheado" });

    const response = await POST(makeRequest({}), makeParams(OPP_ID));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.suggestion).toBe("Rascunho já cacheado");
    expect(json.data.cached).toBe(true);
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(mockGetApiKey).not.toHaveBeenCalled();
    expect(mockLogMonitoringUsage).not.toHaveBeenCalled();
  });

  it("REGENERATE: suggestion presente + regenerate=true → gera de novo e grava (AC2)", async () => {
    const { updateChain } = setupOpportunity({
      ...baseRow,
      suggestion: "Rascunho antigo",
    });

    const response = await POST(makeRequest({ regenerate: true }), makeParams(OPP_ID));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.suggestion).toBe("Rascunho gerado pela IA");
    expect(json.data.cached).toBeUndefined();
    expect(mockGenerate).toHaveBeenCalledOnce();
    expect(updateChain.update).toHaveBeenCalledWith({ suggestion: "Rascunho gerado pela IA" });
  });

  it("FAIL-OPEN: sem chave OpenAI → 200 com suggestion null, sem gerar e sem logar custo (AC5)", async () => {
    setupOpportunity(baseRow);
    mockGetApiKey.mockResolvedValue(null);

    const response = await POST(makeRequest({}), makeParams(OPP_ID));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.suggestion).toBeNull();
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(mockLogMonitoringUsage).not.toHaveBeenCalled();
  });

  it("SUCESSO: grava suggestion e loga custo em api_usage_logs (AC6)", async () => {
    const { updateChain } = setupOpportunity(baseRow);

    const response = await POST(makeRequest({}), makeParams(OPP_ID));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.suggestion).toBe("Rascunho gerado pela IA");
    expect(updateChain.update).toHaveBeenCalledWith({ suggestion: "Rascunho gerado pela IA" });

    expect(mockLogMonitoringUsage).toHaveBeenCalledOnce();
    const params = mockLogMonitoringUsage.mock.calls[0][1];
    expect(params.tenantId).toBe("tenant-1");
    expect(params.serviceName).toBe("openai");
    expect(params.requestType).toBe("opportunity_next_step");
    expect(params.leadId).toBe("lead-1");
    expect(params.status).toBe("success");
    expect(params.estimatedCost).toBeGreaterThan(0);
    expect(params.metadata.promptTokens).toBe(800);
    expect(params.metadata.completionTokens).toBe(200);
  });

  it("monta o contexto do lead a partir do embed (nome completo, cargo, empresa)", async () => {
    setupOpportunity(baseRow);

    await POST(makeRequest({}), makeParams(OPP_ID));

    const [oppContext, leadContext] = mockGenerate.mock.calls[0];
    expect(oppContext).toEqual({
      replyText: "Tenho interesse!",
      replySubject: "Re: Proposta",
      intent: "interessado",
    });
    expect(leadContext.leadName).toBe("João Silva");
    expect(leadContext.leadTitle).toBe("CTO");
    expect(leadContext.leadCompany).toBe("TechCorp");
    // `leads` não tem coluna industry — passa vazio
    expect(leadContext.leadIndustry).toBe("");
  });

  it("lead null (lead_id nullable) → gera mesmo assim, sem quebrar (AC5)", async () => {
    setupOpportunity({ ...baseRow, lead_id: null, lead: null });

    const response = await POST(makeRequest({}), makeParams(OPP_ID));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.suggestion).toBe("Rascunho gerado pela IA");
    const leadContext = mockGenerate.mock.calls[0][1];
    expect(leadContext.leadName).toBe("");
    // sem lead → sem leadId no log de custo
    const params = mockLogMonitoringUsage.mock.calls[0][1];
    expect(params.leadId).toBeUndefined();
  });

  it("KB vazia (loadKBContext null) → ainda gera com contexto mínimo (AC5)", async () => {
    setupOpportunity(baseRow);
    mockLoadKBContext.mockResolvedValue(null);

    const response = await POST(makeRequest({}), makeParams(OPP_ID));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(mockGenerate).toHaveBeenCalledOnce();
    const kbContext = mockGenerate.mock.calls[0][2];
    expect(kbContext.companyContext).toBe("");
    expect(kbContext.toneStyle).toBe("casual");
    expect(json.data.suggestion).toBe("Rascunho gerado pela IA");
  });

  it("geração falhou (suggestion null) → 200 gracioso, sem gravar (AC5)", async () => {
    const { updateChain } = setupOpportunity(baseRow);
    mockGenerate.mockResolvedValue({
      suggestion: null,
      promptTokens: 0,
      completionTokens: 0,
      error: "OpenAI API error: 429",
    });

    const response = await POST(makeRequest({}), makeParams(OPP_ID));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.suggestion).toBeNull();
    expect(updateChain.update).not.toHaveBeenCalled();
    // tokens 0 → NÃO loga custo (gate padrão monitoring/21.3)
    expect(mockLogMonitoringUsage).not.toHaveBeenCalled();
  });

  // ==============================================
  // RLS: chave/KB/prompt são admin-gated — sem o client admin o rascunho
  // (AC1) morre em silêncio para o `sdr`, dono declarado da Central.
  // ==============================================

  it("lê a chave OpenAI com o client ADMIN, não com o de sessão (RLS is_admin bloqueia o SDR)", async () => {
    setupOpportunity({ ...baseRow });

    await POST(makeRequest({}), makeParams(OPP_ID));

    expect(mockGetApiKey).toHaveBeenCalledWith(mockAdminClient, "tenant-1", "openai");
  });

  it("lê KB e tom com o client ADMIN (knowledge_base também exige is_admin)", async () => {
    setupOpportunity({ ...baseRow });

    await POST(makeRequest({}), makeParams(OPP_ID));

    // Sem isto o SDR geraria um rascunho SEM empresa/produto/tom — pior que
    // nenhum, porque degrada em silêncio.
    expect(mockLoadKBContext).toHaveBeenCalledWith(mockAdminClient, "tenant-1");
    expect(mockLoadToneContext).toHaveBeenCalledWith(mockAdminClient, "tenant-1");
  });

  it("passa o client ADMIN ao gerador (ai_prompts é admin-gated: SDR cairia sempre no default de código)", async () => {
    setupOpportunity({ ...baseRow });

    await POST(makeRequest({}), makeParams(OPP_ID));

    expect(mockGenerate.mock.calls[0][4]).toBe(mockAdminClient);
  });

  it("service-role key ausente → fail-open 200 com suggestion null, sem 500 (AC5)", async () => {
    setupOpportunity({ ...baseRow });
    mockCreateAdminClient.mockImplementation(() => {
      throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set.");
    });
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await POST(makeRequest({}), makeParams(OPP_ID));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.suggestion).toBeNull();
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(mockLogMonitoringUsage).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("erro de UPDATE é secundário: o rascunho gerado ainda é retornado", async () => {
    setupOpportunity(baseRow, null, { message: "DB down" });
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await POST(makeRequest({}), makeParams(OPP_ID));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.suggestion).toBe("Rascunho gerado pela IA");
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
