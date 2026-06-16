/**
 * Tests: API Route /api/integrations/apollo/test — authorization
 * Story: 20.5 - Auditoria de acesso do SDR (AC2, AC3)
 *
 * Cobre a barreira de servidor da superfície "Teste de conexão" (admin-only):
 *  - 401 sem sessão; 403 para SDR; Diretor passa do gate (404 sem config).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

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

vi.mock("@/lib/crypto/encryption", () => ({
  decryptApiKey: vi.fn(() => "decrypted-key"),
}));

import { POST } from "@/app/api/integrations/apollo/test/route";

describe("POST /api/integrations/apollo/test — authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(null);

    const response = await POST();
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.message).toContain("autenticado");
  });

  it("returns 403 when SDR (not admin)", async () => {
    mockGetCurrentUserProfile.mockResolvedValue({
      tenant_id: "t1",
      role: "sdr",
    });

    const response = await POST();
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.message).toContain("administradores");
  });

  it("allows a Diretor past the admin gate (404 without config — Story 20.5 AC2/AC3)", async () => {
    mockGetCurrentUserProfile.mockResolvedValue({
      tenant_id: "t1",
      role: "diretor",
    });
    mockSupabaseSingle.mockResolvedValue({
      data: null,
      error: { message: "Not found" },
    });

    const response = await POST();

    expect(response.status).toBe(404);
  });
});
