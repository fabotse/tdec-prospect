/**
 * Unit Tests for POST /api/agent/executions/[executionId]/steps/[stepNumber]/execute
 * Story 17.1 - AC: #1
 *
 * Tests: auth, param validation, success, PipelineError, generic error
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST, maxDuration } from "@/app/api/agent/executions/[executionId]/steps/[stepNumber]/execute/route";
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

// Story 22.9: a chave do TheirStack vem do SERVICE-ROLE (helper `service-keys`).
// O client de SESSAO simula a RLS admin-only de api_configs vista por um `sdr`
// (zero linhas); o orchestrator continua recebendo o client de sessao (Trap #1).
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

// Story 23.3: ramo "Unexpected error" grava error_logs (source api).
const mockLogServerError = vi.fn();
vi.mock("@/lib/services/error-logger", () => ({
  logServerError: (...args: unknown[]) => mockLogServerError(...args),
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

  // Story 22.9: a leitura de SESSAO devolve zero linhas (RLS admin-only vista por
  // um `sdr`). A chave real chega pelo client admin (mockAdminSingle).
  const apiConfigChain = createChainBuilder({ data: null, error: null });

  mockFrom.mockImplementation((table: string) => {
    if (table === "agent_executions") return executionChain;
    if (table === "api_configs") return apiConfigChain;
    return createChainBuilder();
  });

  mockCreateAdminClient.mockImplementation(() => buildAdminClient());
  mockAdminSingle.mockResolvedValue({
    data: { encrypted_key: "encrypted-key-value" },
    error: null,
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

  // ==============================================
  // Story 22.10 — guarda anti-race de execucao terminal (AC4)
  // ==============================================

  it.each(["cancelled", "completed", "failed"])(
    "deve retornar 409 EXECUTION_NOT_ACTIVE quando a execucao esta '%s' (AC4)",
    async (terminalStatus) => {
      setupDefaultMocks();
      mockFrom.mockImplementation((table: string) => {
        if (table === "agent_executions") {
          return createChainBuilder({
            data: { id: EXEC_ID, tenant_id: "tenant-456", status: terminalStatus },
            error: null,
          });
        }
        return createChainBuilder();
      });

      const response = await POST(createRequest(), createParams());
      const json = await response.json();

      expect(response.status).toBe(409);
      expect(json.error.code).toBe("EXECUTION_NOT_ACTIVE");
      // NENHUM step novo rodou -> nada foi gasto em execucao encerrada
      expect(mockExecuteStep).not.toHaveBeenCalled();
    }
  );

  it("deve executar normalmente quando a execucao esta PAUSED (retry legitimo de erro)", async () => {
    setupDefaultMocks();
    mockFrom.mockImplementation((table: string) => {
      if (table === "agent_executions") {
        return createChainBuilder({
          data: { id: EXEC_ID, tenant_id: "tenant-456", status: "paused" },
          error: null,
        });
      }
      if (table === "api_configs") return createChainBuilder({ data: null, error: null });
      return createChainBuilder();
    });

    const response = await POST(createRequest(), createParams());

    expect(response.status).toBe(200);
    expect(mockExecuteStep).toHaveBeenCalled();
  });

  it("deve executar normalmente quando a execucao esta RUNNING (confirmada)", async () => {
    setupDefaultMocks();
    mockFrom.mockImplementation((table: string) => {
      if (table === "agent_executions") {
        return createChainBuilder({
          data: { id: EXEC_ID, tenant_id: "tenant-456", status: "running" },
          error: null,
        });
      }
      if (table === "api_configs") return createChainBuilder({ data: null, error: null });
      return createChainBuilder();
    });

    const response = await POST(createRequest(), createParams());

    expect(response.status).toBe(200);
    expect(mockExecuteStep).toHaveBeenCalled();
  });

  // ==============================================
  // Story 24.2 (AC2) — guarda de status do STEP alvo
  // ==============================================

  /** agent_steps devolve o status do alvo; agent_messages devolve o gate mais recente. */
  function mockTargetStep(stepStatus: string | null, latestGateMetadata?: Record<string, unknown>) {
    const stepsChain = createChainBuilder({
      data: stepStatus === null ? null : { status: stepStatus },
      error: null,
    });
    const messagesChain = createChainBuilder({
      data: latestGateMetadata ? [{ id: "gate-1", metadata: latestGateMetadata }] : [],
      error: null,
    });
    const executionChain = createChainBuilder({
      data: { id: EXEC_ID, tenant_id: "tenant-456", status: "running" },
      error: null,
    });
    mockFrom.mockImplementation((table: string) => {
      if (table === "agent_executions") return executionChain;
      if (table === "agent_steps") return stepsChain;
      if (table === "agent_messages") return messagesChain;
      return createChainBuilder();
    });
    return { stepsChain, messagesChain };
  }

  it.each(["completed", "approved", "running", "skipped"])(
    "24.2: step '%s' -> 409 STEP_NOT_EXECUTABLE sem instanciar o orchestrator nem ler a chave",
    async (stepStatus) => {
      setupDefaultMocks();
      mockTargetStep(stepStatus);

      const response = await POST(createRequest(), createParams());
      const json = await response.json();

      expect(response.status).toBe(409);
      expect(json.error.code).toBe("STEP_NOT_EXECUTABLE");
      // texto para o usuario, sem o valor cru do enum
      expect(json.error.message).toBe(
        "Esta etapa ja esta em andamento ou ja foi concluida — nada foi executado de novo."
      );
      expect(json.error.message).not.toContain(stepStatus);
      expect(mockExecuteStep).not.toHaveBeenCalled();
      // 409 sai ANTES da leitura da chave (nenhuma chamada externa)
      expect(mockCreateAdminClient).not.toHaveBeenCalled();
    }
  );

  it("24.2: awaiting_approval SEM carimbo rejected -> 409", async () => {
    setupDefaultMocks();
    mockTargetStep("awaiting_approval", { messageType: "approval_gate", stepNumber: 1 });

    const response = await POST(createRequest(), createParams());
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json.error.code).toBe("STEP_NOT_EXECUTABLE");
    expect(mockExecuteStep).not.toHaveBeenCalled();
  });

  it("24.2: awaiting_approval com gate mais recente rejected:true -> executa (ajuste 22.13)", async () => {
    setupDefaultMocks();
    const { messagesChain } = mockTargetStep("awaiting_approval", {
      messageType: "approval_gate",
      stepNumber: 1,
      rejected: true,
    });

    const response = await POST(createRequest(), createParams());

    expect(response.status).toBe(200);
    expect(mockExecuteStep).toHaveBeenCalledWith(EXEC_ID, 1);
    // mesma query do carimbo do /reject: gate mais recente DESTE step
    expect(messagesChain.eq).toHaveBeenCalledWith("metadata->>messageType", "approval_gate");
    expect(messagesChain.eq).toHaveBeenCalledWith("metadata->>stepNumber", "1");
    expect(messagesChain.order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(messagesChain.limit).toHaveBeenCalledWith(1);
  });

  it("24.2: erro ao ler o gate (rejeitado?) e fail-closed -> 409", async () => {
    setupDefaultMocks();
    const execChain = createChainBuilder({
      data: { id: EXEC_ID, tenant_id: "tenant-456", status: "running" },
      error: null,
    });
    mockFrom.mockImplementation((table: string) => {
      if (table === "agent_executions") return execChain;
      if (table === "agent_steps")
        return createChainBuilder({ data: { status: "awaiting_approval" }, error: null });
      if (table === "agent_messages")
        return createChainBuilder({ data: null, error: { message: "boom" } });
      return createChainBuilder();
    });

    const response = await POST(createRequest(), createParams());

    expect(response.status).toBe(409);
    expect(mockExecuteStep).not.toHaveBeenCalled();
  });

  it.each(["pending", "failed"])("24.2: step '%s' executa normalmente", async (stepStatus) => {
    setupDefaultMocks();
    const { stepsChain } = mockTargetStep(stepStatus);

    const response = await POST(createRequest(), createParams());

    expect(response.status).toBe(200);
    expect(mockExecuteStep).toHaveBeenCalledWith(EXEC_ID, 1);
    // A leitura do status e do step ALVO desta execucao.
    expect(stepsChain.eq).toHaveBeenCalledWith("execution_id", EXEC_ID);
    expect(stepsChain.eq).toHaveBeenCalledWith("step_number", 1);
  });

  it("24.2: step inexistente segue para o orchestrator (404 logico ja existente)", async () => {
    setupDefaultMocks();
    mockTargetStep(null);

    const response = await POST(createRequest(), createParams());

    expect(response.status).toBe(200);
    expect(mockExecuteStep).toHaveBeenCalled();
  });

  it("24.2: erro ao ler o step alvo -> 500 sem executar", async () => {
    setupDefaultMocks();
    const execChain = createChainBuilder({
      data: { id: EXEC_ID, tenant_id: "tenant-456", status: "running" },
      error: null,
    });
    mockFrom.mockImplementation((table: string) => {
      if (table === "agent_executions") return execChain;
      if (table === "agent_steps") return createChainBuilder({ data: null, error: { message: "x" } });
      return createChainBuilder();
    });

    const response = await POST(createRequest(), createParams());

    expect(response.status).toBe(500);
    expect(mockExecuteStep).not.toHaveBeenCalled();
  });

  it("24.2: clique duplo — 2o POST com o step ja concluido recebe 409 sem chamada externa", async () => {
    setupDefaultMocks();
    // 1o POST: step pending, roda.
    mockTargetStep("pending");
    const first = await POST(createRequest(), createParams());
    expect(first.status).toBe(200);
    expect(mockExecuteStep).toHaveBeenCalledTimes(1);

    // 2o POST: o 1o ja concluiu.
    mockTargetStep("completed");
    const second = await POST(createRequest(), createParams());
    expect(second.status).toBe(409);
    expect(mockExecuteStep).toHaveBeenCalledTimes(1);
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
    // Story 22.9: ausencia REAL da linha, vista pelo client admin.
    mockAdminSingle.mockResolvedValue({ data: null, error: null });

    const response = await POST(createRequest(), createParams());
    const json = await response.json();

    expect(response.status).toBe(422);
    expect(json.error.code).toBe("API_KEY_NOT_FOUND");
  });

  it("Story 22.9: SDR (client de sessao mockado com zero linhas, simulando a RLS) executa o step normalmente (AC2)", async () => {
    setupDefaultMocks();
    mockGetCurrentUserProfile.mockResolvedValue({ ...mockProfile, role: "sdr" });

    const response = await POST(createRequest(), createParams());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.success).toBe(true);
    expect(mockExecuteStep).toHaveBeenCalledWith(EXEC_ID, 1);
  });

  it("Story 22.9: service-role ausente no ambiente vira 422 'nao configurada' (AC4)", async () => {
    setupDefaultMocks();
    mockCreateAdminClient.mockImplementation(() => {
      throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set.");
    });
    vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await POST(createRequest(), createParams());
    const json = await response.json();

    expect(response.status).toBe(422);
    expect(json.error.code).toBe("API_KEY_NOT_FOUND");
    vi.mocked(console.error).mockRestore();
  });

  it("Story 22.9: chave presente mas nao decriptavel vira 500 API_KEY_ERROR (nao 422)", async () => {
    setupDefaultMocks();
    // A linha EXISTE (o admin le), mas o decrypt falha — nao pode virar
    // "nao configurada", senao o gestor reconfigura uma chave que ja esta la.
    mockDecryptApiKey.mockImplementation(() => {
      throw new Error("bad ciphertext");
    });
    vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await POST(createRequest(), createParams());
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.error.code).toBe("API_KEY_ERROR");
    // Nunca executa o step com chave invalida.
    expect(mockExecuteStep).not.toHaveBeenCalled();
    vi.mocked(console.error).mockRestore();
  });

  it("Story 22.9: leitura da chave filtra tenant_id + service_name theirstack (AC4)", async () => {
    setupDefaultMocks();
    const adminClient = buildAdminClient();
    mockCreateAdminClient.mockReturnValue(adminClient);

    await POST(createRequest(), createParams());

    expect(adminClient.from).toHaveBeenCalledWith("api_configs");
    const chain = adminClient.from.mock.results[0]?.value;
    expect(chain.eq).toHaveBeenCalledWith("tenant_id", mockProfile.tenant_id);
    expect(chain.eq).toHaveBeenCalledWith("service_name", "theirstack");
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

  it("Story 23.3: erro generico grava error_logs (source api, tenant do usuario) com a mesma resposta", async () => {
    setupDefaultMocks();
    const crash = new Error("Unexpected crash");
    mockExecuteStep.mockRejectedValue(crash);

    const response = await POST(createRequest(), createParams());
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.error).toEqual({
      code: "INTERNAL_ERROR",
      message: "Unexpected crash",
      isRetryable: false,
    });
    expect(mockLogServerError).toHaveBeenCalledWith({
      source: "api",
      route: "/api/agent/executions/[executionId]/steps/[stepNumber]/execute",
      tenantId: "tenant-456",
      error: crash,
    });
  });

  it("Story 23.3: PipelineError NAO grava error_logs na rota (o orchestrator ja decidiu)", async () => {
    setupDefaultMocks();
    mockExecuteStep.mockRejectedValue({
      code: "STEP_EXECUTION_ERROR",
      message: "Fatal error",
      stepNumber: 1,
      stepType: "search_companies",
      isRetryable: false,
    });

    await POST(createRequest(), createParams());

    expect(mockLogServerError).not.toHaveBeenCalled();
  });
});

// Story 24.3 (AC1): step longo nao pode morrer no limite padrao da function.
describe("execute route config (Story 24.3)", () => {
  it("exporta maxDuration = 300", () => {
    expect(maxDuration).toBe(300);
  });
});
