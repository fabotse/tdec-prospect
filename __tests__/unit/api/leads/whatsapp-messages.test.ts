/**
 * Unit Tests for /api/leads/whatsapp-messages
 * Story 11.7: Tracking e Histórico de Mensagens WhatsApp
 *
 * AC: #4 — GET returns messages for a lead across ALL campaigns with campaign_name
 * Supports ?email=xxx query param (required)
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
import { GET } from "@/app/api/leads/whatsapp-messages/route";

// ==============================================
// HELPERS
// ==============================================

const TENANT_ID = "tenant-001";
const LEAD_ID = "lead-001";

function createRequest(email?: string): Request {
  const url = email
    ? `http://localhost/api/leads/whatsapp-messages?email=${encodeURIComponent(email)}`
    : "http://localhost/api/leads/whatsapp-messages";
  return new Request(url);
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
    campaign_id: "camp-1",
    lead_id: LEAD_ID,
    phone: "+5511999991234",
    message: "Olá João...",
    status: "sent",
    external_message_id: null,
    external_zaap_id: null,
    error_message: null,
    sent_at: "2026-02-10T14:32:00Z",
    created_at: "2026-02-10T14:32:00Z",
    updated_at: "2026-02-10T14:32:00Z",
    campaigns: { name: "Outbound Q1" },
  },
  {
    id: "msg-2",
    tenant_id: TENANT_ID,
    campaign_id: "camp-2",
    lead_id: LEAD_ID,
    phone: "+5511999991234",
    message: "Boa tarde...",
    status: "failed",
    external_message_id: null,
    external_zaap_id: null,
    error_message: "Número inválido",
    sent_at: null,
    created_at: "2026-02-09T10:00:00Z",
    updated_at: "2026-02-09T10:00:00Z",
    campaigns: { name: "Outbound Q4" },
  },
];

// ==============================================
// TESTS
// ==============================================

describe("GET /api/leads/whatsapp-messages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockImplementation(() => createChainBuilder());
  });

  function setupMocks(opts?: { lead?: object | null; messages?: object[] | null; messagesError?: object | null }) {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);

    const leadChain = createChainBuilder({
      data: opts?.lead !== undefined ? opts.lead : { id: LEAD_ID },
      error: opts?.lead === null ? { message: "not found" } : null,
    });

    const messagesChain = createChainBuilder({
      data: opts?.messages !== undefined ? opts.messages : mockMessages,
      error: opts?.messagesError ?? null,
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === "leads") return leadChain;
      if (table === "whatsapp_messages") return messagesChain;
      return createChainBuilder();
    });

    return { leadChain, messagesChain };
  }

  it("should return 401 when not authenticated", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(null);

    const response = await GET(createRequest("joao@example.com"));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("Não autenticado");
  });

  it("should return 400 when email param is missing", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);

    const response = await GET(createRequest());
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Parâmetro email é obrigatório");
  });

  it("should return empty array when lead not found", async () => {
    setupMocks({ lead: null });

    const response = await GET(createRequest("unknown@example.com"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual([]);
  });

  it("should return messages with campaign_name (AC #4)", async () => {
    setupMocks();

    const response = await GET(createRequest("joao@example.com"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toHaveLength(2);
    expect(body.data[0]).toMatchObject({
      id: "msg-1",
      campaign_name: "Outbound Q1",
      status: "sent",
    });
    expect(body.data[1]).toMatchObject({
      id: "msg-2",
      campaign_name: "Outbound Q4",
      status: "failed",
    });
  });

  it("should order by created_at DESC", async () => {
    const { messagesChain } = setupMocks();

    await GET(createRequest("joao@example.com"));

    expect(messagesChain.order).toHaveBeenCalledWith("created_at", { ascending: false });
  });

  it("should apply RLS by tenant_id", async () => {
    const { messagesChain } = setupMocks();

    await GET(createRequest("joao@example.com"));

    expect(messagesChain.eq).toHaveBeenCalledWith("tenant_id", TENANT_ID);
  });

  it("should filter by lead_id from lead lookup", async () => {
    const { messagesChain } = setupMocks();

    await GET(createRequest("joao@example.com"));

    expect(messagesChain.eq).toHaveBeenCalledWith("lead_id", LEAD_ID);
  });

  it("should return empty array when no messages exist", async () => {
    setupMocks({ messages: [] });

    const response = await GET(createRequest("joao@example.com"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual([]);
  });

  it("should return 500 when messages query fails", async () => {
    setupMocks({ messagesError: { message: "DB error" } });

    const response = await GET(createRequest("joao@example.com"));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe("Erro ao buscar mensagens WhatsApp");
  });
});
