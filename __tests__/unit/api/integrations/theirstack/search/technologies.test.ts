/**
 * Unit tests for theirStack Technologies Search API Route
 * Story: 15.2 - Busca Technografica: Autocomplete e Filtros
 *
 * Tests:
 * - Returns 401 when not authenticated
 * - Returns 403 when not admin
 * - Returns 400 when query param missing or too short
 * - Returns 404 when API key not configured
 * - Returns 500 when decryption fails
 * - Returns technologies on success
 * - Returns error from theirStack API
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

import { GET } from "@/app/api/integrations/theirstack/search/technologies/route";

function createRequest(q?: string): NextRequest {
  const url = q
    ? `http://localhost/api/integrations/theirstack/search/technologies?q=${encodeURIComponent(q)}`
    : "http://localhost/api/integrations/theirstack/search/technologies";
  return new NextRequest(url);
}

describe("GET /api/integrations/theirstack/search/technologies", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    restoreFetch();
    vi.restoreAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(null);

    const response = await GET(createRequest("react"));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toContain("autenticado");
  });

  it("returns 403 when not admin", async () => {
    mockGetCurrentUserProfile.mockResolvedValue({
      tenant_id: "t1",
      role: "member",
    });

    const response = await GET(createRequest("react"));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toContain("administradores");
  });

  it("returns 400 when query param q is missing", async () => {
    mockGetCurrentUserProfile.mockResolvedValue({
      tenant_id: "t1",
      role: "admin",
    });

    const response = await GET(createRequest());
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBeDefined();
  });

  it("returns 400 when query param q is too short", async () => {
    mockGetCurrentUserProfile.mockResolvedValue({
      tenant_id: "t1",
      role: "admin",
    });

    const response = await GET(createRequest("a"));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("2 caracteres");
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

    const response = await GET(createRequest("react"));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toContain("não configurada");
  });

  it("returns 500 when decryption fails", async () => {
    mockGetCurrentUserProfile.mockResolvedValue({
      tenant_id: "t1",
      role: "admin",
    });
    mockSupabaseSingle.mockResolvedValue({
      data: { encrypted_key: "bad-data" },
      error: null,
    });
    mockDecryptApiKey.mockImplementation(() => {
      throw new Error("Decryption failed");
    });

    const response = await GET(createRequest("react"));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toContain("descriptografar");
  });

  it("returns technologies on success", async () => {
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
        url: /theirstack\.com.*catalog\/keywords/,
        response: mockJsonResponse({
          data: [
            { name: "React", slug: "react", category: "Frontend", company_count: 150000 },
          ],
          metadata: { total_results: 1, page: 0, limit: 15 },
        }),
      },
    ]);

    const response = await GET(createRequest("react"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].name).toBe("React");
    expect(body.data[0].slug).toBe("react");
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

    const response = await GET(createRequest("react"));
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body.error).toBeDefined();
  });
});
