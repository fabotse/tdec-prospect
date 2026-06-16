/**
 * Tests: API Route /api/settings/integrations — authorization
 * Story: 20.5 - Auditoria de acesso do SDR (AC2, AC3)
 *
 * Fecha a lacuna de cobertura de autorização da superfície "Integrações":
 *  - GET/POST/DELETE: 401 sem sessão, 403 para SDR.
 *  - GET: 200 para Gestor E Diretor (admin access).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createChainBuilder } from "../../../../../helpers/mock-supabase";

// ==============================================
// MOCKS
// ==============================================

const mockGetCurrentUserProfile = vi.fn();
vi.mock("@/lib/supabase/tenant", () => ({
  getCurrentUserProfile: () => mockGetCurrentUserProfile(),
}));

const mockFrom = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve({ from: mockFrom })),
}));

vi.mock("@/lib/crypto/encryption", () => ({
  encryptApiKey: vi.fn(() => "encrypted"),
  maskApiKey: vi.fn(() => "••••1234"),
}));

import { GET, POST, DELETE } from "@/app/api/settings/integrations/route";

const SDR_PROFILE = { id: "u2", tenant_id: "t1", role: "sdr" };

function postReq(): NextRequest {
  return new NextRequest("http://localhost/api/settings/integrations", {
    method: "POST",
    body: JSON.stringify({ serviceName: "apollo", apiKey: "12345678" }),
    headers: { "Content-Type": "application/json" },
  });
}

function deleteReq(): NextRequest {
  return new NextRequest(
    "http://localhost/api/settings/integrations?serviceName=apollo",
    { method: "DELETE" }
  );
}

describe("/api/settings/integrations — authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockImplementation(() =>
      createChainBuilder({ data: [], error: null })
    );
  });

  describe("GET", () => {
    it("returns 401 when not authenticated", async () => {
      mockGetCurrentUserProfile.mockResolvedValue(null);

      const response = await GET();
      const body = await response.json();

      expect(response.status).toBe(401);
      expect(body.error.code).toBe("UNAUTHORIZED");
    });

    it("returns 403 when SDR (not admin)", async () => {
      mockGetCurrentUserProfile.mockResolvedValue(SDR_PROFILE);

      const response = await GET();
      const body = await response.json();

      expect(response.status).toBe(403);
      expect(body.error.code).toBe("FORBIDDEN");
    });

    it("allows a Gestor (200)", async () => {
      mockGetCurrentUserProfile.mockResolvedValue({
        id: "u1",
        tenant_id: "t1",
        role: "gestor",
      });

      const response = await GET();

      expect(response.status).toBe(200);
    });

    it("allows a Diretor (200, admin access — Story 20.5 AC2/AC3)", async () => {
      mockGetCurrentUserProfile.mockResolvedValue({
        id: "u3",
        tenant_id: "t1",
        role: "diretor",
      });

      const response = await GET();

      expect(response.status).toBe(200);
    });
  });

  describe("POST", () => {
    it("returns 401 when not authenticated", async () => {
      mockGetCurrentUserProfile.mockResolvedValue(null);

      const response = await POST(postReq());
      const body = await response.json();

      expect(response.status).toBe(401);
      expect(body.error.code).toBe("UNAUTHORIZED");
    });

    it("returns 403 when SDR (not admin)", async () => {
      mockGetCurrentUserProfile.mockResolvedValue(SDR_PROFILE);

      const response = await POST(postReq());
      const body = await response.json();

      expect(response.status).toBe(403);
      expect(body.error.code).toBe("FORBIDDEN");
    });
  });

  describe("DELETE", () => {
    it("returns 401 when not authenticated", async () => {
      mockGetCurrentUserProfile.mockResolvedValue(null);

      const response = await DELETE(deleteReq());
      const body = await response.json();

      expect(response.status).toBe(401);
      expect(body.error.code).toBe("UNAUTHORIZED");
    });

    it("returns 403 when SDR (not admin)", async () => {
      mockGetCurrentUserProfile.mockResolvedValue(SDR_PROFILE);

      const response = await DELETE(deleteReq());
      const body = await response.json();

      expect(response.status).toBe(403);
      expect(body.error.code).toBe("FORBIDDEN");
    });
  });
});
