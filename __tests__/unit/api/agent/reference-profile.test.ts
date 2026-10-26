/**
 * Story 24.18 — POST /api/agent/executions/[executionId]/reference-profile
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/agent/executions/[executionId]/reference-profile/route";
import { ExternalServiceError } from "@/lib/services/base-service";
import { createChainBuilder } from "../../../helpers/mock-supabase";

const mockGetCurrentUserProfile = vi.fn();
vi.mock("@/lib/supabase/tenant", () => ({
  getCurrentUserProfile: () => mockGetCurrentUserProfile(),
}));

const mockFrom = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({ from: mockFrom })),
}));

const mockGetInjectableServiceApiKey = vi.fn();
vi.mock("@/lib/agent/service-keys", () => ({
  getInjectableServiceApiKey: (...args: unknown[]) => mockGetInjectableServiceApiKey(...args),
}));

const mockEnrichOrganization = vi.fn();
vi.mock("@/lib/services/apollo", () => ({
  ApolloService: class {
    enrichOrganization = mockEnrichOrganization;
  },
}));

const mockGetCostModels = vi.fn();
vi.mock("@/lib/services/agent-cost-estimator", () => ({
  CostEstimatorService: { getCostModels: (...args: unknown[]) => mockGetCostModels(...args) },
}));

const mockLogAgentUsage = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/agent/agent-usage", () => ({
  logAgentUsage: (...args: unknown[]) => mockLogAgentUsage(...args),
}));

const EXEC_ID = "550e8400-e29b-41d4-a716-446655440000";
const REFS = [
  { name: "Banco X", domain: "https://www.bancox.com.br/" },
  { name: "Banco Y", domain: "bancoy.com.br" },
  { name: null, domain: "segz.com.br" },
];

function org(domain: string, employees: number) {
  return {
    id: domain,
    name: domain,
    domain,
    industry: "Banking",
    estimated_num_employees: employees,
    city: "Sao Paulo",
    state: "Sao Paulo",
    country: "Brazil",
    technology_names: ["AWS"],
  };
}

function call(body: unknown, executionId = EXEC_ID) {
  return POST(
    new Request("http://localhost/x", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ executionId }) }
  );
}

describe("POST reference-profile (24.18)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentUserProfile.mockResolvedValue({ id: "u", tenant_id: "tenant-1" });
    mockFrom.mockImplementation(() => createChainBuilder({ data: { id: EXEC_ID }, error: null }));
    mockGetInjectableServiceApiKey.mockResolvedValue("apollo-key");
    mockGetCostModels.mockResolvedValue(new Map([["apollo", 0.1]]));
  });

  it("401 sem sessao", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(null);
    expect((await call({ references: REFS })).status).toBe(401);
  });

  it("400 com menos de 3 ou mais de 5 referencias", async () => {
    expect((await call({ references: REFS.slice(0, 2) })).status).toBe(400);
    const six = Array.from({ length: 6 }, (_, i) => ({ name: null, domain: `e${i}.com` }));
    expect((await call({ references: six })).status).toBe(400);
    expect(mockEnrichOrganization).not.toHaveBeenCalled();
  });

  it("400 quando 3 referencias viram 2 dominios depois de normalizar, sem enriquecer nem logar", async () => {
    const dup = [
      { name: "Banco X", domain: "bancox.com.br" },
      { name: "Banco X", domain: "https://www.bancox.com.br/" },
      { name: "Banco Y", domain: "bancoy.com.br" },
    ];
    expect((await call({ references: dup })).status).toBe(400);
    expect(mockEnrichOrganization).not.toHaveBeenCalled();
    expect(mockLogAgentUsage).not.toHaveBeenCalled();
  });

  it("404 quando a execucao nao e do tenant", async () => {
    mockFrom.mockImplementation(() => createChainBuilder({ data: null, error: { message: "x" } }));
    expect((await call({ references: REFS })).status).toBe(404);
    expect(mockEnrichOrganization).not.toHaveBeenCalled();
  });

  it("422 sem chave da Apollo, sem enriquecer", async () => {
    mockGetInjectableServiceApiKey.mockResolvedValue(undefined);
    const response = await call({ references: REFS });
    expect(response.status).toBe(422);
    expect((await response.json()).error.message).toContain("Apollo");
    expect(mockEnrichOrganization).not.toHaveBeenCalled();
  });

  it("perfil confiante: enriquece os dominios normalizados e loga 1 linha com o custo", async () => {
    mockEnrichOrganization.mockImplementation(async (domain: string) =>
      org(domain, domain === "bancoy.com.br" ? 800 : 300)
    );

    const response = await call({ references: REFS });
    expect(response.status).toBe(200);
    const json = await response.json();

    expect(mockEnrichOrganization.mock.calls.map((c) => c[0])).toEqual([
      "bancox.com.br",
      "bancoy.com.br",
      "segz.com.br",
    ]);
    expect(json.confident).toBe(true);
    expect(json.profile.industries).toEqual(["banking"]);
    expect(json.profile.companySizes).toEqual(["201-500", "501-1000"]);
    expect(json.profile.locations).toEqual(["Sao Paulo, Brazil"]);
    expect(json.profile.creditsUsed).toBe(3);
    expect(json.profile.companies[0].name).toBe("Banco X");
    expect(mockLogAgentUsage).toHaveBeenCalledTimes(1);
    expect(mockLogAgentUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-1",
        executionId: EXEC_ID,
        serviceName: "apollo",
        requestType: "organization_enrich",
        calls: 3,
        estimatedCost: expect.closeTo(0.3, 5),
      })
    );
  });

  it("2 de 3 sem organizacao: nao confiante, explica quais (custo so da encontrada)", async () => {
    mockEnrichOrganization.mockImplementation(async (domain: string) =>
      domain === "bancox.com.br" ? org(domain, 300) : null
    );

    const json = await (await call({ references: REFS })).json();

    expect(json.confident).toBe(false);
    expect(json.reason).toContain("Banco Y");
    expect(json.reason).toContain("segz.com.br");
    expect(mockLogAgentUsage).toHaveBeenCalledWith(
      expect.objectContaining({ calls: 3, estimatedCost: expect.closeTo(0.1, 5) })
    );
  });

  it("uma empresa que falha entra sem dados", async () => {
    mockEnrichOrganization.mockImplementation(async (domain: string) => {
      if (domain === "segz.com.br") throw new ExternalServiceError("apollo", 500, "x");
      return org(domain, 300);
    });

    const json = await (await call({ references: REFS })).json();

    expect(json.confident).toBe(false);
    expect(json.reason).toContain("segz.com.br");
  });

  it("chave recusada pela Apollo (401/403): 422 APOLLO_KEY_INVALID, nunca 401", async () => {
    for (const status of [401, 403]) {
      mockEnrichOrganization.mockRejectedValue(new ExternalServiceError("apollo", status, "x"));
      const response = await call({ references: REFS });
      expect(response.status).toBe(422);
      const json = await response.json();
      expect(json.error.code).toBe("APOLLO_KEY_INVALID");
      expect(json.error.message).toContain("Integracoes");
    }
  });

  it("Apollo fora (todas falham): 502 com mensagem em portugues", async () => {
    mockEnrichOrganization.mockRejectedValue(
      new ExternalServiceError("apollo", 429, "Limite de requisições do Apollo atingido.")
    );

    const response = await call({ references: REFS });

    expect(response.status).toBe(502);
    expect((await response.json()).error.message).toContain("Limite");
    expect(mockLogAgentUsage).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed", estimatedCost: 0 })
    );
  });
});
