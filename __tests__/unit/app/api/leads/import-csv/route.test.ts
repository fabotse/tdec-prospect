/**
 * Tests for Lead CSV Import API Route
 * Story 12.2: Import Leads via CSV
 *
 * AC: #6 - Processing and lead creation with deduplication by email
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Mock dependencies
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

import { POST } from "@/app/api/leads/import-csv/route";

const PROFILE = { tenant_id: "tenant-1", id: "user-1" };

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/leads/import-csv", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/leads/import-csv", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentUserProfile.mockResolvedValue(PROFILE);
  });

  it("should return 401 when not authenticated", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(null);

    const response = await POST(makeRequest({ leads: [{ firstName: "João" }] }));
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json.error.code).toBe("UNAUTHORIZED");
  });

  it("should return 400 for malformed JSON body", async () => {
    const request = new NextRequest("http://localhost/api/leads/import-csv", {
      method: "POST",
      body: "not-json{{{",
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });

  it("should return 400 for invalid body (empty leads)", async () => {
    const response = await POST(makeRequest({ leads: [] }));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });

  it("should return 400 for missing firstName", async () => {
    const response = await POST(makeRequest({ leads: [{ firstName: "" }] }));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });

  it("should import leads without email (no deduplication)", async () => {
    // No emails → no dedup query needed, just insert
    const mockSelect = vi.fn().mockResolvedValue({
      data: [{ id: "lead-1" }, { id: "lead-2" }],
      error: null,
    });
    const mockInsert = vi.fn().mockReturnValue({ select: mockSelect });

    mockFrom.mockReturnValueOnce({ insert: mockInsert });

    const response = await POST(
      makeRequest({
        leads: [
          { firstName: "João" },
          { firstName: "Maria" },
        ],
      })
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.imported).toBe(2);
    expect(json.data.existing).toBe(0);
    expect(json.data.errors).toEqual([]);
  });

  it("should deduplicate leads by email (case-insensitive)", async () => {
    // Dedup query: find existing leads by email
    const mockIn = vi.fn().mockResolvedValue({
      data: [{ id: "existing-1", email: "joao@empresa.com" }],
      error: null,
    });
    const mockEqTenant = vi.fn().mockReturnValue({ in: mockIn });
    const mockDedupSelect = vi.fn().mockReturnValue({ eq: mockEqTenant });

    // Insert query: insert only new leads
    const mockInsertSelect = vi.fn().mockResolvedValue({
      data: [{ id: "lead-new" }],
      error: null,
    });
    const mockInsert = vi.fn().mockReturnValue({ select: mockInsertSelect });

    mockFrom
      .mockReturnValueOnce({ select: mockDedupSelect }) // dedup check
      .mockReturnValueOnce({ insert: mockInsert }); // insert new

    const response = await POST(
      makeRequest({
        leads: [
          { firstName: "João", email: "joao@empresa.com" }, // existing
          { firstName: "Maria", email: "maria@nova.com" }, // new
        ],
      })
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.imported).toBe(1);
    expect(json.data.existing).toBe(1);
  });

  it("should return 500 when dedup query fails", async () => {
    const mockIn = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "DB error" },
    });
    const mockEqTenant = vi.fn().mockReturnValue({ in: mockIn });
    const mockDedupSelect = vi.fn().mockReturnValue({ eq: mockEqTenant });

    mockFrom.mockReturnValueOnce({ select: mockDedupSelect });

    const response = await POST(
      makeRequest({
        leads: [{ firstName: "João", email: "joao@empresa.com" }],
      })
    );
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.error.code).toBe("INTERNAL_ERROR");
  });

  it("should return 500 when insert fails", async () => {
    // No emails → skip dedup, go straight to insert
    const mockSelect = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "Insert error" },
    });
    const mockInsert = vi.fn().mockReturnValue({ select: mockSelect });

    mockFrom.mockReturnValueOnce({ insert: mockInsert });

    const response = await POST(
      makeRequest({
        leads: [{ firstName: "João" }],
      })
    );
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.error.code).toBe("INTERNAL_ERROR");
  });

  it("should associate leads with segment when segmentId provided", async () => {
    // Insert query
    const mockInsertSelect = vi.fn().mockResolvedValue({
      data: [{ id: "lead-1" }],
      error: null,
    });
    const mockInsert = vi.fn().mockReturnValue({ select: mockInsertSelect });

    // Segment association insert
    const mockAssocInsert = vi.fn().mockResolvedValue({ error: null });

    mockFrom
      .mockReturnValueOnce({ insert: mockInsert }) // leads insert
      .mockReturnValueOnce({ insert: mockAssocInsert }); // segment assoc

    const response = await POST(
      makeRequest({
        leads: [{ firstName: "João" }],
        segmentId: "550e8400-e29b-41d4-a716-446655440000",
      })
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.imported).toBe(1);
    expect(mockAssocInsert).toHaveBeenCalled();
  });

  it("should report error but still succeed when segment association fails", async () => {
    // Insert query
    const mockInsertSelect = vi.fn().mockResolvedValue({
      data: [{ id: "lead-1" }],
      error: null,
    });
    const mockInsert = vi.fn().mockReturnValue({ select: mockInsertSelect });

    // Segment association fails
    const mockAssocInsert = vi.fn().mockResolvedValue({
      error: { message: "Assoc error" },
    });

    mockFrom
      .mockReturnValueOnce({ insert: mockInsert })
      .mockReturnValueOnce({ insert: mockAssocInsert });

    const response = await POST(
      makeRequest({
        leads: [{ firstName: "João" }],
        segmentId: "550e8400-e29b-41d4-a716-446655440000",
      })
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.imported).toBe(1);
    expect(json.data.errors).toContain(
      "Leads importados, mas erro ao associar ao segmento"
    );
  });

  it("should not insert when all leads are duplicates", async () => {
    // Dedup query: all emails exist
    const mockIn = vi.fn().mockResolvedValue({
      data: [
        { id: "existing-1", email: "joao@empresa.com" },
        { id: "existing-2", email: "maria@empresa.com" },
      ],
      error: null,
    });
    const mockEqTenant = vi.fn().mockReturnValue({ in: mockIn });
    const mockDedupSelect = vi.fn().mockReturnValue({ eq: mockEqTenant });

    mockFrom.mockReturnValueOnce({ select: mockDedupSelect });

    const response = await POST(
      makeRequest({
        leads: [
          { firstName: "João", email: "joao@empresa.com" },
          { firstName: "Maria", email: "maria@empresa.com" },
        ],
      })
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.imported).toBe(0);
    expect(json.data.existing).toBe(2);
    expect(json.data.errors).toEqual([]);
  });

  it("should not associate when segmentId is null", async () => {
    const mockInsertSelect = vi.fn().mockResolvedValue({
      data: [{ id: "lead-1" }],
      error: null,
    });
    const mockInsert = vi.fn().mockReturnValue({ select: mockInsertSelect });

    mockFrom.mockReturnValueOnce({ insert: mockInsert });

    const response = await POST(
      makeRequest({
        leads: [{ firstName: "João" }],
        segmentId: null,
      })
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    // Only 1 from() call (insert leads), no segment association call
    expect(mockFrom).toHaveBeenCalledTimes(1);
  });

  it("should handle leads with mixed emails (some null, some existing, some new)", async () => {
    // Dedup query: one email exists
    const mockIn = vi.fn().mockResolvedValue({
      data: [{ id: "existing-1", email: "existing@empresa.com" }],
      error: null,
    });
    const mockEqTenant = vi.fn().mockReturnValue({ in: mockIn });
    const mockDedupSelect = vi.fn().mockReturnValue({ eq: mockEqTenant });

    // Insert: 2 leads (null email + new email)
    const mockInsertSelect = vi.fn().mockResolvedValue({
      data: [{ id: "lead-1" }, { id: "lead-2" }],
      error: null,
    });
    const mockInsert = vi.fn().mockReturnValue({ select: mockInsertSelect });

    mockFrom
      .mockReturnValueOnce({ select: mockDedupSelect })
      .mockReturnValueOnce({ insert: mockInsert });

    const response = await POST(
      makeRequest({
        leads: [
          { firstName: "João" }, // no email → always insert
          { firstName: "Maria", email: "existing@empresa.com" }, // duplicate
          { firstName: "Pedro", email: "new@empresa.com" }, // new
        ],
      })
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.imported).toBe(2);
    expect(json.data.existing).toBe(1);
  });

  it("should return 400 when leads exceed max of 1000", async () => {
    const tooManyLeads = Array.from({ length: 1001 }, (_, i) => ({
      firstName: `Lead ${i}`,
    }));

    const response = await POST(makeRequest({ leads: tooManyLeads }));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });
});
