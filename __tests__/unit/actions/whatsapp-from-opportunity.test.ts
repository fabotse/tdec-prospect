/**
 * Unit tests for sendWhatsAppFromOpportunity Server Action
 * Story 21.5: Ações do Card + Próximo Passo por IA — AC #3, #7
 *
 * Espelha whatsapp-from-insight.test.ts. Pontos que NÃO são espelhados de lá
 * (e por isso têm teste próprio):
 * - `campaign_id` é VINCULADO à campanha da oportunidade (decisão Fabossi #3),
 *   não `null` como no insight.
 * - Pré-check contra campanha dangling (`opportunities.campaign_id` não tem FK).
 * - Auto-mark `contacted` SÓ no ramo de sucesso (decisão Fabossi #2).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockSupabaseClient, createChainBuilder } from "../../helpers/mock-supabase";

// ==============================================
// MOCKS
// ==============================================

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/supabase/tenant", () => ({
  getCurrentUserProfile: vi.fn(),
}));

vi.mock("@/lib/crypto/encryption", () => ({
  decryptApiKey: vi.fn((encrypted: string) => encrypted.replace("encrypted:", "")),
}));

const mockSendText = vi.fn();
vi.mock("@/lib/services/zapi", () => {
  return {
    ZApiService: class MockZApiService {
      sendText = mockSendText;
    },
  };
});

import { createClient } from "@/lib/supabase/server";
import { getCurrentUserProfile } from "@/lib/supabase/tenant";
import { sendWhatsAppFromOpportunity } from "@/actions/whatsapp";

// ==============================================
// FIXTURES
// ==============================================

const mockProfile = {
  id: "user-1",
  tenant_id: "tenant-1",
  role: "gestor" as const,
  full_name: "Test User",
  created_at: "2026-01-01",
  updated_at: "2026-01-01",
};

const CAMPAIGN_ID = "550e8400-e29b-41d4-a716-446655440003";

const validInput = {
  opportunityId: "550e8400-e29b-41d4-a716-446655440002",
  leadId: "550e8400-e29b-41d4-a716-446655440001",
  phone: "5511999999999",
  message: "Ola! Vi que voce se interessou.",
};

const mockInsertedMessage = {
  id: "msg-1",
  tenant_id: "tenant-1",
  campaign_id: CAMPAIGN_ID,
  lead_id: validInput.leadId,
  phone: validInput.phone,
  message: validInput.message,
  status: "pending",
  external_message_id: null,
  external_zaap_id: null,
  error_message: null,
  sent_at: null,
  created_at: "2026-07-15T12:00:00Z",
  updated_at: "2026-07-15T12:00:00Z",
};

const mockSentMessage = {
  ...mockInsertedMessage,
  status: "sent",
  external_message_id: "MSG-456",
  external_zaap_id: "ZAAP-123",
  sent_at: "2026-07-15T12:01:00Z",
};

// ==============================================
// HELPERS
// ==============================================

interface SetupOptions {
  /** Campanha existe em `campaigns`? false = dangling (campanha deletada). */
  campaignExists?: boolean;
  /** Erro NÃO-PGRST116 no pré-check da campanha (rede/timeout/RLS). */
  campaignPrecheckError?: { code: string; message: string };
  /** Oportunidade encontrada no tenant? */
  opportunityFound?: boolean;
  /** Lead pertence ao tenant? */
  leadFound?: boolean;
  /** Credenciais Z-API configuradas? */
  zapiConfigured?: boolean;
  /** Status atual da oportunidade. */
  opportunityStatus?: string;
  /** `lead_id` da oportunidade (default: o mesmo do input). */
  opportunityLeadId?: string | null;
}

