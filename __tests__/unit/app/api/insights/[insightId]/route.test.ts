/**
 * Tests for PATCH /api/insights/:insightId
 * Story 13.6: Pagina de Insights - UI
 *
 * AC: #5 - Marcar como Usado
 * AC: #6 - Descartar
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockGetCurrentUserProfile = vi.fn();
const mockFrom = vi.fn();

vi.mock("@/lib/supabase/tenant", () => ({
  getCurrentUserProfile: () => mockGetCurrentUserProfile(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({
    from: mockFrom,
  })),
}));

import { PATCH } from "@/app/api/insights/[insightId]/route";

const mockProfile = { tenant_id: "tenant-1", id: "user-1" };
const VALID_INSIGHT_ID = "insight-uuid-123";

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/insights/test", {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function makeParams(insightId: string) {
  return { params: Promise.resolve({ insightId }) };
}

function setupMockUpdateChain(response: { data: unknown; error: unknown }) {
  const chain = {
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(response),
  };
  mockFrom.mockReturnValue(chain);
  return chain;
}

describe("PATCH /api/insights/:insightId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
  });

  it("should return 401 when not authenticated", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(null);

    const response = await PATCH(makeRequest({ status: "used" }), makeParams(VALID_INSIGHT_ID));
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json.error.code).toBe("UNAUTHORIZED");
  });

  it("should return 400 for invalid JSON body", async () => {
    const request = new NextRequest("http://localhost/api/insights/test", {
      method: "PATCH",
      body: "not-json",
      headers: { "Content-Type": "application/json" },
    });

    const response = await PATCH(request, makeParams(VALID_INSIGHT_ID));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.code).toBe("VALIDATION_ERROR");
    expect(json.error.message).toContain("JSON");
  });

  it("should return 400 for invalid status", async () => {
    const response = await PATCH(makeRequest({ status: "invalid" }), makeParams(VALID_INSIGHT_ID));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });

  it("should return 400 for missing status", async () => {
    const response = await PATCH(makeRequest({}), makeParams(VALID_INSIGHT_ID));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });

  it("should update status to 'used' successfully", async () => {
    const updatedRow = { id: VALID_INSIGHT_ID, status: "used" };
    setupMockUpdateChain({ data: updatedRow, error: null });

    const response = await PATCH(makeRequest({ status: "used" }), makeParams(VALID_INSIGHT_ID));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data).toEqual(updatedRow);
  });

  it("should update status to 'dismissed' successfully", async () => {
    const updatedRow = { id: VALID_INSIGHT_ID, status: "dismissed" };
    setupMockUpdateChain({ data: updatedRow, error: null });

    const response = await PATCH(makeRequest({ status: "dismissed" }), makeParams(VALID_INSIGHT_ID));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data).toEqual(updatedRow);
  });

  it("should update status to 'new' successfully", async () => {
    const updatedRow = { id: VALID_INSIGHT_ID, status: "new" };
    setupMockUpdateChain({ data: updatedRow, error: null });

    const response = await PATCH(makeRequest({ status: "new" }), makeParams(VALID_INSIGHT_ID));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data).toEqual(updatedRow);
  });

  it("should return 404 when insight not found", async () => {
    setupMockUpdateChain({ data: null, error: { code: "PGRST116" } });

    const response = await PATCH(makeRequest({ status: "used" }), makeParams(VALID_INSIGHT_ID));
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.error.code).toBe("NOT_FOUND");
  });

  it("should return 500 on database error", async () => {
    setupMockUpdateChain({ data: null, error: { code: "OTHER", message: "DB error" } });

    const response = await PATCH(makeRequest({ status: "used" }), makeParams(VALID_INSIGHT_ID));
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.error.code).toBe("INTERNAL_ERROR");
  });

  it("should filter by tenant_id when updating", async () => {
    const chain = setupMockUpdateChain({ data: { id: VALID_INSIGHT_ID }, error: null });

    await PATCH(makeRequest({ status: "used" }), makeParams(VALID_INSIGHT_ID));

    // eq should be called with both id and tenant_id
    expect(chain.eq).toHaveBeenCalledWith("id", VALID_INSIGHT_ID);
    expect(chain.eq).toHaveBeenCalledWith("tenant_id", "tenant-1");
  });
});
