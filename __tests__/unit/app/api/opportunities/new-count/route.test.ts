/**
 * Tests for GET /api/opportunities/new-count
 * Story 21.4: Central de Oportunidades — badge da sidebar (AC #1)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

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

import { GET } from "@/app/api/opportunities/new-count/route";

const mockProfile = { tenant_id: "tenant-1", id: "user-1" };

function setupMockChain(response: { count: number | null; error: unknown }) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    then: (resolve: (v: unknown) => unknown) =>
      Promise.resolve(response).then(resolve),
  };
  mockFrom.mockReturnValue(chain);
  return chain;
}

describe("GET /api/opportunities/new-count", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
  });

  it("should return 401 when not authenticated", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(null);

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json.error.code).toBe("UNAUTHORIZED");
  });

  it("should return count of new opportunities", async () => {
    setupMockChain({ count: 7, error: null });

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.count).toBe(7);
  });

  it("should query opportunities filtered by tenant and status new", async () => {
    const chain = setupMockChain({ count: 0, error: null });

    await GET();

    expect(mockFrom).toHaveBeenCalledWith("opportunities");
    expect(chain.select).toHaveBeenCalledWith("id", { count: "exact", head: true });
    expect(chain.eq).toHaveBeenCalledWith("tenant_id", "tenant-1");
    expect(chain.eq).toHaveBeenCalledWith("status", "new");
  });

  it("should return 0 when count is null", async () => {
    setupMockChain({ count: null, error: null });

    const response = await GET();
    const json = await response.json();

    expect(json.data.count).toBe(0);
  });

  it("should return 500 on database error", async () => {
    setupMockChain({ count: null, error: { message: "DB error" } });

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.error.code).toBe("INTERNAL_ERROR");
  });
});
