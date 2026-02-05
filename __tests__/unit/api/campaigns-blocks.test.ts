/**
 * Unit Tests for /api/campaigns/[campaignId]/blocks
 * Story 5.9: Campaign Save & Multiple Campaigns
 *
 * AC: #2, #7 - Carregar blocos existentes
 *
 * Tests: GET campaign blocks
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "@/app/api/campaigns/[campaignId]/blocks/route";

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

describe("GET /api/campaigns/[campaignId]/blocks (AC: #2, #7)", () => {
  const mockUserId = "user-123";
  const mockCampaignId = "550e8400-e29b-41d4-a716-446655440000";

  const mockEmailBlocks = [
    {
      id: "email-1",
      campaign_id: mockCampaignId,
      position: 0,
      subject: "Primeiro email",
      body: "Corpo do primeiro email",
      created_at: "2026-02-02T10:00:00Z",
      updated_at: "2026-02-02T10:00:00Z",
    },
    {
      id: "email-2",
      campaign_id: mockCampaignId,
      position: 2,
      subject: "Segundo email",
      body: "Corpo do segundo email",
      created_at: "2026-02-02T10:00:00Z",
      updated_at: "2026-02-02T10:00:00Z",
    },
  ];

  const mockDelayBlocks = [
    {
      id: "delay-1",
      campaign_id: mockCampaignId,
      position: 1,
      delay_value: 2,
      delay_unit: "days",
      created_at: "2026-02-02T10:00:00Z",
      updated_at: "2026-02-02T10:00:00Z",
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function createRouteParams(campaignId: string) {
    return {
      params: Promise.resolve({ campaignId }),
    };
  }

  function setupGetMocks(emailBlocks = mockEmailBlocks, delayBlocks = mockDelayBlocks) {
    mockGetUser.mockResolvedValue({
      data: { user: { id: mockUserId } },
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === "email_blocks") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({
            data: emailBlocks,
            error: null,
          }),
        };
      }
      if (table === "delay_blocks") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({
            data: delayBlocks,
            error: null,
          }),
        };
      }
      return {};
    });
  }

  it("should return 401 when user is not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const request = new Request(
      `http://localhost:3000/api/campaigns/${mockCampaignId}/blocks`
    );
    const response = await GET(request, createRouteParams(mockCampaignId));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("UNAUTHORIZED");
    expect(body.error.message).toBe("Nao autenticado");
  });

  it("should return 400 for invalid UUID format", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: mockUserId } },
    });

    const invalidId = "not-a-valid-uuid";
    const request = new Request(
      `http://localhost:3000/api/campaigns/${invalidId}/blocks`
    );
    const response = await GET(request, createRouteParams(invalidId));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.message).toBe("ID de campanha invalido");
  });

  it("should return empty array for campaign without blocks", async () => {
    setupGetMocks([], []);

    const request = new Request(
      `http://localhost:3000/api/campaigns/${mockCampaignId}/blocks`
    );
    const response = await GET(request, createRouteParams(mockCampaignId));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual([]);
  });

  it("should return email and delay blocks sorted by position", async () => {
    setupGetMocks();

    const request = new Request(
      `http://localhost:3000/api/campaigns/${mockCampaignId}/blocks`
    );
    const response = await GET(request, createRouteParams(mockCampaignId));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toHaveLength(3);

    // Check order by position
    expect(body.data[0].position).toBe(0);
    expect(body.data[1].position).toBe(1);
    expect(body.data[2].position).toBe(2);

    // Check types
    expect(body.data[0].type).toBe("email");
    expect(body.data[1].type).toBe("delay");
    expect(body.data[2].type).toBe("email");
  });

  it("should transform email blocks to BuilderBlock format", async () => {
    setupGetMocks();

    const request = new Request(
      `http://localhost:3000/api/campaigns/${mockCampaignId}/blocks`
    );
    const response = await GET(request, createRouteParams(mockCampaignId));
    const body = await response.json();

    const emailBlock = body.data.find(
      (b: { type: string; position: number }) => b.type === "email" && b.position === 0
    );

    expect(emailBlock).toMatchObject({
      id: "email-1",
      type: "email",
      position: 0,
      data: {
        subject: "Primeiro email",
        body: "Corpo do primeiro email",
      },
    });
  });

  it("should transform delay blocks to BuilderBlock format", async () => {
    setupGetMocks();

    const request = new Request(
      `http://localhost:3000/api/campaigns/${mockCampaignId}/blocks`
    );
    const response = await GET(request, createRouteParams(mockCampaignId));
    const body = await response.json();

    const delayBlock = body.data.find(
      (b: { type: string }) => b.type === "delay"
    );

    expect(delayBlock).toMatchObject({
      id: "delay-1",
      type: "delay",
      position: 1,
      data: {
        delayValue: 2,
        delayUnit: "days",
      },
    });
  });

  it("should handle null subject and body in email blocks", async () => {
    const emailBlocksWithNulls = [
      {
        id: "email-null",
        campaign_id: mockCampaignId,
        position: 0,
        subject: null as unknown as string,
        body: null as unknown as string,
        created_at: "2026-02-02T10:00:00Z",
        updated_at: "2026-02-02T10:00:00Z",
      },
    ];
    setupGetMocks(emailBlocksWithNulls, []);

    const request = new Request(
      `http://localhost:3000/api/campaigns/${mockCampaignId}/blocks`
    );
    const response = await GET(request, createRouteParams(mockCampaignId));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data[0].data).toMatchObject({
      subject: "",
      body: "",
    });
  });

  it("should return 500 on email blocks database error", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: mockUserId } },
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === "email_blocks") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({
            data: null,
            error: { code: "UNKNOWN", message: "Database error" },
          }),
        };
      }
      return {};
    });

    const request = new Request(
      `http://localhost:3000/api/campaigns/${mockCampaignId}/blocks`
    );
    const response = await GET(request, createRouteParams(mockCampaignId));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error.code).toBe("INTERNAL_ERROR");
    expect(body.error.message).toBe("Erro ao buscar blocos de email");
  });

  it("should return 500 on delay blocks database error", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: mockUserId } },
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === "email_blocks") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({
            data: [],
            error: null,
          }),
        };
      }
      if (table === "delay_blocks") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({
            data: null,
            error: { code: "UNKNOWN", message: "Database error" },
          }),
        };
      }
      return {};
    });

    const request = new Request(
      `http://localhost:3000/api/campaigns/${mockCampaignId}/blocks`
    );
    const response = await GET(request, createRouteParams(mockCampaignId));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error.code).toBe("INTERNAL_ERROR");
    expect(body.error.message).toBe("Erro ao buscar blocos de delay");
  });

  it("should query correct tables with campaignId", async () => {
    setupGetMocks();

    const request = new Request(
      `http://localhost:3000/api/campaigns/${mockCampaignId}/blocks`
    );
    await GET(request, createRouteParams(mockCampaignId));

    expect(mockFrom).toHaveBeenCalledWith("email_blocks");
    expect(mockFrom).toHaveBeenCalledWith("delay_blocks");
  });

  it("should handle only email blocks (no delays)", async () => {
    setupGetMocks(mockEmailBlocks, []);

    const request = new Request(
      `http://localhost:3000/api/campaigns/${mockCampaignId}/blocks`
    );
    const response = await GET(request, createRouteParams(mockCampaignId));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toHaveLength(2);
    expect(body.data.every((b: { type: string }) => b.type === "email")).toBe(true);
  });

  it("should handle only delay blocks (no emails)", async () => {
    setupGetMocks([], mockDelayBlocks);

    const request = new Request(
      `http://localhost:3000/api/campaigns/${mockCampaignId}/blocks`
    );
    const response = await GET(request, createRouteParams(mockCampaignId));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].type).toBe("delay");
  });
});
