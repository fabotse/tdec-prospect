/**
 * Tests: GET /api/settings/errors
 * Story 23.3: Configurações → Erros (só platform admin)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetCurrentUserProfile = vi.fn();
vi.mock("@/lib/supabase/tenant", () => ({
  getCurrentUserProfile: () => mockGetCurrentUserProfile(),
}));

const chain = {
  select: vi.fn(() => chain),
  or: vi.fn(() => chain),
  order: vi.fn(() => chain),
  limit: vi.fn(),
};
const mockFrom = vi.fn(() => chain);
const mockRpc = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ from: mockFrom, rpc: mockRpc })),
}));

import { GET } from "@/app/api/settings/errors/route";

const gestor = { id: "u1", tenant_id: "tenant-1", role: "gestor" };

describe("GET /api/settings/errors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chain.limit.mockResolvedValue({ data: [], error: null });
    mockRpc.mockResolvedValue({ data: true, error: null });
  });

  it("401 sem sessão", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("UNAUTHORIZED");
  });

  it.each(["sdr", "gestor"])("403 para %s que não é platform admin", async (role) => {
    mockGetCurrentUserProfile.mockResolvedValue({ ...gestor, role });
    mockRpc.mockResolvedValue({ data: false, error: null });
    const res = await GET();
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("FORBIDDEN");
    expect(mockRpc).toHaveBeenCalledWith("is_platform_admin");
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("403 (fail-closed) se a RPC falhar, ex.: migration não aplicada", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(gestor);
    mockRpc.mockResolvedValue({ data: null, error: { message: "function does not exist" } });
    const res = await GET();
    expect(res.status).toBe(403);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("403 sem tenant", async () => {
    mockGetCurrentUserProfile.mockResolvedValue({ ...gestor, tenant_id: null });
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it.each(["gestor", "diretor"])("200 para platform admin (%s): últimos 50 do tenant ou de plataforma", async (role) => {
    mockGetCurrentUserProfile.mockResolvedValue({ ...gestor, role });
    chain.limit.mockResolvedValue({
      data: [
        {
          id: "e1",
          tenant_id: null,
          source: "cron",
          route: "pg_net/http",
          message: "3 chamada(s) HTTP falharam",
          created_at: "2026-10-20T12:00:00Z",
        },
      ],
      error: null,
    });

    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      data: [
        {
          id: "e1",
          tenantId: null,
          source: "cron",
          route: "pg_net/http",
          message: "3 chamada(s) HTTP falharam",
          createdAt: "2026-10-20T12:00:00Z",
        },
      ],
    });
    expect(mockFrom).toHaveBeenCalledWith("error_logs");
    expect(chain.or).toHaveBeenCalledWith("tenant_id.is.null,tenant_id.eq.tenant-1");
    expect(chain.order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(chain.limit).toHaveBeenCalledWith(50);
  });

  it("TABELA_AUSENTE: 500 com mensagem", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockGetCurrentUserProfile.mockResolvedValue(gestor);
    chain.limit.mockResolvedValue({
      data: null,
      error: { message: 'relation "public.error_logs" does not exist' },
    });
    const res = await GET();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe("INTERNAL_ERROR");
    expect(body.error.message).toBe("Erro ao buscar o registro de erros");
    spy.mockRestore();
  });
});
