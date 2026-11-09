/**
 * Tests for formatMeetingPrepText (Story 24.23)
 */

import { describe, it, expect } from "vitest";
import { formatMeetingPrepText, sourceHost, formatDateTime } from "@/lib/meeting-prep/format-text";
import type { MeetingPrep } from "@/types/meeting-prep";

const PREP: MeetingPrep = {
  version: 1,
  generatedAt: "2026-11-06T15:30:00.000Z",
  account: {
    status: "found",
    companyName: "Acme",
    companyDomain: "acme.com",
    researchedAt: "2026-11-01T12:00:00.000Z",
    expired: true,
    facts: [
      { id: "F1", kind: "news", fato: "Acme abriu filial", fonteUrl: "https://www.news.com/a?x=1", data: "2026-10-20" },
      { id: "F2", kind: "job", fato: "Vaga", fonteUrl: "javascript:alert(1)", data: "2026-10-21" },
    ],
    whyNow: { gatilho: "Vaga de CISO", hipoteseDor: "Como estruturar o time?" },
  },
  engagement: {
    source: "reply",
    campaignName: "Q4",
    replySubject: "Re: Oi",
    replyText: "Tenho interesse",
    repliedAt: "2026-11-02T10:00:00.000Z",
    openCount: 3,
    clickCount: 1,
    lastEngagementAt: null,
    meetingBookedAt: null,
    events: [
      { type: "email_opened", at: "2026-11-01T10:00:00.000Z" },
      { type: "email_clicked", at: "não é data" },
    ],
  },
  talkingPoints: [
    { text: "Ponto com fonte", origin: "dossie", refs: ["F1"] },
    { text: "Ponto sem fonte", origin: "sugestao", refs: [] },
    { text: "Ponto da KB", origin: "kb", refs: ["P1"] },
  ],
  objections: [{ objection: "Está caro", answer: "Mostrar ROI", origin: "sugestao", refs: [] }],
  kbRefs: ["P1"],
};

describe("formatMeetingPrepText", () => {
  it("monta as seções com fonte (host) e prefixo [Sugestão]", () => {
    const text = formatMeetingPrepText(PREP);
    expect(text).toContain("Preparação de reunião — Acme");
    expect(text).toContain("Gerado em 06/11/2026 12:30");
    expect(text).toContain("RESUMO DA CONTA");
    expect(text).toContain("(desatualizada)");
    expect(text).toContain("- Acme abriu filial (Notícia, 20/10/2026, fonte: www.news.com)");
    expect(text).toContain("- Vaga (Vaga, 21/10/2026, fonte inválida)");
    expect(text).toContain("Gatilho: Vaga de CISO");
    expect(text).toContain("Resposta (02/11/2026 07:00): Tenho interesse");
    expect(text).toContain("Aberturas: 3 · Cliques: 1");
    expect(text).toContain("1. Ponto com fonte");
    expect(text).toContain("2. [Sugestão] Ponto sem fonte");
    expect(text).toContain("3. Ponto da KB");
    expect(text).toContain("1. [Sugestão] Está caro");
    expect(text).toContain("   Resposta: Mostrar ROI");
    expect(text).not.toContain("javascript:");
    // gatilho/hipótese antes dos fatos (mesma ordem do painel)
    expect(text.indexOf("Gatilho: Vaga de CISO")).toBeLessThan(text.indexOf("- Acme abriu filial"));
    expect(text.indexOf("Hipótese de dor:")).toBeLessThan(text.indexOf("- Acme abriu filial"));
    // evento: com data "em ..."; sem data, só o rótulo
    expect(text).toContain("- Abriu o e-mail em 01/11/2026 07:00");
    expect(text.split("\n")).toContain("- Clicou no link");
    expect(text).not.toMatch(/ em $/m);
  });

  it("sem pesquisa: 'Sem pesquisa da conta.'", () => {
    const text = formatMeetingPrepText({
      ...PREP,
      account: { ...PREP.account, status: "none", facts: [], whyNow: null },
    });
    expect(text).toContain("Sem pesquisa da conta.");
    expect(text).not.toContain("Acme abriu filial");
  });

  it("título explícito vence o nome da empresa", () => {
    expect(formatMeetingPrepText(PREP, "Beta").split("\n")[0]).toBe("Preparação de reunião — Beta");
  });
});

describe("helpers", () => {
  it("sourceHost só aceita http/https", () => {
    expect(sourceHost("https://a.com/x")).toBe("a.com");
    expect(sourceHost("javascript:alert(1)")).toBeNull();
    expect(sourceHost("nada")).toBeNull();
    expect(sourceHost(null)).toBeNull();
  });

  it("formatDateTime inválido -> vazio", () => {
    expect(formatDateTime("x")).toBe("");
    expect(formatDateTime(null)).toBe("");
  });
});
