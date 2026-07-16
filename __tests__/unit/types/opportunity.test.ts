import { describe, it, expect } from "vitest";
import {
  OPPORTUNITY_SOURCES,
  OPPORTUNITY_INTENTS,
  OPPORTUNITY_STATUSES,
  isValidOpportunitySource,
  isValidOpportunityIntent,
  isValidOpportunityStatus,
  toOpportunity,
  toOpportunityRow,
  toNotificationSettings,
  toAppNotification,
  type OpportunitySource,
  type OpportunityIntent,
  type OpportunityStatus,
  type OpportunityRow,
  type Opportunity,
  type NotificationSettingsRow,
  type NotificationSettings,
  type AppNotificationRow,
  type AppNotification,
} from "@/types/opportunity";

// ============================================
// FIXTURES
// ============================================

// Reply opportunity — todos os campos nullable preenchidos (não-nulos)
const MOCK_OPPORTUNITY_ROW_FULL: OpportunityRow = {
  id: "opp-uuid-001",
  tenant_id: "tenant-uuid-001",
  lead_id: "lead-uuid-001",
  campaign_id: "campaign-uuid-001",
  source: "reply",
  reply_event_id: "evt-uuid-001",
  reply_text: "Tenho interesse, pode me mandar mais informações?",
  reply_subject: "Re: Proposta comercial",
  unibox_url: "https://app.instantly.ai/app/unibox/thread-123",
  intent: "interessado",
  lt_interest_status: 1,
  suggestion: "Enviar apresentação e propor call de 15 minutos.",
  status: "new",
  meeting_booked_at: "2026-07-15T14:00:00Z",
  open_count: 4,
  click_count: 2,
  last_engagement_at: "2026-07-12T09:00:00Z",
  notified_at: "2026-07-13T10:05:00Z",
  created_at: "2026-07-13T10:00:00Z",
  updated_at: "2026-07-13T10:00:00Z",
};

// Engagement opportunity — todos os campos nullable NULOS (reply_event_id NULL, etc.)
const MOCK_OPPORTUNITY_ROW_NULLABLE: OpportunityRow = {
  id: "opp-uuid-002",
  tenant_id: "tenant-uuid-001",
  lead_id: null,
  campaign_id: "campaign-uuid-002",
  source: "engagement",
  reply_event_id: null,
  reply_text: null,
  reply_subject: null,
  unibox_url: null,
  intent: null,
  lt_interest_status: null,
  suggestion: null,
  status: "viewed",
  meeting_booked_at: null,
  open_count: null,
  click_count: null,
  last_engagement_at: null,
  notified_at: null,
  created_at: "2026-07-13T11:00:00Z",
  updated_at: "2026-07-13T11:30:00Z",
};

const MOCK_NOTIFICATION_SETTINGS_ROW: NotificationSettingsRow = {
  id: "ns-uuid-001",
  tenant_id: "tenant-uuid-001",
  whatsapp_numbers: ["5511999999999", "5511888888888"],
  channels: { whatsapp: true, in_app: false },
  notify_intents: ["interessado", "pediu_info"],
  created_at: "2026-07-13T10:00:00Z",
  updated_at: "2026-07-13T10:00:00Z",
};

const MOCK_APP_NOTIFICATION_ROW: AppNotificationRow = {
  id: "an-uuid-001",
  tenant_id: "tenant-uuid-001",
  type: "nova_oportunidade",
  payload: { opportunityId: "opp-uuid-001", leadEmail: "lead@example.com" },
  read_at: null,
  created_at: "2026-07-13T10:00:00Z",
};

// ============================================
// CONST ARRAYS (Task 3.3)
// ============================================

describe("OPPORTUNITY_SOURCES", () => {
  it("contains exactly 2 sources", () => {
    expect(OPPORTUNITY_SOURCES).toHaveLength(2);
  });

  it("includes reply and engagement", () => {
    expect(OPPORTUNITY_SOURCES).toContain("reply");
    expect(OPPORTUNITY_SOURCES).toContain("engagement");
  });
});

describe("OPPORTUNITY_INTENTS", () => {
  it("contains exactly 5 intents", () => {
    expect(OPPORTUNITY_INTENTS).toHaveLength(5);
  });

  it("includes all expected intents", () => {
    expect(OPPORTUNITY_INTENTS).toContain("interessado");
    expect(OPPORTUNITY_INTENTS).toContain("pediu_info");
    expect(OPPORTUNITY_INTENTS).toContain("objecao");
    expect(OPPORTUNITY_INTENTS).toContain("nao_agora");
    expect(OPPORTUNITY_INTENTS).toContain("opt_out");
  });
});

