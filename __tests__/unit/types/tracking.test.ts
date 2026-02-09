import { describe, it, expect } from "vitest";
import {
  EVENT_TYPES,
  isValidEventType,
  type EventType,
  type CampaignEventRow,
  type CampaignEvent,
  transformCampaignEventRow,
  type OpportunityConfigRow,
  type OpportunityConfig,
  transformOpportunityConfigRow,
  type CampaignAnalytics,
  type LeadTracking,
  type OpportunityLead,
  type InstantlyWebhookEvent,
  type SyncResult,
} from "@/types/tracking";

// ============================================
// FIXTURES
// ============================================

const MOCK_CAMPAIGN_EVENT_ROW: CampaignEventRow = {
  id: "evt-uuid-001",
  tenant_id: "tenant-uuid-001",
  campaign_id: "campaign-uuid-001",
  event_type: "email_opened",
  lead_email: "lead@example.com",
  event_timestamp: "2026-02-09T10:00:00Z",
  payload: { ip: "1.2.3.4" },
  source: "webhook",
  processed_at: "2026-02-09T10:00:01Z",
  created_at: "2026-02-09T10:00:01Z",
};

const MOCK_OPPORTUNITY_CONFIG_ROW: OpportunityConfigRow = {
  id: "cfg-uuid-001",
  tenant_id: "tenant-uuid-001",
  campaign_id: "campaign-uuid-001",
  min_opens: 3,
  period_days: 7,
  is_active: true,
  created_at: "2026-02-09T10:00:00Z",
  updated_at: "2026-02-09T10:00:00Z",
};

// ============================================
// EVENT_TYPES VALIDATION (Task 6.3)
// ============================================

describe("EVENT_TYPES", () => {
  it("contains exactly 5 event types", () => {
    expect(EVENT_TYPES).toHaveLength(5);
  });

  it("includes all expected event types", () => {
    expect(EVENT_TYPES).toContain("email_opened");
    expect(EVENT_TYPES).toContain("email_clicked");
    expect(EVENT_TYPES).toContain("email_replied");
    expect(EVENT_TYPES).toContain("email_bounced");
    expect(EVENT_TYPES).toContain("email_unsubscribed");
  });

  it("is readonly (as const)", () => {
    const types: readonly string[] = EVENT_TYPES;
    expect(types).toBeDefined();
  });

  it("EventType union accepts valid values", () => {
    const validTypes: EventType[] = [
      "email_opened",
      "email_clicked",
      "email_replied",
      "email_bounced",
      "email_unsubscribed",
    ];
    expect(validTypes).toHaveLength(5);
    validTypes.forEach((t) => {
      expect(EVENT_TYPES).toContain(t);
    });
  });
});

// ============================================
// isValidEventType (Code Review Fix #1)
// ============================================

describe("isValidEventType", () => {
  it("returns true for all valid event types", () => {
    for (const eventType of EVENT_TYPES) {
      expect(isValidEventType(eventType)).toBe(true);
    }
  });

  it("returns false for invalid event types", () => {
    expect(isValidEventType("email_forwarded")).toBe(false);
    expect(isValidEventType("invalid")).toBe(false);
    expect(isValidEventType("")).toBe(false);
    expect(isValidEventType("EMAIL_OPENED")).toBe(false);
  });

  it("narrows type correctly (type guard)", () => {
    const value: string = "email_opened";
    if (isValidEventType(value)) {
      const narrowed: EventType = value;
      expect(narrowed).toBe("email_opened");
    }
  });
});

// ============================================
// transformCampaignEventRow (Task 6.1)
// ============================================

