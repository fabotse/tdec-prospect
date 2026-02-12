/**
 * Tests for Lead Bulk Delete API Route
 * Story 12.5: Deleção de Leads (Individual e em Massa)
 *
 * AC: #5 - Hard delete (remoção permanente)
 * AC: #9 - RLS enforced (tenant isolation)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Mock dependencies
const mockGetUser = vi.fn();
const mockFrom = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  })),
}));

import { DELETE } from "@/app/api/leads/bulk-delete/route";

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/leads/bulk-delete", {
    method: "DELETE",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";
const VALID_UUID_2 = "550e8400-e29b-41d4-a716-446655440001";
const VALID_UUID_3 = "550e8400-e29b-41d4-a716-446655440002";

describe("DELETE /api/leads/bulk-delete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
  });

  // AC #9: Unauthorized
  it("should return 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const response = await DELETE(makeRequest({ leadIds: [VALID_UUID] }));
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json.error.code).toBe("UNAUTHORIZED");
  });

  // Validation: malformed JSON
  it("should return 400 for malformed JSON body", async () => {
    const request = new NextRequest("http://localhost/api/leads/bulk-delete", {
      method: "DELETE",
      body: "not-json{{{",
      headers: { "Content-Type": "application/json" },
    });

    const response = await DELETE(request);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });

  // Validation: empty leadIds
  it("should return 400 for empty leadIds array", async () => {
    const response = await DELETE(makeRequest({ leadIds: [] }));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });

  // Validation: invalid UUIDs
  it("should return 400 for invalid UUID in leadIds", async () => {
    const response = await DELETE(makeRequest({ leadIds: ["not-a-uuid"] }));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });

  // Validation: too many IDs (max 500)
  it("should return 400 when leadIds exceeds 500", async () => {
    const leadIds = Array.from({ length: 501 }, () => crypto.randomUUID());
    const response = await DELETE(makeRequest({ leadIds }));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });

  // AC #5: Successful delete
  it("should delete leads and return count", async () => {
    const mockIn = vi.fn().mockResolvedValue({ error: null, count: 3 });
    const mockDelete = vi.fn().mockReturnValue({ in: mockIn });
    mockFrom.mockReturnValue({ delete: mockDelete });

    const leadIds = [VALID_UUID, VALID_UUID_2, VALID_UUID_3];
    const response = await DELETE(makeRequest({ leadIds }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.deleted).toBe(3);
    expect(mockFrom).toHaveBeenCalledWith("leads");
    expect(mockIn).toHaveBeenCalledWith("id", leadIds);
  });

  // AC #5: Fallback count when Supabase count is null
  it("should use leadIds length as fallback when count is null", async () => {
    const mockIn = vi.fn().mockResolvedValue({ error: null, count: null });
    const mockDelete = vi.fn().mockReturnValue({ in: mockIn });
    mockFrom.mockReturnValue({ delete: mockDelete });

    const response = await DELETE(makeRequest({ leadIds: [VALID_UUID] }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.deleted).toBe(1);
  });

  // Error handling: database error
  it("should return 500 on database error", async () => {
    const mockIn = vi.fn().mockResolvedValue({
      error: { message: "DB error" },
      count: null,
    });
    const mockDelete = vi.fn().mockReturnValue({ in: mockIn });
    mockFrom.mockReturnValue({ delete: mockDelete });

    const response = await DELETE(makeRequest({ leadIds: [VALID_UUID] }));
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.error.code).toBe("INTERNAL_ERROR");
  });

  // Validation: missing leadIds field
  it("should return 400 when leadIds field is missing", async () => {
    const response = await DELETE(makeRequest({}));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });

  // Boundary: exactly 500 IDs should succeed
  it("should accept exactly 500 leadIds", async () => {
    const mockIn = vi.fn().mockResolvedValue({ error: null, count: 500 });
    const mockDelete = vi.fn().mockReturnValue({ in: mockIn });
    mockFrom.mockReturnValue({ delete: mockDelete });

    const leadIds = Array.from({ length: 500 }, () => crypto.randomUUID());
    const response = await DELETE(makeRequest({ leadIds }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.deleted).toBe(500);
  });
});
