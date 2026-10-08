/**
 * Regressao: SDR nao via as contas de envio do Instantly no export da campanha.
 *
 * A RLS de `api_configs` e admin-only: para um `sdr`, o client de SESSAO devolve
 * zero linhas (sem erro) e a rota respondia 404 "API key do Instantly nao
 * configurada" com a chave configurada pelo gestor. Este teste modela a RLS de
 * verdade — sessao NAO enxerga a linha, service-role enxerga — e usa o helper
 * real (`@/lib/agent/service-keys`), sem mocka-lo.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const SDR_PROFILE = { id: "user-sdr", tenant_id: "tenant-1", role: "sdr" };

vi.mock("@/lib/supabase/tenant", () => ({
  getCurrentUserProfile: vi.fn(async () => SDR_PROFILE),
}));

/** Query builder minimo: `.select().eq().eq().single()` resolvendo `result`. */
function queryReturning(result: { data: unknown; error: unknown }) {
  const builder = {
    select: () => builder,
    eq: vi.fn(() => builder),
    single: async () => result,
  };
  return builder;
}

// Sessao do SDR: a RLS filtra a linha -> zero linhas (PGRST116), sem erro de permissao.
const sessionFrom = vi.fn(() =>
  queryReturning({ data: null, error: { code: "PGRST116", message: "0 rows" } })
);
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: sessionFrom }),
}));

// Service-role: bypassa a RLS e enxerga a chave do tenant.
const adminBuilder = queryReturning({ data: { encrypted_key: "enc-key" }, error: null });
const adminFrom = vi.fn(() => adminBuilder);
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: adminFrom }),
}));

vi.mock("@/lib/crypto/encryption", () => ({
  decryptApiKey: (value: string) => (value === "enc-key" ? "instantly-key" : ""),
}));

const mockListAccounts = vi.fn();
vi.mock("@/lib/services/instantly", () => ({
  InstantlyService: class {
    listAccounts = mockListAccounts;
  },
}));

import { GET } from "@/app/api/instantly/accounts/route";

describe("GET /api/instantly/accounts — usuario SDR", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListAccounts.mockResolvedValue({
      accounts: [{ email: "envio@tdec.com.br", first_name: "Envio", last_name: "TDec" }],
    });
  });

  it("lista as contas de envio usando a chave lida via service-role", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([
      { email: "envio@tdec.com.br", first_name: "Envio", last_name: "TDec" },
    ]);
    expect(mockListAccounts).toHaveBeenCalledWith({ apiKey: "instantly-key" });
  });

  it("filtra a chave pelo tenant do profile autenticado", async () => {
    await GET();

    expect(adminFrom).toHaveBeenCalledWith("api_configs");
    expect(adminBuilder.eq).toHaveBeenCalledWith("tenant_id", "tenant-1");
    expect(adminBuilder.eq).toHaveBeenCalledWith("service_name", "instantly");
  });
});
