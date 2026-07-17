/**
 * Unit Tests for POST /api/campaigns/[campaignId]/leads/sequence-actions
 * Story 21.9: Controle Manual de Sequência por Lead (FR18)
 *
 * AC#1/#2 — stop (update-interest-status 1/-1, status local promote-only, interaction)
 * AC#3 — remove (lookup por e-mail + DELETE, admin-only, dados locais preservados)
 * AC#7 — ordem REMOTO→LOCAL + fail-safe (nada local se o Instantly falhar)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/campaigns/[campaignId]/leads/sequence-actions/route";
import {
  createChainBuilder,
  type ChainBuilder,
} from "../../helpers/mock-supabase";
import { ExternalServiceError } from "@/lib/services/base-service";

// Mock dependencies
const mockGetCurrentUserProfile = vi.fn();
const mockGetApiKey = vi.fn();
const mockMatchLeadId = vi.fn();
const mockUpdateLeadInterestStatus = vi.fn();
const mockFindLeadIdByEmail = vi.fn();
const mockDeleteLead = vi.fn();
const mockFrom = vi.fn();
const mockAdminClient = { from: vi.fn() };
const mockCreateAdminClient = vi.fn();

vi.mock("@/lib/supabase/tenant", () => ({
  getCurrentUserProfile: (...args: unknown[]) => mockGetCurrentUserProfile(...args),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ from: mockFrom })),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: (...args: unknown[]) => mockCreateAdminClient(...args),
}));

vi.mock("@/lib/utils/monitoring-processor", () => ({
  getApiKey: (...args: unknown[]) => mockGetApiKey(...args),
  logMonitoringUsage: vi.fn(),
}));

vi.mock("@/lib/utils/reply-processor", () => ({
  matchLeadId: (...args: unknown[]) => mockMatchLeadId(...args),
}));

vi.mock("@/lib/services/instantly", () => ({
  InstantlyService: vi.fn().mockImplementation(function () {
    return {
      updateLeadInterestStatus: mockUpdateLeadInterestStatus,
      findLeadIdByEmail: mockFindLeadIdByEmail,
      deleteLead: mockDeleteLead,
    };
  }),
}));

const CAMPAIGN_ID = "12345678-1234-1234-1234-123456789abc";
const LOCAL_LEAD_ID = "local-lead-1";

const adminProfile = { id: "user-admin", tenant_id: "tenant-1", role: "gestor" };
const sdrProfile = { id: "user-sdr", tenant_id: "tenant-1", role: "sdr" };

function createRequest(body: unknown) {
  return new NextRequest(
    `http://localhost/api/campaigns/${CAMPAIGN_ID}/leads/sequence-actions`,
    {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    }
  );
}

function routeParams(campaignId: string = CAMPAIGN_ID) {
  return { params: Promise.resolve({ campaignId }) };
}

const stopBody = {
  action: "stop",
  leadEmail: "lead@example.com",
  reason: "responded_other_channel",
};

const removeBody = { action: "remove", leadEmail: "lead@example.com" };

describe("POST /api/campaigns/[campaignId]/leads/sequence-actions", () => {
  let campaignsChain: ChainBuilder;
  let leadsChain: ChainBuilder;
  let interactionsChain: ChainBuilder;

  function setupTables(options?: {
    campaign?: unknown;
    campaignError?: unknown;
    leadStatus?: string;
    interactionError?: unknown;
  }) {
    const campaign =
      options?.campaign !== undefined
        ? options.campaign
        : { id: CAMPAIGN_ID, external_campaign_id: "ext-camp-1" };
    campaignsChain = createChainBuilder({
      data: campaign,
      error: options?.campaignError ?? null,
    });
    leadsChain = createChainBuilder({
      data: { status: options?.leadStatus ?? "novo" },
      error: null,
    });
    interactionsChain = createChainBuilder({
      data: null,
      error: options?.interactionError ?? null,
    });
    mockFrom.mockImplementation((table: string) => {
      if (table === "campaigns") return campaignsChain;
      if (table === "leads") return leadsChain;
      if (table === "lead_interactions") return interactionsChain;
      return createChainBuilder();
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    setupTables();
    mockGetCurrentUserProfile.mockResolvedValue(adminProfile);
    mockCreateAdminClient.mockReturnValue(mockAdminClient);
    mockGetApiKey.mockResolvedValue("instantly-key");
    mockMatchLeadId.mockResolvedValue(LOCAL_LEAD_ID);
    mockUpdateLeadInterestStatus.mockResolvedValue({ accepted: true });
    mockFindLeadIdByEmail.mockResolvedValue("instantly-lead-1");
    mockDeleteLead.mockResolvedValue({ deleted: true });
  });

  // ==============================================
  // Auth + validação (Task 4.1/4.2/4.3)
  // ==============================================

  it("returns 401 when user is not authenticated", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(null);

    const response = await POST(createRequest(stopBody), routeParams());
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Não autenticado");
  });

  it("returns 400 for invalid campaignId (not UUID)", async () => {
    const response = await POST(createRequest(stopBody), routeParams("not-a-uuid"));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("ID de campanha inválido");
  });

  it("returns 400 for non-JSON body", async () => {
    const response = await POST(createRequest("not-json"), routeParams());

    expect(response.status).toBe(400);
  });

  it("returns 400 when action=stop has no reason", async () => {
    const response = await POST(
      createRequest({ action: "stop", leadEmail: "lead@example.com" }),
      routeParams()
    );

    expect(response.status).toBe(400);
    expect(mockUpdateLeadInterestStatus).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid leadEmail", async () => {
    const response = await POST(
      createRequest({ ...stopBody, leadEmail: "not-an-email" }),
      routeParams()
    );

    expect(response.status).toBe(400);
  });

  it("returns 400 for unknown action", async () => {
    const response = await POST(
      createRequest({ action: "pause", leadEmail: "lead@example.com" }),
      routeParams()
    );

    expect(response.status).toBe(400);
  });

  it("returns 404 when campaign is not found in tenant", async () => {
    setupTables({ campaign: null, campaignError: { code: "PGRST116" } });

    const response = await POST(createRequest(stopBody), routeParams());
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe("Campanha não encontrada");
  });

  it("returns 400 when campaign has no external_campaign_id", async () => {
    setupTables({ campaign: { id: CAMPAIGN_ID, external_campaign_id: null } });

    const response = await POST(createRequest(stopBody), routeParams());
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Campanha ainda não exportada para o Instantly");
    expect(mockUpdateLeadInterestStatus).not.toHaveBeenCalled();
  });

  // ==============================================
  // Gating por papel (Task 4.3 — AC3)
  // ==============================================

  it("returns 403 when non-admin tries remove", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(sdrProfile);

    const response = await POST(createRequest(removeBody), routeParams());
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toBe("Acesso negado");
    expect(mockFindLeadIdByEmail).not.toHaveBeenCalled();
    expect(mockDeleteLead).not.toHaveBeenCalled();
  });

  it("allows stop for SDR (qualquer papel do tenant — AC1)", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(sdrProfile);

    const response = await POST(createRequest(stopBody), routeParams());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockUpdateLeadInterestStatus).toHaveBeenCalledTimes(1);
  });

  // ==============================================
  // API key via client ADMIN (Task 4.4 — lição patch 4 review 21.5)
  // ==============================================

  it("reads the Instantly key with the ADMIN client (RLS is_admin em api_configs)", async () => {
    await POST(createRequest(stopBody), routeParams());

    expect(mockGetApiKey).toHaveBeenCalledWith(
      mockAdminClient,
      "tenant-1",
      "instantly"
    );
  });

  it("returns 404 when Instantly API key is not configured", async () => {
    mockGetApiKey.mockResolvedValue(null);

    const response = await POST(createRequest(stopBody), routeParams());
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe("API key do Instantly não configurada");
    expect(mockUpdateLeadInterestStatus).not.toHaveBeenCalled();
  });

  it("returns 500 when the admin client is unavailable (service-role key ausente)", async () => {
    mockCreateAdminClient.mockImplementation(() => {
      throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
    });

    const response = await POST(createRequest(stopBody), routeParams());

    expect(response.status).toBe(500);
    expect(mockUpdateLeadInterestStatus).not.toHaveBeenCalled();
  });

  // ==============================================
  // stop — AC1/AC2/AC7
  // ==============================================

  it("stop (responded_other_channel): interest 1, interaction e promoção do lead", async () => {
    const response = await POST(createRequest(stopBody), routeParams());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toMatchObject({ success: true, action: "stop", localSynced: true });

    // Remoto com o external_campaign_id (não o local) e interest_value 1.
    expect(mockUpdateLeadInterestStatus).toHaveBeenCalledWith({
      apiKey: "instantly-key",
      campaignId: "ext-camp-1",
      leadEmail: "lead@example.com",
      interestValue: 1,
    });

    // Interaction registra a ação com o motivo (AC1/FR18).
    expect(interactionsChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        lead_id: LOCAL_LEAD_ID,
        tenant_id: "tenant-1",
        type: "sequence_stopped",
        created_by: adminProfile.id,
        content: expect.stringContaining("outro canal"),
      })
    );

    // Status local promovido para interessado (novo → interessado).
    expect(leadsChain.update).toHaveBeenCalledWith({ status: "interessado" });
  });

  it("stop happens REMOTE-first: Instantly antes de qualquer efeito local (AC7)", async () => {
    await POST(createRequest(stopBody), routeParams());

    const remoteOrder = mockUpdateLeadInterestStatus.mock.invocationCallOrder[0];
    const localInsertOrder = interactionsChain.insert.mock.invocationCallOrder[0];
    const localUpdateOrder = leadsChain.update.mock.invocationCallOrder[0];

    expect(remoteOrder).toBeLessThan(localInsertOrder);
    expect(remoteOrder).toBeLessThan(localUpdateOrder);
  });

  it("stop (do_not_contact): interest -1 e status local nao_interessado (AC2)", async () => {
    const response = await POST(
      createRequest({ ...stopBody, reason: "do_not_contact" }),
      routeParams()
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.localSynced).toBe(true);
    expect(mockUpdateLeadInterestStatus).toHaveBeenCalledWith(
      expect.objectContaining({ interestValue: -1 })
    );
    expect(leadsChain.update).toHaveBeenCalledWith({ status: "nao_interessado" });
    expect(interactionsChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ type: "sequence_stopped" })
    );
  });

  it("stop NÃO rebaixa lead 'oportunidade' (guarda promote-only — AC1)", async () => {
    setupTables({ leadStatus: "oportunidade" });

    const response = await POST(createRequest(stopBody), routeParams());

    expect(response.status).toBe(200);
    // Interaction ainda registra a ação; o status permanece intocado.
    expect(interactionsChain.insert).toHaveBeenCalled();
    expect(leadsChain.update).not.toHaveBeenCalled();
  });

  it("stop (do_not_contact) também preserva lead 'oportunidade' (guarda 21.3)", async () => {
    setupTables({ leadStatus: "oportunidade" });

    await POST(
      createRequest({ ...stopBody, reason: "do_not_contact" }),
      routeParams()
    );

    expect(leadsChain.update).not.toHaveBeenCalled();
  });

  it("stop com lead local não encontrado: 200 com localSynced=false (Task 4.5c)", async () => {
    mockMatchLeadId.mockResolvedValue(null);

    const response = await POST(createRequest(stopBody), routeParams());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toMatchObject({ success: true, localSynced: false });
    expect(interactionsChain.insert).not.toHaveBeenCalled();
    expect(leadsChain.update).not.toHaveBeenCalled();
  });

  it("stop com falha remota: erro PT-BR e NADA local gravado (fail-safe AC7)", async () => {
    mockUpdateLeadInterestStatus.mockRejectedValue(
      new ExternalServiceError("instantly", 429, "Limite de requisições atingido. Aguarde e tente novamente.")
    );

    const response = await POST(createRequest(stopBody), routeParams());
    const data = await response.json();

    expect(response.status).toBe(429);
    expect(data.error).toBe("Limite de requisições atingido. Aguarde e tente novamente.");
    expect(interactionsChain.insert).not.toHaveBeenCalled();
    expect(leadsChain.update).not.toHaveBeenCalled();
  });

  it("stop com falha no insert da interaction: 200 com localSynced=false", async () => {
    setupTables({
      interactionError: { code: "22P02", message: "invalid input value for enum" },
    });

    const response = await POST(createRequest(stopBody), routeParams());
    const data = await response.json();

    // A ação remota já foi executada com sucesso — não vira erro para o usuário.
    expect(response.status).toBe(200);
    expect(data.localSynced).toBe(false);
  });

  // ==============================================
  // remove — AC3/AC7
  // ==============================================

  it("remove: resolve o ID no Instantly por e-mail e deleta (admin)", async () => {
    const response = await POST(createRequest(removeBody), routeParams());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toMatchObject({ success: true, action: "remove", localSynced: true });

    expect(mockFindLeadIdByEmail).toHaveBeenCalledWith({
      apiKey: "instantly-key",
      campaignId: "ext-camp-1",
      email: "lead@example.com",
    });
    expect(mockDeleteLead).toHaveBeenCalledWith({
      apiKey: "instantly-key",
      leadId: "instantly-lead-1",
    });

    // Interaction lead_removed registrada para o lead local.
    expect(interactionsChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        lead_id: LOCAL_LEAD_ID,
        type: "lead_removed",
        created_by: adminProfile.id,
      })
    );
  });

  it("remove NÃO apaga leads nem campaign_leads locais (AC3)", async () => {
    await POST(createRequest(removeBody), routeParams());

    expect(leadsChain.delete).not.toHaveBeenCalled();
    const tablesTouched = mockFrom.mock.calls.map((c) => c[0]);
    expect(tablesTouched).not.toContain("campaign_leads");
  });

  it("remove com lead não encontrado no Instantly: 404 PT-BR e sem delete", async () => {
    mockFindLeadIdByEmail.mockResolvedValue(null);

    const response = await POST(createRequest(removeBody), routeParams());
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe(
      "Lead não encontrado no Instantly — ele pode já ter sido removido"
    );
    expect(mockDeleteLead).not.toHaveBeenCalled();
    expect(interactionsChain.insert).not.toHaveBeenCalled();
  });

  it("remove com falha remota no delete: erro propagado e NADA local gravado (AC7)", async () => {
    mockDeleteLead.mockRejectedValue(
      new ExternalServiceError("instantly", 500, "Erro na comunicação com Instantly.")
    );

    const response = await POST(createRequest(removeBody), routeParams());
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Erro na comunicação com Instantly.");
    expect(interactionsChain.insert).not.toHaveBeenCalled();
  });

  it("remove com lead local inexistente: 200 com localSynced=false (histórico só no Instantly)", async () => {
    mockMatchLeadId.mockResolvedValue(null);

    const response = await POST(createRequest(removeBody), routeParams());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toMatchObject({ success: true, localSynced: false });
    expect(mockDeleteLead).toHaveBeenCalledTimes(1);
    expect(interactionsChain.insert).not.toHaveBeenCalled();
  });

  // ==============================================
  // Erro inesperado
  // ==============================================

  it("returns 500 with generic PT-BR message on unexpected error", async () => {
    mockUpdateLeadInterestStatus.mockRejectedValue(new Error("boom"));

    const response = await POST(createRequest(stopBody), routeParams());
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Erro interno ao executar ação de sequência");
  });
});
