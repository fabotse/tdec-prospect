/**
 * Tests for GET /api/insights
 * Story 13.6: Pagina de Insights - UI
 *
 * AC: #2 - Tabela de insights com colunas
 * AC: #5, #6 - Status transitions
 * AC: #7 - Filtros: status, periodo
 * AC: #8 - Ordenacao padrao: mais recentes primeiro
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

import { GET } from "@/app/api/insights/route";

function makeRequest(params: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/insights");
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  return new NextRequest(url);
}

const mockProfile = { tenant_id: "tenant-1", id: "user-1" };

// Mock insight row with lead join data
function makeMockInsightRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "insight-1",
    tenant_id: "tenant-1",
    lead_id: "lead-1",
    post_url: "https://linkedin.com/post/1",
    post_text: "Interesting post about AI",
    post_published_at: "2026-02-20T10:00:00Z",
    relevance_reasoning: "Relevant to product",
    suggestion: "Approach with AI angle",
    status: "new",
    created_at: "2026-02-25T10:00:00Z",
    updated_at: "2026-02-25T10:00:00Z",
    leads: {
      id: "lead-1",
      first_name: "John",
      last_name: "Doe",
      photo_url: "https://example.com/photo.jpg",
      company_name: "Acme Inc",
      title: "CTO",
      linkedin_url: "https://linkedin.com/in/johndoe",
    },
    ...overrides,
  };
}

function setupMockChain(response: { data: unknown; error: unknown; count?: number }) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    then: (resolve: (v: unknown) => unknown) =>
      Promise.resolve(response).then(resolve),
  };
  mockFrom.mockReturnValue(chain);
  return chain;
}

describe("GET /api/insights", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
  });

  it("should return 401 when not authenticated", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(null);

    const response = await GET(makeRequest());
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json.error.code).toBe("UNAUTHORIZED");
  });

  it("should return insights with lead data", async () => {
    const rows = [makeMockInsightRow()];
    setupMockChain({ data: rows, error: null, count: 1 });

    const response = await GET(makeRequest());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data).toHaveLength(1);
    expect(json.data[0].id).toBe("insight-1");
    expect(json.data[0].lead.firstName).toBe("John");
    expect(json.data[0].lead.lastName).toBe("Doe");
    expect(json.data[0].lead.companyName).toBe("Acme Inc");
    expect(json.meta.total).toBe(1);
    expect(json.meta.page).toBe(1);
    expect(json.meta.limit).toBe(25);
  });

  it("should apply status filter", async () => {
    const chain = setupMockChain({ data: [], error: null, count: 0 });

    await GET(makeRequest({ status: "new,used" }));

    expect(chain.in).toHaveBeenCalledWith("status", ["new", "used"]);
  });

  it("should apply period filter", async () => {
    const chain = setupMockChain({ data: [], error: null, count: 0 });

    await GET(makeRequest({ period: "7d" }));

    expect(chain.gte).toHaveBeenCalledWith("created_at", expect.any(String));
  });

  it("should not apply period filter for 'all'", async () => {
    const chain = setupMockChain({ data: [], error: null, count: 0 });

    await GET(makeRequest({ period: "all" }));

    expect(chain.gte).not.toHaveBeenCalled();
  });

  it("should apply pagination defaults", async () => {
    const chain = setupMockChain({ data: [], error: null, count: 0 });

    await GET(makeRequest());

    expect(chain.range).toHaveBeenCalledWith(0, 24);
    expect(chain.order).toHaveBeenCalledWith("created_at", { ascending: false });
  });

  it("should apply custom pagination", async () => {
    const chain = setupMockChain({ data: [], error: null, count: 0 });

    await GET(makeRequest({ page: "2", per_page: "10" }));

    expect(chain.range).toHaveBeenCalledWith(10, 19);
  });

  it("should clamp per_page to max 100", async () => {
    const chain = setupMockChain({ data: [], error: null, count: 0 });

    await GET(makeRequest({ per_page: "200" }));

    expect(chain.range).toHaveBeenCalledWith(0, 99);
  });

  it("should clamp page to min 1", async () => {
    const chain = setupMockChain({ data: [], error: null, count: 0 });

    await GET(makeRequest({ page: "-5" }));

    expect(chain.range).toHaveBeenCalledWith(0, 24);
  });

  it("should return empty data array when no insights", async () => {
    setupMockChain({ data: [], error: null, count: 0 });

    const response = await GET(makeRequest());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data).toEqual([]);
    expect(json.meta.total).toBe(0);
    expect(json.meta.totalPages).toBe(0);
  });

  it("should return 500 on database error", async () => {
    setupMockChain({ data: null, error: { message: "DB error" }, count: 0 });

    const response = await GET(makeRequest());
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.error.code).toBe("INTERNAL_ERROR");
  });

  it("should transform snake_case to camelCase", async () => {
    const rows = [makeMockInsightRow()];
    setupMockChain({ data: rows, error: null, count: 1 });

    const response = await GET(makeRequest());
    const json = await response.json();

    const insight = json.data[0];
    expect(insight.postUrl).toBe("https://linkedin.com/post/1");
    expect(insight.postText).toBe("Interesting post about AI");
    expect(insight.createdAt).toBe("2026-02-25T10:00:00Z");
    expect(insight.tenantId).toBe("tenant-1");
    expect(insight.leadId).toBe("lead-1");
  });

  it("should handle null lead data gracefully", async () => {
    const rows = [makeMockInsightRow({
      leads: {
        id: "lead-1",
        first_name: "Jane",
        last_name: null,
        photo_url: null,
        company_name: null,
        title: null,
        linkedin_url: null,
      },
    })];
    setupMockChain({ data: rows, error: null, count: 1 });

    const response = await GET(makeRequest());
    const json = await response.json();

    expect(json.data[0].lead.lastName).toBeNull();
    expect(json.data[0].lead.photoUrl).toBeNull();
    expect(json.data[0].lead.companyName).toBeNull();
  });

  it("should calculate totalPages correctly", async () => {
    setupMockChain({ data: [], error: null, count: 75 });

    const response = await GET(makeRequest({ per_page: "25" }));
    const json = await response.json();

    expect(json.meta.totalPages).toBe(3);
  });

  it("should filter by tenant_id", async () => {
    const chain = setupMockChain({ data: [], error: null, count: 0 });

    await GET(makeRequest());

    expect(chain.eq).toHaveBeenCalledWith("tenant_id", "tenant-1");
  });
});
