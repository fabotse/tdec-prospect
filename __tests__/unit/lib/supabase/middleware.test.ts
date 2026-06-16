/**
 * Tests: Supabase auth middleware (updateSession)
 * Story: 20.5 - Auditoria de acesso do SDR (AC2, AC3)
 *
 * Fecha a lacuna de cobertura de autorização do middleware (ZERO testes antes).
 * Prova a barreira de servidor por papel × superfície:
 *  - /settings e /technographic são admin-only (Gestor/Diretor passam, SDR é
 *    redirecionado para /leads).
 *  - rota protegida sem sessão → redirect /login.
 *  - rota não-admin protegida (/leads) → passa para qualquer papel autenticado.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ==============================================
// MOCKS
// ==============================================

const mockGetUser = vi.fn();
const mockSingle = vi.fn();

// `from("profiles").select("role").eq("id", ...).single()`
// Story 20.5 (review hardening): mocks hoisted (não inline) para que o ALVO da
// query de papel seja inspecionável. O desfecho redirect/pass já é coberto, mas
// sem isto uma query mal-direcionada (tabela/coluna/filtro errados, id de outro
// usuário) passaria despercebida — o mock devolvia `{ role }` para qualquer coisa.
const mockEq = vi.fn(() => ({ single: mockSingle }));
const mockSelect = vi.fn(() => ({ eq: mockEq }));
const mockFrom = vi.fn(() => ({ select: mockSelect }));

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  })),
}));

import { updateSession } from "@/lib/supabase/middleware";

// ==============================================
// HELPERS
// ==============================================

function req(path: string): NextRequest {
  return new NextRequest(`http://localhost${path}`);
}

/**
 * Configura a sessão/papel retornados pelo client mockado.
 * @param role papel do perfil, ou `null` para "não autenticado".
 */
function authAs(role: "gestor" | "diretor" | "sdr" | null) {
  if (role === null) {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    return;
  }
  mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
  mockSingle.mockResolvedValue({ data: { role }, error: null });
}

/** Local do redirect (ou null quando a resposta é pass-through). */
function redirectLocation(res: Response): string | null {
  return res.headers.get("location");
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
});

// ==============================================
// TESTS
// ==============================================

describe("updateSession middleware — authorization", () => {
  describe("unauthenticated on protected routes → /login", () => {
    it("redirects /settings to /login when not authenticated", async () => {
      authAs(null);
      const res = await updateSession(req("/settings"));
      expect(redirectLocation(res)).toContain("/login");
    });

    it("redirects /technographic to /login when not authenticated", async () => {
      authAs(null);
      const res = await updateSession(req("/technographic"));
      expect(redirectLocation(res)).toContain("/login");
    });

    it("redirects /leads to /login when not authenticated", async () => {
      authAs(null);
      const res = await updateSession(req("/leads"));
      expect(redirectLocation(res)).toContain("/login");
    });
  });

  describe("SDR is blocked from admin surfaces → /leads", () => {
    it("redirects SDR away from /settings", async () => {
      authAs("sdr");
      const res = await updateSession(req("/settings"));
      expect(redirectLocation(res)).toContain("/leads");
    });

    it("redirects SDR away from /technographic (Story 20.5 AC5)", async () => {
      authAs("sdr");
      const res = await updateSession(req("/technographic"));
      expect(redirectLocation(res)).toContain("/leads");
    });
  });

  describe("Gestor passes admin surfaces", () => {
    it("allows Gestor on /settings (no redirect)", async () => {
      authAs("gestor");
      const res = await updateSession(req("/settings"));
      expect(redirectLocation(res)).toBeNull();
    });

    it("allows Gestor on /technographic (no redirect)", async () => {
      authAs("gestor");
      const res = await updateSession(req("/technographic"));
      expect(redirectLocation(res)).toBeNull();
    });
  });

  describe("Diretor passes admin surfaces (diretor == admin access)", () => {
    it("allows Diretor on /settings (no redirect)", async () => {
      authAs("diretor");
      const res = await updateSession(req("/settings"));
      expect(redirectLocation(res)).toBeNull();
    });

    it("allows Diretor on /technographic (no redirect)", async () => {
      authAs("diretor");
      const res = await updateSession(req("/technographic"));
      expect(redirectLocation(res)).toBeNull();
    });
  });

  describe("non-admin protected route (/leads) is allowed for any authenticated role", () => {
    it("allows SDR on /leads (prospecting surface, no redirect)", async () => {
      authAs("sdr");
      const res = await updateSession(req("/leads"));
      expect(redirectLocation(res)).toBeNull();
    });

    it("allows Gestor on /leads (no redirect)", async () => {
      authAs("gestor");
      const res = await updateSession(req("/leads"));
      expect(redirectLocation(res)).toBeNull();
    });
  });

  // Story 20.5 (review hardening) — prova QUE o papel vem da fonte certa, não só
  // que o desfecho redirect/pass está correto sob um mock que fixa o `role`.
  describe("role query targets the authenticated user's profiles row", () => {
    it("reads `role` from `profiles` filtered by the authenticated user id (admin route)", async () => {
      authAs("gestor");
      await updateSession(req("/settings"));

      expect(mockFrom).toHaveBeenCalledWith("profiles");
      expect(mockSelect).toHaveBeenCalledWith("role");
      expect(mockEq).toHaveBeenCalledWith("id", "user-1");
    });

    it("does not query the profile for a non-admin protected route (/leads)", async () => {
      // Em rota não-admin o gate de papel não roda → nenhuma consulta a profiles.
      authAs("sdr");
      await updateSession(req("/leads"));

      expect(mockFrom).not.toHaveBeenCalled();
    });
  });
});
