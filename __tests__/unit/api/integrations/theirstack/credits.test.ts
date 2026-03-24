/**
 * Unit tests for theirStack Credits API Route
 * Story: 15.1 - Integracao theirStack: Configuracao, Teste e Credits
 *
 * Tests:
 * - Returns 401 when not authenticated
 * - Returns 404 when API key not configured
 * - Returns 500 when decryption fails
 * - Returns credits on success
 * - Handles theirStack API error gracefully
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createMockFetch,
  mockJsonResponse,
  mockErrorResponse,
  restoreFetch,
} from "../../../../helpers/mock-fetch";

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

import { GET } from "@/app/api/integrations/theirstack/credits/route";

describe("GET /api/integrations/theirstack/credits", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    restoreFetch();
    vi.restoreAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(null);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toContain("autenticado");
  });

  it("returns 403 when not admin", async () => {
    mockGetCurrentUserProfile.mockResolvedValue({
      tenant_id: "t1",
      role: "member",
    });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toContain("administradores");
  });

  it("returns 404 when API key not configured", async () => {
    mockGetCurrentUserProfile.mockResolvedValue({
      tenant_id: "t1",
      role: "admin",
    });
    mockSupabaseSingle.mockResolvedValue({ data: null, error: { message: "Not found" } });

    const response = await GET();
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

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toContain("descriptografar");
  });

  it("returns credits data on success", async () => {
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
        url: /theirstack\.com.*credit-balance/,
        response: mockJsonResponse({
          ui_credits: 50,
          used_ui_credits: 10,
          api_credits: 200,
          used_api_credits: 6,
        }),
      },
    ]);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual({
      apiCredits: 200,
      usedApiCredits: 6,
      uiCredits: 50,
      usedUiCredits: 10,
    });
  });

  it("returns 500 when theirStack API fails", async () => {
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

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBeDefined();
  });
});
