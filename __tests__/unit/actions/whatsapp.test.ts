/**
 * Unit tests for WhatsApp Server Actions
 * Story: 11.4 - Envio Individual de WhatsApp
 *
 * AC: #2 - Server action sendWhatsAppMessage
 * Tests: full flow (pending→sent), error flow (pending→failed),
 *        Z-API not configured, lead not found, validation errors
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
import { sendWhatsAppMessage } from "@/actions/whatsapp";

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
  campaignId: "550e8400-e29b-41d4-a716-446655440000",
  leadEmail: "lead@example.com",
  phone: "5511999999999",
  message: "Olá, tudo bem?",
};

const mockInsertedMessage = {
  id: "msg-1",
  tenant_id: "tenant-1",
  campaign_id: validInput.campaignId,
  lead_id: "lead-1",
  phone: validInput.phone,
  message: validInput.message,
  status: "pending",
  external_message_id: null,
  external_zaap_id: null,
  error_message: null,
  sent_at: null,
  created_at: "2026-02-10T12:00:00Z",
  updated_at: "2026-02-10T12:00:00Z",
};

const mockSentMessage = {
  ...mockInsertedMessage,
  status: "sent",
  external_message_id: "MSG-456",
  external_zaap_id: "ZAAP-123",
  sent_at: "2026-02-10T12:01:00Z",
};

// ==============================================
// HELPERS
// ==============================================

function setupMockClient() {
  const client = createMockSupabaseClient();

  // api_configs — Z-API credentials
  const apiConfigsChain = createChainBuilder({
    data: { encrypted_key: "encrypted:zapi-credentials" },
    error: null,
  });
  // leads — resolve leadId
  const leadsChain = createChainBuilder({
    data: { id: "lead-1" },
    error: null,
  });
  // whatsapp_messages — insert
  const insertChain = createChainBuilder({
    data: mockInsertedMessage,
    error: null,
  });
  // whatsapp_messages — update (sent)
  const updateChain = createChainBuilder({
    data: mockSentMessage,
    error: null,
  });

  // Track call count to whatsapp_messages
  let whatsappCallCount = 0;

  client.from.mockImplementation((table: string) => {
    if (table === "api_configs") return apiConfigsChain;
    if (table === "leads") return leadsChain;
    if (table === "whatsapp_messages") {
      whatsappCallCount++;
      // First call = insert, second call = update
      if (whatsappCallCount === 1) return insertChain;
      return updateChain;
    }
    return createChainBuilder();
  });

  vi.mocked(createClient).mockResolvedValue(client as never);

  return { client, apiConfigsChain, leadsChain, insertChain, updateChain };
}

// ==============================================
// TESTS
// ==============================================

describe("sendWhatsAppMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUserProfile).mockResolvedValue(mockProfile);
    mockSendText.mockResolvedValue({ zaapId: "ZAAP-123", messageId: "MSG-456" });
  });

  describe("successful flow (pending → sent)", () => {
    it("returns success with sent message data", async () => {
      setupMockClient();

      const result = await sendWhatsAppMessage(validInput);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe("sent");
        expect(result.data.external_message_id).toBe("MSG-456");
        expect(result.data.external_zaap_id).toBe("ZAAP-123");
      }
    });

    it("inserts pending message before calling Z-API", async () => {
      const { insertChain } = setupMockClient();

      await sendWhatsAppMessage(validInput);

      expect(insertChain.insert).toHaveBeenCalled();
    });

    // Story 13.11 (AC #3): a migration 00059 afrouxou whatsapp_messages.campaign_id
    // para NULLABLE (o fluxo de insight não tem campanha). O fluxo DE CAMPANHA não é
    // afetado: continua gravando o campaign_id REAL. Regressão explícita.
    it("13.11 AC#3: inserts the REAL campaign_id (unaffected by nullable relaxation)", async () => {
      const { insertChain } = setupMockClient();

      await sendWhatsAppMessage(validInput);

      expect(insertChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          campaign_id: validInput.campaignId,
          lead_id: "lead-1",
        })
      );
    });

    it("calls ZApiService.sendText with decrypted key, phone, message", async () => {
      setupMockClient();

      await sendWhatsAppMessage(validInput);

      expect(mockSendText).toHaveBeenCalledWith(
        "zapi-credentials",
        validInput.phone,
        validInput.message
      );
    });

    it("updates message to sent with external IDs after Z-API success", async () => {
      const { updateChain } = setupMockClient();

      await sendWhatsAppMessage(validInput);

      expect(updateChain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "sent",
          external_message_id: "MSG-456",
          external_zaap_id: "ZAAP-123",
        })
      );
    });

    it("resolves leadId from leads table using email + tenant_id", async () => {
      const { leadsChain } = setupMockClient();

      await sendWhatsAppMessage(validInput);

      expect(leadsChain.eq).toHaveBeenCalledWith("email", validInput.leadEmail);
      expect(leadsChain.eq).toHaveBeenCalledWith("tenant_id", mockProfile.tenant_id);
    });
  });

  describe("error flow (pending → failed)", () => {
    it("updates message to failed when Z-API call fails", async () => {
      const { updateChain } = setupMockClient();
      mockSendText.mockRejectedValue(new Error("Tempo limite excedido"));

      const result = await sendWhatsAppMessage(validInput);

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
  });

  describe("Z-API not configured", () => {
    it("returns error when api_configs has no zapi entry", async () => {
      const client = createMockSupabaseClient();
      mockTableResponse(client, "api_configs", { data: null, error: { message: "not found" } });
      vi.mocked(createClient).mockResolvedValue(client as never);

      const result = await sendWhatsAppMessage(validInput);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Z-API não configurado");
      }
    });
  });

  describe("lead not found", () => {
    it("returns error when lead email does not exist", async () => {
      const client = createMockSupabaseClient();
      const apiConfigsChain = createChainBuilder({
        data: { encrypted_key: "encrypted:key" },
        error: null,
      });
      const leadsChain = createChainBuilder({ data: null, error: { message: "not found" } });

      client.from.mockImplementation((table: string) => {
        if (table === "api_configs") return apiConfigsChain;
        if (table === "leads") return leadsChain;
        return createChainBuilder();
      });
      vi.mocked(createClient).mockResolvedValue(client as never);

      const result = await sendWhatsAppMessage(validInput);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Lead não encontrado");
      }
    });
  });

  describe("authentication", () => {
    it("returns error when user is not authenticated", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(null);

      const result = await sendWhatsAppMessage(validInput);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("Não autenticado");
      }
    });
  });

  describe("validation", () => {
    it("rejects invalid campaign ID", async () => {
      const result = await sendWhatsAppMessage({
        ...validInput,
        campaignId: "not-a-uuid",
      });

      expect(result.success).toBe(false);
    });

    it("rejects invalid email", async () => {
      const result = await sendWhatsAppMessage({
        ...validInput,
        leadEmail: "not-an-email",
      });

      expect(result.success).toBe(false);
    });

    it("rejects empty message", async () => {
      const result = await sendWhatsAppMessage({
        ...validInput,
        message: "",
      });

      expect(result.success).toBe(false);
    });

    it("rejects short phone number", async () => {
      const result = await sendWhatsAppMessage({
        ...validInput,
        phone: "123",
      });

      expect(result.success).toBe(false);
    });

    it("rejects phone with non-numeric characters that result in too few digits", async () => {
      const result = await sendWhatsAppMessage({
        ...validInput,
        phone: "55abc99999",
      });

      expect(result.success).toBe(false);
    });

    it("accepts phone with + prefix", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(mockProfile);
      setupMockClient();

      const result = await sendWhatsAppMessage({
        ...validInput,
        phone: "+5511999999999",
      });

      expect(result.success).toBe(true);
    });

    it("sanitizes formatted phone: strips parens, dashes, spaces before validation", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(mockProfile);
      setupMockClient();

      const result = await sendWhatsAppMessage({
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

    it("sanitizes phone with only parens and spaces", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(mockProfile);
      setupMockClient();

      const result = await sendWhatsAppMessage({
        ...validInput,
        phone: "(11) 99999-9999",
      });

      expect(result.success).toBe(true);
      expect(mockSendText).toHaveBeenCalledWith(
        "zapi-credentials",
        "11999999999",
        validInput.message
      );
    });

    it("rejects message exceeding 5000 characters", async () => {
      const result = await sendWhatsAppMessage({
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
      const leadsChain = createChainBuilder({ data: { id: "lead-1" }, error: null });
      const insertChain = createChainBuilder({ data: null, error: { message: "insert failed" } });

      client.from.mockImplementation((table: string) => {
        if (table === "api_configs") return apiConfigsChain;
        if (table === "leads") return leadsChain;
        if (table === "whatsapp_messages") return insertChain;
        return createChainBuilder();
      });
      vi.mocked(createClient).mockResolvedValue(client as never);

      const result = await sendWhatsAppMessage(validInput);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Erro ao registrar mensagem");
      }
    });

    // Story 13.11 (AC #4): o early-return genérico deste ramo escondeu um bug de
    // produção — o 23502 real da 13.7 nunca era logado nem propagado. Agora o erro
    // do Postgres (código + mensagem) vai para o log, SEM vazar para o usuário.
    it("13.11 AC#4: logs the real Postgres error while keeping the pt-BR message", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const client = createMockSupabaseClient();
      const apiConfigsChain = createChainBuilder({
        data: { encrypted_key: "encrypted:key" },
        error: null,
      });
      const leadsChain = createChainBuilder({ data: { id: "lead-1" }, error: null });
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

      const result = await sendWhatsAppMessage(validInput);

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

      // A mensagem ao usuário permanece genérica em pt-BR (não vaza detalhe de banco)
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("Erro ao registrar mensagem. Tente novamente.");
        expect(result.error).not.toContain("23502");
      }

      consoleSpy.mockRestore();
    });
  });
});