describe("OPPORTUNITY_STATUSES", () => {
  it("contains exactly 5 statuses", () => {
    expect(OPPORTUNITY_STATUSES).toHaveLength(5);
  });

  it("includes all expected statuses", () => {
    expect(OPPORTUNITY_STATUSES).toContain("new");
    expect(OPPORTUNITY_STATUSES).toContain("viewed");
    expect(OPPORTUNITY_STATUSES).toContain("contacted");
    expect(OPPORTUNITY_STATUSES).toContain("meeting_booked");
    expect(OPPORTUNITY_STATUSES).toContain("discarded");
  });
});

// ============================================
// GUARDS (Task 3.3)
// ============================================

describe("isValidOpportunitySource", () => {
  it("returns true for all valid sources", () => {
    for (const source of OPPORTUNITY_SOURCES) {
      expect(isValidOpportunitySource(source)).toBe(true);
    }
  });

  it("returns false for invalid sources", () => {
    expect(isValidOpportunitySource("webhook")).toBe(false);
    expect(isValidOpportunitySource("polling")).toBe(false);
    expect(isValidOpportunitySource("")).toBe(false);
    expect(isValidOpportunitySource("REPLY")).toBe(false);
  });

  it("narrows type correctly (type guard)", () => {
    const value: string = "reply";
    if (isValidOpportunitySource(value)) {
      const narrowed: OpportunitySource = value;
      expect(narrowed).toBe("reply");
    }
  });
});

describe("isValidOpportunityIntent", () => {
  it("returns true for all valid intents", () => {
    for (const intent of OPPORTUNITY_INTENTS) {
      expect(isValidOpportunityIntent(intent)).toBe(true);
    }
  });

  it("returns false for invalid intents", () => {
    expect(isValidOpportunityIntent("interested")).toBe(false);
    expect(isValidOpportunityIntent("unknown")).toBe(false);
    expect(isValidOpportunityIntent("")).toBe(false);
  });

  it("narrows type correctly (type guard)", () => {
    const value: string = "objecao";
    if (isValidOpportunityIntent(value)) {
      const narrowed: OpportunityIntent = value;
      expect(narrowed).toBe("objecao");
    }
  });
});

describe("isValidOpportunityStatus", () => {
  it("returns true for all valid statuses", () => {
    for (const status of OPPORTUNITY_STATUSES) {
      expect(isValidOpportunityStatus(status)).toBe(true);
    }
  });

  it("returns false for invalid statuses", () => {
    expect(isValidOpportunityStatus("open")).toBe(false);
    expect(isValidOpportunityStatus("closed")).toBe(false);
    expect(isValidOpportunityStatus("")).toBe(false);
    expect(isValidOpportunityStatus("NEW")).toBe(false);
  });

  it("narrows type correctly (type guard)", () => {
    const value: string = "meeting_booked";
    if (isValidOpportunityStatus(value)) {
      const narrowed: OpportunityStatus = value;
      expect(narrowed).toBe("meeting_booked");
    }
  });
});

// ============================================
// toOpportunity / toOpportunityRow (Task 3.1)
// ============================================

