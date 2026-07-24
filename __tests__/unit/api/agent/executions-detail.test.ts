/**
 * Unit Tests for PATCH /api/agent/executions/[executionId]
 * Story 16.4 - AC: #4
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { PATCH } from "@/app/api/agent/executions/[executionId]/route";
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

const EXEC_ID = "exec-001";

function createRequest(body: unknown): NextRequest {
  return new NextRequest(
    `http://localhost/api/agent/executions/${EXEC_ID}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

function createParams() {
  return { params: Promise.resolve({ executionId: EXEC_ID }) };
}

// ==============================================
// TESTS
// ==============================================

describe("PATCH /api/agent/executions/[executionId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deve retornar 401 quando nao autenticado", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(null);

    const response = await PATCH(createRequest({ mode: "guided" }), createParams());
    expect(response.status).toBe(401);

    const json = await response.json();
    expect(json.error.code).toBe("UNAUTHORIZED");
  });

  it("deve retornar 404 quando execucao nao encontrada", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);

    // select returns null (not found)
    const selectChain = createChainBuilder({ data: null, error: null });
    mockFrom.mockImplementation(() => selectChain);

    const response = await PATCH(createRequest({ mode: "guided" }), createParams());
    expect(response.status).toBe(404);

    const json = await response.json();
    expect(json.error.code).toBe("NOT_FOUND");
  });

  it("deve retornar 400 para modo invalido", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);

    // First call: select (execution exists)
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return createChainBuilder({ data: { id: EXEC_ID }, error: null });
      }
      return createChainBuilder();
    });

    const response = await PATCH(createRequest({ mode: "turbo" }), createParams());
    expect(response.status).toBe(400);

    const json = await response.json();
    expect(json.error.code).toBe("INVALID_MODE");
  });

  it("deve retornar 400 quando modo nao enviado", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return createChainBuilder({ data: { id: EXEC_ID }, error: null });
      }
      return createChainBuilder();
    });

    const response = await PATCH(createRequest({}), createParams());
    expect(response.status).toBe(400);

    const json = await response.json();
    expect(json.error.code).toBe("INVALID_MODE");
  });

  it("deve atualizar modo para guided com sucesso", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);

    const updatedExecution = { id: EXEC_ID, mode: "guided", status: "pending" };
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return createChainBuilder({ data: { id: EXEC_ID }, error: null });
      }
      return createChainBuilder({ data: updatedExecution, error: null });
    });

    const response = await PATCH(createRequest({ mode: "guided" }), createParams());
    expect(response.status).toBe(200);

    const json = await response.json();
    expect(json.data.mode).toBe("guided");
  });

  it("deve atualizar modo para autopilot com sucesso", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);

    const updatedExecution = { id: EXEC_ID, mode: "autopilot", status: "pending" };
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return createChainBuilder({ data: { id: EXEC_ID }, error: null });
      }
      return createChainBuilder({ data: updatedExecution, error: null });
    });

    const response = await PATCH(createRequest({ mode: "autopilot" }), createParams());
    expect(response.status).toBe(200);

    const json = await response.json();
    expect(json.data.mode).toBe("autopilot");
  });

  it("deve retornar 500 quando update falha", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return createChainBuilder({ data: { id: EXEC_ID }, error: null });
      }
      return createChainBuilder({ data: null, error: { message: "DB error" } });
    });

    const response = await PATCH(createRequest({ mode: "guided" }), createParams());
    expect(response.status).toBe(500);

    const json = await response.json();
    expect(json.error.code).toBe("INTERNAL_ERROR");
  });

  // ==============================================
  // Story 22.10 — cancelamento ("Nova conversa") (AC3)
  // ==============================================

  describe('cancelamento { status: "cancelled" } (Story 22.10)', () => {
    // Monta os 2 acessos a agent_executions: 1o = select da execucao, 2o = update.
    function mockExecution(
      execution: Record<string, unknown> | null,
      updateResult: { data: unknown; error: unknown } = { data: null, error: null }
    ) {
      const updateChain = createChainBuilder(updateResult);
      let callCount = 0;
      mockFrom.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return createChainBuilder({ data: execution, error: null });
        }
        return updateChain;
      });
      return updateChain;
    }

    it("cancela execucao PENDING do proprio usuario (caso comum: briefing abandonado)", async () => {
      mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
      const cancelledRow = { id: EXEC_ID, status: "cancelled" };
      // Story 22.10 (code review): o cancel usa CAS (.in(status).select() SEM .single()),
      // entao o PostgREST devolve um ARRAY de linhas afetadas.
      const updateChain = mockExecution(
        { id: EXEC_ID, user_id: mockProfile.id, status: "pending" },
        { data: [cancelledRow], error: null }
      );

      const response = await PATCH(createRequest({ status: "cancelled" }), createParams());
      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.data.status).toBe("cancelled");

      // grava o status terminal E carimba o encerramento
      const payload = updateChain.update.mock.calls[0][0] as {
        status?: string;
        completed_at?: string;
      };
      expect(payload.status).toBe("cancelled");
      expect(typeof payload.completed_at).toBe("string");
      expect(Number.isNaN(Date.parse(payload.completed_at as string))).toBe(false);
    });

    it("cancela execucao RUNNING do proprio usuario (confirmada em andamento)", async () => {
      mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
      mockExecution(
        { id: EXEC_ID, user_id: mockProfile.id, status: "running" },
        { data: [{ id: EXEC_ID, status: "cancelled" }], error: null }
      );

      const response = await PATCH(createRequest({ status: "cancelled" }), createParams());
      expect(response.status).toBe(200);
    });

    it("cancela execucao PAUSED do proprio usuario (parada por erro)", async () => {
      mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
      mockExecution(
        { id: EXEC_ID, user_id: mockProfile.id, status: "paused" },
        { data: [{ id: EXEC_ID, status: "cancelled" }], error: null }
      );

      const response = await PATCH(createRequest({ status: "cancelled" }), createParams());
      expect(response.status).toBe(200);
    });

    it("retorna 403 FORBIDDEN ao cancelar execucao de OUTRO usuario do mesmo tenant", async () => {
      mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
      // A RLS e por TENANT: a linha VEM no select mesmo sendo de outra pessoa.
      const updateChain = mockExecution({
        id: EXEC_ID,
        user_id: "outro-usuario",
        status: "running",
      });

      const response = await PATCH(createRequest({ status: "cancelled" }), createParams());
      expect(response.status).toBe(403);

      const json = await response.json();
      expect(json.error.code).toBe("FORBIDDEN");
      // e NADA foi escrito
      expect(updateChain.update).not.toHaveBeenCalled();
    });

    it.each(["completed", "failed", "cancelled"])(
      "retorna 409 INVALID_TRANSITION para status terminal '%s' (nao ha como descancelar)",
      async (terminalStatus) => {
        mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
        const updateChain = mockExecution({
          id: EXEC_ID,
          user_id: mockProfile.id,
          status: terminalStatus,
        });

        const response = await PATCH(createRequest({ status: "cancelled" }), createParams());
        expect(response.status).toBe(409);

        const json = await response.json();
        expect(json.error.code).toBe("INVALID_TRANSITION");
        expect(updateChain.update).not.toHaveBeenCalled();
      }
    );

    it("retorna 404 quando a execucao nao existe no tenant (RLS)", async () => {
      mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
      mockExecution(null);

      const response = await PATCH(createRequest({ status: "cancelled" }), createParams());
      expect(response.status).toBe(404);

      const json = await response.json();
      expect(json.error.code).toBe("NOT_FOUND");
    });

    it("retorna 401 quando nao autenticado", async () => {
      mockGetCurrentUserProfile.mockResolvedValue(null);

      const response = await PATCH(createRequest({ status: "cancelled" }), createParams());
      expect(response.status).toBe(401);
    });

    it("retorna 400 INVALID_STATUS para status diferente de 'cancelled'", async () => {
      mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
      const updateChain = mockExecution({
        id: EXEC_ID,
        user_id: mockProfile.id,
        status: "running",
      });

      const response = await PATCH(createRequest({ status: "completed" }), createParams());
      expect(response.status).toBe(400);

      const json = await response.json();
      expect(json.error.code).toBe("INVALID_STATUS");
      expect(updateChain.update).not.toHaveBeenCalled();
    });

    it("retorna 400 INVALID_BODY quando mode e status vem juntos", async () => {
      mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
      const updateChain = mockExecution({
        id: EXEC_ID,
        user_id: mockProfile.id,
        status: "running",
      });

      const response = await PATCH(
        createRequest({ mode: "guided", status: "cancelled" }),
        createParams()
      );
      expect(response.status).toBe(400);

      const json = await response.json();
      expect(json.error.code).toBe("INVALID_BODY");
      expect(updateChain.update).not.toHaveBeenCalled();
    });

    it("retorna 409 INVALID_TRANSITION quando o CAS afeta 0 linhas (corrida: virou terminal entre o SELECT e o UPDATE)", async () => {
      mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
      // O guard le 'running', mas uma conclusao/pausa concorrente tornou a execucao
      // terminal antes do UPDATE -> o `.in("status", [...nao-terminais])` casa 0 linhas.
      mockExecution(
        { id: EXEC_ID, user_id: mockProfile.id, status: "running" },
        { data: [], error: null }
      );

      const response = await PATCH(createRequest({ status: "cancelled" }), createParams());
      expect(response.status).toBe(409);

      const json = await response.json();
      expect(json.error.code).toBe("INVALID_TRANSITION");
    });

    it("retorna 400 INVALID_BODY quando o corpo e null literal (nao derruba com 500)", async () => {
      mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
      mockExecution({ id: EXEC_ID, user_id: mockProfile.id, status: "running" });

      // corpo JSON `null` valido -> request.json() devolve null (nao lanca)
      const request = new NextRequest(
        `http://localhost/api/agent/executions/${EXEC_ID}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: "null",
        }
      );

      const response = await PATCH(request, createParams());
      expect(response.status).toBe(400);

      const json = await response.json();
      expect(json.error.code).toBe("INVALID_BODY");
    });

    it("retorna 500 quando o update de cancelamento falha", async () => {
      mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
      mockExecution(
        { id: EXEC_ID, user_id: mockProfile.id, status: "running" },
        { data: null, error: { message: "DB error" } }
      );

      const response = await PATCH(createRequest({ status: "cancelled" }), createParams());
      expect(response.status).toBe(500);

      const json = await response.json();
      expect(json.error.code).toBe("INTERNAL_ERROR");
    });

    it("caminho de MODE nao ganhou checagem de dono (byte-a-byte com a 16.4)", async () => {
      mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
      // execucao de OUTRO usuario: o cancel daria 403, mas o mode continua permitido
      // (a superficie de acesso das demais rotas segue tenant-only — fora do escopo).
      mockExecution(
        { id: EXEC_ID, user_id: "outro-usuario", status: "pending" },
        { data: { id: EXEC_ID, mode: "guided" }, error: null }
      );

      const response = await PATCH(createRequest({ mode: "guided" }), createParams());
      expect(response.status).toBe(200);
    });
  });
});
