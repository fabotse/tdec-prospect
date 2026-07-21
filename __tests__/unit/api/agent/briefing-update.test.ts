/**
 * Unit Tests for PATCH /api/agent/executions/[executionId]/briefing
 * Story 16.3 - AC: #1, #4
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { PATCH } from "@/app/api/agent/executions/[executionId]/briefing/route";
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

// ==============================================
// HELPERS
// ==============================================

const mockProfile = {
  id: "user-123",
  tenant_id: "tenant-456",
  role: "user",
};

const VALID_BRIEFING = {
  technology: "Netskope",
  jobTitles: ["CTO"],
  location: "Sao Paulo",
  companySize: null,
  industry: "fintech",
  productSlug: null,
  mode: "guided",
  skipSteps: [],
};

const EXEC_ID = "exec-001";

function createRequest(body: unknown): Request {
  return new Request(`http://localhost/api/agent/executions/${EXEC_ID}/briefing`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function createParams() {
  return { params: Promise.resolve({ executionId: EXEC_ID }) };
}

// ==============================================
// TESTS
// ==============================================

describe("PATCH /api/agent/executions/[executionId]/briefing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockImplementation(() => createChainBuilder());
  });

  it("deve retornar 401 quando nao autenticado", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(null);

    const response = await PATCH(createRequest(VALID_BRIEFING), createParams());
    expect(response.status).toBe(401);
  });

  it("deve retornar 400 para briefing invalido", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);

    const response = await PATCH(
      createRequest({ technology: 123 }),
      createParams()
    );
    expect(response.status).toBe(400);

    const json = await response.json();
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });

  it("deve atualizar execucao com briefing valido", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);

    const updatedExecution = {
      id: EXEC_ID,
      briefing: VALID_BRIEFING,
      status: "pending",
    };
    const chain = createChainBuilder({ data: updatedExecution, error: null });
    mockFrom.mockImplementation(() => chain);

    const response = await PATCH(createRequest(VALID_BRIEFING), createParams());
    expect(response.status).toBe(200);

    const json = await response.json();
    expect(json.data.briefing).toEqual(VALID_BRIEFING);
  });

  it("deve atualizar execucao com briefing contendo importedLeads (AC: 17.11#2)", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);

    const briefingWithLeads = {
      ...VALID_BRIEFING,
      skipSteps: ["search_companies", "search_leads"],
      importedLeads: [
        {
          name: "Joao Silva",
          title: "CTO",
          companyName: "Empresa X",
          email: "joao@empresa.com",
          linkedinUrl: null,
          apolloId: null,
        },
      ],
    };

    const updatedExecution = {
      id: EXEC_ID,
      briefing: briefingWithLeads,
      status: "pending",
    };
    const chain = createChainBuilder({ data: updatedExecution, error: null });
    mockFrom.mockImplementation(() => chain);

    const response = await PATCH(createRequest(briefingWithLeads), createParams());
    expect(response.status).toBe(200);

    const json = await response.json();
    expect(json.data.briefing.importedLeads).toHaveLength(1);
    expect(json.data.briefing.importedLeads[0].email).toBe("joao@empresa.com");
  });

  it("deve aceitar briefing sem importedLeads (campo opcional, regressao)", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);

    const updatedExecution = {
      id: EXEC_ID,
      briefing: VALID_BRIEFING,
      status: "pending",
    };
    const chain = createChainBuilder({ data: updatedExecution, error: null });
    mockFrom.mockImplementation(() => chain);

    const response = await PATCH(createRequest(VALID_BRIEFING), createParams());
    expect(response.status).toBe(200);
  });

  // ==============================================
  // Story 22.5: campos de campanha DEVEM sobreviver ao briefingUpdateSchema
  // (o z.object faz strip silencioso de chaves nao declaradas — este e o teste
  //  que prova que objective/urgency/campaignDescription/emailCount chegam ao JSONB)
  // ==============================================

  it("deve PRESERVAR os 4 campos de campanha no briefing enviado ao update (22.5 - armadilha do strip)", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);

    const briefingWithCampaign = {
      ...VALID_BRIEFING,
      objective: "REENGAGEMENT",
      urgency: "HIGH",
      campaignDescription: "Black Friday",
      emailCount: 3,
    };

    const chain = createChainBuilder({
      data: { id: EXEC_ID, briefing: briefingWithCampaign, status: "pending" },
      error: null,
    });
    mockFrom.mockImplementation(() => chain);

    const response = await PATCH(createRequest(briefingWithCampaign), createParams());
    expect(response.status).toBe(200);

    // O que REALMENTE foi persistido = o 1o argumento de .update({ briefing: validation.data }).
    // Se o schema stripasse os campos, briefing aqui NAO teria objective/urgency/etc.
    const updateArg = chain.update.mock.calls[0][0] as { briefing: Record<string, unknown> };
    expect(updateArg.briefing.objective).toBe("REENGAGEMENT");
    expect(updateArg.briefing.urgency).toBe("HIGH");
    expect(updateArg.briefing.campaignDescription).toBe("Black Friday");
    expect(updateArg.briefing.emailCount).toBe(3);
  });

  it("deve aceitar briefing sem os campos de campanha (opcionais, regressao 22.5)", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);

    const chain = createChainBuilder({
      data: { id: EXEC_ID, briefing: VALID_BRIEFING, status: "pending" },
      error: null,
    });
    mockFrom.mockImplementation(() => chain);

    const response = await PATCH(createRequest(VALID_BRIEFING), createParams());
    expect(response.status).toBe(200);
  });

  it("deve rejeitar emailCount fora do range 1-10 no PATCH (22.5)", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);

    const response = await PATCH(
      createRequest({ ...VALID_BRIEFING, emailCount: 0 }),
      createParams()
    );
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });

  it("deve retornar 500 quando update falha", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);

    const chain = createChainBuilder({ data: null, error: { message: "DB error" } });
    mockFrom.mockImplementation(() => chain);

    const response = await PATCH(createRequest(VALID_BRIEFING), createParams());
    expect(response.status).toBe(500);

    const json = await response.json();
    expect(json.error.code).toBe("UPDATE_ERROR");
  });
});
