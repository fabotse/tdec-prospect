/**
 * Tests for GET /api/insights/new-count
 * Story 13.6: Pagina de Insights - UI
 *
 * AC: #3 - Badge no menu lateral indicando quantidade de insights com status new
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

import { GET } from "@/app/api/insights/new-count/route";

const mockProfile = { tenant_id: "tenant-1", id: "user-1" };

function setupMockCountChain(response: { count: number | null; error: unknown }) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    then: (resolve: (v: unknown) => unknown) =>
      Promise.resolve(response).then(resolve),
  };
  mockFrom.mockReturnValue(chain);
  return chain;
}

describe("GET /api/insights/new-count", () => {
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

  it("should return count of new insights", async () => {
    setupMockCountChain({ count: 5, error: null });

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.count).toBe(5);
  });

  it("should return 0 when count is null", async () => {
    setupMockCountChain({ count: null, error: null });

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.count).toBe(0);
  });

  it("should return 0 when no new insights", async () => {
    setupMockCountChain({ count: 0, error: null });

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.count).toBe(0);
  });

  it("should return 500 on database error", async () => {
    setupMockCountChain({ count: null, error: { message: "DB error" } });

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.error.code).toBe("INTERNAL_ERROR");
  });

  it("should filter by tenant_id and status=new", async () => {
    const chain = setupMockCountChain({ count: 3, error: null });

    await GET();

    expect(chain.eq).toHaveBeenCalledWith("tenant_id", "tenant-1");
    expect(chain.eq).toHaveBeenCalledWith("status", "new");
  });
});
