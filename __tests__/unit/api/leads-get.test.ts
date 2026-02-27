/**
 * Unit Tests for GET /api/leads
 * Story 4.2.2: My Leads Page
 *
 * AC: #2, #3, #7 - Fetch imported leads with filtering and pagination
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/leads/route";
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

describe("GET /api/leads", () => {
  const mockUserId = "user-123";
  const mockTenantId = "tenant-456";

  const mockLeads = [
    {
      id: "lead-1",
      tenant_id: mockTenantId,
      apollo_id: "apollo-1",
      first_name: "John",
      last_name: "Doe",
      email: "john@example.com",
      phone: "+55 11 99999-9999",
      company_name: "Acme Inc",
      company_size: "11-50",
      industry: "Technology",
      location: "São Paulo, BR",
      title: "CEO",
      linkedin_url: "https://linkedin.com/in/johndoe",
      status: "novo",
      has_email: true,
      has_direct_phone: "yes",
      created_at: "2026-01-30T10:00:00Z",
      updated_at: "2026-01-30T10:00:00Z",
    },
    {
      id: "lead-2",
      tenant_id: mockTenantId,
      apollo_id: "apollo-2",
      first_name: "Jane",
      last_name: "Smith",
      email: "jane@example.com",
      phone: null,
      company_name: "Tech Corp",
      company_size: "51-200",
      industry: "Software",
      location: "Rio de Janeiro, BR",
      title: "CTO",
      linkedin_url: null,
      status: "interessado",
      has_email: true,
      has_direct_phone: null,
      created_at: "2026-01-29T10:00:00Z",
      updated_at: "2026-01-29T10:00:00Z",
    },
  ];

  function createRequest(params: Record<string, string> = {}): NextRequest {
    const searchParams = new URLSearchParams(params);
    const url = `http://localhost:3000/api/leads?${searchParams.toString()}`;
    return new NextRequest(url);
  }

  function setupSuccessMocks(
    leads = mockLeads,
    count = mockLeads.length,
    segmentLeads: { lead_id: string }[] | null = null
  ) {
    mockGetCurrentUserProfile.mockResolvedValue({
      id: mockUserId,
      tenant_id: mockTenantId,
      role: "user",
    });

    // Leads query chain
    const leadsChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockResolvedValue({
        data: leads,
        error: null,
        count,
      }),
    };

    // Segments query chain (for segment filtering)
    const segmentsChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({
        data: segmentLeads,
        error: null,
      }),
    };

    mockFrom.mockImplementation((table: string) => {
      if (table === "lead_segments") return segmentsChain;
      return leadsChain;
    });

    return { leadsChain, segmentsChain };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockImplementation(() => createChainBuilder());
  });

  describe("Authentication", () => {
    it("should return 401 when user is not authenticated", async () => {
      mockGetCurrentUserProfile.mockResolvedValue(null);

      const request = createRequest();
      const response = await GET(request);
      const body = await response.json();

      expect(response.status).toBe(401);
      expect(body.error.code).toBe("UNAUTHORIZED");
      expect(body.error.message).toBe("Não autenticado");
    });

    it("should return 401 when profile not found", async () => {
      mockGetCurrentUserProfile.mockResolvedValue(null);

      const request = createRequest();
      const response = await GET(request);
      const body = await response.json();

      expect(response.status).toBe(401);
      expect(body.error.code).toBe("UNAUTHORIZED");
      expect(body.error.message).toBe("Não autenticado");
    });
  });

  describe("Basic Fetch", () => {
    it("should return leads with pagination metadata", async () => {
      setupSuccessMocks();

      const request = createRequest();
      const response = await GET(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.data).toHaveLength(2);
      expect(body.meta).toEqual({
        total: 2,
        page: 1,
        limit: 25,
        totalPages: 1,
      });
    });

    it("should transform snake_case to camelCase", async () => {
      setupSuccessMocks();

      const request = createRequest();
      const response = await GET(request);
      const body = await response.json();

      expect(body.data[0]).toMatchObject({
        id: "lead-1",
        tenantId: mockTenantId,
        apolloId: "apollo-1",
        firstName: "John",
        lastName: "Doe",
        companyName: "Acme Inc",
        hasEmail: true,
        hasDirectPhone: "yes",
        createdAt: "2026-01-30T10:00:00Z",
      });
    });
  });

  describe("Status Filtering", () => {
    it("should filter by single status", async () => {
      const { leadsChain } = setupSuccessMocks([mockLeads[0]], 1);

      const request = createRequest({ status: "novo" });
      await GET(request);

      expect(leadsChain.in).toHaveBeenCalledWith("status", ["novo"]);
    });

    it("should filter by multiple statuses", async () => {
      const { leadsChain } = setupSuccessMocks();

      const request = createRequest({ status: "novo,interessado" });
      await GET(request);

      expect(leadsChain.in).toHaveBeenCalledWith("status", [
        "novo",
        "interessado",
      ]);
    });
  });

  describe("Segment Filtering", () => {
    it("should filter by segment_id", async () => {
      const segmentId = "segment-123";
      const segmentLeads = [{ lead_id: "lead-1" }];
      const { leadsChain } = setupSuccessMocks([mockLeads[0]], 1, segmentLeads);

      const request = createRequest({ segment_id: segmentId });
      await GET(request);

      expect(leadsChain.in).toHaveBeenCalledWith("id", ["lead-1"]);
    });

    it("should return empty when segment has no leads", async () => {
      setupSuccessMocks([], 0, []);

      const request = createRequest({ segment_id: "empty-segment" });
      const response = await GET(request);
      const body = await response.json();

      expect(body.data).toEqual([]);
      expect(body.meta.total).toBe(0);
    });
  });

  describe("Search Filtering", () => {
    it("should search by name or company (case-insensitive)", async () => {
      const { leadsChain } = setupSuccessMocks([mockLeads[0]], 1);

      const request = createRequest({ search: "john" });
      await GET(request);

      expect(leadsChain.or).toHaveBeenCalledWith(
        "first_name.ilike.%john%,last_name.ilike.%john%,company_name.ilike.%john%"
      );
    });
  });

  describe("Pagination", () => {
    it("should use default pagination (page 1, 25 per page)", async () => {
      const { leadsChain } = setupSuccessMocks();

      const request = createRequest();
      await GET(request);

      expect(leadsChain.range).toHaveBeenCalledWith(0, 24);
    });

    it("should apply custom pagination", async () => {
      const { leadsChain } = setupSuccessMocks();

      const request = createRequest({ page: "2", per_page: "10" });
      await GET(request);

      // Page 2 with 10 per page: from 10 to 19
      expect(leadsChain.range).toHaveBeenCalledWith(10, 19);
    });

    it("should cap per_page at 100", async () => {
      const { leadsChain } = setupSuccessMocks();

      const request = createRequest({ per_page: "200" });
      await GET(request);

      expect(leadsChain.range).toHaveBeenCalledWith(0, 99);
    });

    it("should return correct totalPages", async () => {
      setupSuccessMocks(mockLeads, 75);

      const request = createRequest({ per_page: "25" });
      const response = await GET(request);
      const body = await response.json();

      expect(body.meta.totalPages).toBe(3);
    });
  });

  describe("Sorting", () => {
    it("should sort by photo_url (enriched first) then created_at DESC", async () => {
      const { leadsChain } = setupSuccessMocks();

      const request = createRequest();
      await GET(request);

      // Story 12.8: Enriched leads (with photo_url) first
      expect(leadsChain.order).toHaveBeenCalledWith("photo_url", {
        ascending: false,
        nullsFirst: false,
      });
      expect(leadsChain.order).toHaveBeenCalledWith("created_at", {
        ascending: false,
      });
      // photo_url order called before created_at
      const calls = leadsChain.order.mock.calls;
      const photoUrlIdx = calls.findIndex((c: unknown[]) => c[0] === "photo_url");
      const createdAtIdx = calls.findIndex((c: unknown[]) => c[0] === "created_at");
      expect(photoUrlIdx).toBeLessThan(createdAtIdx);
    });
  });

  describe("Error Handling", () => {
    it("should return 500 on database error", async () => {
      mockGetCurrentUserProfile.mockResolvedValue({
        id: mockUserId,
        tenant_id: mockTenantId,
        role: "user",
      });

      const leadsChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        or: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockResolvedValue({
          data: null,
          error: { message: "Database error" },
          count: null,
        }),
      };

      mockFrom.mockImplementation(() => leadsChain);

      const request = createRequest();
      const response = await GET(request);
      const body = await response.json();

      expect(response.status).toBe(500);
      expect(body.error.code).toBe("INTERNAL_ERROR");
      expect(body.error.message).toBe("Erro ao buscar leads");
    });
  });
});
