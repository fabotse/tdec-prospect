/**
 * Unit tests for theirStack Test API Route
 * Story: 15.1 - Integracao theirStack: Configuracao, Teste e Credits
 *
 * Tests:
 * - Returns 401 when not authenticated
 * - Returns 403 when not admin
 * - Returns 404 when API key not configured
 * - Returns 500 when decryption fails
 * - Returns 200 on successful connection test
 * - Returns 400 when connection test fails
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

import { POST } from "@/app/api/integrations/theirstack/test/route";

describe("POST /api/integrations/theirstack/test", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    restoreFetch();
    vi.restoreAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(null);

    const response = await POST();
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.success).toBe(false);
    expect(body.message).toContain("autenticado");
  });

  it("returns 403 when not admin", async () => {
    mockGetCurrentUserProfile.mockResolvedValue({
      tenant_id: "t1",
      role: "member",
    });

    const response = await POST();
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.message).toContain("administradores");
  });

  it("returns 404 when API key not configured", async () => {
    mockGetCurrentUserProfile.mockResolvedValue({
      tenant_id: "t1",
      role: "admin",
    });
    mockSupabaseSingle.mockResolvedValue({ data: null, error: { message: "Not found" } });

    const response = await POST();
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.message).toContain("não configurada");
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

    const response = await POST();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.message).toContain("descriptografar");
  });

  it("returns 200 on successful connection test", async () => {
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
          used_ui_credits: 0,
          api_credits: 200,
          used_api_credits: 6,
        }),
      },
    ]);

    const response = await POST();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.message).toContain("sucesso");
    expect(body.testedAt).toBeDefined();
  });

  it("returns 400 when connection test fails", async () => {
    mockGetCurrentUserProfile.mockResolvedValue({
      tenant_id: "t1",
      role: "admin",
    });
    mockSupabaseSingle.mockResolvedValue({
      data: { encrypted_key: "encrypted-key" },
      error: null,
    });
    mockDecryptApiKey.mockReturnValue("bad-key");

    createMockFetch([
      {
        url: /theirstack\.com/,
        response: mockErrorResponse(401, "Unauthorized"),
      },
    ]);

    const response = await POST();
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
  });
});
