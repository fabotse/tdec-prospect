/**
 * Unit Tests for GET /api/campaigns/[campaignId]/leads/tracking
 * Story 11.4: Phone enrichment from leads table
 * Story 11.5: leadId enrichment from leads table (AC#6)
 * Story 11.7: WhatsApp message stats per lead (AC#8)
 *
 * Tests: phone enrichment from DB, leadId enrichment, Instantly phone preserved,
 *        empty leads, auth, invalid UUID, missing campaign, WhatsApp aggregate stats
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "@/app/api/campaigns/[campaignId]/leads/tracking/route";
import {
  createMockSupabaseClient,
  mockTableResponse,
} from "../../../../helpers/mock-supabase";
import type { LeadTracking } from "@/types/tracking";

// ==============================================
// MOCK DEPENDENCIES
// ==============================================

const mockGetCurrentUserProfile = vi.fn();
vi.mock("@/lib/supabase/tenant", () => ({
  getCurrentUserProfile: () => mockGetCurrentUserProfile(),
}));

const mockSupabase = createMockSupabaseClient();
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve(mockSupabase)),
}));

vi.mock("@/lib/crypto/encryption", () => ({
  decryptApiKey: vi.fn(() => "decrypted-key"),
}));

const mockGetLeadTracking = vi.fn();
vi.mock("@/lib/services/tracking", () => ({
  TrackingService: class MockTrackingService {
    getLeadTracking = mockGetLeadTracking;
  },
}));

vi.mock("@/lib/services/base-service", () => ({
  ExternalServiceError: class ExternalServiceError extends Error {
    userMessage: string;
    statusCode?: number;
    constructor(msg: string, statusCode?: number) {
      super(msg);
      this.userMessage = msg;
      this.statusCode = statusCode;
    }
  },
}));

// ==============================================
// FIXTURES
// ==============================================

const CAMPAIGN_ID = "550e8400-e29b-41d4-a716-446655440000";
const TENANT_ID = "tenant-123";
const EXTERNAL_CAMPAIGN_ID = "ext-camp-abc";

const mockProfile = { id: "user-1", tenant_id: TENANT_ID };

const mockCampaign = {
  id: CAMPAIGN_ID,
  external_campaign_id: EXTERNAL_CAMPAIGN_ID,
};

const mockApiConfig = { encrypted_key: "encrypted-key-value" };

function makeTrackingLead(overrides: Partial<LeadTracking> = {}): LeadTracking {
  return {
    leadEmail: "lead@test.com",
    campaignId: EXTERNAL_CAMPAIGN_ID,
    openCount: 3,
    clickCount: 1,
    hasReplied: false,
    lastOpenAt: "2026-02-10T12:00:00Z",
    events: [],
    firstName: "John",
    lastName: "Doe",
    ...overrides,
  };
}

function makeParams(campaignId = CAMPAIGN_ID) {
  return { params: Promise.resolve({ campaignId }) };
}

const dummyRequest = new Request("http://localhost/api/campaigns/x/leads/tracking");

// ==============================================
// HELPERS
// ==============================================

function setupHappyPath(
  trackingLeads: LeadTracking[],
  dbLeads: Array<{ id?: string; email: string; phone: string | null }> = [],
  sentMessages: Array<{ lead_id: string; status: string; sent_at: string | null }> = []
) {
  mockGetCurrentUserProfile.mockResolvedValue(mockProfile);

  // Reset from mock
  mockSupabase.from.mockReset();

  // campaigns table
  const campaignsChain = mockTableResponse(mockSupabase, "campaigns", {
    data: mockCampaign,
  });
  campaignsChain.single.mockReturnValue(campaignsChain);

  // api_configs table
  const configChain = mockTableResponse(mockSupabase, "api_configs", {
    data: mockApiConfig,
  });
  configChain.single.mockReturnValue(configChain);

  // leads table (phone enrichment + id for sentLeadEmails)
  mockTableResponse(mockSupabase, "leads", { data: dbLeads });

  // whatsapp_messages table (sent messages for AC#7)
  mockTableResponse(mockSupabase, "whatsapp_messages", { data: sentMessages });

  // Tracking service
  mockGetLeadTracking.mockResolvedValue(trackingLeads);
}

// ==============================================
// TESTS
// ==============================================

describe("GET /api/campaigns/[campaignId]/leads/tracking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("phone enrichment (Story 11.4)", () => {
    it("enriches tracking leads with phone from leads table", async () => {
      const trackingLeads = [
        makeTrackingLead({ leadEmail: "lead1@test.com", phone: undefined }),
        makeTrackingLead({ leadEmail: "lead2@test.com", phone: undefined }),
      ];

      const dbLeads = [
        { id: "lid-1", email: "lead1@test.com", phone: "+5511999999999" },
        { id: "lid-2", email: "lead2@test.com", phone: "+5511888888888" },
      ];

      setupHappyPath(trackingLeads, dbLeads);

      const response = await GET(dummyRequest, makeParams());
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.data).toHaveLength(2);
      expect(body.data[0].phone).toBe("+5511999999999");
      expect(body.data[1].phone).toBe("+5511888888888");
    });

    it("preserves phone from Instantly when already present", async () => {
      const trackingLeads = [
        makeTrackingLead({
          leadEmail: "lead@test.com",
          phone: "+5511111111111",
        }),
      ];

      const dbLeads = [
        { id: "lid-1", email: "lead@test.com", phone: "+5522222222222" },
      ];

      setupHappyPath(trackingLeads, dbLeads);

      const response = await GET(dummyRequest, makeParams());
      const body = await response.json();

      expect(body.data[0].phone).toBe("+5511111111111");
    });

    it("returns undefined phone when neither Instantly nor DB has it", async () => {
      const trackingLeads = [
        makeTrackingLead({ leadEmail: "nophone@test.com", phone: undefined }),
      ];

      setupHappyPath(trackingLeads, []);

      const response = await GET(dummyRequest, makeParams());
      const body = await response.json();

      expect(body.data[0].phone).toBeUndefined();
    });

    it("handles partial phone data — some leads have phone in DB, some don't", async () => {
      const trackingLeads = [
        makeTrackingLead({ leadEmail: "has-phone@test.com", phone: undefined }),
        makeTrackingLead({ leadEmail: "no-phone@test.com", phone: undefined }),
      ];

      const dbLeads = [
        { id: "lid-1", email: "has-phone@test.com", phone: "+5511999999999" },
        { id: "lid-2", email: "no-phone@test.com", phone: null },
      ];

      setupHappyPath(trackingLeads, dbLeads);

      const response = await GET(dummyRequest, makeParams());
      const body = await response.json();

      expect(body.data[0].phone).toBe("+5511999999999");
      expect(body.data[1].phone).toBeUndefined();
    });

    it("skips phone lookup when no tracking leads", async () => {
      setupHappyPath([]);

      const response = await GET(dummyRequest, makeParams());
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.data).toHaveLength(0);
      // "leads" table should not be queried when no emails
      const fromCalls = mockSupabase.from.mock.calls.map(
        (c: unknown[]) => c[0]
      );
      expect(fromCalls).not.toContain("leads");
    });
  });

  describe("leadId enrichment (Story 11.5 AC#6)", () => {
    it("includes leadId for leads that exist in DB", async () => {
      const trackingLeads = [
        makeTrackingLead({ leadEmail: "lead1@test.com" }),
        makeTrackingLead({ leadEmail: "lead2@test.com" }),
      ];
      const dbLeads = [
        { id: "uuid-lead-1", email: "lead1@test.com", phone: "+5511999999999" },
        { id: "uuid-lead-2", email: "lead2@test.com", phone: null },
      ];

      setupHappyPath(trackingLeads, dbLeads);

      const response = await GET(dummyRequest, makeParams());
      const body = await response.json();

      expect(body.data[0].leadId).toBe("uuid-lead-1");
      expect(body.data[1].leadId).toBe("uuid-lead-2");
    });

    it("returns undefined leadId for leads not in DB", async () => {
      const trackingLeads = [
        makeTrackingLead({ leadEmail: "external@test.com" }),
      ];

      setupHappyPath(trackingLeads, []);

      const response = await GET(dummyRequest, makeParams());
      const body = await response.json();

      expect(body.data[0].leadId).toBeUndefined();
    });

    it("handles mixed leads — some in DB, some not", async () => {
      const trackingLeads = [
        makeTrackingLead({ leadEmail: "in-db@test.com" }),
        makeTrackingLead({ leadEmail: "not-in-db@test.com" }),
      ];
      const dbLeads = [
        { id: "uuid-in-db", email: "in-db@test.com", phone: null },
      ];

      setupHappyPath(trackingLeads, dbLeads);

      const response = await GET(dummyRequest, makeParams());
      const body = await response.json();

      expect(body.data[0].leadId).toBe("uuid-in-db");
      expect(body.data[1].leadId).toBeUndefined();
    });
  });

  describe("sentLeadEmails (Story 11.4 AC#7)", () => {
    it("returns sentLeadEmails for leads with sent WhatsApp messages", async () => {
      const trackingLeads = [
        makeTrackingLead({ leadEmail: "sent@test.com", phone: undefined }),
        makeTrackingLead({ leadEmail: "unsent@test.com", phone: undefined }),
      ];
      const dbLeads = [
        { id: "lid-1", email: "sent@test.com", phone: "+5511999999999" },
        { id: "lid-2", email: "unsent@test.com", phone: "+5511888888888" },
      ];
      const sentMessages = [{ lead_id: "lid-1", status: "sent", sent_at: "2026-02-10T14:00:00Z" }];

      setupHappyPath(trackingLeads, dbLeads, sentMessages);

      const response = await GET(dummyRequest, makeParams());
      const body = await response.json();

      expect(body.sentLeadEmails).toEqual(["sent@test.com"]);
    });

    it("returns empty sentLeadEmails when no messages sent", async () => {
      const trackingLeads = [
        makeTrackingLead({ leadEmail: "lead@test.com", phone: undefined }),
      ];
      const dbLeads = [
        { id: "lid-1", email: "lead@test.com", phone: "+5511999999999" },
      ];

      setupHappyPath(trackingLeads, dbLeads, []);

      const response = await GET(dummyRequest, makeParams());
      const body = await response.json();

      expect(body.sentLeadEmails).toEqual([]);
    });

    it("returns empty sentLeadEmails when no tracking leads", async () => {
      setupHappyPath([]);

      const response = await GET(dummyRequest, makeParams());
      const body = await response.json();

      expect(body.sentLeadEmails).toEqual([]);
    });
  });

  describe("authentication & validation", () => {
    it("returns 401 when not authenticated", async () => {
      mockGetCurrentUserProfile.mockResolvedValue(null);

      const response = await GET(dummyRequest, makeParams());
      const body = await response.json();

      expect(response.status).toBe(401);
      expect(body.error).toBe("Não autenticado");
    });

    it("returns 400 for invalid campaign UUID", async () => {
      mockGetCurrentUserProfile.mockResolvedValue(mockProfile);

      const response = await GET(dummyRequest, makeParams("not-a-uuid"));
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error).toBe("ID de campanha inválido");
    });

    it("returns 404 when campaign not found", async () => {
      mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
      mockSupabase.from.mockReset();
      mockTableResponse(mockSupabase, "campaigns", {
        data: null,
        error: { message: "not found" },
      });

      const response = await GET(dummyRequest, makeParams());
      const body = await response.json();

      expect(response.status).toBe(404);
      expect(body.error).toBe("Campanha não encontrada");
    });
  });

  describe("response mapping", () => {
    it("maps campaignId to local UUID", async () => {
      const trackingLeads = [makeTrackingLead()];
      setupHappyPath(trackingLeads);

      const response = await GET(dummyRequest, makeParams());
      const body = await response.json();

      expect(body.data[0].campaignId).toBe(CAMPAIGN_ID);
    });
  });

  describe("WhatsApp stats per lead (Story 11.7 AC#8)", () => {
    it("returns whatsappMessageCount, lastWhatsAppSentAt, lastWhatsAppStatus", async () => {
      const trackingLeads = [
        makeTrackingLead({ leadEmail: "lead1@test.com" }),
      ];
      const dbLeads = [
        { id: "lid-1", email: "lead1@test.com", phone: "+5511999999999" },
      ];
      const sentMessages = [
        { lead_id: "lid-1", status: "sent", sent_at: "2026-02-10T14:00:00Z" },
        { lead_id: "lid-1", status: "sent", sent_at: "2026-02-10T16:00:00Z" },
      ];

      setupHappyPath(trackingLeads, dbLeads, sentMessages);

      const response = await GET(dummyRequest, makeParams());
      const body = await response.json();

      expect(body.data[0].whatsappMessageCount).toBe(2);
      expect(body.data[0].lastWhatsAppSentAt).toBe("2026-02-10T16:00:00Z");
      expect(body.data[0].lastWhatsAppStatus).toBe("sent");
    });

    it("returns 0 count when lead has no WhatsApp messages", async () => {
      const trackingLeads = [
        makeTrackingLead({ leadEmail: "no-wa@test.com" }),
      ];
      const dbLeads = [
        { id: "lid-1", email: "no-wa@test.com", phone: "+5511999999999" },
      ];

      setupHappyPath(trackingLeads, dbLeads, []);

      const response = await GET(dummyRequest, makeParams());
      const body = await response.json();

      expect(body.data[0].whatsappMessageCount).toBe(0);
      expect(body.data[0].lastWhatsAppSentAt).toBeNull();
      expect(body.data[0].lastWhatsAppStatus).toBeNull();
    });

    it("tracks latest status based on sent_at", async () => {
      const trackingLeads = [
        makeTrackingLead({ leadEmail: "lead1@test.com" }),
      ];
      const dbLeads = [
        { id: "lid-1", email: "lead1@test.com", phone: "+5511999999999" },
      ];
      const sentMessages = [
        { lead_id: "lid-1", status: "sent", sent_at: "2026-02-10T10:00:00Z" },
        { lead_id: "lid-1", status: "failed", sent_at: null },
      ];

      setupHappyPath(trackingLeads, dbLeads, sentMessages);

      const response = await GET(dummyRequest, makeParams());
      const body = await response.json();

      expect(body.data[0].whatsappMessageCount).toBe(2);
      // Last by sent_at is the first one (the failed one has null sent_at)
      expect(body.data[0].lastWhatsAppSentAt).toBe("2026-02-10T10:00:00Z");
      expect(body.data[0].lastWhatsAppStatus).toBe("sent");
    });

    it("handles multiple leads with different WhatsApp stats", async () => {
      const trackingLeads = [
        makeTrackingLead({ leadEmail: "lead1@test.com" }),
        makeTrackingLead({ leadEmail: "lead2@test.com" }),
      ];
      const dbLeads = [
        { id: "lid-1", email: "lead1@test.com", phone: "+5511999999999" },
        { id: "lid-2", email: "lead2@test.com", phone: "+5511888888888" },
      ];
      const sentMessages = [
        { lead_id: "lid-1", status: "sent", sent_at: "2026-02-10T14:00:00Z" },
        { lead_id: "lid-1", status: "sent", sent_at: "2026-02-10T16:00:00Z" },
        { lead_id: "lid-2", status: "failed", sent_at: null },
      ];

      setupHappyPath(trackingLeads, dbLeads, sentMessages);

      const response = await GET(dummyRequest, makeParams());
      const body = await response.json();

      expect(body.data[0].whatsappMessageCount).toBe(2);
      expect(body.data[0].lastWhatsAppSentAt).toBe("2026-02-10T16:00:00Z");
      expect(body.data[1].whatsappMessageCount).toBe(1);
      expect(body.data[1].lastWhatsAppStatus).toBe("failed");
    });
  });
});