function setupMockClient(options: SetupOptions = {}) {
  const {
    campaignExists = true,
    campaignPrecheckError,
    opportunityFound = true,
    leadFound = true,
    zapiConfigured = true,
    opportunityStatus = "viewed",
    opportunityLeadId = validInput.leadId,
  } = options;

  const client = createMockSupabaseClient();

  const apiConfigsChain = createChainBuilder(
    zapiConfigured
      ? { data: { encrypted_key: "encrypted:zapi-credentials" }, error: null }
      : { data: null, error: { code: "PGRST116" } }
  );
  const leadsChain = createChainBuilder(
    leadFound
      ? { data: { id: validInput.leadId }, error: null }
      : { data: null, error: { code: "PGRST116" } }
  );
  const opportunityLoadChain = createChainBuilder(
    opportunityFound
      ? {
          data: {
            campaign_id: CAMPAIGN_ID,
            status: opportunityStatus,
            lead_id: opportunityLeadId,
          },
          error: null,
        }
      : { data: null, error: { code: "PGRST116" } }
  );
  const opportunityMarkChain = createChainBuilder({ data: null, error: null });
  const campaignsChain = createChainBuilder(
    campaignPrecheckError
      ? { data: null, error: campaignPrecheckError }
      : campaignExists
        ? { data: { id: CAMPAIGN_ID }, error: null }
        : { data: null, error: { code: "PGRST116" } }
  );
  const insertChain = createChainBuilder({ data: mockInsertedMessage, error: null });
  const updateChain = createChainBuilder({ data: mockSentMessage, error: null });

  let whatsappCallCount = 0;
  let opportunityCallCount = 0;

  client.from.mockImplementation((table: string) => {
    if (table === "api_configs") return apiConfigsChain;
    if (table === "leads") return leadsChain;
    if (table === "campaigns") return campaignsChain;
    if (table === "opportunities") {
      opportunityCallCount++;
      return opportunityCallCount === 1 ? opportunityLoadChain : opportunityMarkChain;
    }
    if (table === "whatsapp_messages") {
      whatsappCallCount++;
      return whatsappCallCount === 1 ? insertChain : updateChain;
    }
    return createChainBuilder();
  });

  vi.mocked(createClient).mockResolvedValue(client as never);

  return {
    client,
    apiConfigsChain,
    leadsChain,
    campaignsChain,
    opportunityLoadChain,
    opportunityMarkChain,
    insertChain,
    updateChain,
  };
}

// ==============================================
// TESTS
// ==============================================

