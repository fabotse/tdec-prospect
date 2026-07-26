/**
 * Unit Tests for GET /api/agent/executions/[executionId]/plan
 * Story 16.5 - AC: #1, #2, #3
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/agent/executions/[executionId]/plan/route";
import { createChainBuilder } from "../../../helpers/mock-supabase";

// ==============================================
// MOCKS
// ==============================================

const mockGetCurrentUserProfile = vi.fn();

vi.mock("@/lib/supabase/tenant", () => ({
  getCurrentUserProfile: () => mockGetCurrentUserProfile(),
}));

const mockFrom = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({
    from: mockFrom,
  })),
}));

// Story 22.14 (AC7): a contagem de viabilidade bate na Apollo. Mockado aqui para provar
// que ela SO acontece com o opt-in `?viability=1` (Trap #7 — o mesmo endpoint e chamado a
// cada turno de ajuste pelo fetchStepEstimatedCost da 22.13).
const mockSearchPeople = vi.fn();
const apolloConstructorArgs: Array<[string | undefined, string | undefined]> = [];

vi.mock("@/lib/services/apollo", () => ({
  ApolloService: class MockApolloService {
    searchPeople = mockSearchPeople;
    constructor(tenantId?: string, apiKey?: string) {
      apolloConstructorArgs.push([tenantId, apiKey]);
    }
  },
}));

const mockGetInjectableServiceApiKey = vi.fn();

vi.mock("@/lib/agent/service-keys", () => ({
  getInjectableServiceApiKey: (...args: unknown[]) => mockGetInjectableServiceApiKey(...args),
}));

// ==============================================
// HELPERS
// ==============================================

const mockProfile = {
  id: "user-123",
  tenant_id: "tenant-456",
  role: "user",
};

const EXEC_ID = "exec-001";

const mockBriefing = {
  technology: "Netskope",
  jobTitles: ["CTO"],
  location: "Sao Paulo",
  companySize: null,
  industry: null,
  productSlug: null,
  mode: "guided",
  skipSteps: [],
};

function createRequest(query = ""): NextRequest {
  return new NextRequest(
    `http://localhost/api/agent/executions/${EXEC_ID}/plan${query}`,
    { method: "GET" }
  );
}

function createParams() {
  return { params: Promise.resolve({ executionId: EXEC_ID }) };
}

// ==============================================
// TESTS
// ==============================================

describe("GET /api/agent/executions/[executionId]/plan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deve retornar 401 quando nao autenticado", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(null);

    const response = await GET(createRequest(), createParams());
    expect(response.status).toBe(401);

    const json = await response.json();
    expect(json.error.code).toBe("UNAUTHORIZED");
  });

  it("deve retornar 404 quando execucao nao encontrada", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);

    const chain = createChainBuilder({ data: null, error: null });
    mockFrom.mockReturnValue(chain);

    const response = await GET(createRequest(), createParams());
    expect(response.status).toBe(404);

    const json = await response.json();
    expect(json.error.code).toBe("NOT_FOUND");
  });

  it("deve retornar 400 quando briefing esta vazio", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);

    const chain = createChainBuilder({
      data: { id: EXEC_ID, briefing: null, status: "pending" },
      error: null,
    });
    mockFrom.mockReturnValue(chain);

    const response = await GET(createRequest(), createParams());
    expect(response.status).toBe(400);

    const json = await response.json();
    expect(json.error.code).toBe("INVALID_BRIEFING");
  });

  it("deve retornar 400 quando briefing nao tem technology NEM jobTitles", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);

    const chain = createChainBuilder({
      data: {
        id: EXEC_ID,
        briefing: { ...mockBriefing, technology: null, jobTitles: [] },
        status: "pending",
      },
      error: null,
    });
    mockFrom.mockReturnValue(chain);

    const response = await GET(createRequest(), createParams());
    expect(response.status).toBe(400);
  });

  it("deve retornar 200 quando briefing tem jobTitles sem technology (direct entry - Story 17.10)", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);

    const directEntryBriefing = {
      ...mockBriefing,
      technology: null,
      jobTitles: ["CTO"],
      skipSteps: ["search_companies"],
    };

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return createChainBuilder({
          data: { id: EXEC_ID, briefing: directEntryBriefing, status: "pending" },
          error: null,
        });
      }
      return createChainBuilder({ data: [], error: null });
    });

    const response = await GET(createRequest(), createParams());
    expect(response.status).toBe(200);

    const json = await response.json();
    expect(json.data.totalActiveSteps).toBe(4); // 5 - 1 skipped
  });

  it("deve retornar 200 com plan, costEstimate e totalActiveSteps", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);

    // First call: agent_executions (select), second: cost_models (select), third: cost_models (insert+select)
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // agent_executions
        return createChainBuilder({
          data: { id: EXEC_ID, briefing: mockBriefing, status: "pending" },
          error: null,
        });
      }
      // cost_models — return empty first (triggers lazy seed), then return defaults
      return createChainBuilder({
        data: [],
        error: null,
      });
    });

    const response = await GET(createRequest(), createParams());
    expect(response.status).toBe(200);

    const json = await response.json();
    expect(json.data).toBeDefined();
    expect(json.data.steps).toHaveLength(5);
    expect(json.data.costEstimate).toBeDefined();
    expect(json.data.costEstimate.currency).toBe("BRL");
    expect(json.data.totalActiveSteps).toBe(5);
  });

  it("deve retornar totalActiveSteps menor quando ha skipSteps", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);

    const briefingWithSkips = {
      ...mockBriefing,
      skipSteps: ["search_companies", "export"],
    };

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return createChainBuilder({
          data: { id: EXEC_ID, briefing: briefingWithSkips, status: "pending" },
          error: null,
        });
      }
      return createChainBuilder({ data: [], error: null });
    });

    const response = await GET(createRequest(), createParams());
    expect(response.status).toBe(200);

    const json = await response.json();
    expect(json.data.totalActiveSteps).toBe(3);
  });

  it("deve retornar 200 com briefing contendo importedLeads sem technology nem jobTitles (AC: 17.11#3)", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);

    const briefingWithImportedLeads = {
      technology: null,
      jobTitles: [],
      location: null,
      companySize: null,
      industry: null,
      productSlug: null,
      mode: "guided",
      skipSteps: ["search_companies", "search_leads"],
      importedLeads: [
        { name: "Joao", title: "CTO", companyName: "Acme", email: "joao@acme.com", linkedinUrl: null, apolloId: null },
      ],
    };

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return createChainBuilder({
          data: { id: EXEC_ID, briefing: briefingWithImportedLeads, status: "pending" },
          error: null,
        });
      }
      return createChainBuilder({ data: [], error: null });
    });

    const response = await GET(createRequest(), createParams());
    expect(response.status).toBe(200);
  });

  // ==============================================
  // Story 22.14 (AC7) — viabilidade da busca antes de gastar
  // ==============================================

  describe("Story 22.14 - contagem de viabilidade (AC #7)", () => {
    const DIRECT_BRIEFING = {
      ...mockBriefing,
      technology: null,
      jobTitles: ["Owner"],
      location: "Atibaia",
      industry: "clinicas de estetica",
      skipSteps: ["search_companies"],
    };

    function mockExecution(briefing: Record<string, unknown>) {
      let callCount = 0;
      mockFrom.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return createChainBuilder({
            data: { id: EXEC_ID, briefing, status: "pending" },
            error: null,
          });
        }
        return createChainBuilder({ data: [], error: null });
      });
    }

    beforeEach(() => {
      apolloConstructorArgs.length = 0;
      mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
      mockGetInjectableServiceApiKey.mockResolvedValue("apollo-key");
      mockSearchPeople.mockResolvedValue({
        leads: [],
        pagination: { totalEntries: 0, page: 1, perPage: 1, totalPages: 0 },
      });
    });

    /**
     * Trap #7: sem o opt-in, CADA turno de ajuste (que chama este endpoint pelo
     * fetchStepEstimatedCost) dispararia uma chamada externa.
     */
    it("SEM ?viability=1 nao chama a Apollo e devolve viability null", async () => {
      mockExecution(DIRECT_BRIEFING);

      const response = await GET(createRequest(), createParams());
      const json = await response.json();

      expect(mockSearchPeople).not.toHaveBeenCalled();
      expect(json.data.viability).toBeNull();
    });

    it("COM ?viability=1 conta com perPage 1 e devolve o total (search nao gasta credito)", async () => {
      mockExecution(DIRECT_BRIEFING);
      mockSearchPeople.mockResolvedValue({
        leads: [],
        pagination: { totalEntries: 248, page: 1, perPage: 1, totalPages: 248 },
      });

      const response = await GET(createRequest("?viability=1"), createParams());
      const json = await response.json();

      expect(mockSearchPeople).toHaveBeenCalledTimes(1);
      expect(mockSearchPeople).toHaveBeenCalledWith(
        expect.objectContaining({ perPage: 1, page: 1, titles: ["Owner"] })
      );
      expect(json.data.viability).toEqual({ estimatedResults: 248, isLow: false });
    });

    it("marca isLow quando a estimativa e 0 (o caso Atibaia, antes de gastar)", async () => {
      mockExecution(DIRECT_BRIEFING);

      const response = await GET(createRequest("?viability=1"), createParams());
      const json = await response.json();

      expect(json.data.viability).toEqual({ estimatedResults: 0, isLow: true });
    });

    it("usa os MESMOS filtros da busca real (piso 11+ da 22.6 incluido)", async () => {
      mockExecution({ ...DIRECT_BRIEFING, companySize: null });

      await GET(createRequest("?viability=1"), createParams());

      const filters = mockSearchPeople.mock.calls[0][0];
      // SSOT `buildDirectSearchFilters`: uma estimativa com filtros diferentes da busca
      // real seria uma estimativa que mente.
      expect(filters.companySizes).not.toContain("1-10");
      expect(filters.locations).toEqual(["Atibaia"]);
      expect(filters.industries).toEqual(["clinicas de estetica"]);
    });

    it("le a chave do Apollo via service-role e injeta no service (Story 22.9)", async () => {
      mockExecution(DIRECT_BRIEFING);

      await GET(createRequest("?viability=1"), createParams());

      expect(mockGetInjectableServiceApiKey).toHaveBeenCalledWith(
        mockProfile.tenant_id,
        "apollo",
        "Apollo"
      );
      expect(apolloConstructorArgs).toContainEqual([mockProfile.tenant_id, "apollo-key"]);
    });

    it("fluxo COM tecnologia: nao conta (a busca vai por dominios do step 1, nao pelo briefing)", async () => {
      mockExecution({ ...mockBriefing, technology: "Netskope", skipSteps: [] });

      const response = await GET(createRequest("?viability=1"), createParams());
      const json = await response.json();

      expect(mockSearchPeople).not.toHaveBeenCalled();
      expect(json.data.viability).toBeNull();
    });

    it("leads importados: nao conta (nao ha busca a estimar)", async () => {
      mockExecution({
        ...DIRECT_BRIEFING,
        importedLeads: [{ name: "Joao", title: null, companyName: null, email: "j@x.com", linkedinUrl: null, apolloId: null }],
        skipSteps: ["search_companies", "search_leads"],
      });

      const response = await GET(createRequest("?viability=1"), createParams());
      const json = await response.json();

      expect(mockSearchPeople).not.toHaveBeenCalled();
      expect(json.data.viability).toBeNull();
    });

    it("fail-open: Apollo caindo NAO derruba o plano (estimativa e conforto, nao bloqueio)", async () => {
      mockExecution(DIRECT_BRIEFING);
      mockSearchPeople.mockRejectedValue(new Error("apollo 429"));

      const response = await GET(createRequest("?viability=1"), createParams());
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.data.viability).toBeNull();
      expect(json.data.steps.length).toBeGreaterThan(0);
    });

    it("fail-open: chave nao decriptavel NAO derruba o plano", async () => {
      mockExecution(DIRECT_BRIEFING);
      mockGetInjectableServiceApiKey.mockRejectedValue(new Error("decrypt_error"));

      const response = await GET(createRequest("?viability=1"), createParams());
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.data.viability).toBeNull();
    });

    /**
     * Code review 22.14 — o fail-open cobria ERROS, nao LENTIDAO.
     *
     * `ExternalService` usa timeout de 10s com 1 retry: uma Apollo degradada segurava o
     * `GET /plan` por ~20s, awaitada inline antes da resposta. Nao virava 504 (o catch
     * captura o abort), mas um plano que leva 20s para abrir e um bloqueio na pratica — e o
     * proprio AC7 exige nao estourar o NFR de <5s. Passado o prazo, o plano sai sem
     * estimativa: a contagem e um conforto, nunca um requisito.
     */
    it("contagem lenta nao segura o plano — responde sem estimativa apos o prazo", async () => {
      vi.useFakeTimers();
      try {
        mockExecution(DIRECT_BRIEFING);
        // Apollo que nunca responde dentro do prazo.
        mockSearchPeople.mockImplementation(() => new Promise(() => {}));

        const promise = GET(createRequest("?viability=1"), createParams());
        await vi.advanceTimersByTimeAsync(5000);
        const response = await promise;
        const json = await response.json();

        expect(response.status).toBe(200);
        expect(json.data.viability).toBeNull();
        // O plano em si sai completo — so a estimativa ficou de fora.
        expect(json.data.steps.length).toBeGreaterThan(0);
        expect(json.data.costEstimate).toBeDefined();
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
