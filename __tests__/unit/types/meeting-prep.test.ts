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
  kbRefs: ["P1"],
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
    ["só 1 ponto", { ...VALID_PREP, talkingPoints: VALID_PREP.talkingPoints.slice(0, 1) }],
    ["sem objeções", { ...VALID_PREP, objections: [] }],
    [
      "6 pontos",
      { ...VALID_PREP, talkingPoints: Array.from({ length: 6 }, () => VALID_PREP.talkingPoints[2]) },
    ],
    [
      "ponto com texto vazio",
      { ...VALID_PREP, talkingPoints: [...VALID_PREP.talkingPoints.slice(0, 2), { text: "  ", origin: "sugestao", refs: [] }] },
    ],
    ["data inválida", { ...VALID_PREP, generatedAt: "ontem" }],
  ])("lixo (%s) -> null", (_label, value) => {
    expect(parseMeetingPrep(value)).toBeNull();
  });

  it("citação que o snapshot não sustenta vira sugestão e perde o ref", () => {
    const prep = {
      ...VALID_PREP,
      account: { ...VALID_PREP.account, status: "none" as const, facts: [] },
      engagement: { ...VALID_PREP.engagement, replyText: null },
      talkingPoints: [
        { text: "Ponto 1", origin: "dossie" as const, refs: ["F999"] },
        { text: "Ponto 2", origin: "resposta" as const, refs: ["R"] },
        { text: "Ponto 3", origin: "kb" as const, refs: ["P1", "X9"] },
      ],
      objections: [{ objection: "Caro", answer: "ROI", origin: "dossie" as const, refs: ["F1"] }],
    };
    const out = parseMeetingPrep(prep);
    expect(out?.talkingPoints).toEqual([
      { text: "Ponto 1", origin: "sugestao", refs: [] },
      { text: "Ponto 2", origin: "sugestao", refs: [] },
      { text: "Ponto 3", origin: "kb", refs: ["P1"] },
    ]);
    expect(out?.objections[0]).toMatchObject({ origin: "sugestao", refs: [] });
  });

  it("fato vazio, gatilho vazio e prova fora de kbRefs não sustentam a origem", () => {
    const prep = {
      ...VALID_PREP,
      account: {
        ...VALID_PREP.account,
        facts: [{ ...VALID_PREP.account.facts[0], fato: " " }],
        whyNow: { gatilho: "", hipoteseDor: null },
      },
      talkingPoints: [
        { text: "Ponto 1", origin: "dossie" as const, refs: ["F1"] },
        { text: "Ponto 2", origin: "dossie" as const, refs: ["F-GATILHO"] },
        { text: "Ponto 3", origin: "kb" as const, refs: ["P999"] },
      ],
    };
    const out = parseMeetingPrep(prep);
    expect(out?.talkingPoints.map((t) => t.origin)).toEqual(["sugestao", "sugestao", "sugestao"]);
    expect(out?.talkingPoints.every((t) => t.refs.length === 0)).toBe(true);
  });

  it("briefing salvo antes do kbRefs (sem o campo) é descartado", () => {
    const { kbRefs: _omit, ...legacy } = VALID_PREP;
    expect(parseMeetingPrep(legacy)).toBeNull();
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