describe("sendWhatsAppFromOpportunity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUserProfile).mockResolvedValue(mockProfile);
    mockSendText.mockResolvedValue({ zaapId: "ZAAP-123", messageId: "MSG-456" });
  });

  describe("validação e auth", () => {
    it("rejeita opportunityId que não é UUID", async () => {
      setupMockClient();

      const result = await sendWhatsAppFromOpportunity({
        ...validInput,
        opportunityId: "not-a-uuid",
      });

      expect(result.success).toBe(false);
      expect(mockSendText).not.toHaveBeenCalled();
    });

    it("rejeita telefone em formato inválido", async () => {
      setupMockClient();

      const result = await sendWhatsAppFromOpportunity({ ...validInput, phone: "123" });

      expect(result.success).toBe(false);
      if (!result.success) expect(result.error).toContain("telefone");
      expect(mockSendText).not.toHaveBeenCalled();
    });

    it("rejeita mensagem vazia", async () => {
      setupMockClient();

      const result = await sendWhatsAppFromOpportunity({ ...validInput, message: "" });

      expect(result.success).toBe(false);
      expect(mockSendText).not.toHaveBeenCalled();
    });

    it("sanitiza o telefone antes de validar (parênteses/traços/espaços)", async () => {
      setupMockClient();

      const result = await sendWhatsAppFromOpportunity({
        ...validInput,
        phone: "+55 (11) 99999-9999",
      });

      expect(result.success).toBe(true);
      expect(mockSendText).toHaveBeenCalledWith(
        expect.anything(),
        "+5511999999999",
        validInput.message
      );
    });

    it("rejeita quando não autenticado", async () => {
      setupMockClient();
      vi.mocked(getCurrentUserProfile).mockResolvedValue(null);

      const result = await sendWhatsAppFromOpportunity(validInput);

      expect(result.success).toBe(false);
      if (!result.success) expect(result.error).toBe("Não autenticado");
      expect(mockSendText).not.toHaveBeenCalled();
    });

    it("falha quando as credenciais Z-API não estão configuradas", async () => {
      setupMockClient({ zapiConfigured: false });

      const result = await sendWhatsAppFromOpportunity(validInput);

      expect(result.success).toBe(false);
      if (!result.success) expect(result.error).toContain("Z-API");
      expect(mockSendText).not.toHaveBeenCalled();
    });

    it("rejeita lead de outro tenant (isolamento)", async () => {
      setupMockClient({ leadFound: false });

      const result = await sendWhatsAppFromOpportunity(validInput);

      expect(result.success).toBe(false);
      if (!result.success) expect(result.error).toContain("Lead não encontrado");
      expect(mockSendText).not.toHaveBeenCalled();
    });

    it("rejeita oportunidade de outro tenant / inexistente", async () => {
      setupMockClient({ opportunityFound: false });

      const result = await sendWhatsAppFromOpportunity(validInput);

      expect(result.success).toBe(false);
      if (!result.success) expect(result.error).toContain("Oportunidade não encontrada");
      expect(mockSendText).not.toHaveBeenCalled();
    });
  });

  describe("campaign_id (decisão Fabossi #3 — VINCULAR, não null)", () => {
    it("insere com o campaign_id da oportunidade — NÃO null (não espelha a 13.7)", async () => {
      const { insertChain } = setupMockClient();

      await sendWhatsAppFromOpportunity(validInput);

      expect(insertChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          campaign_id: CAMPAIGN_ID,
          lead_id: validInput.leadId,
          status: "pending",
        })
      );
    });

    it("pré-checa a campanha no tenant antes de inserir (FK 23503)", async () => {
      const { campaignsChain } = setupMockClient();

      await sendWhatsAppFromOpportunity(validInput);

      expect(campaignsChain.eq).toHaveBeenCalledWith("id", CAMPAIGN_ID);
      expect(campaignsChain.eq).toHaveBeenCalledWith("tenant_id", "tenant-1");
    });

    it("campanha dangling → insert com campaign_id: null e o envio ACONTECE", async () => {
      // Regressão contra a FK 23503: `opportunities.campaign_id` não tem FK e pode
      // apontar p/ campanha deletada ("Campanha desconhecida" da 21.4). Gravar esse
      // id quebraria o insert; gravar `null` é possível desde a 00059 (13.11) e NÃO
      // bloqueia um lead quente por causa de bookkeeping de campanha (decisão #3).
      const { insertChain } = setupMockClient({ campaignExists: false });

      const result = await sendWhatsAppFromOpportunity(validInput);

      expect(result.success).toBe(true);
      expect(insertChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({ campaign_id: null, lead_id: validInput.leadId })
      );
      expect(mockSendText).toHaveBeenCalled();
    });

    it("erro NÃO-PGRST116 no pré-check não é tratado como dangling (não perde a atribuição)", async () => {
      // Uma queda de rede devolve `campaign: null` igual a uma campanha deletada.
      // Sem distinguir, gravaríamos `campaign_id: null` e perderíamos o vínculo
      // com a campanha em silêncio — pior que falhar.
      const { insertChain } = setupMockClient({
        campaignPrecheckError: { code: "08006", message: "connection failure" },
      });

      const result = await sendWhatsAppFromOpportunity(validInput);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Erro ao verificar a campanha de origem");
      }
      expect(insertChain.insert).not.toHaveBeenCalled();
      expect(mockSendText).not.toHaveBeenCalled();
    });

    it("lead que não pertence à oportunidade é rejeitado (sem envio)", async () => {
      // `leadId` e `opportunityId` chegam do cliente e são validados de forma
      // independente contra o tenant — sem esta amarração, um par (oportunidade A,
      // lead B) do mesmo tenant registraria o envio sob o lead errado.
      const { insertChain } = setupMockClient({
        opportunityLeadId: "550e8400-e29b-41d4-a716-4466554409ff",
      });

      const result = await sendWhatsAppFromOpportunity(validInput);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("não pertence a esta oportunidade");
      }
      expect(insertChain.insert).not.toHaveBeenCalled();
      expect(mockSendText).not.toHaveBeenCalled();
    });

    it("oportunidade sem lead (lead_id null) é rejeitada (sem envio)", async () => {
      const { insertChain } = setupMockClient({ opportunityLeadId: null });

      const result = await sendWhatsAppFromOpportunity(validInput);

      expect(result.success).toBe(false);
      expect(insertChain.insert).not.toHaveBeenCalled();
      expect(mockSendText).not.toHaveBeenCalled();
    });
  });

  describe("fluxo de sucesso", () => {
    it("retorna a mensagem enviada", async () => {
      setupMockClient();

      const result = await sendWhatsAppFromOpportunity(validInput);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe("sent");
        expect(result.data.external_message_id).toBe("MSG-456");
        expect(result.data.external_zaap_id).toBe("ZAAP-123");
      }
    });

    it("auto-marca a oportunidade como 'contacted' (decisão #2)", async () => {
      const { opportunityMarkChain } = setupMockClient();

      await sendWhatsAppFromOpportunity(validInput);

      expect(opportunityMarkChain.update).toHaveBeenCalledWith({ status: "contacted" });
      expect(opportunityMarkChain.eq).toHaveBeenCalledWith("id", validInput.opportunityId);
      expect(opportunityMarkChain.eq).toHaveBeenCalledWith("tenant_id", "tenant-1");
    });

    it("o auto-mark só promove de new/viewed (não rebaixa meeting_booked nem ressuscita discarded)", async () => {
      const { opportunityMarkChain } = setupMockClient();

      await sendWhatsAppFromOpportunity(validInput);

      expect(opportunityMarkChain.in).toHaveBeenCalledWith("status", ["new", "viewed"]);
    });

    it("falha do auto-mark NÃO derruba o envio já feito (isolado)", async () => {
      const { opportunityMarkChain } = setupMockClient();
      opportunityMarkChain.in.mockRejectedValueOnce(new Error("DB down"));

      const result = await sendWhatsAppFromOpportunity(validInput);

      expect(result.success).toBe(true);
    });

    it("marca a mensagem como 'sent' com os ids externos", async () => {
      const { updateChain } = setupMockClient();

      await sendWhatsAppFromOpportunity(validInput);

      expect(updateChain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "sent",
          external_message_id: "MSG-456",
          external_zaap_id: "ZAAP-123",
        })
      );
    });
  });

  describe("falha da Z-API", () => {
    it("marca a mensagem como 'failed' com a mensagem de erro", async () => {
      const { updateChain } = setupMockClient();
      mockSendText.mockRejectedValueOnce(new Error("Instancia desconectada"));

      const result = await sendWhatsAppFromOpportunity(validInput);

      expect(result.success).toBe(false);
      expect(updateChain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "failed",
          error_message: "Instancia desconectada",
        })
      );
    });

    it("NÃO auto-marca 'contacted' quando o envio falha (decisão #2: 'se o envio for feito')", async () => {
      const { opportunityMarkChain } = setupMockClient();
      mockSendText.mockRejectedValueOnce(new Error("Instancia desconectada"));

      const result = await sendWhatsAppFromOpportunity(validInput);

      expect(result.success).toBe(false);
      expect(opportunityMarkChain.update).not.toHaveBeenCalled();
    });

    it("retorna erro em pt-BR", async () => {
      setupMockClient();
      mockSendText.mockRejectedValueOnce(new Error("Instancia desconectada"));

      const result = await sendWhatsAppFromOpportunity(validInput);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Falha ao enviar mensagem WhatsApp");
      }
    });
  });
});
