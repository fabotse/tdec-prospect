/**
 * Unit tests for theirStack Companies Search API Route
 * Story: 15.2 - Busca Technografica: Autocomplete e Filtros
 *
 * Tests:
 * - Returns 401 when not authenticated
 * - Returns 403 when not admin
 * - Returns 400 on validation error (no slugs, invalid body)
 * - Returns 404 when API key not configured
 * - Returns companies on success
 * - Returns error from theirStack API (429, 500)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import {
  createMockFetch,
  mockJsonResponse,
  mockErrorResponse,
  restoreFetch,
} from "../../../../../helpers/mock-fetch";

// ==============================================
// MOCKS
// ==============================================

const mockGetCurrentUserProfile = vi.fn();
vi.mock("@/lib/supabase/tenant", () => ({
  getCurrentUserProfile: () => mockGetCurrentUserProfile(),
}));

const mockSupabaseSingle = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() =>
    Promise.resolve({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: mockSupabaseSingle,
            })),
          })),
        })),
      })),
    })
  ),
}));

const mockDecryptApiKey = vi.fn();
vi.mock("@/lib/crypto/encryption", () => ({
  decryptApiKey: (...args: unknown[]) => mockDecryptApiKey(...args),
}));

// ==============================================
// IMPORT ROUTE (after mocks)
// ==============================================

import { POST } from "@/app/api/integrations/theirstack/search/companies/route";

function createRequest(body?: unknown): NextRequest {
  return new NextRequest(
    "http://localhost/api/integrations/theirstack/search/companies",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }
  );
}

describe("POST /api/integrations/theirstack/search/companies", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    restoreFetch();
    vi.restoreAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(null);

    const response = await POST(
      createRequest({ technologySlugs: ["react"] })
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toContain("autenticado");
  });

  it("returns 403 when not admin", async () => {
    mockGetCurrentUserProfile.mockResolvedValue({
      tenant_id: "t1",
      role: "member",
    });

    const response = await POST(
      createRequest({ technologySlugs: ["react"] })
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toContain("administradores");
  });

  it("returns 400 when technologySlugs is empty", async () => {
    mockGetCurrentUserProfile.mockResolvedValue({
      tenant_id: "t1",
      role: "admin",
    });

    const response = await POST(
      createRequest({ technologySlugs: [] })
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("pelo menos uma tecnologia");
  });

  it("returns 400 when minEmployeeCount > maxEmployeeCount", async () => {
    mockGetCurrentUserProfile.mockResolvedValue({
      tenant_id: "t1",
      role: "admin",
    });

    const response = await POST(
      createRequest({
        technologySlugs: ["react"],
        minEmployeeCount: 5000,
        maxEmployeeCount: 50,
      })
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("menor ou igual");
  });

  it("returns 400 when body is invalid JSON", async () => {
    mockGetCurrentUserProfile.mockResolvedValue({
      tenant_id: "t1",
      role: "admin",
    });

    const request = new NextRequest(
      "http://localhost/api/integrations/theirstack/search/companies",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not-json",
      }
    );

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBeDefined();
  });

  it("returns 404 when API key not configured", async () => {
    mockGetCurrentUserProfile.mockResolvedValue({
      tenant_id: "t1",
      role: "admin",
    });
    mockSupabaseSingle.mockResolvedValue({
      data: null,
      error: { message: "Not found" },
    });

    const response = await POST(
      createRequest({ technologySlugs: ["react"] })
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toContain("não configurada");
  });

  it("returns companies on success", async () => {
    mockGetCurrentUserProfile.mockResolvedValue({
      tenant_id: "t1",
      role: "admin",
    });
    mockSupabaseSingle.mockResolvedValue({
      data: { encrypted_key: "encrypted-key" },
      error: null,
    });
    mockDecryptApiKey.mockReturnValue("decrypted-key");

    createMockFetch([
      {
        url: /theirstack\.com.*companies\/search/,
        method: "POST",
        response: mockJsonResponse({
          metadata: { total_results: 1, total_companies: 1 },
          data: [
            {
              name: "Acme",
              domain: "acme.com",
              url: null,
              country: "Brazil",
              country_code: "BR",
              city: "SP",
              industry: "Tech",
              employee_count_range: "100-500",
              apollo_id: null,
              annual_revenue_usd: null,
              founded_year: 2020,
              linkedin_url: null,
              technologies_found: [],
              has_blurred_data: false,
            },
          ],
        }),
      },
    ]);

    const response = await POST(
      createRequest({ technologySlugs: ["react"] })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].name).toBe("Acme");
    expect(body.meta.total_results).toBe(1);
  });

  it("returns error from theirStack API (429)", async () => {
    mockGetCurrentUserProfile.mockResolvedValue({
      tenant_id: "t1",
      role: "admin",
    });
    mockSupabaseSingle.mockResolvedValue({
      data: { encrypted_key: "encrypted-key" },
      error: null,
    });
    mockDecryptApiKey.mockReturnValue("decrypted-key");

    createMockFetch([
      {
        url: /theirstack\.com/,
        response: mockErrorResponse(429, "Rate limited"),
      },
    ]);

    const response = await POST(
      createRequest({ technologySlugs: ["react"] })
    );
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body.error).toBeDefined();
  });

  it("returns 500 on theirStack server error", async () => {
    mockGetCurrentUserProfile.mockResolvedValue({
      tenant_id: "t1",
      role: "admin",
    });
    mockSupabaseSingle.mockResolvedValue({
      data: { encrypted_key: "encrypted-key" },
      error: null,
    });
    mockDecryptApiKey.mockReturnValue("decrypted-key");

    createMockFetch([
      {
        url: /theirstack\.com/,
        response: mockErrorResponse(500, "Internal Server Error"),
      },
    ]);

    const response = await POST(
      createRequest({ technologySlugs: ["react"] })
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBeDefined();
  });
});
