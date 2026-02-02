/**
 * Unit Tests for /api/campaigns/[campaignId]
 * Story 5.2: Campaign Builder Canvas
 * Story 5.9: Campaign Save & Multiple Campaigns
 *
 * AC 5.2: #1 - Route to builder page, handle 404
 * AC 5.9: #1, #3 - Salvar campanha e blocos
 *
 * Tests: GET single campaign by ID, PATCH campaign
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET, PATCH } from "@/app/api/campaigns/[campaignId]/route";

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

// ==============================================
// PATCH Tests - Story 5.9
// ==============================================

describe("PATCH /api/campaigns/[campaignId] (AC 5.9: #1, #3)", () => {
  const mockUserId = "user-123";
  const mockTenantId = "tenant-456";
  const mockCampaignId = "550e8400-e29b-41d4-a716-446655440000";

  const mockCampaign = {
    id: mockCampaignId,
    tenant_id: mockTenantId,
    name: "Updated Campaign",
    status: "draft",
    created_at: "2026-02-02T10:00:00Z",
    updated_at: "2026-02-02T12:00:00Z",
    lead_count: [{ count: 10 }],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function createRouteParams(campaignId: string) {
    return {
      params: Promise.resolve({ campaignId }),
    };
  }

  function createPatchRequest(campaignId: string, body: unknown) {
    return new Request(`http://localhost:3000/api/campaigns/${campaignId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  function setupPatchMocks() {
    mockGetUser.mockResolvedValue({
      data: { user: { id: mockUserId } },
    });

    const updateChain = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    };

    const deleteChain = {
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    };

    const insertChain = {
      insert: vi.fn().mockResolvedValue({ error: null }),
    };

    const selectChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: mockCampaign,
        error: null,
      }),
    };

    mockFrom.mockImplementation((table: string) => {
      if (table === "campaigns") {
        return {
          ...updateChain,
          ...selectChain,
        };
      }
      if (table === "email_blocks" || table === "delay_blocks") {
        return {
          ...deleteChain,
          ...insertChain,
        };
      }
      return {};
    });

    return { updateChain, deleteChain, insertChain, selectChain };
  }

  it("should return 401 when user is not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const request = createPatchRequest(mockCampaignId, { name: "New Name" });
    const response = await PATCH(request, createRouteParams(mockCampaignId));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("should return 400 for invalid UUID format", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: mockUserId } },
    });

    const invalidId = "not-a-valid-uuid";
    const request = createPatchRequest(invalidId, { name: "New Name" });
    const response = await PATCH(request, createRouteParams(invalidId));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.message).toBe("ID de campanha invalido");
  });

  it("should return 400 for invalid JSON body", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: mockUserId } },
    });

    const request = new Request(
      `http://localhost:3000/api/campaigns/${mockCampaignId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: "invalid json",
      }
    );
    const response = await PATCH(request, createRouteParams(mockCampaignId));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.message).toBe("Body JSON invalido");
  });

  it("should update campaign name successfully", async () => {
    setupPatchMocks();

    const request = createPatchRequest(mockCampaignId, { name: "New Campaign Name" });
    const response = await PATCH(request, createRouteParams(mockCampaignId));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.name).toBe("Updated Campaign");
    expect(mockFrom).toHaveBeenCalledWith("campaigns");
  });

  it("should save blocks (email + delay) successfully", async () => {
    setupPatchMocks();

    const blocks = [
      {
        id: "550e8400-e29b-41d4-a716-446655440001",
        type: "email",
        position: 0,
        data: { subject: "Hello", body: "World" },
      },
      {
        id: "550e8400-e29b-41d4-a716-446655440002",
        type: "delay",
        position: 1,
        data: { delayValue: 2, delayUnit: "days" },
      },
    ];

    const request = createPatchRequest(mockCampaignId, { blocks });
    const response = await PATCH(request, createRouteParams(mockCampaignId));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toBeDefined();
    expect(mockFrom).toHaveBeenCalledWith("email_blocks");
    expect(mockFrom).toHaveBeenCalledWith("delay_blocks");
  });

  it("should update both name and blocks in one request", async () => {
    setupPatchMocks();

    const request = createPatchRequest(mockCampaignId, {
      name: "New Name",
      blocks: [
        {
          id: "550e8400-e29b-41d4-a716-446655440001",
          type: "email",
          position: 0,
          data: { subject: "Test", body: "Body" },
        },
      ],
    });
    const response = await PATCH(request, createRouteParams(mockCampaignId));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toBeDefined();
  });

  it("should handle empty blocks array (clear all blocks)", async () => {
    setupPatchMocks();

    const request = createPatchRequest(mockCampaignId, { blocks: [] });
    const response = await PATCH(request, createRouteParams(mockCampaignId));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toBeDefined();
  });

  it("should return validation error for invalid block type", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: mockUserId } },
    });

    const request = createPatchRequest(mockCampaignId, {
      blocks: [
        {
          id: "550e8400-e29b-41d4-a716-446655440001",
          type: "invalid",
          position: 0,
          data: {},
        },
      ],
    });
    const response = await PATCH(request, createRouteParams(mockCampaignId));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("should return validation error for name too long", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: mockUserId } },
    });

    const longName = "a".repeat(201);
    const request = createPatchRequest(mockCampaignId, { name: longName });
    const response = await PATCH(request, createRouteParams(mockCampaignId));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("should return 500 on database error when updating name", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: mockUserId } },
    });

    mockFrom.mockImplementation(() => ({
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({
        error: { code: "UNKNOWN", message: "Database error" },
      }),
    }));

    const request = createPatchRequest(mockCampaignId, { name: "New Name" });
    const response = await PATCH(request, createRouteParams(mockCampaignId));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error.code).toBe("INTERNAL_ERROR");
    expect(body.error.message).toBe("Erro ao atualizar nome da campanha");
  });

  it("should return updated campaign with leadCount", async () => {
    setupPatchMocks();

    const request = createPatchRequest(mockCampaignId, { name: "Test" });
    const response = await PATCH(request, createRouteParams(mockCampaignId));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.leadCount).toBe(10);
    expect(body.data.tenantId).toBe(mockTenantId);
  });

  // CR-1 FIX: Test for campaign not found when saving blocks
  it("should return 404 when campaign does not exist (blocks update)", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: mockUserId } },
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === "campaigns") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: null,
            error: { code: "PGRST116", message: "Row not found" },
          }),
        };
      }
      return {};
    });

    const request = createPatchRequest(mockCampaignId, {
      blocks: [
        {
          id: "550e8400-e29b-41d4-a716-446655440001",
          type: "email",
          position: 0,
          data: { subject: "Test", body: "Body" },
        },
      ],
    });
    const response = await PATCH(request, createRouteParams(mockCampaignId));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("NOT_FOUND");
    expect(body.error.message).toBe("Campanha nao encontrada");
  });

  // CR-6 FIX: Test for delete email_blocks error
  it("should return 500 on database error when deleting email blocks", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: mockUserId } },
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === "campaigns") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { id: mockCampaignId },
            error: null,
          }),
        };
      }
      if (table === "email_blocks") {
        return {
          delete: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({
            error: { code: "UNKNOWN", message: "Database error" },
          }),
        };
      }
      return {};
    });

    const request = createPatchRequest(mockCampaignId, {
      blocks: [
        {
          id: "550e8400-e29b-41d4-a716-446655440001",
          type: "email",
          position: 0,
          data: { subject: "Test", body: "Body" },
        },
      ],
    });
    const response = await PATCH(request, createRouteParams(mockCampaignId));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error.code).toBe("INTERNAL_ERROR");
    expect(body.error.message).toBe("Erro ao remover blocos antigos");
  });

  // CR-6 FIX: Test for delete delay_blocks error
  it("should return 500 on database error when deleting delay blocks", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: mockUserId } },
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === "campaigns") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { id: mockCampaignId },
            error: null,
          }),
        };
      }
      if (table === "email_blocks") {
        return {
          delete: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ error: null }),
        };
      }
      if (table === "delay_blocks") {
        return {
          delete: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({
            error: { code: "UNKNOWN", message: "Database error" },
          }),
        };
      }
      return {};
    });

    const request = createPatchRequest(mockCampaignId, {
      blocks: [
        {
          id: "550e8400-e29b-41d4-a716-446655440001",
          type: "delay",
          position: 0,
          data: { delayValue: 2, delayUnit: "days" },
        },
      ],
    });
    const response = await PATCH(request, createRouteParams(mockCampaignId));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error.code).toBe("INTERNAL_ERROR");
    expect(body.error.message).toBe("Erro ao remover blocos antigos");
  });
});