describe("transformCampaignEventRow", () => {
  it("transforms snake_case row to camelCase CampaignEvent", () => {
    const result = transformCampaignEventRow(MOCK_CAMPAIGN_EVENT_ROW);

    expect(result).toEqual<CampaignEvent>({
      id: "evt-uuid-001",
      tenantId: "tenant-uuid-001",
      campaignId: "campaign-uuid-001",
      eventType: "email_opened",
      leadEmail: "lead@example.com",
      eventTimestamp: "2026-02-09T10:00:00Z",
      payload: { ip: "1.2.3.4" },
      source: "webhook",
      processedAt: "2026-02-09T10:00:01Z",
      createdAt: "2026-02-09T10:00:01Z",
    });
  });

  it("preserves payload object", () => {
    const rowWithPayload: CampaignEventRow = {
      ...MOCK_CAMPAIGN_EVENT_ROW,
      payload: { subject: "Test", step: 2, variant: "A" },
    };

    const result = transformCampaignEventRow(rowWithPayload);
    expect(result.payload).toEqual({ subject: "Test", step: 2, variant: "A" });
  });

  it("handles polling source", () => {
    const pollingRow: CampaignEventRow = {
      ...MOCK_CAMPAIGN_EVENT_ROW,
      source: "polling",
    };

    const result = transformCampaignEventRow(pollingRow);
    expect(result.source).toBe("polling");
  });

  it("handles empty payload", () => {
    const emptyPayload: CampaignEventRow = {
      ...MOCK_CAMPAIGN_EVENT_ROW,
      payload: {},
    };

    const result = transformCampaignEventRow(emptyPayload);
    expect(result.payload).toEqual({});
  });

  it("maps all event types correctly", () => {
    for (const eventType of EVENT_TYPES) {
      const row: CampaignEventRow = {
        ...MOCK_CAMPAIGN_EVENT_ROW,
        event_type: eventType,
      };
      const result = transformCampaignEventRow(row);
      expect(result.eventType).toBe(eventType);
    }
  });
});

// ============================================
// transformOpportunityConfigRow (Task 6.2)
// ============================================

describe("transformOpportunityConfigRow", () => {
  it("transforms snake_case row to camelCase OpportunityConfig", () => {
    const result = transformOpportunityConfigRow(MOCK_OPPORTUNITY_CONFIG_ROW);

    expect(result).toEqual<OpportunityConfig>({
      id: "cfg-uuid-001",
      tenantId: "tenant-uuid-001",
      campaignId: "campaign-uuid-001",
      minOpens: 3,
      periodDays: 7,
      isActive: true,
      createdAt: "2026-02-09T10:00:00Z",
      updatedAt: "2026-02-09T10:00:00Z",
    });
  });

  it("handles custom min_opens and period_days", () => {
    const customRow: OpportunityConfigRow = {
      ...MOCK_OPPORTUNITY_CONFIG_ROW,
      min_opens: 5,
      period_days: 14,
    };

    const result = transformOpportunityConfigRow(customRow);
    expect(result.minOpens).toBe(5);
    expect(result.periodDays).toBe(14);
  });

  it("handles inactive config", () => {
    const inactiveRow: OpportunityConfigRow = {
      ...MOCK_OPPORTUNITY_CONFIG_ROW,
      is_active: false,
    };

    const result = transformOpportunityConfigRow(inactiveRow);
    expect(result.isActive).toBe(false);
  });
});

// ============================================
// TYPE STRUCTURE VALIDATION (compile-time + runtime)
// ============================================

