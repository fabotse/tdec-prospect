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

/**
 * Story 24.2: execucao `running`/`paused` so aceita PATCH no ajuste pos-rejeicao —
 * ha um step `awaiting_approval` cujo gate mais recente esta carimbado `rejected`.
 */
function routeWithRejectedStep(executionChain: ReturnType<typeof createChainBuilder>) {
  const stepsChain = createChainBuilder({ data: [{ step_number: 2 }], error: null });
  const messagesChain = createChainBuilder({
    data: [{ id: "gate-2", metadata: { messageType: "approval_gate", stepNumber: 2, rejected: true } }],
    error: null,
  });
  mockFrom.mockImplementation((table: string) => {
    if (table === "agent_steps") return stepsChain;
    if (table === "agent_messages") return messagesChain;
    return executionChain;
  });
  return { stepsChain, messagesChain };
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

  // Story 22.15: mesma armadilha de strip — sem `segmentName` declarado no schema, o
  // "coloca no segmento Teste Atibaia" seria descartado antes do update e o
  // CreateCampaignStep cairia sempre no nome da campanha.
  it("deve PRESERVAR segmentName no briefing enviado ao update (22.15 - armadilha do strip)", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);

    const briefingWithSegment = { ...VALID_BRIEFING, segmentName: "Teste Atibaia" };

    const chain = createChainBuilder({
      data: { id: EXEC_ID, briefing: briefingWithSegment, status: "pending" },
      error: null,
    });
    mockFrom.mockImplementation(() => chain);

    const response = await PATCH(createRequest(briefingWithSegment), createParams());
    expect(response.status).toBe(200);

    const updateArg = chain.update.mock.calls[0][0] as { briefing: Record<string, unknown> };
    expect(updateArg.briefing.segmentName).toBe("Teste Atibaia");
  });

  it("deve rejeitar segmentName acima de 100 chars (segments.name e VARCHAR(100)) - 22.15", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);

    const response = await PATCH(
      createRequest({ ...VALID_BRIEFING, segmentName: "s".repeat(120) }),
      createParams()
    );

    expect(response.status).toBe(400);
  });

  it("segmentName NAO-string vira null em vez de derrubar o PATCH inteiro - 22.15", async () => {
    // O cliente reenvia o `merged`, cujo `segmentName` vem do JSONB do briefing (mais de
    // um escritor). Reprovar o schema aqui custaria TODOS os ajustes do turno por causa
    // de um campo acessorio — o oposto do fail-open que a story pede.
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);

    const chain = createChainBuilder({
      data: { id: EXEC_ID, briefing: VALID_BRIEFING, status: "pending" },
      error: null,
    });
    mockFrom.mockImplementation(() => chain);

    const response = await PATCH(
      createRequest({ ...VALID_BRIEFING, segmentName: 42 as unknown as string }),
      createParams()
    );

    expect(response.status).toBe(200);
    const updateArg = chain.update.mock.calls[0][0] as { briefing: Record<string, unknown> };
    expect(updateArg.briefing.segmentName).toBeNull();
  });

  it("PATCH que nao menciona segmentName NAO zera o valor ja salvo - 22.15", async () => {
    // Guard do `undefined` no preprocess: sem ele o campo omitido viraria null e o
    // "coloca no segmento X" pedido antes desapareceria no primeiro ajuste seguinte.
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);

    const chain = createChainBuilder({
      data: {
        id: EXEC_ID,
        briefing: { ...VALID_BRIEFING, segmentName: "Teste Atibaia" },
        status: "pending",
      },
      error: null,
    });
    mockFrom.mockImplementation(() => chain);

    const response = await PATCH(createRequest({ ...VALID_BRIEFING }), createParams());

    expect(response.status).toBe(200);
    const updateArg = chain.update.mock.calls[0][0] as { briefing: Record<string, unknown> };
    // `undefined` sai do payload validado e o merge com o persistido preserva o valor.
    expect(updateArg.briefing.segmentName).toBe("Teste Atibaia");
  });

  // O teto e por CODE POINT, coerente com o schema do parser: com `.max(100)` cru
  // (unidades UTF-16), um nome que o parser ACEITA derrubaria aqui o PATCH do briefing
  // INTEIRO com 400 — perdendo tambem os outros campos do turno.
  it("deve ACEITAR segmentName com 100 code points (200 unidades UTF-16) - 22.15", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);

    const segmentName = "🚀".repeat(100);
    const chain = createChainBuilder({
      data: { id: EXEC_ID, briefing: { ...VALID_BRIEFING, segmentName }, status: "pending" },
      error: null,
    });
    mockFrom.mockImplementation(() => chain);

    const response = await PATCH(
      createRequest({ ...VALID_BRIEFING, segmentName }),
      createParams()
    );

    expect(response.status).toBe(200);
    const updateArg = chain.update.mock.calls[0][0] as { briefing: Record<string, unknown> };
    expect(updateArg.briefing.segmentName).toBe(segmentName);
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

  // Story 24.13: leadCount (N) sobrevive ao strip do z.object e respeita 1-500.
  it("deve PRESERVAR leadCount no briefing enviado ao update (24.13 - armadilha do strip)", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);

    const briefingWithN = { ...VALID_BRIEFING, leadCount: 5 };
    const chain = createChainBuilder({
      data: { id: EXEC_ID, briefing: briefingWithN, status: "pending" },
      error: null,
    });
    mockFrom.mockImplementation(() => chain);

    const response = await PATCH(createRequest(briefingWithN), createParams());
    expect(response.status).toBe(200);

    const updateArg = chain.update.mock.calls[0][0] as { briefing: Record<string, unknown> };
    expect(updateArg.briefing.leadCount).toBe(5);
  });

  it.each([0, 501, 2.5])("deve rejeitar leadCount %p fora de 1-500 no PATCH (24.13)", async (value) => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);

    const response = await PATCH(
      createRequest({ ...VALID_BRIEFING, leadCount: value }),
      createParams()
    );
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });

  // Story 24.15: locationScope sobrevive ao strip do z.object.
  it("deve PRESERVAR locationScope no briefing enviado ao update (24.15 - armadilha do strip)", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);

    const briefing = { ...VALID_BRIEFING, locationScope: "person" };
    const chain = createChainBuilder({
      data: { id: EXEC_ID, briefing, status: "pending" },
      error: null,
    });
    mockFrom.mockImplementation(() => chain);

    const response = await PATCH(createRequest(briefing), createParams());
    expect(response.status).toBe(200);

    const updateArg = chain.update.mock.calls[0][0] as { briefing: Record<string, unknown> };
    expect(updateArg.briefing.locationScope).toBe("person");
  });

  it("deve rejeitar locationScope invalido no PATCH (24.15)", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);

    const response = await PATCH(
      createRequest({ ...VALID_BRIEFING, locationScope: "planeta" }),
      createParams()
    );
    expect(response.status).toBe(400);
  });

  // Story 24.14: icpDefaults sobrevive ao strip do z.object (senao a busca volta ao piso 11+).
  it("deve PRESERVAR icpDefaults no briefing enviado ao update (24.14 - armadilha do strip)", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);

    const icpDefaults = { companySizes: ["201-500", "501-1000"], locations: ["SP"] };
    const briefingWithIcp = { ...VALID_BRIEFING, icpDefaults };
    const chain = createChainBuilder({
      data: { id: EXEC_ID, briefing: {}, status: "pending" },
      error: null,
    });
    mockFrom.mockImplementation(() => chain);

    const response = await PATCH(createRequest(briefingWithIcp), createParams());
    expect(response.status).toBe(200);

    const updateArg = chain.update.mock.calls[0][0] as { briefing: Record<string, unknown> };
    expect(updateArg.briefing.icpDefaults).toEqual(icpDefaults);
  });

  it("deve aceitar icpDefaults null (24.14)", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
    const chain = createChainBuilder({
      data: { id: EXEC_ID, briefing: {}, status: "pending" },
      error: null,
    });
    mockFrom.mockImplementation(() => chain);

    const response = await PATCH(
      createRequest({ ...VALID_BRIEFING, icpDefaults: null }),
      createParams()
    );
    expect(response.status).toBe(200);
  });

  it("deve rejeitar icpDefaults com faixa de tamanho nao canonica (24.14)", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);

    const response = await PATCH(
      createRequest({
        ...VALID_BRIEFING,
        icpDefaults: { companySizes: ["1000+"], locations: ["SP"] },
      }),
      createParams()
    );
    expect(response.status).toBe(400);
  });

  // Story 24.17: as contas sobrevivem ao strip do z.object (senao a execucao vira busca aberta).
  it("deve PRESERVAR targetAccounts, suppressedAccounts e jobTitlesFromIcp (24.17 - strip)", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
    const targetAccounts = [
      { name: "Banco X", domain: "bancox.com.br", confidence: "high" },
      { name: "Empresa W", domain: null, confidence: "low" },
    ];
    const suppressedAccounts = [
      { name: "Banco Z", domain: "bancoz.com.br", reason: "negociacao em andamento (oportunidade em contato)" },
    ];
    const chain = createChainBuilder({
      data: { id: EXEC_ID, briefing: {}, status: "pending" },
      error: null,
    });
    mockFrom.mockImplementation(() => chain);

    const response = await PATCH(
      createRequest({ ...VALID_BRIEFING, targetAccounts, suppressedAccounts, jobTitlesFromIcp: true }),
      createParams()
    );
    expect(response.status).toBe(200);

    const updateArg = chain.update.mock.calls[0][0] as { briefing: Record<string, unknown> };
    expect(updateArg.briefing.targetAccounts).toEqual(targetAccounts);
    expect(updateArg.briefing.suppressedAccounts).toEqual(suppressedAccounts);
    expect(updateArg.briefing.jobTitlesFromIcp).toBe(true);
  });

  it("deve rejeitar dominio invalido em targetAccounts (24.17)", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
    const response = await PATCH(
      createRequest({
        ...VALID_BRIEFING,
        targetAccounts: [{ name: "X", domain: "https://x.com/", confidence: "high" }],
      }),
      createParams()
    );
    expect(response.status).toBe(400);
  });

  it("deve rejeitar mais de 50 contas e reason acima de 200 (24.17)", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
    const tooMany = await PATCH(
      createRequest({
        ...VALID_BRIEFING,
        targetAccounts: Array.from({ length: 51 }, (_, i) => ({
          name: null,
          domain: `e${i}.com`,
          confidence: "high",
        })),
      }),
      createParams()
    );
    expect(tooMany.status).toBe(400);

    const longReason = await PATCH(
      createRequest({
        ...VALID_BRIEFING,
        suppressedAccounts: [{ name: null, domain: "a.com", reason: "x".repeat(201) }],
      }),
      createParams()
    );
    expect(longReason.status).toBe(400);
  });

  it("deve rejeitar icpDefaults com mais de 10 locais (24.14)", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);

    const response = await PATCH(
      createRequest({
        ...VALID_BRIEFING,
        icpDefaults: { companySizes: [], locations: Array.from({ length: 11 }, (_, i) => `L${i}`) },
      }),
      createParams()
    );
    expect(response.status).toBe(400);
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

  // ==============================================
  // Story 22.13: o PATCH deixa de ser REPLACE TOTAL — chaves ausentes no payload
  // sao PRESERVADAS do briefing persistido. Sem isto, um ajuste pos-rejeicao
  // rebaixaria icebreaker premium PAGO para standard, em silencio.
  // ==============================================

  it("deve PRESERVAR premiumIcebreakers persistido quando o payload nao o traz (22.13 AC4)", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);

    const persisted = {
      ...VALID_BRIEFING,
      premiumIcebreakers: true,
      importedLeads: [
        {
          name: "Joao",
          title: null,
          companyName: null,
          email: "joao@x.com",
          linkedinUrl: null,
          apolloId: null,
        },
      ],
    };
    const chain = createChainBuilder({
      data: { id: EXEC_ID, briefing: persisted, status: "running" },
      error: null,
    });
    routeWithRejectedStep(chain);

    // Payload de ajuste: so filtros (o cliente nunca reenvia premiumIcebreakers,
    // escrito pelo servidor no confirm)
    const response = await PATCH(
      createRequest({ ...VALID_BRIEFING, companySize: null, industry: null }),
      createParams()
    );
    expect(response.status).toBe(200);

    const updateArg = chain.update.mock.calls[0][0] as { briefing: Record<string, unknown> };
    // preservados do persistido
    expect(updateArg.briefing.premiumIcebreakers).toBe(true);
    expect(updateArg.briefing.importedLeads).toHaveLength(1);
    // aplicados do payload
    expect(updateArg.briefing.companySize).toBeNull();
    expect(updateArg.briefing.industry).toBeNull();
  });

  it("deve ACEITAR premiumIcebreakers vindo no payload (schema deixou de stripar - 22.13)", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);

    const chain = createChainBuilder({
      data: { id: EXEC_ID, briefing: { ...VALID_BRIEFING, premiumIcebreakers: false }, status: "running" },
      error: null,
    });
    routeWithRejectedStep(chain);

    const response = await PATCH(
      createRequest({ ...VALID_BRIEFING, premiumIcebreakers: true }),
      createParams()
    );
    expect(response.status).toBe(200);

    const updateArg = chain.update.mock.calls[0][0] as { briefing: Record<string, unknown> };
    expect(updateArg.briefing.premiumIcebreakers).toBe(true);
  });

  it("payload vence o persistido nas chaves presentes (merge, nao append - 22.13)", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);

    const chain = createChainBuilder({
      data: {
        id: EXEC_ID,
        briefing: { ...VALID_BRIEFING, jobTitles: ["CTO"], location: "Rio de Janeiro" },
        status: "running",
      },
      error: null,
    });
    routeWithRejectedStep(chain);

    await PATCH(
      createRequest({ ...VALID_BRIEFING, jobTitles: ["CFO"], location: "Sao Paulo" }),
      createParams()
    );

    const updateArg = chain.update.mock.calls[0][0] as { briefing: Record<string, unknown> };
    expect(updateArg.briefing.jobTitles).toEqual(["CFO"]);
    expect(updateArg.briefing.location).toBe("Sao Paulo");
  });

  // Code review 2026-07-24 (P5): ignorar o erro da leitura fazia o merge degradar em
  // SILENCIO para replace-total — apagando premiumIcebreakers com resposta 200.
  it("falha alto quando a leitura do briefing atual falha — NAO faz update (review P5)", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);

    const chain = createChainBuilder({ data: null, error: { message: "read failed" } });
    mockFrom.mockImplementation(() => chain);

    const response = await PATCH(createRequest(VALID_BRIEFING), createParams());
    expect(response.status).toBe(500);
    // o ponto do teste: nada foi gravado por cima do briefing persistido
    expect(chain.update).not.toHaveBeenCalled();
  });

  // ==============================================
  // Story 24.2 (AC3): briefing so e sobrescrito com a execucao `pending`
  // ==============================================

  it.each(["running", "paused"])(
    "24.2: execucao '%s' SEM step rejeitado -> 409 EXECUTION_NOT_PENDING, briefing intacto",
    async (status) => {
      mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
      const chain = createChainBuilder({
        data: { id: EXEC_ID, briefing: VALID_BRIEFING, status },
        error: null,
      });
      const stepsChain = createChainBuilder({ data: [], error: null });
      mockFrom.mockImplementation((table: string) =>
        table === "agent_steps" ? stepsChain : chain
      );

      const response = await PATCH(
        createRequest({ ...VALID_BRIEFING, location: "Curitiba" }),
        createParams()
      );
      const json = await response.json();

      expect(response.status).toBe(409);
      expect(json.error.code).toBe("EXECUTION_NOT_PENDING");
      expect(chain.update).not.toHaveBeenCalled();
    }
  );

  it.each(["completed", "cancelled", "failed"])(
    "24.2: execucao terminal '%s' -> 409 sem update",
    async (status) => {
      mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
      const chain = createChainBuilder({
        data: { id: EXEC_ID, briefing: VALID_BRIEFING, status },
        error: null,
      });
      routeWithRejectedStep(chain); // nem o ajuste abre excecao para execucao terminal

      const response = await PATCH(createRequest(VALID_BRIEFING), createParams());

      expect(response.status).toBe(409);
      expect((await response.json()).error.code).toBe("EXECUTION_NOT_PENDING");
      expect(chain.update).not.toHaveBeenCalled();
    }
  );

  it("24.2: running com step awaiting_approval NAO carimbado -> 409", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
    const chain = createChainBuilder({
      data: { id: EXEC_ID, briefing: VALID_BRIEFING, status: "running" },
      error: null,
    });
    const stepsChain = createChainBuilder({ data: [{ step_number: 2 }], error: null });
    const messagesChain = createChainBuilder({
      data: [{ id: "gate-2", metadata: { messageType: "approval_gate", stepNumber: 2 } }],
      error: null,
    });
    mockFrom.mockImplementation((table: string) => {
      if (table === "agent_steps") return stepsChain;
      if (table === "agent_messages") return messagesChain;
      return chain;
    });

    const response = await PATCH(createRequest(VALID_BRIEFING), createParams());

    expect(response.status).toBe(409);
    expect(chain.update).not.toHaveBeenCalled();
  });

  it.each(["running", "paused"])(
    "24.2: ajuste pos-rejeicao ('%s' + step rejeitado) -> 200 com merge e CAS running/paused",
    async (status) => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
    const chain = createChainBuilder({
      data: { id: EXEC_ID, briefing: { ...VALID_BRIEFING, premiumIcebreakers: true }, status },
      error: null,
    });
    const { stepsChain } = routeWithRejectedStep(chain);

    const response = await PATCH(
      createRequest({ ...VALID_BRIEFING, location: "Curitiba" }),
      createParams()
    );

    expect(response.status).toBe(200);
    expect(stepsChain.eq).toHaveBeenCalledWith("status", "awaiting_approval");
    expect(chain.in).toHaveBeenCalledWith("status", ["running", "paused"]);
    const updateArg = chain.update.mock.calls[0][0] as { briefing: Record<string, unknown> };
    expect(updateArg.briefing.location).toBe("Curitiba");
    // merge: o persistido que o payload nao traz sobrevive
    expect(updateArg.briefing.premiumIcebreakers).toBe(true);
    }
  );

  it("24.2: execucao pending -> update com CAS de status pending", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
    const chain = createChainBuilder({
      data: { id: EXEC_ID, briefing: {}, status: "pending" },
      error: null,
    });
    mockFrom.mockImplementation(() => chain);

    const response = await PATCH(createRequest(VALID_BRIEFING), createParams());

    expect(response.status).toBe(200);
    expect(chain.in).toHaveBeenCalledWith("status", ["pending"]);
    expect(chain.select).toHaveBeenCalledWith("briefing, status");
  });

  it("24.2: status mudou entre leitura e escrita (update com 0 linhas) -> 409", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
    const chain = createChainBuilder({
      data: { id: EXEC_ID, briefing: {}, status: "pending" },
      error: null,
    });
    // a leitura (.single) ve `pending`; o update com CAS nao casa nenhuma linha.
    chain.maybeSingle.mockResolvedValue({ data: null, error: null });
    mockFrom.mockImplementation(() => chain);

    const response = await PATCH(createRequest(VALID_BRIEFING), createParams());

    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("EXECUTION_NOT_PENDING");
  });

  it("24.2: leitura ok e update com erro de banco -> 500 (nao 409)", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
    const chain = createChainBuilder({
      data: { id: EXEC_ID, briefing: {}, status: "pending" },
      error: null,
    });
    chain.maybeSingle.mockResolvedValue({ data: null, error: { message: "DB error" } });
    mockFrom.mockImplementation(() => chain);

    const response = await PATCH(createRequest(VALID_BRIEFING), createParams());

    expect(response.status).toBe(500);
    expect((await response.json()).error.code).toBe("UPDATE_ERROR");
    expect(chain.update).toHaveBeenCalled();
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
