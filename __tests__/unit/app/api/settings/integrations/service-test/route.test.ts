/**
 * Tests: API Route /api/settings/integrations/[service]/test — authorization
 * Story: 20.5 - Auditoria de acesso do SDR (AC2, AC3)
 *
 * Cobre a barreira de servidor da superfície "Teste de conexão" (admin-only):
 *  - 400 serviço inválido; 401 sem sessão; 403 para SDR; Diretor passa o gate.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

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

vi.mock("@/lib/services", () => ({
  testConnection: vi.fn(),
  ERROR_MESSAGES: { INTERNAL_ERROR: "Erro interno" },
}));

import { POST } from "@/app/api/settings/integrations/[service]/test/route";

function req(): NextRequest {
  return new NextRequest(
    "http://localhost/api/settings/integrations/apollo/test",
    { method: "POST" }
  );
}

function params(service = "apollo") {
  return { params: Promise.resolve({ service }) };
}

describe("POST /api/settings/integrations/[service]/test — authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 for an invalid service name", async () => {
    const response = await POST(req(), params("not-a-service"));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("inválido");
  });

  it("returns 401 when not authenticated", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(null);

    const response = await POST(req(), params());
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toContain("autenticado");
  });

  it("returns 403 when SDR (not admin)", async () => {
    mockGetCurrentUserProfile.mockResolvedValue({
      tenant_id: "t1",
      role: "sdr",
    });

    const response = await POST(req(), params());
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toContain("administradores");
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

    const response = await POST(req(), params());

    expect(response.status).toBe(404);
  });
});