describe("Type structure validation", () => {
  it("CampaignAnalytics has all required fields", () => {
    const analytics: CampaignAnalytics = {
      campaignId: "campaign-uuid-001",
      totalSent: 100,
      totalOpens: 40,
      totalClicks: 10,
      totalReplies: 5,
      totalBounces: 2,
      openRate: 0.4,
      clickRate: 0.1,
      replyRate: 0.05,
      bounceRate: 0.02,
      lastSyncAt: "2026-02-09T10:00:00Z",
    };

    expect(analytics.campaignId).toBe("campaign-uuid-001");
    expect(analytics.openRate).toBe(0.4);
    expect(analytics.bounceRate).toBe(0.02);
  });

  it("LeadTracking has all required fields including nullable lastOpenAt", () => {
    const tracking: LeadTracking = {
      leadEmail: "lead@example.com",
      campaignId: "campaign-uuid-001",
      openCount: 3,
      clickCount: 1,
      hasReplied: false,
      lastOpenAt: null,
      events: [],
    };

    expect(tracking.lastOpenAt).toBeNull();
    expect(tracking.events).toEqual([]);
  });

  it("LeadTracking accepts lastOpenAt as string", () => {
    const tracking: LeadTracking = {
      leadEmail: "lead@example.com",
      campaignId: "campaign-uuid-001",
      openCount: 5,
      clickCount: 2,
      hasReplied: true,
      lastOpenAt: "2026-02-09T10:00:00Z",
      events: [transformCampaignEventRow(MOCK_CAMPAIGN_EVENT_ROW)],
    };

    expect(tracking.lastOpenAt).toBe("2026-02-09T10:00:00Z");
    expect(tracking.events).toHaveLength(1);
  });

  it("OpportunityLead extends LeadTracking with qualification fields", () => {
    const opportunityLead: OpportunityLead = {
      leadEmail: "hot-lead@example.com",
      campaignId: "campaign-uuid-001",
      openCount: 5,
      clickCount: 3,
      hasReplied: true,
      lastOpenAt: "2026-02-09T10:00:00Z",
      events: [],
      qualifiedAt: "2026-02-09T12:00:00Z",
      isInOpportunityWindow: true,
    };

    expect(opportunityLead.qualifiedAt).toBe("2026-02-09T12:00:00Z");
    expect(opportunityLead.isInOpportunityWindow).toBe(true);
  });

  it("InstantlyWebhookEvent has required and optional fields", () => {
    const minimalEvent: InstantlyWebhookEvent = {
      event_type: "email_opened",
      lead_email: "lead@example.com",
      campaign_id: "instantly-campaign-123",
      timestamp: "2026-02-09T10:00:00Z",
    };

    expect(minimalEvent.event_type).toBe("email_opened");
    expect(minimalEvent.campaign_name).toBeUndefined();
    expect(minimalEvent.step).toBeUndefined();

    const fullEvent: InstantlyWebhookEvent = {
      event_type: "email_clicked",
      lead_email: "lead@example.com",
      campaign_id: "instantly-campaign-123",
      timestamp: "2026-02-09T10:00:00Z",
      campaign_name: "Q1 Outreach",
      workspace: "workspace-123",
      email_account: "sender@company.com",
      step: 2,
      variant: 1,
      is_first: false,
      payload: { link: "https://example.com" },
    };

    expect(fullEvent.campaign_name).toBe("Q1 Outreach");
    expect(fullEvent.step).toBe(2);
  });

  it("SyncResult has fixed source polling", () => {
    const syncResult: SyncResult = {
      campaignId: "campaign-uuid-001",
      analytics: {
        campaignId: "campaign-uuid-001",
        totalSent: 50,
        totalOpens: 20,
        totalClicks: 5,
        totalReplies: 2,
        totalBounces: 1,
        openRate: 0.4,
        clickRate: 0.1,
        replyRate: 0.04,
        bounceRate: 0.02,
        lastSyncAt: "2026-02-09T10:00:00Z",
      },
      lastSyncAt: "2026-02-09T10:00:00Z",
      source: "polling",
    };

    expect(syncResult.source).toBe("polling");
    expect(syncResult.analytics.totalSent).toBe(50);
  });
});

// ============================================
// RE-EXPORT VALIDATION (Task 6.4 — mock Supabase tables)
// ============================================

describe("Re-export from index", () => {
  it("all runtime exports are accessible from @/types barrel", async () => {
    const types = await import("@/types");

    expect(types.EVENT_TYPES).toBeDefined();
    expect(types.EVENT_TYPES).toHaveLength(5);
    expect(types.isValidEventType).toBeTypeOf("function");
    expect(types.transformCampaignEventRow).toBeTypeOf("function");
    expect(types.transformOpportunityConfigRow).toBeTypeOf("function");
  });
});
