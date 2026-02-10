/**
 * Unit Tests for /api/campaigns
 * Story 5.1: Campaigns Page & Data Model
 *
 * AC: #1 - View campaigns list with lead count
 * AC: #4 - Create new campaign with status draft
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/campaigns/route";
import { createChainBuilder } from "../../helpers/mock-supabase";

// Mock getCurrentUserProfile
const mockGetCurrentUserProfile = vi.fn();

vi.mock("@/lib/supabase/tenant", () => ({
  getCurrentUserProfile: () => mockGetCurrentUserProfile(),
}));

// Mock Supabase (still needed for DB operations)
const mockFrom = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({
    from: mockFrom,
  })),
}));

describe("Campaigns API", () => {
  const mockUserId = "user-123";
  const mockTenantId = "tenant-456";

  const mockCampaigns = [
    {
      id: "campaign-1",
      tenant_id: mockTenantId,
      name: "Q1 Outreach",
      status: "active",
      created_at: "2026-02-01T10:00:00Z",
      updated_at: "2026-02-01T10:00:00Z",
      lead_count: [{ count: 25 }],
    },
    {
      id: "campaign-2",
      tenant_id: mockTenantId,
      name: "Welcome Series",
      status: "draft",
      created_at: "2026-01-30T10:00:00Z",
      updated_at: "2026-01-30T10:00:00Z",
      lead_count: [{ count: 0 }],
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockImplementation(() => createChainBuilder());
  });

  describe("GET /api/campaigns (AC: #1, #5)", () => {
    function setupGetMocks(campaigns = mockCampaigns) {
      mockGetCurrentUserProfile.mockResolvedValue({
        id: mockUserId,
        tenant_id: mockTenantId,
        role: "user",
      });

      const campaignsChain = createChainBuilder({
        data: campaigns,
        error: null,
      });

      mockFrom.mockImplementation(() => campaignsChain);

      return { campaignsChain };
    }

    it("should return 401 when user is not authenticated", async () => {
      mockGetCurrentUserProfile.mockResolvedValue(null);

      const response = await GET();
      const body = await response.json();

      expect(response.status).toBe(401);
      expect(body.error.code).toBe("UNAUTHORIZED");
      expect(body.error.message).toBe("Nao autenticado");
    });

    it("should return campaigns with lead counts", async () => {
      setupGetMocks();

      const response = await GET();
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.data).toHaveLength(2);
      expect(body.data[0].leadCount).toBe(25);
      expect(body.data[1].leadCount).toBe(0);
    });

    it("should transform snake_case to camelCase", async () => {
      setupGetMocks();

      const response = await GET();
      const body = await response.json();

      expect(body.data[0]).toMatchObject({
        id: "campaign-1",
        tenantId: mockTenantId,
        name: "Q1 Outreach",
        status: "active",
        createdAt: "2026-02-01T10:00:00Z",
        updatedAt: "2026-02-01T10:00:00Z",
        leadCount: 25,
      });
    });

    it("should order campaigns by created_at DESC", async () => {
      const { campaignsChain } = setupGetMocks();

      await GET();

      expect(campaignsChain.order).toHaveBeenCalledWith("created_at", {
        ascending: false,
      });
    });

    it("should return empty array when no campaigns exist", async () => {
      setupGetMocks([]);

      const response = await GET();
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.data).toEqual([]);
    });

    it("should handle campaigns with empty lead_count array", async () => {
      const campaignsWithEmptyCount = [
        {
          id: "campaign-1",
          tenant_id: mockTenantId,
          name: "Test",
          status: "draft",
          created_at: "2026-02-01T10:00:00Z",
          updated_at: "2026-02-01T10:00:00Z",
          lead_count: [],
        },
      ];
      setupGetMocks(campaignsWithEmptyCount);

      const response = await GET();
      const body = await response.json();

      expect(body.data[0].leadCount).toBe(0);
    });

    it("should return 500 on database error", async () => {
      mockGetCurrentUserProfile.mockResolvedValue({
        id: mockUserId,
        tenant_id: mockTenantId,
        role: "user",
      });

      const errorChain = createChainBuilder({
        data: null,
        error: { message: "Database error" },
      });
      mockFrom.mockImplementation(() => errorChain);

      const response = await GET();
      const body = await response.json();

      expect(response.status).toBe(500);
      expect(body.error.code).toBe("INTERNAL_ERROR");
      expect(body.error.message).toBe("Erro ao buscar campanhas");
    });
  });

  describe("POST /api/campaigns (AC: #4)", () => {
    function createRequest(body: unknown): NextRequest {
      return new NextRequest("http://localhost:3000/api/campaigns", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
      });
    }

    function setupPostMocks() {
      mockGetCurrentUserProfile.mockResolvedValue({
        id: mockUserId,
        tenant_id: mockTenantId,
        role: "user",
      });

      const insertChain = createChainBuilder({
        data: {
          id: "campaign-new",
          tenant_id: mockTenantId,
          name: "New Campaign",
          status: "draft",
          created_at: "2026-02-02T10:00:00Z",
          updated_at: "2026-02-02T10:00:00Z",
        },
        error: null,
      });

      mockFrom.mockImplementation((table: string) => {
        if (table === "campaigns") return insertChain;
        return createChainBuilder();
      });

      return { insertChain };
    }

    it("should return 401 when user is not authenticated", async () => {
      mockGetCurrentUserProfile.mockResolvedValue(null);

      const request = createRequest({ name: "Test Campaign" });
      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(401);
      expect(body.error.code).toBe("UNAUTHORIZED");
    });

    it("should return 401 when profile not found (no tenant)", async () => {
      mockGetCurrentUserProfile.mockResolvedValue(null);

      const request = createRequest({ name: "Test Campaign" });
      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(401);
      expect(body.error.code).toBe("UNAUTHORIZED");
      expect(body.error.message).toBe("Nao autenticado");
    });

    it("should create campaign with status draft", async () => {
      const { insertChain } = setupPostMocks();

      const request = createRequest({ name: "New Campaign" });
      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(201);
      expect(body.data.status).toBe("draft");
      expect(body.data.leadCount).toBe(0);

      expect(insertChain.insert).toHaveBeenCalledWith({
        tenant_id: mockTenantId,
        name: "New Campaign",
        status: "draft",
      });
    });

    it("should transform response to camelCase", async () => {
      setupPostMocks();

      const request = createRequest({ name: "New Campaign" });
      const response = await POST(request);
      const body = await response.json();

      expect(body.data).toMatchObject({
        id: "campaign-new",
        tenantId: mockTenantId,
        name: "New Campaign",
        status: "draft",
        leadCount: 0,
      });
    });

    it("should return 400 for empty name", async () => {
      setupPostMocks();

      const request = createRequest({ name: "" });
      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error.code).toBe("VALIDATION_ERROR");
      expect(body.error.message).toBe("Nome e obrigatorio");
    });

    it("should return 400 for name exceeding 200 characters", async () => {
      setupPostMocks();

      const longName = "a".repeat(201);
      const request = createRequest({ name: longName });
      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error.code).toBe("VALIDATION_ERROR");
      expect(body.error.message).toBe("Nome muito longo");
    });

    it("should return 400 for missing name field", async () => {
      setupPostMocks();

      const request = createRequest({});
      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error.code).toBe("VALIDATION_ERROR");
    });

    it("should return 500 on database error", async () => {
      mockGetCurrentUserProfile.mockResolvedValue({
        id: mockUserId,
        tenant_id: mockTenantId,
        role: "user",
      });

      const insertChain = createChainBuilder({
        data: null,
        error: { message: "Database error" },
      });

      mockFrom.mockImplementation((table: string) => {
        if (table === "campaigns") return insertChain;
        return createChainBuilder();
      });

      const request = createRequest({ name: "Test Campaign" });
      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(500);
      expect(body.error.code).toBe("INTERNAL_ERROR");
      expect(body.error.message).toBe("Erro ao criar campanha");
    });

    it("should return 400 for invalid JSON body", async () => {
      mockGetCurrentUserProfile.mockResolvedValue({
        id: mockUserId,
        tenant_id: mockTenantId,
        role: "user",
      });

      // Create request with invalid JSON
      const request = new NextRequest("http://localhost:3000/api/campaigns", {
        method: "POST",
        body: "invalid json {",
        headers: { "Content-Type": "application/json" },
      });

      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error.code).toBe("INVALID_JSON");
      expect(body.error.message).toBe("Corpo da requisicao invalido");
    });
  });
});
