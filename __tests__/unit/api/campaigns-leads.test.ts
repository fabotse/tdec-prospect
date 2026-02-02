/**
 * Tests for Campaign Leads API Routes
 * Story 5.7: Campaign Lead Association
 *
 * AC: #4 - Add leads to campaign
 * AC: #7 - View leads associated (GET)
 * AC: #8 - Remove leads from campaign
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Mock Supabase
const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockOrder = vi.fn();
const mockUpsert = vi.fn();
const mockDelete = vi.fn();
const mockFrom = vi.fn();
const mockGetUser = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() =>
    Promise.resolve({
      auth: {
        getUser: mockGetUser,
      },
      from: mockFrom,
    })
  ),
}));

// Import after mocks
import { GET, POST } from "@/app/api/campaigns/[campaignId]/leads/route";
import { DELETE } from "@/app/api/campaigns/[campaignId]/leads/[leadId]/route";

describe("Campaign Leads API Routes (Story 5.7)", () => {
  const validCampaignId = "12345678-1234-1234-1234-123456789012";
  const validLeadId = "87654321-abcd-abcd-abcd-123456789abc";
  const mockUser = { id: "user-123" };

  beforeEach(() => {
    vi.clearAllMocks();

    // Default: authenticated user
    mockGetUser.mockResolvedValue({ data: { user: mockUser } });

    // Setup chain for from()
    mockFrom.mockReturnValue({
      select: mockSelect,
      upsert: mockUpsert,
      delete: mockDelete,
    });

    mockSelect.mockReturnValue({
      eq: mockEq,
    });

    mockEq.mockReturnValue({
      order: mockOrder,
      eq: mockEq,
    });
  });

  describe("GET /api/campaigns/[campaignId]/leads (AC #7)", () => {
    it("returns campaign leads", async () => {
      const mockLeads = [
        {
          id: "cl-1",
          added_at: "2026-01-30T10:00:00Z",
          lead: {
            id: "lead-1",
            first_name: "John",
            last_name: "Doe",
            email: "john@example.com",
            company_name: "Acme",
            title: "CEO",
            photo_url: null,
          },
        },
      ];

      mockOrder.mockResolvedValue({ data: mockLeads, error: null });

      const request = new Request("http://localhost");
      const response = await GET(request, {
        params: Promise.resolve({ campaignId: validCampaignId }),
      });

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.data).toHaveLength(1);
      expect(json.data[0].lead.first_name).toBe("John");
    });

    it("returns 400 for invalid UUID", async () => {
      const request = new Request("http://localhost");
      const response = await GET(request, {
        params: Promise.resolve({ campaignId: "invalid-uuid" }),
      });

      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error.code).toBe("VALIDATION_ERROR");
    });

    it("returns 401 when not authenticated", async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });

      const request = new Request("http://localhost");
      const response = await GET(request, {
        params: Promise.resolve({ campaignId: validCampaignId }),
      });

      expect(response.status).toBe(401);
      const json = await response.json();
      expect(json.error.code).toBe("UNAUTHORIZED");
    });

    it("returns 500 on database error", async () => {
      mockOrder.mockResolvedValue({
        data: null,
        error: { message: "DB error" },
      });

      const request = new Request("http://localhost");
      const response = await GET(request, {
        params: Promise.resolve({ campaignId: validCampaignId }),
      });

      expect(response.status).toBe(500);
      const json = await response.json();
      expect(json.error.code).toBe("INTERNAL_ERROR");
    });
  });

  describe("POST /api/campaigns/[campaignId]/leads (AC #4)", () => {
    it("adds leads to campaign", async () => {
      const mockResult = [
        { id: "cl-1", campaign_id: validCampaignId, lead_id: validLeadId },
      ];

      mockUpsert.mockReturnValue({
        select: vi.fn().mockResolvedValue({ data: mockResult, error: null }),
      });

      const request = new NextRequest("http://localhost", {
        method: "POST",
        body: JSON.stringify({ leadIds: [validLeadId] }),
      });

      const response = await POST(request, {
        params: Promise.resolve({ campaignId: validCampaignId }),
      });

      expect(response.status).toBe(201);
      const json = await response.json();
      expect(json.data).toHaveLength(1);
      expect(json.meta.added).toBe(1);
    });

    it("returns 400 for empty leadIds array", async () => {
      const request = new NextRequest("http://localhost", {
        method: "POST",
        body: JSON.stringify({ leadIds: [] }),
      });

      const response = await POST(request, {
        params: Promise.resolve({ campaignId: validCampaignId }),
      });

      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error.code).toBe("VALIDATION_ERROR");
    });

    it("returns 400 for invalid lead UUID", async () => {
      const request = new NextRequest("http://localhost", {
        method: "POST",
        body: JSON.stringify({ leadIds: ["invalid-uuid"] }),
      });

      const response = await POST(request, {
        params: Promise.resolve({ campaignId: validCampaignId }),
      });

      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error.code).toBe("VALIDATION_ERROR");
    });

    it("returns 400 for invalid JSON body", async () => {
      const request = new NextRequest("http://localhost", {
        method: "POST",
        body: "not-json",
      });

      const response = await POST(request, {
        params: Promise.resolve({ campaignId: validCampaignId }),
      });

      expect(response.status).toBe(400);
    });

    it("returns 401 when not authenticated", async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });

      const request = new NextRequest("http://localhost", {
        method: "POST",
        body: JSON.stringify({ leadIds: [validLeadId] }),
      });

      const response = await POST(request, {
        params: Promise.resolve({ campaignId: validCampaignId }),
      });

      expect(response.status).toBe(401);
    });
  });

  describe("DELETE /api/campaigns/[campaignId]/leads/[leadId] (AC #8)", () => {
    it("removes lead from campaign", async () => {
      // Setup delete chain: .delete() -> .eq() -> .eq() -> resolves
      const mockEqSecond = vi.fn().mockResolvedValue({ error: null, count: 1 });
      const mockEqFirst = vi.fn().mockReturnValue({ eq: mockEqSecond });
      mockDelete.mockReturnValue({ eq: mockEqFirst });

      const request = new Request("http://localhost", { method: "DELETE" });
      const response = await DELETE(request, {
        params: Promise.resolve({
          campaignId: validCampaignId,
          leadId: validLeadId,
        }),
      });

      expect(response.status).toBe(204);
    });

    it("returns 400 for invalid campaign UUID", async () => {
      const request = new Request("http://localhost", { method: "DELETE" });
      const response = await DELETE(request, {
        params: Promise.resolve({
          campaignId: "invalid",
          leadId: validLeadId,
        }),
      });

      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error.message).toContain("campanha");
    });

    it("returns 400 for invalid lead UUID", async () => {
      const request = new Request("http://localhost", { method: "DELETE" });
      const response = await DELETE(request, {
        params: Promise.resolve({
          campaignId: validCampaignId,
          leadId: "invalid",
        }),
      });

      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error.message).toContain("lead");
    });

    it("returns 401 when not authenticated", async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });

      // Still need to setup delete chain for when validation passes
      const mockEqSecond = vi.fn().mockResolvedValue({ error: null, count: 1 });
      const mockEqFirst = vi.fn().mockReturnValue({ eq: mockEqSecond });
      mockDelete.mockReturnValue({ eq: mockEqFirst });

      const request = new Request("http://localhost", { method: "DELETE" });
      const response = await DELETE(request, {
        params: Promise.resolve({
          campaignId: validCampaignId,
          leadId: validLeadId,
        }),
      });

      expect(response.status).toBe(401);
    });

    it("returns 404 when lead not in campaign", async () => {
      const mockEqSecond = vi.fn().mockResolvedValue({ error: null, count: 0 });
      const mockEqFirst = vi.fn().mockReturnValue({ eq: mockEqSecond });
      mockDelete.mockReturnValue({ eq: mockEqFirst });

      const request = new Request("http://localhost", { method: "DELETE" });
      const response = await DELETE(request, {
        params: Promise.resolve({
          campaignId: validCampaignId,
          leadId: validLeadId,
        }),
      });

      expect(response.status).toBe(404);
      const json = await response.json();
      expect(json.error.code).toBe("NOT_FOUND");
    });

    it("returns 500 on database error", async () => {
      const mockEqSecond = vi.fn().mockResolvedValue({
        error: { message: "DB error" },
        count: null,
      });
      const mockEqFirst = vi.fn().mockReturnValue({ eq: mockEqSecond });
      mockDelete.mockReturnValue({ eq: mockEqFirst });

      const request = new Request("http://localhost", { method: "DELETE" });
      const response = await DELETE(request, {
        params: Promise.resolve({
          campaignId: validCampaignId,
          leadId: validLeadId,
        }),
      });

      expect(response.status).toBe(500);
    });
  });
});