describe("toOpportunity", () => {
  it("transforms a fully-populated snake_case row to camelCase Opportunity", () => {
    const result = toOpportunity(MOCK_OPPORTUNITY_ROW_FULL);

    expect(result).toEqual<Opportunity>({
      id: "opp-uuid-001",
      tenantId: "tenant-uuid-001",
      leadId: "lead-uuid-001",
      campaignId: "campaign-uuid-001",
      source: "reply",
      replyEventId: "evt-uuid-001",
      replyText: "Tenho interesse, pode me mandar mais informações?",
      replySubject: "Re: Proposta comercial",
      uniboxUrl: "https://app.instantly.ai/app/unibox/thread-123",
      intent: "interessado",
      ltInterestStatus: 1,
      suggestion: "Enviar apresentação e propor call de 15 minutos.",
      status: "new",
      meetingBookedAt: "2026-07-15T14:00:00Z",
      openCount: 4,
      clickCount: 2,
      lastEngagementAt: "2026-07-12T09:00:00Z",
      notifiedAt: "2026-07-13T10:05:00Z",
      createdAt: "2026-07-13T10:00:00Z",
      updatedAt: "2026-07-13T10:00:00Z",
    });
  });

  it("preserves nulls for all nullable fields (engagement source)", () => {
    const result = toOpportunity(MOCK_OPPORTUNITY_ROW_NULLABLE);

    expect(result.leadId).toBeNull();
    expect(result.replyEventId).toBeNull();
    expect(result.replyText).toBeNull();
    expect(result.replySubject).toBeNull();
    expect(result.uniboxUrl).toBeNull();
    expect(result.intent).toBeNull();
    expect(result.ltInterestStatus).toBeNull();
    expect(result.suggestion).toBeNull();
    expect(result.meetingBookedAt).toBeNull();
    expect(result.openCount).toBeNull();
    expect(result.clickCount).toBeNull();
    expect(result.lastEngagementAt).toBeNull();
    expect(result.notifiedAt).toBeNull();
    expect(result.source).toBe("engagement");
    expect(result.status).toBe("viewed");
  });

  it("maps engagement metrics (open/click/last engagement) round-trip", () => {
    const result = toOpportunity(MOCK_OPPORTUNITY_ROW_FULL);

    expect(result.openCount).toBe(4);
    expect(result.clickCount).toBe(2);
    expect(result.lastEngagementAt).toBe("2026-07-12T09:00:00Z");
  });
});

describe("toOpportunityRow", () => {
  it("transforms a camelCase Opportunity back to a snake_case row", () => {
    const opp = toOpportunity(MOCK_OPPORTUNITY_ROW_FULL);
    const result = toOpportunityRow(opp);

    expect(result).toEqual<OpportunityRow>(MOCK_OPPORTUNITY_ROW_FULL);
  });
});

describe("round-trip toOpportunity/toOpportunityRow", () => {
  it("Row -> TS -> Row is identical (fully populated)", () => {
    const roundTripped = toOpportunityRow(toOpportunity(MOCK_OPPORTUNITY_ROW_FULL));
    expect(roundTripped).toEqual(MOCK_OPPORTUNITY_ROW_FULL);
  });

  it("Row -> TS -> Row is identical (all nullable fields null)", () => {
    const roundTripped = toOpportunityRow(
      toOpportunity(MOCK_OPPORTUNITY_ROW_NULLABLE)
    );
    expect(roundTripped).toEqual(MOCK_OPPORTUNITY_ROW_NULLABLE);
  });
});

// ============================================
// toNotificationSettings (Task 3.2)
// ============================================

describe("toNotificationSettings", () => {
  it("transforms snake_case row to camelCase NotificationSettings", () => {
    const result = toNotificationSettings(MOCK_NOTIFICATION_SETTINGS_ROW);

    expect(result).toEqual<NotificationSettings>({
      id: "ns-uuid-001",
      tenantId: "tenant-uuid-001",
      whatsappNumbers: ["5511999999999", "5511888888888"],
      // Story 21.7: whatsappEngagement default false (chave ausente no row legado).
      channels: { whatsapp: true, inApp: false, whatsappEngagement: false },
      notifyIntents: ["interessado", "pediu_info"],
      createdAt: "2026-07-13T10:00:00Z",
      updatedAt: "2026-07-13T10:00:00Z",
    });
  });

  it("maps the in_app JSONB key to inApp", () => {
    const result = toNotificationSettings({
      ...MOCK_NOTIFICATION_SETTINGS_ROW,
      channels: { whatsapp: false, in_app: true },
    });

    expect(result.channels.whatsapp).toBe(false);
    expect(result.channels.inApp).toBe(true);
  });

  it("mapeia whatsapp_engagement -> whatsappEngagement (AC5)", () => {
    const result = toNotificationSettings({
      ...MOCK_NOTIFICATION_SETTINGS_ROW,
      channels: { whatsapp: true, in_app: true, whatsapp_engagement: true },
    });

    expect(result.channels.whatsappEngagement).toBe(true);
  });

  it("handles empty whatsapp_numbers and notify_intents arrays", () => {
    const result = toNotificationSettings({
      ...MOCK_NOTIFICATION_SETTINGS_ROW,
      whatsapp_numbers: [],
      notify_intents: [],
    });

    expect(result.whatsappNumbers).toEqual([]);
    expect(result.notifyIntents).toEqual([]);
  });

  // Story 21.7 Task 2.3 — leitura defensiva do JSONB (fecha defers 21.1 L17-L18)
  describe("defesa de JSONB malformado", () => {
    it("channels null/não-objeto → defaults seguros (não lança)", () => {
      const result = toNotificationSettings({
        ...MOCK_NOTIFICATION_SETTINGS_ROW,
        channels: null as unknown as NotificationSettingsRow["channels"],
      });
      expect(result.channels).toEqual({ whatsapp: true, inApp: true, whatsappEngagement: false });
    });

    it("channels parcial (falta in_app) → default do campo ausente", () => {
      const result = toNotificationSettings({
        ...MOCK_NOTIFICATION_SETTINGS_ROW,
        channels: { whatsapp: false } as unknown as NotificationSettingsRow["channels"],
      });
      expect(result.channels.whatsapp).toBe(false);
      expect(result.channels.inApp).toBe(true); // default (chave ausente)
    });

    it("notify_intents com valor inválido → filtrado", () => {
      const result = toNotificationSettings({
        ...MOCK_NOTIFICATION_SETTINGS_ROW,
        notify_intents: ["interessado", "lixo", "pediu_info"] as unknown as NotificationSettingsRow["notify_intents"],
      });
      expect(result.notifyIntents).toEqual(["interessado", "pediu_info"]);
    });

    it("whatsapp_numbers não-array → default []", () => {
      const result = toNotificationSettings({
        ...MOCK_NOTIFICATION_SETTINGS_ROW,
        whatsapp_numbers: "5511999999999" as unknown as string[],
      });
      expect(result.whatsappNumbers).toEqual([]);
    });
  });
});

