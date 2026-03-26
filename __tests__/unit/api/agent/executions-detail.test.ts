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
});
