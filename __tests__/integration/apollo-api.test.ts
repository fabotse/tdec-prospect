/**
 * Integration tests for Apollo API Route
 * Story: 3.2 - Apollo API Integration Service
 *
 * Tests the full request/response flow of the Apollo API route
 * with mocked external Apollo API calls.
 *
 * AC: #2 - Requests proxied through API Routes
 * AC: #4 - Errors translated to Portuguese
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { POST } from "@/app/api/integrations/apollo/route";
import { NextRequest } from "next/server";

// ==============================================
// MOCKS
// ==============================================

// Mock Supabase tenant utilities
vi.mock("@/lib/supabase/tenant", () => ({
  getCurrentUserProfile: vi.fn(() =>
    Promise.resolve({
      id: "user-123",
      tenant_id: "tenant-456",
      role: "admin",
      email: "test@example.com",
    })
  ),
}));

// Mock Supabase client for api_configs
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() =>
    Promise.resolve({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() =>
                Promise.resolve({
                  data: { encrypted_key: "encrypted-api-key" },
                  error: null,
                })
              ),
            })),
          })),
        })),
      })),
    })
  ),
}));

// Mock encryption
vi.mock("@/lib/crypto/encryption", () => ({
  decryptApiKey: vi.fn(() => "decrypted-api-key"),
}));

// ==============================================
// TESTS
// ==============================================

describe("Apollo API Route Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("POST /api/integrations/apollo", () => {
    it("returns leads on successful Apollo API call", async () => {
      // Mock Apollo API response
      const mockApolloResponse = {
        total_entries: 1,
        people: [
          {
            id: "apollo-person-1",
            first_name: "João",
            last_name_obfuscated: "Si***a",
            title: "CEO",
            last_refreshed_at: "2025-01-30T12:00:00.000Z",
            has_email: true,
            has_city: true,
            has_state: true,
            has_country: true,
            has_direct_phone: "Yes",
            organization: {
              name: "Test Company",
              has_industry: true,
              has_phone: true,
              has_city: true,
              has_state: true,
              has_country: true,
              has_zip_code: false,
              has_revenue: true,
              has_employee_count: true,
            },
          },
        ],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockApolloResponse),
      });

      const request = new NextRequest("http://localhost:3000/api/integrations/apollo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titles: ["CEO"],
          locations: ["Brazil"],
          page: 1,
          perPage: 25,
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data).toHaveLength(1);
      expect(data.data[0].firstName).toBe("João");
      expect(data.data[0].companyName).toBe("Test Company");
      expect(data.meta).toEqual({
        total: 1,
        page: 1,
        limit: 25,
      });
    });

    it("returns validation error for invalid request body", async () => {
      const request = new NextRequest("http://localhost:3000/api/integrations/apollo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          perPage: 500, // Invalid: max is 100
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.code).toBe("VALIDATION_ERROR");
      expect(data.error.message).toBe("Filtros de busca inválidos");
    });

    it("returns Portuguese error message on Apollo API failure", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
      });

      const request = new NextRequest("http://localhost:3000/api/integrations/apollo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error.code).toBe("APOLLO_ERROR");
      // Message should be in Portuguese
      expect(data.error.message).toMatch(/inválida|expirada/i);
    });

    it("returns rate limit error in Portuguese", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
      });

      const request = new NextRequest("http://localhost:3000/api/integrations/apollo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(429);
      expect(data.error.message).toMatch(/limite|requisições/i);
    });

    it("handles empty search results", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            total_entries: 0,
            people: [],
          }),
      });

      const request = new NextRequest("http://localhost:3000/api/integrations/apollo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titles: ["Nonexistent Title"],
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data).toEqual([]);
      expect(data.meta.total).toBe(0);
    });

    it("passes filter parameters to Apollo API correctly", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ total_entries: 0, people: [] }),
      });
      global.fetch = fetchMock;

      const filters = {
        titles: ["CEO", "CTO"],
        locations: ["São Paulo, Brazil"],
        companySizes: ["11-50", "51-200"],
        keywords: "marketing",
        page: 2,
        perPage: 50,
      };

      const request = new NextRequest("http://localhost:3000/api/integrations/apollo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(filters),
      });

      await POST(request);

      // Verify Apollo API was called with correct query params
      expect(fetchMock).toHaveBeenCalled();
      const calledUrl = fetchMock.mock.calls[0][0];
      expect(calledUrl).toContain("api_search");
      expect(calledUrl).toContain("person_titles%5B%5D=CEO");
      expect(calledUrl).toContain("person_titles%5B%5D=CTO");
      expect(calledUrl).toContain("page=2");
      expect(calledUrl).toContain("per_page=50");
    });
  });

  describe("Authentication", () => {
    it("returns 401 when user is not authenticated", async () => {
      // Override mock to return null profile
      const { getCurrentUserProfile } = await import("@/lib/supabase/tenant");
      vi.mocked(getCurrentUserProfile).mockResolvedValueOnce(null);

      const request = new NextRequest("http://localhost:3000/api/integrations/apollo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error.code).toBe("UNAUTHORIZED");
      expect(data.error.message).toBe("Não autenticado");
    });

    it("returns 403 when tenant_id is missing", async () => {
      const { getCurrentUserProfile } = await import("@/lib/supabase/tenant");
      vi.mocked(getCurrentUserProfile).mockResolvedValueOnce({
        id: "user-123",
        tenant_id: null,
        role: "admin",
        email: "test@example.com",
      } as never);

      const request = new NextRequest("http://localhost:3000/api/integrations/apollo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error.code).toBe("FORBIDDEN");
      expect(data.error.message).toBe("Tenant não encontrado");
    });
  });
});
