/**
 * Unit Tests for /api/campaigns/[campaignId]
 * Story 5.2: Campaign Builder Canvas
 *
 * AC: #1 - Route to builder page, handle 404
 *
 * Tests: GET single campaign by ID
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "@/app/api/campaigns/[campaignId]/route";

// Mock Supabase
const mockFrom = vi.fn();
const mockGetUser = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: mockGetUser,
    },
    from: mockFrom,
  })),
}));

describe("GET /api/campaigns/[campaignId] (AC: #1)", () => {
  const mockUserId = "user-123";
  const mockTenantId = "tenant-456";
  const mockCampaignId = "550e8400-e29b-41d4-a716-446655440000";

  const mockCampaign = {
    id: mockCampaignId,
    tenant_id: mockTenantId,
    name: "Q1 Prospeccao",
    status: "draft",
    created_at: "2026-02-02T10:00:00Z",
    updated_at: "2026-02-02T10:00:00Z",
    lead_count: [{ count: 15 }],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function createRouteParams(campaignId: string) {
    return {
      params: Promise.resolve({ campaignId }),
    };
  }

  function setupGetMocks(campaign = mockCampaign) {
    mockGetUser.mockResolvedValue({
      data: { user: { id: mockUserId } },
    });

    const campaignChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: campaign,
        error: null,
      }),
    };

    mockFrom.mockImplementation(() => campaignChain);

    return { campaignChain };
  }

  it("should return 401 when user is not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const request = new Request("http://localhost:3000/api/campaigns/" + mockCampaignId);
    const response = await GET(request, createRouteParams(mockCampaignId));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("UNAUTHORIZED");
    expect(body.error.message).toBe("Nao autenticado");
  });

  it("should return campaign with lead count", async () => {
    setupGetMocks();

    const request = new Request("http://localhost:3000/api/campaigns/" + mockCampaignId);
    const response = await GET(request, createRouteParams(mockCampaignId));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.id).toBe(mockCampaignId);
    expect(body.data.leadCount).toBe(15);
  });

  it("should transform snake_case to camelCase", async () => {
    setupGetMocks();

    const request = new Request("http://localhost:3000/api/campaigns/" + mockCampaignId);
    const response = await GET(request, createRouteParams(mockCampaignId));
    const body = await response.json();

    expect(body.data).toMatchObject({
      id: mockCampaignId,
      tenantId: mockTenantId,
      name: "Q1 Prospeccao",
      status: "draft",
      createdAt: "2026-02-02T10:00:00Z",
      updatedAt: "2026-02-02T10:00:00Z",
      leadCount: 15,
    });
  });

  it("should return 404 for non-existent campaign", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: mockUserId } },
    });

    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: null,
        error: { code: "PGRST116", message: "Row not found" },
      }),
    }));

    const request = new Request("http://localhost:3000/api/campaigns/" + mockCampaignId);
    const response = await GET(request, createRouteParams(mockCampaignId));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("NOT_FOUND");
    expect(body.error.message).toBe("Campanha nao encontrada");
  });

  it("should return 400 for invalid UUID format", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: mockUserId } },
    });

    const invalidId = "not-a-valid-uuid";
    const request = new Request("http://localhost:3000/api/campaigns/" + invalidId);
    const response = await GET(request, createRouteParams(invalidId));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.message).toBe("ID de campanha invalido");
  });

  it("should handle campaign with empty lead_count array", async () => {
    const campaignNoLeads = {
      ...mockCampaign,
      lead_count: [],
    };
    setupGetMocks(campaignNoLeads);

    const request = new Request("http://localhost:3000/api/campaigns/" + mockCampaignId);
    const response = await GET(request, createRouteParams(mockCampaignId));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.leadCount).toBe(0);
  });

  it("should return 500 on database error", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: mockUserId } },
    });

    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: null,
        error: { code: "UNKNOWN", message: "Database error" },
      }),
    }));

    const request = new Request("http://localhost:3000/api/campaigns/" + mockCampaignId);
    const response = await GET(request, createRouteParams(mockCampaignId));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error.code).toBe("INTERNAL_ERROR");
    expect(body.error.message).toBe("Erro ao buscar campanha");
  });

  it("should query correct table with campaignId", async () => {
    const { campaignChain } = setupGetMocks();

    const request = new Request("http://localhost:3000/api/campaigns/" + mockCampaignId);
    await GET(request, createRouteParams(mockCampaignId));

    expect(mockFrom).toHaveBeenCalledWith("campaigns");
    expect(campaignChain.eq).toHaveBeenCalledWith("id", mockCampaignId);
  });
});
