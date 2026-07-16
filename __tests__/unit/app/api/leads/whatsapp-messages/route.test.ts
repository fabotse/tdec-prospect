/**
 * Tests for Lead WhatsApp Messages API Route
 * Story 11.7: Tracking e Histórico de Mensagens WhatsApp (AC #4)
 * Story 13.11 (code review): LEFT join — mensagens sem campanha no histórico
 *
 * A rota era `campaigns!inner(name)` (INNER JOIN). Enquanto
 * `whatsapp_messages.campaign_id` era NOT NULL isso era inerte — nenhuma linha
 * podia ter `campaign_id NULL`. A migration 00059 (Story 13.11) tornou a coluna
 * nullable justamente para o envio a partir de um insight (13.7, sem campanha),
 * e aí o INNER JOIN passaria a DESCARTAR EM SILÊNCIO exatamente as linhas que a
 * story existe para permitir: a mensagem seria enviada e sumiria do histórico.
 * Estes testes travam o LEFT join + o acesso null-safe.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockSupabaseClient, createChainBuilder } from "../../../../../helpers/mock-supabase";

// ==============================================
// MOCKS
// ==============================================

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/supabase/tenant", () => ({
  getCurrentUserProfile: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { getCurrentUserProfile } from "@/lib/supabase/tenant";
import { GET } from "@/app/api/leads/whatsapp-messages/route";

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

const LEAD_EMAIL = "lead@example.com";

function buildRequest(email = LEAD_EMAIL) {
  return new Request(`http://localhost/api/leads/whatsapp-messages?email=${encodeURIComponent(email)}`);
}

/** Linha de mensagem nascida de uma CAMPANHA (join casa). */
const campaignMessageRow = {
  id: "msg-campaign",
  tenant_id: "tenant-1",
  campaign_id: "550e8400-e29b-41d4-a716-446655440000",
  lead_id: "lead-1",
  phone: "5511999999999",
  message: "Mensagem de campanha",
  status: "sent",
  campaigns: { name: "Campanha Q3" },
};

/**
 * Linha nascida de um INSIGHT (13.7): `campaign_id NULL` → LEFT join devolve
 * `campaigns: null`. É a linha que a 00059 passou a permitir.
 */
const insightMessageRow = {
  id: "msg-insight",
  tenant_id: "tenant-1",
  campaign_id: null,
  lead_id: "lead-1",
  phone: "5511999999999",
  message: "Vi seu post sobre IA!",
  status: "sent",
  campaigns: null,
};

function setupMockClient(messageRows: unknown[]) {
  const client = createMockSupabaseClient();
  const leadsChain = createChainBuilder({ data: { id: "lead-1" }, error: null });
  const messagesChain = createChainBuilder({ data: messageRows, error: null });

  client.from.mockImplementation((table: string) => {
    if (table === "leads") return leadsChain;
    if (table === "whatsapp_messages") return messagesChain;
    return createChainBuilder();
  });
  vi.mocked(createClient).mockResolvedValue(client as never);

  return { messagesChain };
}

// ==============================================
// TESTS
// ==============================================

describe("GET /api/leads/whatsapp-messages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUserProfile).mockResolvedValue(mockProfile as never);
  });

  describe("13.11 code review: mensagens sem campanha (campaign_id NULL)", () => {
    // ESTE é o teste que faltava. Sem o LEFT join a linha do insight nem chega aqui:
    // o INNER JOIN a remove no banco e a asserção de comprimento falha.
    it("inclui no histórico a mensagem de insight (campaign_id NULL) — não pode ser descartada", async () => {
      setupMockClient([campaignMessageRow, insightMessageRow]);

      const response = await GET(buildRequest());
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.data).toHaveLength(2);
      expect(json.data.map((m: { id: string }) => m.id)).toContain("msg-insight");
    });

    it("degrada campaign_name para null quando não há campanha (a UI rotula 'Sem campanha')", async () => {
      setupMockClient([insightMessageRow]);

      const response = await GET(buildRequest());
      const json = await response.json();

      expect(json.data[0].campaign_name).toBeNull();
      expect(json.data[0].campaign_id).toBeNull();
    });

    // Regressão do bug latente: `!inner` é INNER JOIN e descartaria a linha do
    // insight no banco, antes de qualquer código nosso rodar.
    it("usa LEFT join — o select NÃO pode conter `!inner`", async () => {
      const { messagesChain } = setupMockClient([insightMessageRow]);

      await GET(buildRequest());

      expect(messagesChain.select).toHaveBeenCalledWith("*, campaigns(name)");
      expect(messagesChain.select).not.toHaveBeenCalledWith(
        expect.stringContaining("!inner")
      );
    });

    // A armadilha do fix: com LEFT join `msg.campaigns` é null; um acesso direto
    // (`campaignData.name`) lançaria TypeError → catch → 500 genérico.
    it("não lança TypeError ao acessar campanha nula (não degrada para 500)", async () => {
      setupMockClient([insightMessageRow]);

      const response = await GET(buildRequest());

      expect(response.status).toBe(200);
    });
  });

  describe("regressão: mensagens de campanha seguem íntegras", () => {
    it("resolve campaign_name real quando há campanha", async () => {
      setupMockClient([campaignMessageRow]);

      const response = await GET(buildRequest());
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.data[0].campaign_name).toBe("Campanha Q3");
      expect(json.data[0].campaign_id).toBe(campaignMessageRow.campaign_id);
    });

    it("remove o objeto aninhado `campaigns` do payload", async () => {
      setupMockClient([campaignMessageRow, insightMessageRow]);

      const response = await GET(buildRequest());
      const json = await response.json();

      expect(json.data[0]).not.toHaveProperty("campaigns");
      expect(json.data[1]).not.toHaveProperty("campaigns");
    });
  });

  describe("guardas da rota", () => {
    it("retorna 401 quando não autenticado", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(null as never);

      const response = await GET(buildRequest());
      const json = await response.json();

      expect(response.status).toBe(401);
      expect(json.error).toBe("Não autenticado");
    });

    it("retorna 400 quando o parâmetro email está ausente", async () => {
      const response = await GET(new Request("http://localhost/api/leads/whatsapp-messages"));
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toBe("Parâmetro email é obrigatório");
    });

    it("retorna lista vazia quando o lead não existe no tenant", async () => {
      const client = createMockSupabaseClient();
      client.from.mockImplementation(() => createChainBuilder({ data: null, error: null }));
      vi.mocked(createClient).mockResolvedValue(client as never);

      const response = await GET(buildRequest());
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.data).toEqual([]);
    });
  });
});
