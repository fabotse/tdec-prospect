/**
 * getConfiguredIntegrations + listConfiguredServices
 * Hotfix SDR: o dialogo de export marcava Instantly/Snov.io como "Nao configurado"
 * para `sdr`, porque o builder usava `getApiConfigs` (admin-only). A action nova
 * responde para qualquer papel, le via service-role e devolve SO nomes de servico.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetCurrentUserProfile = vi.fn();
vi.mock("@/lib/supabase/tenant", () => ({
  getCurrentUserProfile: () => mockGetCurrentUserProfile(),
}));

const adminEq = vi.fn();
const adminSelect = vi.fn(() => ({ eq: adminEq }));
const adminFrom = vi.fn(() => ({ select: adminSelect }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: adminFrom }),
}));

import { getConfiguredIntegrations } from "@/actions/integration-status";

describe("getConfiguredIntegrations (hotfix SDR)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    adminEq.mockResolvedValue({
      data: [{ service_name: "snovio" }, { service_name: "instantly" }, { service_name: "legacy" }],
      error: null,
    });
  });

  it("responde para um SDR com os servicos configurados do tenant (service-role)", async () => {
    mockGetCurrentUserProfile.mockResolvedValue({ id: "u1", tenant_id: "tenant-1", role: "sdr" });

    const result = await getConfiguredIntegrations();

    // Ordem de SERVICE_NAMES; servico desconhecido ("legacy") descartado.
    expect(result).toEqual({ success: true, data: ["snovio", "instantly"] });
    expect(adminFrom).toHaveBeenCalledWith("api_configs");
    expect(adminEq).toHaveBeenCalledWith("tenant_id", "tenant-1");
  });

  it("seleciona apenas service_name — nunca material de chave", async () => {
    mockGetCurrentUserProfile.mockResolvedValue({ id: "u1", tenant_id: "tenant-1", role: "sdr" });

    await getConfiguredIntegrations();

    expect(adminSelect).toHaveBeenCalledWith("service_name");
  });

  it("exige autenticacao", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(null);

    const result = await getConfiguredIntegrations();

    expect(result).toEqual({ success: false, error: "Não autenticado" });
    expect(adminFrom).not.toHaveBeenCalled();
  });

  it("fail-safe: erro de leitura vira lista vazia (nada configurado), sem lancar", async () => {
    mockGetCurrentUserProfile.mockResolvedValue({ id: "u1", tenant_id: "tenant-1", role: "sdr" });
    adminEq.mockResolvedValue({ data: null, error: { message: "boom" } });

    const result = await getConfiguredIntegrations();

    expect(result).toEqual({ success: true, data: [] });
  });
});
