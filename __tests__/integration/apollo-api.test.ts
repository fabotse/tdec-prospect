/**
 * Integration tests for Apollo API Routes
 * Story: 3.2 - Apollo API Integration Service
 * Story: 3.2.1 - People Enrichment Integration
 *
 * Tests the full request/response flow of the Apollo API routes
 * with mocked external Apollo API calls.
 *
 * AC: #2 - Requests proxied through API Routes
 * AC: #4 - Errors translated to Portuguese
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { POST } from "@/app/api/integrations/apollo/route";
import { POST as EnrichPOST } from "@/app/api/integrations/apollo/enrich/route";
import { POST as BulkEnrichPOST } from "@/app/api/integrations/apollo/enrich/bulk/route";
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

// Mock Supabase client for api_configs and leads queries
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() =>
    Promise.resolve({
      from: vi.fn((tableName: string) => {
        if (tableName === "api_configs") {
          return {
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
          };
        }
        // Handle leads table query for import status check
        if (tableName === "leads") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                in: vi.fn(() =>
                  Promise.resolve({
                    data: [], // No existing leads
                    error: null,
                  })
                ),
              })),
            })),
          };
        }
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(() => Promise.resolve({ data: null, error: null })),
              })),
            })),
          })),
        };
      }),
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
        totalPages: 1,
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

  // ==============================================
  // ENRICHMENT ROUTES (Story 3.2.1)
  // ==============================================

  describe("POST /api/integrations/apollo/enrich", () => {
    it("returns enriched person on successful Apollo API call", async () => {
      const mockEnrichmentResponse = {
        person: {
          id: "apollo-person-1",
          first_name: "João",
          last_name: "Silva",
          email: "joao@empresa.com",
          email_status: "verified",
          title: "CEO",
          city: "São Paulo",
          state: "SP",
          country: "Brazil",
          linkedin_url: "https://linkedin.com/in/joao",
          photo_url: null,
          employment_history: [],
        },
        organization: {
          id: "org-1",
          name: "Empresa SA",
          domain: "empresa.com",
          industry: "Technology",
          estimated_num_employees: 150,
        },
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockEnrichmentResponse),
      });

      const request = new NextRequest(
        "http://localhost:3000/api/integrations/apollo/enrich",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            apolloId: "apollo-person-1",
            revealPersonalEmails: true,
          }),
        }
      );

      const response = await EnrichPOST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.person.last_name).toBe("Silva");
      expect(data.data.person.email).toBe("joao@empresa.com");
      expect(data.data.organization.name).toBe("Empresa SA");
    });

    it("returns validation error when apolloId is missing", async () => {
      const request = new NextRequest(
        "http://localhost:3000/api/integrations/apollo/enrich",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            revealPersonalEmails: true,
          }),
        }
      );

      const response = await EnrichPOST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.code).toBe("VALIDATION_ERROR");
    });

    it("returns 401 when user is not authenticated", async () => {
      const { getCurrentUserProfile } = await import("@/lib/supabase/tenant");
      vi.mocked(getCurrentUserProfile).mockResolvedValueOnce(null);

      const request = new NextRequest(
        "http://localhost:3000/api/integrations/apollo/enrich",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ apolloId: "apollo-1" }),
        }
      );

      const response = await EnrichPOST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error.code).toBe("UNAUTHORIZED");
      expect(data.error.message).toBe("Não autenticado");
    });

    it("returns Portuguese error when person not found", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ person: null, organization: null }),
      });

      const request = new NextRequest(
        "http://localhost:3000/api/integrations/apollo/enrich",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ apolloId: "nonexistent-id" }),
        }
      );

      const response = await EnrichPOST(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error.message).toMatch(/não encontrada/i);
    });

    it("returns Portuguese error when webhook missing for phone", async () => {
      const request = new NextRequest(
        "http://localhost:3000/api/integrations/apollo/enrich",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            apolloId: "apollo-1",
            revealPhoneNumber: true,
            // missing webhookUrl
          }),
        }
      );

      const response = await EnrichPOST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.message).toMatch(/webhook/i);
    });
  });

  describe("POST /api/integrations/apollo/enrich/bulk", () => {
    it("returns enriched people on successful bulk Apollo API call", async () => {
      const mockBulkResponse = {
        matches: [
          {
            person: {
              id: "apollo-1",
              first_name: "João",
              last_name: "Silva",
              email: "joao@empresa.com",
              email_status: "verified",
              title: "CEO",
              city: "São Paulo",
              state: "SP",
              country: "Brazil",
              linkedin_url: null,
              photo_url: null,
              employment_history: [],
            },
            organization: null,
          },
          {
            person: {
              id: "apollo-2",
              first_name: "Maria",
              last_name: "Santos",
              email: "maria@empresa.com",
              email_status: "verified",
              title: "CTO",
              city: "Rio de Janeiro",
              state: "RJ",
              country: "Brazil",
              linkedin_url: null,
              photo_url: null,
              employment_history: [],
            },
            organization: null,
          },
        ],
        missing: 0,
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockBulkResponse),
      });

      const request = new NextRequest(
        "http://localhost:3000/api/integrations/apollo/enrich/bulk",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            apolloIds: ["apollo-1", "apollo-2"],
          }),
        }
      );

      const response = await BulkEnrichPOST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data).toHaveLength(2);
      expect(data.data[0].last_name).toBe("Silva");
      expect(data.data[1].last_name).toBe("Santos");
      expect(data.meta.total).toBe(2);
    });

    it("returns validation error when apolloIds exceeds 10", async () => {
      const request = new NextRequest(
        "http://localhost:3000/api/integrations/apollo/enrich/bulk",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            apolloIds: Array.from({ length: 11 }, (_, i) => `apollo-${i}`),
          }),
        }
      );

      const response = await BulkEnrichPOST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.code).toBe("VALIDATION_ERROR");
      expect(data.error.message).toMatch(/inválidos|lote/i);
    });

    it("returns validation error when apolloIds is empty", async () => {
      const request = new NextRequest(
        "http://localhost:3000/api/integrations/apollo/enrich/bulk",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            apolloIds: [],
          }),
        }
      );

      const response = await BulkEnrichPOST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.code).toBe("VALIDATION_ERROR");
    });

    it("returns 401 when user is not authenticated", async () => {
      const { getCurrentUserProfile } = await import("@/lib/supabase/tenant");
      vi.mocked(getCurrentUserProfile).mockResolvedValueOnce(null);

      const request = new NextRequest(
        "http://localhost:3000/api/integrations/apollo/enrich/bulk",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ apolloIds: ["apollo-1"] }),
        }
      );

      const response = await BulkEnrichPOST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error.code).toBe("UNAUTHORIZED");
    });

    it("returns Portuguese error when webhook missing for phone", async () => {
      const request = new NextRequest(
        "http://localhost:3000/api/integrations/apollo/enrich/bulk",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            apolloIds: ["apollo-1"],
            revealPhoneNumber: true,
            // missing webhookUrl
          }),
        }
      );

      const response = await BulkEnrichPOST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.message).toMatch(/webhook/i);
    });

    it("filters out null results from bulk response", async () => {
      const mockBulkResponse = {
        matches: [
          {
            person: {
              id: "apollo-1",
              first_name: "João",
              last_name: "Silva",
              email: null,
              email_status: null,
              title: null,
              city: null,
              state: null,
              country: null,
              linkedin_url: null,
              photo_url: null,
              employment_history: [],
            },
            organization: null,
          },
          {
            person: null, // Not found
            organization: null,
          },
        ],
        missing: 1,
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockBulkResponse),
      });

      const request = new NextRequest(
        "http://localhost:3000/api/integrations/apollo/enrich/bulk",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            apolloIds: ["apollo-1", "apollo-2"],
          }),
        }
      );

      const response = await BulkEnrichPOST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data).toHaveLength(1);
      expect(data.data[0].first_name).toBe("João");
    });
  });
});
