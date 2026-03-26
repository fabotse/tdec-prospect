/**
 * Unit Tests for POST /api/agent/executions/[executionId]/steps/[stepNumber]/execute
 * Story 17.1 - AC: #1
 *
 * Tests: auth, param validation, success, PipelineError, generic error
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/agent/executions/[executionId]/steps/[stepNumber]/execute/route";
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

const mockExecuteStep = vi.fn();

vi.mock("@/lib/agent/orchestrator", () => ({
  DeterministicOrchestrator: class MockOrchestrator {
    executeStep = mockExecuteStep;
  },
  isPipelineError: (error: unknown) =>
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    "stepNumber" in error &&
    "isRetryable" in error,
}));

// ==============================================
// HELPERS
// ==============================================

const mockProfile = {
  id: "user-123",
  tenant_id: "tenant-456",
  role: "user",
};

const EXEC_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
const STEP_NUM = "1";

function createRequest(): NextRequest {
  return new NextRequest(
    `http://localhost/api/agent/executions/${EXEC_ID}/steps/${STEP_NUM}/execute`,
    { method: "POST" }
  );
}

function createParams(executionId = EXEC_ID, stepNumber = STEP_NUM) {
  return { params: Promise.resolve({ executionId, stepNumber }) };
}

function setupDefaultMocks() {
  mockGetCurrentUserProfile.mockResolvedValue(mockProfile);

  const executionChain = createChainBuilder({
    data: { id: EXEC_ID, tenant_id: "tenant-456", status: "pending" },
    error: null,
  });

  const apiConfigChain = createChainBuilder({
    data: { encrypted_key: "encrypted-key-value" },
    error: null,
  });

  mockFrom.mockImplementation((table: string) => {
    if (table === "agent_executions") return executionChain;
    if (table === "api_configs") return apiConfigChain;
    return createChainBuilder();
  });

  mockDecryptApiKey.mockReturnValue("decrypted-api-key");

  mockExecuteStep.mockResolvedValue({
    success: true,
    data: { companies: [], totalFound: 0 },
    cost: { theirstack_search: 0 },
  });

  return { executionChain, apiConfigChain };
}

// ==============================================
// TESTS
// ==============================================

describe("POST /api/agent/executions/[executionId]/steps/[stepNumber]/execute", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deve retornar 401 quando nao autenticado (5.1)", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(null);

    const response = await POST(createRequest(), createParams());
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json.error.code).toBe("UNAUTHORIZED");
  });

  it("deve retornar 400 para executionId nao-UUID (5.2)", async () => {
    setupDefaultMocks();

    const response = await POST(createRequest(), createParams("not-a-uuid", STEP_NUM));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.code).toBe("INVALID_PARAMS");
    expect(json.error.message).toContain("UUID");
  });

  it("deve retornar 400 para stepNumber invalido (5.2)", async () => {
    setupDefaultMocks();

    const response = await POST(createRequest(), createParams(EXEC_ID, "abc"));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.code).toBe("INVALID_PARAMS");
  });

  it("deve retornar 400 para stepNumber zero (5.2)", async () => {
    setupDefaultMocks();

    const response = await POST(createRequest(), createParams(EXEC_ID, "0"));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.code).toBe("INVALID_PARAMS");
  });

  it("deve retornar 404 quando execucao nao encontrada (5.3)", async () => {
    setupDefaultMocks();
    mockFrom.mockImplementation((table: string) => {
      if (table === "agent_executions") return createChainBuilder({ data: null, error: null });
      return createChainBuilder();
    });

    const response = await POST(createRequest(), createParams());
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.error.code).toBe("NOT_FOUND");
  });

  it("deve retornar 404 quando execucao pertence a outro tenant (5.3)", async () => {
    setupDefaultMocks();
    mockFrom.mockImplementation((table: string) => {
      if (table === "agent_executions") {
        return createChainBuilder({
          data: { id: EXEC_ID, tenant_id: "other-tenant", status: "pending" },
          error: null,
        });
      }
      return createChainBuilder();
    });

    const response = await POST(createRequest(), createParams());
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.error.code).toBe("NOT_FOUND");
  });

  it("deve retornar 422 quando API key nao configurada (5.4)", async () => {
    setupDefaultMocks();
    const executionChain = createChainBuilder({
      data: { id: EXEC_ID, tenant_id: "tenant-456", status: "pending" },
      error: null,
    });
    mockFrom.mockImplementation((table: string) => {
      if (table === "agent_executions") return executionChain;
      if (table === "api_configs") return createChainBuilder({ data: null, error: null });
      return createChainBuilder();
    });

    const response = await POST(createRequest(), createParams());
    const json = await response.json();

    expect(response.status).toBe(422);
    expect(json.error.code).toBe("API_KEY_NOT_FOUND");
  });

  it("deve retornar sucesso com StepOutput (5.5, 5.6)", async () => {
    setupDefaultMocks();

    const response = await POST(createRequest(), createParams());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.success).toBe(true);
    expect(mockExecuteStep).toHaveBeenCalledWith(EXEC_ID, 1);
  });

  it("deve retornar 503 para PipelineError retryable (5.7)", async () => {
    setupDefaultMocks();
    mockExecuteStep.mockRejectedValue({
      code: "STEP_SEARCH_COMPANIES_ERROR",
      message: "Rate limited",
      stepNumber: 1,
      stepType: "search_companies",
      isRetryable: true,
      externalService: "theirstack",
    });

    const response = await POST(createRequest(), createParams());
    const json = await response.json();

    expect(response.status).toBe(503);
    expect(json.error.code).toBe("STEP_SEARCH_COMPANIES_ERROR");
    expect(json.error.isRetryable).toBe(true);
    expect(json.error.externalService).toBe("theirstack");
  });

  it("deve retornar 500 para PipelineError terminal (5.7)", async () => {
    setupDefaultMocks();
    mockExecuteStep.mockRejectedValue({
      code: "STEP_EXECUTION_ERROR",
      message: "Fatal error",
      stepNumber: 1,
      stepType: "search_companies",
      isRetryable: false,
    });

    const response = await POST(createRequest(), createParams());
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.error.isRetryable).toBe(false);
  });

  it("deve retornar 500 para erro generico (5.8)", async () => {
    setupDefaultMocks();
    mockExecuteStep.mockRejectedValue(new Error("Unexpected crash"));

    const response = await POST(createRequest(), createParams());
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.error.code).toBe("INTERNAL_ERROR");
    expect(json.error.isRetryable).toBe(false);
  });
});
