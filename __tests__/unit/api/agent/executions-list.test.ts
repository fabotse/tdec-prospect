/**
 * Unit Tests for GET /api/agent/executions
 * Story 16.4 - AC: #1, #2
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "@/app/api/agent/executions/route";
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

// ==============================================
// TESTS
// ==============================================

describe("GET /api/agent/executions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockImplementation(() => createChainBuilder());
  });

  it("deve retornar 401 quando nao autenticado", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(null);

    const response = await GET();
    expect(response.status).toBe(401);

    const json = await response.json();
    expect(json.error.code).toBe("UNAUTHORIZED");
  });

  it("deve retornar lista vazia quando nao ha execucoes", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);

    const chain = createChainBuilder({ data: [], error: null });
    mockFrom.mockImplementation(() => chain);

    const response = await GET();
    expect(response.status).toBe(200);

    const json = await response.json();
    expect(json.data).toEqual([]);
  });

  it("deve retornar lista de execucoes", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);

    const executions = [
      { id: "exec-1", status: "pending", mode: "guided" },
      { id: "exec-2", status: "completed", mode: "autopilot" },
    ];
    const chain = createChainBuilder({ data: executions, error: null });
    mockFrom.mockImplementation(() => chain);

    const response = await GET();
    expect(response.status).toBe(200);

    const json = await response.json();
    expect(json.data).toHaveLength(2);
    expect(json.data[0].id).toBe("exec-1");
  });

  it("deve retornar 500 quando query falha", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);

    const chain = createChainBuilder({ data: null, error: { message: "DB error" } });
    mockFrom.mockImplementation(() => chain);

    const response = await GET();
    expect(response.status).toBe(500);

    const json = await response.json();
    expect(json.error.code).toBe("INTERNAL_ERROR");
  });

  it("deve retornar array vazio quando data e null", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);

    const chain = createChainBuilder({ data: null, error: null });
    mockFrom.mockImplementation(() => chain);

    const response = await GET();
    expect(response.status).toBe(200);

    const json = await response.json();
    expect(json.data).toEqual([]);
  });
});
