/**
 * Unit Tests for POST /api/agent/briefing/parse-product
 * Story 16.6 - AC: #2
 *
 * Tests: auth, validation, execution check, API key, decryption, parse, success
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/agent/briefing/parse-product/route";
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

const mockDecryptApiKey = vi.fn();

vi.mock("@/lib/crypto/encryption", () => ({
  decryptApiKey: (...args: unknown[]) => mockDecryptApiKey(...args),
}));

// Story 22.9: a chave OpenAI vem do SERVICE-ROLE (helper `service-keys`), nunca do
// client de sessao — `defaultMockFrom` simula a RLS admin-only vista por um `sdr`
// (zero linhas). Regressao para a leitura de sessao volta a dar 422 (RED).
const mockCreateAdminClient = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => mockCreateAdminClient(),
}));

const mockAdminSingle = vi.fn();

function buildAdminClient() {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    single: mockAdminSingle,
  };
  return { from: vi.fn(() => chain) };
}

const mockParse = vi.fn();

vi.mock("@/lib/agent/product-parser-service", () => ({
  ProductParserService: {
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

const VALID_BODY = {
  executionId: "550e8400-e29b-41d4-a716-446655440000",
  message: "Plataforma de analytics para vendas B2B com dashboard",
  productName: "TDEC Analytics",
};

function createRequest(body: unknown): Request {
  return new Request("http://localhost/api/agent/briefing/parse-product", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function createInvalidRequest(): Request {
  return new Request("http://localhost/api/agent/briefing/parse-product", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "not json",
  });
}

const EXTRACTED_PRODUCT = {
  name: "TDEC Analytics",
  description: "Plataforma de analytics para vendas B2B",
  features: "Dashboard em tempo real",
  differentials: null,
  targetAudience: "Times de vendas",
};

// ==============================================
// TESTS
// ==============================================

describe("POST /api/agent/briefing/parse-product", () => {
  function defaultMockFrom(table: string) {
    if (table === "agent_executions") {
      return createChainBuilder({
        data: { id: VALID_BODY.executionId },
        error: null,
      });
    }
    if (table === "api_configs") {
      // Story 22.9: RLS admin-only vista por um `sdr` — zero linhas, sem erro.
      return createChainBuilder({ data: null, error: null });
    }
    return createChainBuilder();
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockImplementation(defaultMockFrom);
    mockDecryptApiKey.mockReturnValue("decrypted-key");
    mockCreateAdminClient.mockImplementation(() => buildAdminClient());
    mockAdminSingle.mockResolvedValue({
      data: { encrypted_key: "enc-key-123" },
      error: null,
    });
  });

  it("deve retornar 401 se nao autenticado", async () => {
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

  it("deve retornar 400 se executionId nao e UUID", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);

    const response = await POST(
      createRequest({ ...VALID_BODY, executionId: "not-a-uuid" })
    );
    expect(response.status).toBe(400);

    const json = await response.json();
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });

  it("deve retornar 400 se message vazio", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);

    const response = await POST(
      createRequest({ ...VALID_BODY, message: "" })
    );
    expect(response.status).toBe(400);
  });

  it("deve retornar 400 se productName vazio", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);

    const response = await POST(
      createRequest({ ...VALID_BODY, productName: "" })
    );
    expect(response.status).toBe(400);
  });

  it("deve retornar 404 se execucao nao encontrada", async () => {
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

  it("deve retornar 422 se API key OpenAI nao configurada", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
    // Story 22.9: "nao configurada" = ausencia REAL da linha, vista pelo client admin.
    mockAdminSingle.mockResolvedValue({ data: null, error: null });

    const response = await POST(createRequest(VALID_BODY));
    expect(response.status).toBe(422);

    const json = await response.json();
    expect(json.error.code).toBe("API_KEY_MISSING");
  });

  it("Story 22.9: SDR (client de sessao mockado com zero linhas, simulando a RLS) parseia produto normalmente (AC1/AC2)", async () => {
    mockGetCurrentUserProfile.mockResolvedValue({ ...mockProfile, role: "sdr" });
    mockParse.mockResolvedValue(EXTRACTED_PRODUCT);

    const response = await POST(createRequest(VALID_BODY));

    expect(response.status).toBe(200);
    expect(mockParse).toHaveBeenCalledWith(
      VALID_BODY.message,
      VALID_BODY.productName,
      "decrypted-key"
    );
  });

  it("Story 22.9: service-role ausente no ambiente vira 422 'nao configurada' (AC4)", async () => {
    mockGetCurrentUserProfile.mockResolvedValue({ ...mockProfile, role: "sdr" });
    mockCreateAdminClient.mockImplementation(() => {
      throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set.");
    });
    vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await POST(createRequest(VALID_BODY));
    const json = await response.json();

    expect(response.status).toBe(422);
    expect(json.error.code).toBe("API_KEY_MISSING");
    vi.mocked(console.error).mockRestore();
  });

  it("deve retornar 500 se decriptacao falhar", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
    mockDecryptApiKey.mockImplementation(() => {
      throw new Error("Decryption failed");
    });

    const response = await POST(createRequest(VALID_BODY));
    expect(response.status).toBe(500);

    const json = await response.json();
    expect(json.error.code).toBe("API_KEY_ERROR");
  });

  it("deve retornar 500 se ProductParserService.parse falhar", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
    mockParse.mockRejectedValue(new Error("Parse failed"));

    const response = await POST(createRequest(VALID_BODY));
    expect(response.status).toBe(500);

    const json = await response.json();
    expect(json.error.code).toBe("PRODUCT_PARSE_ERROR");
  });

  it("deve retornar 200 com produto extraido", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
    mockParse.mockResolvedValue(EXTRACTED_PRODUCT);

    const response = await POST(createRequest(VALID_BODY));
    expect(response.status).toBe(200);

    const json = await response.json();
    expect(json.product.name).toBe("TDEC Analytics");
    expect(json.product.description).toBe(
      "Plataforma de analytics para vendas B2B"
    );
    expect(json.product.features).toBe("Dashboard em tempo real");
    expect(json.product.differentials).toBeNull();
    expect(json.product.targetAudience).toBe("Times de vendas");
  });

  it("deve chamar ProductParserService.parse com argumentos corretos", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
    mockParse.mockResolvedValue(EXTRACTED_PRODUCT);

    await POST(createRequest(VALID_BODY));

    expect(mockParse).toHaveBeenCalledWith(
      VALID_BODY.message,
      VALID_BODY.productName,
      "decrypted-key"
    );
  });
});
