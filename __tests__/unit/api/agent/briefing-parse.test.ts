/**
 * Unit Tests for POST /api/agent/briefing/parse
 * Story 16.3 - AC: #2
 *
 * Tests: auth, validation, sucesso, erro OpenAI, missing API key
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/agent/briefing/parse/route";
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

vi.mock("@/lib/crypto/encryption", () => ({
  decryptApiKey: vi.fn((key: string) => `decrypted-${key}`),
}));

const mockGenerateSuggestions = vi.fn();

vi.mock("@/lib/agent/briefing-suggestion-service", () => ({
  BriefingSuggestionService: {
    generateSuggestions: (...args: unknown[]) => mockGenerateSuggestions(...args),
  },
}));

const mockParse = vi.fn();

vi.mock("@/lib/agent/briefing-parser-service", () => ({
  BriefingParserService: {
    parse: (...args: unknown[]) => mockParse(...args),
  },
}));

// ==============================================
// HELPERS
// ==============================================

const mockProfile = {
  id: "user-123",
  tenant_id: "tenant-456",
  role: "user",
};

function createRequest(body: unknown): Request {
  return new Request("http://localhost/api/agent/briefing/parse", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function createInvalidRequest(): Request {
  return new Request("http://localhost/api/agent/briefing/parse", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "not json",
  });
}

const VALID_BODY = {
  executionId: "550e8400-e29b-41d4-a716-446655440000",
  message: "Quero prospectar CTOs de fintechs em SP que usam Netskope",
};

const FULL_PARSE_RESULT = {
  briefing: {
    technology: "Netskope",
    jobTitles: ["CTO"],
    location: "Sao Paulo",
    companySize: null,
    industry: "fintech",
    productSlug: null,
    mode: "guided" as const,
    skipSteps: [],
  },
  rawResponse: {
    technology: "Netskope",
    jobTitles: ["CTO"],
    location: "Sao Paulo",
    companySize: null,
    industry: "fintech",
    productMentioned: null,
    mode: "guided" as const,
    skipSteps: [],
  },
};

// ==============================================
// TESTS
// ==============================================

describe("POST /api/agent/briefing/parse", () => {
  function defaultMockFrom(table: string) {
    if (table === "agent_executions") {
      return createChainBuilder({
        data: { id: VALID_BODY.executionId },
        error: null,
      });
    }
    if (table === "api_configs") {
      return createChainBuilder({
        data: { encrypted_key: "enc-key-123" },
        error: null,
      });
    }
    if (table === "products") {
      return createChainBuilder({ data: [], error: null });
    }
    return createChainBuilder();
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockImplementation(defaultMockFrom);
    mockGenerateSuggestions.mockReturnValue({});
  });

  it("deve retornar 401 quando nao autenticado (AC: #2)", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(null);

    const response = await POST(createRequest(VALID_BODY));
    expect(response.status).toBe(401);

    const json = await response.json();
    expect(json.error.code).toBe("UNAUTHORIZED");
  });

  it("deve retornar 400 para JSON invalido", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);

    const response = await POST(createInvalidRequest());
    expect(response.status).toBe(400);

    const json = await response.json();
    expect(json.error.code).toBe("INVALID_JSON");
  });

  it("deve retornar 400 para body sem campos obrigatorios", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);

    const response = await POST(createRequest({ message: "test" }));
    expect(response.status).toBe(400);

    const json = await response.json();
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });

  it("deve retornar 422 quando API key OpenAI nao configurada", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
    mockFrom.mockImplementation((table: string) => {
      if (table === "agent_executions") {
        return createChainBuilder({ data: { id: VALID_BODY.executionId }, error: null });
      }
      if (table === "api_configs") {
        return createChainBuilder({ data: null, error: null });
      }
      return createChainBuilder();
    });

    const response = await POST(createRequest(VALID_BODY));
    expect(response.status).toBe(422);

    const json = await response.json();
    expect(json.error.code).toBe("API_KEY_MISSING");
  });

  it("deve parsear briefing completo com sucesso (AC: #2)", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
    mockParse.mockResolvedValue(FULL_PARSE_RESULT);

    const response = await POST(createRequest(VALID_BODY));
    expect(response.status).toBe(200);

    const json = await response.json();
    expect(json.briefing.technology).toBe("Netskope");
    expect(json.briefing.jobTitles).toEqual(["CTO"]);
    // M1 fix: isComplete now tracks ALL fields — companySize is null in FULL_PARSE_RESULT
    expect(json.isComplete).toBe(false);
    expect(json.missingFields).toContain("companySize");
    // Story 17.8: new fields
    expect(json.canProceed).toBe(true);
    expect(json.suggestions).toEqual({});
  });

  it("deve fazer passthrough dos campos de campanha e NAO alterar canProceed (Story 22.5 AC3)", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
    mockParse.mockResolvedValue({
      briefing: {
        ...FULL_PARSE_RESULT.briefing,
        objective: "REENGAGEMENT",
        urgency: "HIGH",
        campaignDescription: "Black Friday",
        emailCount: 3,
      },
      rawResponse: FULL_PARSE_RESULT.rawResponse,
      nextAction: "confirm",
      questionText: null,
    });

    const response = await POST(createRequest(VALID_BODY));
    expect(response.status).toBe(200);

    const json = await response.json();
    // passthrough: os 4 campos chegam intactos na resposta (spread ...briefing)
    expect(json.briefing.objective).toBe("REENGAGEMENT");
    expect(json.briefing.urgency).toBe("HIGH");
    expect(json.briefing.campaignDescription).toBe("Black Friday");
    expect(json.briefing.emailCount).toBe(3);
    // AC3 nao-bloqueante: campos de campanha NAO entram em missingFields nem no gate
    expect(json.missingFields).not.toContain("objective");
    expect(json.missingFields).not.toContain("emailCount");
    expect(json.canProceed).toBe(true); // cargo + localizacao continuam decidindo
  });

  it("deve retornar isComplete false quando campos obrigatorios faltam", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
    mockParse.mockResolvedValue({
      briefing: {
        ...FULL_PARSE_RESULT.briefing,
        technology: null,
        jobTitles: [],
      },
      rawResponse: {
        ...FULL_PARSE_RESULT.rawResponse,
        technology: null,
        jobTitles: [],
      },
    });
    mockGenerateSuggestions.mockReturnValue({
      jobTitles: ["CTO", "Head de TI"],
      technology: ["Stripe", "Plaid"],
    });

    const response = await POST(createRequest(VALID_BODY));
    expect(response.status).toBe(200);

    const json = await response.json();
    expect(json.isComplete).toBe(false);
    expect(json.missingFields).toContain("technology");
    expect(json.missingFields).toContain("jobTitles");
    // Story 17.8: canProceed false because jobTitles missing
    expect(json.canProceed).toBe(false);
    expect(json.suggestions.jobTitles).toBeDefined();
    expect(json.suggestions.jobTitles.length).toBeGreaterThan(0);
  });

  it("deve retornar 500 quando parser falha", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
    mockParse.mockRejectedValue(new Error("Parse failed"));

    const response = await POST(createRequest(VALID_BODY));
    expect(response.status).toBe(500);

    const json = await response.json();
    expect(json.error.code).toBe("BRIEFING_PARSE_ERROR");
  });

  it("deve resolver productSlug quando produto mencionado e encontrado", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
    mockParse.mockResolvedValue({
      briefing: { ...FULL_PARSE_RESULT.briefing },
      rawResponse: { ...FULL_PARSE_RESULT.rawResponse, productMentioned: "CloudGuard" },
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === "agent_executions") {
        return createChainBuilder({ data: { id: VALID_BODY.executionId }, error: null });
      }
      if (table === "api_configs") {
        return createChainBuilder({ data: { encrypted_key: "enc-key" }, error: null });
      }
      if (table === "products") {
        return createChainBuilder({
          data: [
            { id: "prod-001", name: "CloudGuard Security" },
            { id: "prod-002", name: "NetMonitor" },
          ],
          error: null,
        });
      }
      return createChainBuilder();
    });

    const response = await POST(createRequest(VALID_BODY));
    const json = await response.json();

    expect(json.briefing.productSlug).toBe("prod-001");
  });

  it("deve chamar BriefingParserService.parse com historico (message legado vira 1 turno) e apiKey", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
    mockParse.mockResolvedValue(FULL_PARSE_RESULT);

    await POST(createRequest(VALID_BODY));

    // Story 22.3: body legado { message } vira historico [{ role: "user", content }]
    expect(mockParse).toHaveBeenCalledWith(
      [{ role: "user", content: VALID_BODY.message }],
      "decrypted-enc-key-123"
    );
  });

  it("deve retornar 404 quando execucao nao encontrada (M4 fix)", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
    mockFrom.mockImplementation((table: string) => {
      if (table === "agent_executions") {
        return createChainBuilder({ data: null, error: { code: "PGRST116" } });
      }
      return defaultMockFrom(table);
    });

    const response = await POST(createRequest(VALID_BODY));
    expect(response.status).toBe(404);

    const json = await response.json();
    expect(json.error.code).toBe("EXECUTION_NOT_FOUND");
  });

  it("deve retornar productSlug null quando multiplos produtos fazem match (H1 fix)", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
    mockParse.mockResolvedValue({
      briefing: { ...FULL_PARSE_RESULT.briefing },
      rawResponse: { ...FULL_PARSE_RESULT.rawResponse, productMentioned: "Cloud" },
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === "agent_executions") {
        return createChainBuilder({ data: { id: VALID_BODY.executionId }, error: null });
      }
      if (table === "api_configs") {
        return createChainBuilder({ data: { encrypted_key: "enc-key" }, error: null });
      }
      if (table === "products") {
        return createChainBuilder({
          data: [
            { id: "prod-001", name: "CloudGuard Security" },
            { id: "prod-002", name: "CloudMonitor Pro" },
          ],
          error: null,
        });
      }
      return createChainBuilder();
    });

    const response = await POST(createRequest(VALID_BODY));
    const json = await response.json();

    expect(json.briefing.productSlug).toBeNull();
  });

  it("deve retornar productMentioned quando produto detectado mas nao resolvido (16.6)", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
    mockParse.mockResolvedValue({
      briefing: { ...FULL_PARSE_RESULT.briefing },
      rawResponse: { ...FULL_PARSE_RESULT.rawResponse, productMentioned: "TDEC Analytics" },
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === "agent_executions") {
        return createChainBuilder({ data: { id: VALID_BODY.executionId }, error: null });
      }
      if (table === "api_configs") {
        return createChainBuilder({ data: { encrypted_key: "enc-key" }, error: null });
      }
      if (table === "products") {
        return createChainBuilder({ data: [], error: null });
      }
      return createChainBuilder();
    });

    const response = await POST(createRequest(VALID_BODY));
    const json = await response.json();

    expect(json.productMentioned).toBe("TDEC Analytics");
    expect(json.briefing.productSlug).toBeNull();
  });

  it("deve retornar productMentioned null quando nenhum produto mencionado (16.6)", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
    mockParse.mockResolvedValue(FULL_PARSE_RESULT);

    const response = await POST(createRequest(VALID_BODY));
    const json = await response.json();

    expect(json.productMentioned).toBeNull();
  });

  it("deve retornar productSlug null quando nenhum produto faz match", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
    mockParse.mockResolvedValue({
      briefing: { ...FULL_PARSE_RESULT.briefing },
      rawResponse: { ...FULL_PARSE_RESULT.rawResponse, productMentioned: "XYZ" },
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === "agent_executions") {
        return createChainBuilder({ data: { id: VALID_BODY.executionId }, error: null });
      }
      if (table === "api_configs") {
        return createChainBuilder({ data: { encrypted_key: "enc-key" }, error: null });
      }
      if (table === "products") {
        return createChainBuilder({
          data: [{ id: "prod-001", name: "CloudGuard" }],
          error: null,
        });
      }
      return createChainBuilder();
    });

    const response = await POST(createRequest(VALID_BODY));
    const json = await response.json();

    expect(json.briefing.productSlug).toBeNull();
  });

  // ==============================================
  // Story 17.8: analyzeBriefingCompleteness + suggestions + canProceed
  // ==============================================

  it("deve retornar canProceed=true quando technology ausente mas industry presente (6.6)", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
    mockParse.mockResolvedValue({
      briefing: {
        ...FULL_PARSE_RESULT.briefing,
        technology: null,
        industry: "fintech",
        location: "Sao Paulo",
        jobTitles: ["CTO"],
      },
      rawResponse: {
        ...FULL_PARSE_RESULT.rawResponse,
        technology: null,
        industry: "fintech",
        location: "Sao Paulo",
        jobTitles: ["CTO"],
      },
    });
    mockGenerateSuggestions.mockReturnValue({ technology: ["Stripe", "Plaid"] });

    const response = await POST(createRequest(VALID_BODY));
    const json = await response.json();

    expect(json.canProceed).toBe(true);
    expect(json.missingFields).toContain("technology");
    // M1 fix: also tracks optional fields
    expect(json.missingFields).toContain("companySize");
    expect(json.suggestions.technology).toBeDefined();
  });

  it("deve retornar canProceed=false quando nenhum parametro viavel (6.7)", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
    mockParse.mockResolvedValue({
      briefing: {
        ...FULL_PARSE_RESULT.briefing,
        technology: null,
        industry: null,
        location: null,
        jobTitles: [],
      },
      rawResponse: {
        ...FULL_PARSE_RESULT.rawResponse,
        technology: null,
        industry: null,
        location: null,
        jobTitles: [],
      },
    });
    mockGenerateSuggestions.mockReturnValue({ jobTitles: ["CTO"] });

    const response = await POST(createRequest(VALID_BODY));
    const json = await response.json();

    expect(json.canProceed).toBe(false);
  });

  it("deve retornar canProceed=false quando jobTitles ausente com suggestions (6.8)", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
    mockParse.mockResolvedValue({
      briefing: {
        ...FULL_PARSE_RESULT.briefing,
        technology: "Netskope",
        jobTitles: [],
      },
      rawResponse: {
        ...FULL_PARSE_RESULT.rawResponse,
        technology: "Netskope",
        jobTitles: [],
      },
    });
    mockGenerateSuggestions.mockReturnValue({ jobTitles: ["CISO", "Head de Seguranca"] });

    const response = await POST(createRequest(VALID_BODY));
    const json = await response.json();

    expect(json.canProceed).toBe(false);
    expect(json.suggestions.jobTitles).toEqual(["CISO", "Head de Seguranca"]);
  });

  it("deve retornar canProceed=true e suggestions vazio quando tudo preenchido (6.9)", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
    // Override with ALL fields filled (including companySize)
    const fullyComplete = {
      briefing: {
        ...FULL_PARSE_RESULT.briefing,
        companySize: "51-200",
      },
      rawResponse: {
        ...FULL_PARSE_RESULT.rawResponse,
        companySize: "51-200",
      },
    };
    mockParse.mockResolvedValue(fullyComplete);
    mockGenerateSuggestions.mockReturnValue({});

    const response = await POST(createRequest(VALID_BODY));
    const json = await response.json();

    expect(json.canProceed).toBe(true);
    expect(json.isComplete).toBe(true);
    expect(json.missingFields).toEqual([]);
    expect(json.suggestions).toEqual({});
  });

  it("deve incluir suggestions e canProceed na response (6.10)", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
    mockParse.mockResolvedValue(FULL_PARSE_RESULT);

    const response = await POST(createRequest(VALID_BODY));
    const json = await response.json();

    expect(json).toHaveProperty("suggestions");
    expect(json).toHaveProperty("canProceed");
  });

  it("deve retornar suggestions nao-vazias para briefing incompleto (6.11)", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
    mockParse.mockResolvedValue({
      briefing: {
        ...FULL_PARSE_RESULT.briefing,
        technology: null,
        jobTitles: [],
        industry: "fintech",
      },
      rawResponse: {
        ...FULL_PARSE_RESULT.rawResponse,
        technology: null,
        jobTitles: [],
        industry: "fintech",
      },
    });
    mockGenerateSuggestions.mockReturnValue({
      jobTitles: ["CTO", "CPO"],
      technology: ["Stripe"],
    });

    const response = await POST(createRequest(VALID_BODY));
    const json = await response.json();

    expect(Object.keys(json.suggestions).length).toBeGreaterThan(0);
  });

  it("deve adicionar search_companies ao skipSteps quando technology null e LLM nao adicionou (bugfix)", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
    mockParse.mockResolvedValue({
      briefing: {
        technology: null,
        jobTitles: ["CTO"],
        location: "Sao Paulo",
        companySize: null,
        industry: null,
        productSlug: null,
        mode: "guided" as const,
        skipSteps: [], // LLM did NOT add search_companies despite technology being null
      },
      rawResponse: {
        technology: null,
        jobTitles: ["CTO"],
        location: "Sao Paulo",
        companySize: null,
        industry: null,
        productMentioned: null,
        mode: "guided" as const,
        skipSteps: [],
      },
    });
    mockGenerateSuggestions.mockReturnValue({});

    const response = await POST(createRequest(VALID_BODY));
    const json = await response.json();

    expect(response.status).toBe(200);
    // search_companies must be added deterministically when technology is null
    expect(json.briefing.skipSteps).toContain("search_companies");
  });

  it("deve NAO adicionar search_companies ao skipSteps quando technology presente", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
    mockParse.mockResolvedValue(FULL_PARSE_RESULT); // technology: "Netskope"
    mockGenerateSuggestions.mockReturnValue({});

    const response = await POST(createRequest(VALID_BODY));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.briefing.skipSteps).not.toContain("search_companies");
  });

  it("deve remover search_companies inconsistente quando technology esta presente (22.1 AC5)", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
    mockParse.mockResolvedValue({
      briefing: {
        ...FULL_PARSE_RESULT.briefing,
        skipSteps: ["search_companies"],
      },
      rawResponse: {
        ...FULL_PARSE_RESULT.rawResponse,
        skipSteps: ["search_companies"],
      },
    });
    mockGenerateSuggestions.mockReturnValue({});

    const response = await POST(createRequest(VALID_BODY));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.briefing.technology).toBe("Netskope");
    expect(json.briefing.skipSteps).not.toContain("search_companies");
  });

  it("deve preservar ambos os skips para leads importados mesmo com technology presente", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
    mockParse.mockResolvedValue({
      briefing: {
        ...FULL_PARSE_RESULT.briefing,
        jobTitles: [],
        location: null,
        skipSteps: ["search_companies", "search_leads"],
      },
      rawResponse: {
        ...FULL_PARSE_RESULT.rawResponse,
        jobTitles: [],
        location: null,
        skipSteps: ["search_companies", "search_leads"],
      },
    });
    mockGenerateSuggestions.mockReturnValue({});

    const response = await POST(createRequest(VALID_BODY));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.canProceed).toBe(true);
    expect(json.briefing.skipSteps).toEqual(["search_companies", "search_leads"]);
  });

  it("deve NAO duplicar search_companies se LLM ja adicionou corretamente", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
    mockParse.mockResolvedValue({
      briefing: {
        technology: null,
        jobTitles: ["CTO"],
        location: "Sao Paulo",
        companySize: null,
        industry: null,
        productSlug: null,
        mode: "guided" as const,
        skipSteps: ["search_companies"], // LLM correctly added it
      },
      rawResponse: {
        technology: null,
        jobTitles: ["CTO"],
        location: "Sao Paulo",
        companySize: null,
        industry: null,
        productMentioned: null,
        mode: "guided" as const,
        skipSteps: ["search_companies"],
      },
    });
    mockGenerateSuggestions.mockReturnValue({});

    const response = await POST(createRequest(VALID_BODY));
    const json = await response.json();

    expect(response.status).toBe(200);
    // Should contain exactly one occurrence, not duplicated
    const count = json.briefing.skipSteps.filter((s: string) => s === "search_companies").length;
    expect(count).toBe(1);
  });

  it("deve retornar canProceed=true para imported leads flow mesmo sem jobTitles/technology (AC: 17.11#1)", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
    mockParse.mockResolvedValue({
      briefing: {
        technology: null,
        jobTitles: [],
        location: null,
        companySize: null,
        industry: null,
        productSlug: null,
        mode: "guided" as const,
        skipSteps: ["search_companies", "search_leads"],
      },
      rawResponse: {
        technology: null,
        jobTitles: [],
        location: null,
        companySize: null,
        industry: null,
        productMentioned: null,
        mode: "guided" as const,
        skipSteps: ["search_companies", "search_leads"],
      },
    });
    mockGenerateSuggestions.mockReturnValue({});

    const response = await POST(createRequest(VALID_BODY));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.canProceed).toBe(true);
    expect(json.briefing.skipSteps).toEqual(["search_companies", "search_leads"]);
  });

  // ==============================================
  // Story 22.1: Localizacao obrigatoria, tecnologia opcional
  // ==============================================

  it("deve retornar canProceed=false quando technology presente mas location ausente (NUCLEO 22.1)", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
    mockParse.mockResolvedValue({
      briefing: {
        technology: "Netskope",
        jobTitles: ["CTO"],
        location: null,
        companySize: null,
        industry: null,
        productSlug: null,
        mode: "guided" as const,
        skipSteps: [],
      },
      rawResponse: {
        technology: "Netskope",
        jobTitles: ["CTO"],
        location: null,
        companySize: null,
        industry: null,
        productMentioned: null,
        mode: "guided" as const,
        skipSteps: [],
      },
    });
    mockGenerateSuggestions.mockReturnValue({});

    const response = await POST(createRequest(VALID_BODY));
    const json = await response.json();

    expect(response.status).toBe(200);
    // Regra ANTIGA daria true (tech contava como search param). Regra NOVA (22.1):
    // canProceed = hasJobTitles && hasLocation -> sem location, nao avanca.
    expect(json.canProceed).toBe(false);
    expect(json.missingFields).toContain("location");
  });

  it("deve normalizar location composta so por espacos e impedir avanco (22.1)", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
    mockParse.mockResolvedValue({
      briefing: {
        technology: null,
        jobTitles: ["CTO"],
        location: "   ",
        companySize: null,
        industry: null,
        productSlug: null,
        mode: "guided" as const,
        skipSteps: ["search_companies"],
      },
      rawResponse: {
        technology: null,
        jobTitles: ["CTO"],
        location: "   ",
        companySize: null,
        industry: null,
        productMentioned: null,
        mode: "guided" as const,
        skipSteps: ["search_companies"],
      },
    });
    mockGenerateSuggestions.mockReturnValue({});

    const response = await POST(createRequest(VALID_BODY));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.briefing.location).toBeNull();
    expect(json.canProceed).toBe(false);
    expect(json.missingFields).toContain("location");
  });

  it("deve retornar canProceed=false quando industry presente mas location ausente (22.1)", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
    mockParse.mockResolvedValue({
      briefing: {
        technology: null,
        jobTitles: ["CTO"],
        location: null,
        companySize: null,
        industry: "fintech",
        productSlug: null,
        mode: "guided" as const,
        skipSteps: ["search_companies"],
      },
      rawResponse: {
        technology: null,
        jobTitles: ["CTO"],
        location: null,
        companySize: null,
        industry: "fintech",
        productMentioned: null,
        mode: "guided" as const,
        skipSteps: ["search_companies"],
      },
    });
    mockGenerateSuggestions.mockReturnValue({});

    const response = await POST(createRequest(VALID_BODY));
    const json = await response.json();

    expect(response.status).toBe(200);
    // Setor tambem nao basta mais para avancar — so location destrava.
    expect(json.canProceed).toBe(false);
    expect(json.missingFields).toContain("location");
  });

  it("deve retornar canProceed=true com cargo e localizacao sem tech nem setor (22.1)", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
    mockParse.mockResolvedValue({
      briefing: {
        technology: null,
        jobTitles: ["CTO"],
        location: "Sao Paulo",
        companySize: null,
        industry: null,
        productSlug: null,
        mode: "guided" as const,
        skipSteps: ["search_companies"],
      },
      rawResponse: {
        technology: null,
        jobTitles: ["CTO"],
        location: "Sao Paulo",
        companySize: null,
        industry: null,
        productMentioned: null,
        mode: "guided" as const,
        skipSteps: ["search_companies"],
      },
    });
    mockGenerateSuggestions.mockReturnValue({});

    const response = await POST(createRequest(VALID_BODY));
    const json = await response.json();

    expect(response.status).toBe(200);
    // Caso feliz da story: cargo + localizacao bastam, sem TheirStack.
    expect(json.canProceed).toBe(true);
    expect(json.briefing.skipSteps).toContain("search_companies");
  });

  // ==============================================
  // Story 22.3: historico estruturado + nextAction/questionText
  // ==============================================

  it("deve aceitar body { messages: [...] } e chamar parse com o array (22.3)", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
    mockParse.mockResolvedValue({
      ...FULL_PARSE_RESULT,
      nextAction: "confirm",
      questionText: "Confirma: CTO em Sao Paulo?",
    });

    const messages = [
      { role: "user", content: "Quero prospectar CTOs" },
      { role: "agent", content: "Em qual localizacao?" },
      { role: "user", content: "Sao Paulo" },
    ];

    const response = await POST(
      createRequest({ executionId: VALID_BODY.executionId, messages })
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(mockParse).toHaveBeenCalledWith(messages, "decrypted-enc-key-123");
    // resposta expoe os campos de conversa
    expect(json.nextAction).toBe("confirm");
    expect(json.questionText).toBe("Confirma: CTO em Sao Paulo?");
  });

  it("deve devolver defaults nextAction='ask'/questionText=null quando parser nao os retorna (22.3)", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
    mockParse.mockResolvedValue(FULL_PARSE_RESULT); // sem nextAction/questionText

    const response = await POST(createRequest(VALID_BODY));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.nextAction).toBe("ask");
    expect(json.questionText).toBeNull();
  });

  it("deve retornar 400 quando body nao tem messages nem message (22.3)", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);

    const response = await POST(
      createRequest({ executionId: VALID_BODY.executionId })
    );
    expect(response.status).toBe(400);

    const json = await response.json();
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });

  it("deve manter skipSteps/canProceed deterministicos independentemente do nextAction do LLM (NFR1, 22.3)", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
    // LLM sugere "proceed" mas o briefing NAO tem location -> canProceed deve ser false;
    // e technology null -> search_companies deve ser adicionado deterministicamente.
    mockParse.mockResolvedValue({
      briefing: {
        technology: null,
        jobTitles: ["CTO"],
        location: null,
        companySize: null,
        industry: null,
        productSlug: null,
        mode: "guided" as const,
        skipSteps: [],
      },
      rawResponse: {
        technology: null,
        jobTitles: ["CTO"],
        location: null,
        companySize: null,
        industry: null,
        productMentioned: null,
        mode: "guided" as const,
        skipSteps: [],
      },
      nextAction: "proceed",
      questionText: null,
    });
    mockGenerateSuggestions.mockReturnValue({});

    const response = await POST(createRequest(VALID_BODY));
    const json = await response.json();

    expect(response.status).toBe(200);
    // nextAction do LLM ecoa na resposta...
    expect(json.nextAction).toBe("proceed");
    // ...mas NAO altera o gating deterministico:
    expect(json.canProceed).toBe(false);
    expect(json.missingFields).toContain("location");
    expect(json.briefing.skipSteps).toContain("search_companies");
  });
});
