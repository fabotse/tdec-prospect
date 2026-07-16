/**
 * Unit tests for sendWhatsAppFromInsight Server Action
 * Story 13.7: Envio WhatsApp a Partir do Insight
 *
 * AC: #2 - Server action sendWhatsAppFromInsight
 * AC: #5 - Auto-mark insight as "used" on success
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createMockSupabaseClient,
  mockTableResponse,
  createChainBuilder,
} from "../../helpers/mock-supabase";

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
import { sendWhatsAppFromInsight } from "@/actions/whatsapp";

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

const validInput = {
  leadId: "550e8400-e29b-41d4-a716-446655440001",
  insightId: "550e8400-e29b-41d4-a716-446655440002",
  phone: "5511999999999",
  message: "Ola, vi seu post sobre IA!",
};

const mockInsertedMessage = {
  id: "msg-1",
  tenant_id: "tenant-1",
  campaign_id: null,
  lead_id: validInput.leadId,
  phone: validInput.phone,
  message: validInput.message,
  status: "pending",
  external_message_id: null,
  external_zaap_id: null,
  error_message: null,
  sent_at: null,
  created_at: "2026-02-28T12:00:00Z",
  updated_at: "2026-02-28T12:00:00Z",
};

const mockSentMessage = {
  ...mockInsertedMessage,
  status: "sent",
  external_message_id: "MSG-456",
  external_zaap_id: "ZAAP-123",
  sent_at: "2026-02-28T12:01:00Z",
};

// ==============================================
// HELPERS
// ==============================================

function setupMockClient() {
  const client = createMockSupabaseClient();

  const apiConfigsChain = createChainBuilder({
    data: { encrypted_key: "encrypted:zapi-credentials" },
    error: null,
  });
  const insertChain = createChainBuilder({
    data: mockInsertedMessage,
    error: null,
  });
  const updateChain = createChainBuilder({
    data: mockSentMessage,
    error: null,
  });
  const insightUpdateChain = createChainBuilder({
    data: null,
    error: null,
  });
  const leadsChain = createChainBuilder({
    data: { id: validInput.leadId },
    error: null,
  });

  let whatsappCallCount = 0;

  client.from.mockImplementation((table: string) => {
    if (table === "api_configs") return apiConfigsChain;
    if (table === "whatsapp_messages") {
      whatsappCallCount++;
      if (whatsappCallCount === 1) return insertChain;
      return updateChain;
    }
    if (table === "lead_insights") return insightUpdateChain;
    if (table === "leads") return leadsChain;
    return createChainBuilder();
  });

  vi.mocked(createClient).mockResolvedValue(client as never);

  return { client, apiConfigsChain, leadsChain, insertChain, updateChain, insightUpdateChain };
}

// ==============================================
// TESTS
// ==============================================

describe("sendWhatsAppFromInsight", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUserProfile).mockResolvedValue(mockProfile);
    mockSendText.mockResolvedValue({ zaapId: "ZAAP-123", messageId: "MSG-456" });
  });

  describe("successful flow", () => {
    it("returns success with sent message data", async () => {
      setupMockClient();

      const result = await sendWhatsAppFromInsight(validInput);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe("sent");
        expect(result.data.external_message_id).toBe("MSG-456");
        expect(result.data.external_zaap_id).toBe("ZAAP-123");
      }
    });

    // Story 13.11 (AC #2, Task 3.1): CONTRATO. O insight não tem campanha — o `null`
    // é semanticamente correto e é exatamente o que a migration 00059 legaliza (a
    // coluna era NOT NULL → 23502 → o envio falhava em 100% das tentativas em prod).
    // Se alguém "consertar" isto inventando uma campanha, este teste quebra: dado
    // falso poluiria as métricas por campanha (idx_whatsapp_messages_campaign_status).
    it("13.11 AC#2: inserts message with campaign_id=null (contract — do NOT invent a campaign)", async () => {
      const { insertChain } = setupMockClient();

      await sendWhatsAppFromInsight(validInput);

      expect(insertChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          campaign_id: null,
          lead_id: validInput.leadId,
        })
      );
    });

    // Story 13.11 (AC #2): o fluxo completo que a 00059 destrava, ponta a ponta —
    // insert (campaign_id null) → sendText → update 'sent' → insight 'used'.
    // O AC5 da 13.7 nunca era alcançado porque o insert falhava antes.
    it("13.11 AC#2: completes the full chain insert → sendText → sent → insight used", async () => {
      const { insertChain, updateChain, insightUpdateChain } = setupMockClient();

      const result = await sendWhatsAppFromInsight(validInput);

      expect(insertChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({ campaign_id: null, status: "pending" })
      );
      expect(mockSendText).toHaveBeenCalledWith(
        "zapi-credentials",
        validInput.phone,
        validInput.message
      );
      expect(updateChain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "sent",
          external_message_id: "MSG-456",
          external_zaap_id: "ZAAP-123",
        })
      );
      expect(insightUpdateChain.update).toHaveBeenCalledWith({ status: "used" });
      expect(result.success).toBe(true);
    });

    it("uses leadId directly without email resolution", async () => {
      const { insertChain } = setupMockClient();

      await sendWhatsAppFromInsight(validInput);

      expect(insertChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          lead_id: validInput.leadId,
        })
      );
    });

    it("calls ZApiService.sendText with decrypted key", async () => {
      setupMockClient();

      await sendWhatsAppFromInsight(validInput);

      expect(mockSendText).toHaveBeenCalledWith(
        "zapi-credentials",
        validInput.phone,
        validInput.message
      );
    });

    it("AC #5: auto-marks insight as used on success", async () => {
      const { insightUpdateChain } = setupMockClient();

      await sendWhatsAppFromInsight(validInput);

      expect(insightUpdateChain.update).toHaveBeenCalledWith({ status: "used" });
      expect(insightUpdateChain.eq).toHaveBeenCalledWith("id", validInput.insightId);
      expect(insightUpdateChain.eq).toHaveBeenCalledWith("tenant_id", mockProfile.tenant_id);
    });
  });

  describe("error flow", () => {
    it("updates message to failed when Z-API call fails", async () => {
      const { updateChain } = setupMockClient();
      mockSendText.mockRejectedValue(new Error("Tempo limite excedido"));

      const result = await sendWhatsAppFromInsight(validInput);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Falha ao enviar mensagem WhatsApp");
        expect(result.error).toContain("Tempo limite excedido");
      }
      expect(updateChain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "failed",
          error_message: "Tempo limite excedido",
        })
      );
    });

    it("does NOT mark insight as used on failure", async () => {
      const { insightUpdateChain } = setupMockClient();
      mockSendText.mockRejectedValue(new Error("Send failed"));

      await sendWhatsAppFromInsight(validInput);

      // insightUpdateChain.update should not be called with status: "used"
      // The update chain for lead_insights is only reached in the success path
      const updateCalls = insightUpdateChain.update.mock.calls;
      const usedCalls = updateCalls.filter(
        (call: unknown[]) => (call[0] as Record<string, unknown>)?.status === "used"
      );
      expect(usedCalls).toHaveLength(0);
    });
  });

  describe("authentication", () => {
    it("returns error when user is not authenticated", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(null);

      const result = await sendWhatsAppFromInsight(validInput);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("Não autenticado");
      }
    });
  });

  describe("Z-API not configured", () => {
    it("returns error when api_configs has no zapi entry", async () => {
      const client = createMockSupabaseClient();
      mockTableResponse(client, "api_configs", { data: null, error: { message: "not found" } });
      vi.mocked(createClient).mockResolvedValue(client as never);

      const result = await sendWhatsAppFromInsight(validInput);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Z-API não configurado");
      }
    });
  });

  describe("validation", () => {
    it("rejects invalid leadId", async () => {
      const result = await sendWhatsAppFromInsight({
        ...validInput,
        leadId: "not-a-uuid",
      });
      expect(result.success).toBe(false);
    });

    it("rejects invalid insightId", async () => {
      const result = await sendWhatsAppFromInsight({
        ...validInput,
        insightId: "not-a-uuid",
      });
      expect(result.success).toBe(false);
    });

    it("rejects empty message", async () => {
      const result = await sendWhatsAppFromInsight({
        ...validInput,
        message: "",
      });
      expect(result.success).toBe(false);
    });

    it("rejects short phone number", async () => {
      const result = await sendWhatsAppFromInsight({
        ...validInput,
        phone: "123",
      });
      expect(result.success).toBe(false);
    });

    it("accepts phone with + prefix", async () => {
      setupMockClient();

      const result = await sendWhatsAppFromInsight({
        ...validInput,
        phone: "+5511999999999",
      });
      expect(result.success).toBe(true);
    });

    it("sanitizes formatted phone before validation", async () => {
      setupMockClient();

      const result = await sendWhatsAppFromInsight({
        ...validInput,
        phone: "+55 (11) 99542-1150",
      });

      expect(result.success).toBe(true);
      expect(mockSendText).toHaveBeenCalledWith(
        "zapi-credentials",
        "+5511995421150",
        validInput.message
      );
    });

    it("rejects message exceeding 5000 characters", async () => {
      const result = await sendWhatsAppFromInsight({
        ...validInput,
        message: "a".repeat(5001),
      });
      expect(result.success).toBe(false);
    });
  });

  describe("insert failure", () => {
    it("returns error when whatsapp_messages insert fails", async () => {
      const client = createMockSupabaseClient();
      const apiConfigsChain = createChainBuilder({
        data: { encrypted_key: "encrypted:key" },
        error: null,
      });
      const leadsChain = createChainBuilder({ data: { id: validInput.leadId }, error: null });
      const insertChain = createChainBuilder({ data: null, error: { message: "insert failed" } });

      client.from.mockImplementation((table: string) => {
        if (table === "api_configs") return apiConfigsChain;
        if (table === "leads") return leadsChain;
        if (table === "whatsapp_messages") return insertChain;
        return createChainBuilder();
      });
      vi.mocked(createClient).mockResolvedValue(client as never);

      const result = await sendWhatsAppFromInsight(validInput);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Erro ao registrar mensagem");
      }
    });

    // Story 13.11 (AC #4): ESTE é o ramo que escondeu o bug. O insert violava o
    // NOT NULL de campaign_id (23502) e o early-return genérico engolia o erro —
    // nem log, nem propagação. Uma feature entregue, code-review aprovada e 100%
    // quebrada. Agora o erro real do Postgres é logado; o usuário segue vendo a
    // mensagem pt-BR genérica (não vaza detalhe de banco).
    it("13.11 AC#4: logs the real Postgres error while keeping the pt-BR message", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const client = createMockSupabaseClient();
      const apiConfigsChain = createChainBuilder({
        data: { encrypted_key: "encrypted:key" },
        error: null,
      });
      const leadsChain = createChainBuilder({ data: { id: validInput.leadId }, error: null });
      const insertChain = createChainBuilder({
        data: null,
        error: {
          code: "23502",
          message: 'null value in column "campaign_id" violates not-null constraint',
          // O PostgREST devolve a linha que falhou em `details` — telefone e corpo
          // da mensagem. NÃO pode ir para o log (ver assert de PII abaixo).
          details: `Failing row contains (msg-1, tenant-1, null, lead-1, ${validInput.phone}, ${validInput.message}, pending).`,
        },
      });

      client.from.mockImplementation((table: string) => {
        if (table === "api_configs") return apiConfigsChain;
        if (table === "leads") return leadsChain;
        if (table === "whatsapp_messages") return insertChain;
        return createChainBuilder();
      });
      vi.mocked(createClient).mockResolvedValue(client as never);

      const result = await sendWhatsAppFromInsight(validInput);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("falha ao registrar mensagem"),
        "23502",
        expect.stringContaining("not-null constraint")
      );

      // O log leva código + mensagem, NUNCA o objeto de erro inteiro: `details`
      // carrega telefone e corpo da mensagem (PII) e não pode vazar para o log.
      const loggedOutput = consoleSpy.mock.calls.flat().join(" ");
      expect(loggedOutput).not.toContain(validInput.phone);
      expect(loggedOutput).not.toContain(validInput.message);

      // Contrato do early-return: NÃO enviar mensagem que não foi registrada.
      // Sem este assert, mover o sendText para antes da guarda passa despercebido.
      expect(mockSendText).not.toHaveBeenCalled();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("Erro ao registrar mensagem. Tente novamente.");
        expect(result.error).not.toContain("23502");
      }

      consoleSpy.mockRestore();
    });
  });

  describe("lead ownership validation", () => {
    it("returns error when lead does not belong to tenant", async () => {
      const client = createMockSupabaseClient();
      const apiConfigsChain = createChainBuilder({
        data: { encrypted_key: "encrypted:key" },
        error: null,
      });
      const leadsChain = createChainBuilder({
        data: null,
        error: { message: "not found" },
      });

      client.from.mockImplementation((table: string) => {
        if (table === "api_configs") return apiConfigsChain;
        if (table === "leads") return leadsChain;
        return createChainBuilder();
      });
      vi.mocked(createClient).mockResolvedValue(client as never);

      const result = await sendWhatsAppFromInsight(validInput);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Lead não encontrado");
      }
    });

    it("verifies lead with tenant_id filter", async () => {
      const { leadsChain } = setupMockClient();

      await sendWhatsAppFromInsight(validInput);

      expect(leadsChain.eq).toHaveBeenCalledWith("id", validInput.leadId);
      expect(leadsChain.eq).toHaveBeenCalledWith("tenant_id", mockProfile.tenant_id);
    });
  });

  describe("insight auto-mark resilience", () => {
    it("returns success even when insight auto-mark fails", async () => {
      const client = createMockSupabaseClient();
      const apiConfigsChain = createChainBuilder({
        data: { encrypted_key: "encrypted:zapi-credentials" },
        error: null,
      });
      const leadsChain = createChainBuilder({
        data: { id: validInput.leadId },
        error: null,
      });
      const insertChain = createChainBuilder({
        data: mockInsertedMessage,
        error: null,
      });
      const updateChain = createChainBuilder({
        data: mockSentMessage,
        error: null,
      });
      const failingInsightChain = createChainBuilder({
        data: null,
        error: { message: "update failed" },
      });

      let whatsappCallCount = 0;
      client.from.mockImplementation((table: string) => {
        if (table === "api_configs") return apiConfigsChain;
        if (table === "leads") return leadsChain;
        if (table === "whatsapp_messages") {
          whatsappCallCount++;
          if (whatsappCallCount === 1) return insertChain;
          return updateChain;
        }
        if (table === "lead_insights") return failingInsightChain;
        return createChainBuilder();
      });
      vi.mocked(createClient).mockResolvedValue(client as never);

      const result = await sendWhatsAppFromInsight(validInput);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe("sent");
      }
    });
  });
});
