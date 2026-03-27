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

  it("deve chamar BriefingParserService.parse com mensagem e apiKey", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
    mockParse.mockResolvedValue(FULL_PARSE_RESULT);

    await POST(createRequest(VALID_BODY));

    expect(mockParse).toHaveBeenCalledWith(VALID_BODY.message, "decrypted-enc-key-123");
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
});
