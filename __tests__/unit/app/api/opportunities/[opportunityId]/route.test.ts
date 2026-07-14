/**
 * Tests for PATCH /api/opportunities/:opportunityId
 * Story 21.4: Central de Oportunidades — transição new→viewed (AC #5)
 *
 * Escopo 21.4: a rota grava SÓ `status` (validado por isValidOpportunityStatus).
 * Efeitos colaterais das demais transições (meeting_booked_at, status do lead) = 21.5.
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

import { PATCH } from "@/app/api/opportunities/[opportunityId]/route";

const mockProfile = { tenant_id: "tenant-1", id: "user-1" };
const VALID_OPPORTUNITY_ID = "opp-uuid-123";

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/opportunities/test", {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function makeParams(opportunityId: string) {
  return { params: Promise.resolve({ opportunityId }) };
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

describe("PATCH /api/opportunities/:opportunityId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
  });

  it("should return 401 when not authenticated", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(null);

    const response = await PATCH(
      makeRequest({ status: "viewed" }),
      makeParams(VALID_OPPORTUNITY_ID)
    );
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json.error.code).toBe("UNAUTHORIZED");
  });

  it("should return 400 for invalid JSON body", async () => {
    const request = new NextRequest("http://localhost/api/opportunities/test", {
      method: "PATCH",
      body: "not-json",
      headers: { "Content-Type": "application/json" },
    });

    const response = await PATCH(request, makeParams(VALID_OPPORTUNITY_ID));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.code).toBe("VALIDATION_ERROR");
    expect(json.error.message).toContain("JSON");
  });

  it("should return 400 (not 500) for a JSON null body", async () => {
    // request.json() parseia "null" sem lançar → o destructure quebraria com 500
    const request = new NextRequest("http://localhost/api/opportunities/test", {
      method: "PATCH",
      body: "null",
      headers: { "Content-Type": "application/json" },
    });

    const response = await PATCH(request, makeParams(VALID_OPPORTUNITY_ID));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });

  it("should return 400 for invalid status", async () => {
    const response = await PATCH(
      makeRequest({ status: "invalid" }),
      makeParams(VALID_OPPORTUNITY_ID)
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });

  it("should return 400 for missing status", async () => {
    const response = await PATCH(makeRequest({}), makeParams(VALID_OPPORTUNITY_ID));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });

  it("should return 400 for non-string status", async () => {
    const response = await PATCH(
      makeRequest({ status: 42 }),
      makeParams(VALID_OPPORTUNITY_ID)
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });

  it("should update status to 'viewed' successfully (AC5)", async () => {
    const updatedRow = { id: VALID_OPPORTUNITY_ID, status: "viewed" };
    const chain = setupMockUpdateChain({ data: updatedRow, error: null });

    const response = await PATCH(
      makeRequest({ status: "viewed" }),
      makeParams(VALID_OPPORTUNITY_ID)
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data).toEqual(updatedRow);
    // Grava SÓ status (sem meeting_booked_at / efeitos da 21.5)
    expect(chain.update).toHaveBeenCalledWith({ status: "viewed" });
  });

  it("should accept the other valid statuses (validação só — efeitos são 21.5)", async () => {
    for (const status of ["new", "contacted", "meeting_booked", "discarded"]) {
      const chain = setupMockUpdateChain({
        data: { id: VALID_OPPORTUNITY_ID, status },
        error: null,
      });

      const response = await PATCH(
        makeRequest({ status }),
        makeParams(VALID_OPPORTUNITY_ID)
      );

      expect(response.status).toBe(200);
      expect(chain.update).toHaveBeenCalledWith({ status });
    }
  });

  it("should return 404 when opportunity not found (PGRST116)", async () => {
    setupMockUpdateChain({ data: null, error: { code: "PGRST116" } });

    const response = await PATCH(
      makeRequest({ status: "viewed" }),
      makeParams(VALID_OPPORTUNITY_ID)
    );
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.error.code).toBe("NOT_FOUND");
  });

  it("should return 500 on database error", async () => {
    setupMockUpdateChain({ data: null, error: { code: "OTHER", message: "DB error" } });

    const response = await PATCH(
      makeRequest({ status: "viewed" }),
      makeParams(VALID_OPPORTUNITY_ID)
    );
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.error.code).toBe("INTERNAL_ERROR");
  });

  it("should filter by id and tenant_id when updating", async () => {
    const chain = setupMockUpdateChain({
      data: { id: VALID_OPPORTUNITY_ID },
      error: null,
    });

    await PATCH(makeRequest({ status: "viewed" }), makeParams(VALID_OPPORTUNITY_ID));

    expect(chain.eq).toHaveBeenCalledWith("id", VALID_OPPORTUNITY_ID);
    expect(chain.eq).toHaveBeenCalledWith("tenant_id", "tenant-1");
  });
});
