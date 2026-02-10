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
  role: "admin" as const,
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

    it("rejects phone with non-numeric characters", async () => {
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
  });
});
