/**
 * Tests: API Route /api/usage/statistics — authorization
 * Story: 20.5 - Auditoria de acesso do SDR (AC2, AC3)
 *
 * Fecha a lacuna de cobertura de autorização da superfície "Uso/custos":
 *  - 401 sem sessão; 403 para SDR; 200 para Gestor E Diretor (admin access).
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

const mockGetUsageStatistics = vi.fn();
vi.mock("@/lib/services/usage-logger", () => ({
  getUsageStatistics: (...args: unknown[]) => mockGetUsageStatistics(...args),
}));

import { GET } from "@/app/api/usage/statistics/route";

function req(): NextRequest {
  return new NextRequest("http://localhost/api/usage/statistics");
}

describe("GET /api/usage/statistics — authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUsageStatistics.mockResolvedValue([]);
  });

  it("returns 401 when not authenticated", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(null);

    const response = await GET(req());
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("returns 403 when SDR (not admin)", async () => {
    mockGetCurrentUserProfile.mockResolvedValue({
      id: "u1",
      tenant_id: "t1",
      role: "sdr",
    });

    const response = await GET(req());
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

    const response = await GET(req());

    expect(response.status).toBe(200);
    expect(mockGetUsageStatistics).toHaveBeenCalled();
  });

  it("allows a Diretor (200, admin access — Story 20.5 AC2/AC3)", async () => {
    mockGetCurrentUserProfile.mockResolvedValue({
      id: "u3",
      tenant_id: "t1",
      role: "diretor",
    });

    const response = await GET(req());

    expect(response.status).toBe(200);
    expect(mockGetUsageStatistics).toHaveBeenCalled();
  });
});
