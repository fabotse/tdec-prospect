/**
 * Unit Tests for /api/campaigns/[campaignId]/whatsapp-messages
 * Story 11.7: Tracking e Histórico de Mensagens WhatsApp
 *
 * AC: #2 — GET returns WhatsAppMessageWithLead[], ordered by created_at DESC
 * AC: #2 — Auth + RLS by tenant_id, supports ?leadEmail filter
 * AC: #2 — Returns 401 if not authenticated, 404 if campaign not found
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createChainBuilder } from "../../../helpers/mock-supabase";

// Mock getCurrentUserProfile
const mockGetCurrentUserProfile = vi.fn();

vi.mock("@/lib/supabase/tenant", () => ({
  getCurrentUserProfile: () => mockGetCurrentUserProfile(),
}));

// Mock Supabase
const mockFrom = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve({ from: mockFrom })),
}));

// Import after mocking
import { GET } from "@/app/api/campaigns/[campaignId]/whatsapp-messages/route";

// ==============================================
// HELPERS
// ==============================================

const TENANT_ID = "tenant-001";
const CAMPAIGN_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
const INVALID_ID = "not-a-uuid";

function createRequest(url = `http://localhost/api/campaigns/${CAMPAIGN_ID}/whatsapp-messages`): Request {
  return new Request(url);
}

function createParams(campaignId = CAMPAIGN_ID) {
  return { params: Promise.resolve({ campaignId }) };
}

const mockProfile = {
  id: "user-001",
  tenant_id: TENANT_ID,
  role: "user" as const,
};

const mockMessages = [
  {
    id: "msg-1",
    tenant_id: TENANT_ID,
    campaign_id: CAMPAIGN_ID,
    lead_id: "lead-1",
    phone: "+5511999991234",
    message: "Olá João, vi que...",
    status: "sent",
    external_message_id: null,
    external_zaap_id: null,
    error_message: null,
    sent_at: "2026-02-10T14:32:00Z",
    created_at: "2026-02-10T14:32:00Z",
    updated_at: "2026-02-10T14:32:00Z",
    leads: { email: "joao@example.com", first_name: "João", last_name: "Silva" },
  },
  {
    id: "msg-2",
    tenant_id: TENANT_ID,
    campaign_id: CAMPAIGN_ID,
    lead_id: "lead-2",
    phone: "+5511888882345",
    message: "Boa tarde Maria...",
    status: "failed",
    external_message_id: null,
    external_zaap_id: null,
    error_message: "Número inválido",
    sent_at: null,
    created_at: "2026-02-10T15:00:00Z",
    updated_at: "2026-02-10T15:00:00Z",
    leads: { email: "maria@example.com", first_name: "Maria", last_name: null },
  },
];

// ==============================================
// TESTS
// ==============================================

describe("GET /api/campaigns/[campaignId]/whatsapp-messages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockImplementation(() => createChainBuilder());
  });

  function setupMocks(opts?: { campaign?: object | null; messages?: object[] | null; messagesError?: object | null }) {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);

    const campaignChain = createChainBuilder({
      data: opts?.campaign !== undefined ? opts.campaign : { id: CAMPAIGN_ID },
      error: opts?.campaign === null ? { message: "not found" } : null,
    });

    const messagesChain = createChainBuilder({
      data: opts?.messages !== undefined ? opts.messages : mockMessages,
      error: opts?.messagesError ?? null,
    });

    let callCount = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === "campaigns") return campaignChain;
      if (table === "whatsapp_messages") return messagesChain;
      callCount++;
      return createChainBuilder();
    });

    return { campaignChain, messagesChain };
  }

  it("should return 401 when not authenticated", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(null);

    const response = await GET(createRequest(), createParams());
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("Não autenticado");
  });

  it("should return 400 for invalid campaign ID", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);

    const response = await GET(createRequest(), createParams(INVALID_ID));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("ID de campanha inválido");
  });

  it("should return 404 when campaign not found", async () => {
    setupMocks({ campaign: null });

    const response = await GET(createRequest(), createParams());
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Campanha não encontrada");
  });

  it("should return messages with lead data (AC #2)", async () => {
    setupMocks();

    const response = await GET(createRequest(), createParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toHaveLength(2);
    expect(body.data[0]).toMatchObject({
      id: "msg-1",
      lead_email: "joao@example.com",
      lead_name: "João Silva",
      phone: "+5511999991234",
      status: "sent",
    });
    expect(body.data[1]).toMatchObject({
      id: "msg-2",
      lead_email: "maria@example.com",
      lead_name: "Maria",
      status: "failed",
    });
  });

  it("should order messages by created_at DESC", async () => {
    const { messagesChain } = setupMocks();

    await GET(createRequest(), createParams());

    expect(messagesChain.order).toHaveBeenCalledWith("created_at", { ascending: false });
  });

  it("should apply RLS by tenant_id", async () => {
    const { messagesChain } = setupMocks();

    await GET(createRequest(), createParams());

    expect(messagesChain.eq).toHaveBeenCalledWith("tenant_id", TENANT_ID);
  });

  it("should filter by leadEmail when query param provided", async () => {
    const { messagesChain } = setupMocks();

    const url = `http://localhost/api/campaigns/${CAMPAIGN_ID}/whatsapp-messages?leadEmail=joao@example.com`;
    await GET(createRequest(url), createParams());

    expect(messagesChain.eq).toHaveBeenCalledWith("leads.email", "joao@example.com");
  });

  it("should not filter by leadEmail when param not provided", async () => {
    const { messagesChain } = setupMocks();

    await GET(createRequest(), createParams());

    // eq is called for campaign_id and tenant_id, but NOT for leads.email
    const eqCalls = messagesChain.eq.mock.calls;
    const emailFilter = eqCalls.find((call: string[]) => call[0] === "leads.email");
    expect(emailFilter).toBeUndefined();
  });

  it("should return empty array when no messages", async () => {
    setupMocks({ messages: [] });

    const response = await GET(createRequest(), createParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual([]);
  });

  it("should return 500 when messages query fails", async () => {
    setupMocks({ messagesError: { message: "DB error" } });

    const response = await GET(createRequest(), createParams());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe("Erro ao buscar mensagens WhatsApp");
  });

  it("should handle lead_name as null when both names are null", async () => {
    setupMocks({
      messages: [{
        ...mockMessages[0],
        leads: { email: "test@example.com", first_name: null, last_name: null },
      }],
    });

    const response = await GET(createRequest(), createParams());
    const body = await response.json();

    expect(body.data[0].lead_name).toBeNull();
  });
});