// ============================================
// toAppNotification (Task 3.2)
// ============================================

describe("toAppNotification", () => {
  it("transforms snake_case row to camelCase AppNotification (unread)", () => {
    const result = toAppNotification(MOCK_APP_NOTIFICATION_ROW);

    expect(result).toEqual<AppNotification>({
      id: "an-uuid-001",
      tenantId: "tenant-uuid-001",
      type: "nova_oportunidade",
      payload: { opportunityId: "opp-uuid-001", leadEmail: "lead@example.com" },
      readAt: null,
      createdAt: "2026-07-13T10:00:00Z",
    });
  });

  it("maps read_at when the notification has been read", () => {
    const result = toAppNotification({
      ...MOCK_APP_NOTIFICATION_ROW,
      read_at: "2026-07-13T12:00:00Z",
    });

    expect(result.readAt).toBe("2026-07-13T12:00:00Z");
  });

  it("preserves an arbitrary payload object", () => {
    const result = toAppNotification({
      ...MOCK_APP_NOTIFICATION_ROW,
      payload: { nested: { count: 3 }, flag: true },
    });

    expect(result.payload).toEqual({ nested: { count: 3 }, flag: true });
  });

  // Story 21.7 Task 2.3 — payload não-objeto degrada para {} (fecha defer 21.1 L18)
  it("payload não-objeto (array/scalar/null) → {} (não mistipado)", () => {
    expect(
      toAppNotification({
        ...MOCK_APP_NOTIFICATION_ROW,
        payload: [1, 2, 3] as unknown as Record<string, unknown>,
      }).payload
    ).toEqual({});
    expect(
      toAppNotification({
        ...MOCK_APP_NOTIFICATION_ROW,
        payload: null as unknown as Record<string, unknown>,
      }).payload
    ).toEqual({});
  });
});

// ============================================
// RE-EXPORT VALIDATION (barrel @/types)
// ============================================

describe("Re-export from index", () => {
  it("all runtime exports are accessible from @/types barrel", async () => {
    const types = await import("@/types");

    expect(types.OPPORTUNITY_SOURCES).toBeDefined();
    expect(types.OPPORTUNITY_SOURCES).toHaveLength(2);
    expect(types.OPPORTUNITY_INTENTS).toHaveLength(5);
    expect(types.OPPORTUNITY_STATUSES).toHaveLength(5);
    expect(types.isValidOpportunitySource).toBeTypeOf("function");
    expect(types.isValidOpportunityIntent).toBeTypeOf("function");
    expect(types.isValidOpportunityStatus).toBeTypeOf("function");
    expect(types.toOpportunity).toBeTypeOf("function");
    expect(types.toOpportunityRow).toBeTypeOf("function");
    expect(types.toNotificationSettings).toBeTypeOf("function");
    expect(types.toAppNotification).toBeTypeOf("function");
  });
});
