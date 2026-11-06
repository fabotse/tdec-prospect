/**
 * Tests for the MeetingPrep contract (Story 24.23)
 * parseMeetingPrep (leitura defensiva do jsonb) + toOpportunity/toOpportunityRow.
 */

import { describe, it, expect } from "vitest";
import { parseMeetingPrep, type MeetingPrep } from "@/types/meeting-prep";
import { toOpportunity, toOpportunityRow, type OpportunityRow } from "@/types/opportunity";

const VALID_PREP: MeetingPrep = {
  version: 1,
  generatedAt: "2026-11-06T15:00:00.000Z",
  account: {
    status: "found",
    companyName: "Acme",
    companyDomain: "acme.com",
    researchedAt: "2026-11-01T12:00:00.000Z",
    expired: false,
    facts: [{ id: "F1", kind: "news", fato: "Acme abriu filial", fonteUrl: "https://news.com/a", data: "2026-10-20" }],
    whyNow: null,
  },
  engagement: {
    source: "reply",
    campaignName: "Q4",
    replySubject: "Re: Oi",
    replyText: "Tenho interesse",
    repliedAt: "2026-11-02T10:00:00.000Z",
    openCount: null,
    clickCount: null,
    lastEngagementAt: null,
    meetingBookedAt: null,
    events: [],
  },
  talkingPoints: [
    { text: "Ponto 1", origin: "dossie", refs: ["F1"] },
    { text: "Ponto 2", origin: "resposta", refs: ["R"] },
    { text: "Ponto 3", origin: "sugestao", refs: [] },
  ],
  objections: [{ objection: "Caro", answer: "ROI", origin: "kb", refs: ["P1"] }],
};

const ROW: OpportunityRow = {
  id: "opp-1",
  tenant_id: "t1",
  lead_id: null,
  campaign_id: "c1",
  source: "reply",
  reply_event_id: null,
  reply_text: null,
  reply_subject: null,
  unibox_url: null,
  intent: "interessado",
  lt_interest_status: null,
  suggestion: null,
  status: "new",
  meeting_booked_at: null,
  open_count: null,
  click_count: null,
  last_engagement_at: null,
  notified_at: null,
  created_at: "2026-11-01T00:00:00Z",
  updated_at: "2026-11-01T00:00:00Z",
};

describe("parseMeetingPrep", () => {
  it("aceita o contrato v1", () => {
    expect(parseMeetingPrep(VALID_PREP)).toEqual(VALID_PREP);
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["string", "lixo"],
    ["número", 42],
    ["array", []],
    ["objeto vazio", {}],
    ["versão errada", { ...VALID_PREP, version: 2 }],
    ["origem desconhecida", { ...VALID_PREP, talkingPoints: [{ text: "x", origin: "web", refs: [] }] }],
    ["account sem status", { ...VALID_PREP, account: { ...VALID_PREP.account, status: "talvez" } }],
  ])("lixo (%s) -> null", (_label, value) => {
    expect(parseMeetingPrep(value)).toBeNull();
  });
});

describe("toOpportunity / toOpportunityRow com meeting_prep", () => {
  it("linha sem a coluna (antes da 00074) não ganha meetingPrep", () => {
    expect(toOpportunity(ROW).meetingPrep).toBeUndefined();
  });

  it("linha com briefing válido devolve o briefing; lixo vira null", () => {
    expect(toOpportunity({ ...ROW, meeting_prep: VALID_PREP }).meetingPrep).toEqual(VALID_PREP);
    expect(toOpportunity({ ...ROW, meeting_prep: { foo: 1 } }).meetingPrep).toBeNull();
    expect(toOpportunity({ ...ROW, meeting_prep: null }).meetingPrep).toBeNull();
  });

  it("toOpportunityRow nunca inclui meeting_prep (INSERT antes da migration)", () => {
    const row = toOpportunityRow(toOpportunity({ ...ROW, meeting_prep: VALID_PREP }));
    expect(Object.keys(row)).not.toContain("meeting_prep");
  });
});
