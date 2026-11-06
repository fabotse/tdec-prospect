/**
 * Tests for buildMeetingPrepSources / catalogRefOrigins (Story 24.23)
 */

import { describe, it, expect } from "vitest";
import {
  buildMeetingPrepSources,
  catalogRefOrigins,
  REPLY_MAX_CHARS,
  type BuildMeetingPrepSourcesInput,
} from "@/lib/meeting-prep/sources";
import type { AccountDossierView, DossierViewFact } from "@/types/account-dossier";
import type { KnowledgeBaseProof } from "@/types/knowledge-base";

function fact(i: number, overrides: Partial<DossierViewFact> = {}): DossierViewFact {
  return {
    kind: "news",
    fato: `Fato ${i}`,
    fonteUrl: `https://news.com/${i}`,
    data: "2026-10-20",
    confianca: "alta",
    isTriggerSource: false,
    ...overrides,
  };
}

function foundView(facts: DossierViewFact[], withTrigger = true): Extract<AccountDossierView, { status: "found" }> {
  return {
    status: "found",
    dossier: {
      id: "d1",
      companyName: "Acme",
      companyDomain: "acme.com",
      dossierStatus: "complete",
      failedSources: [],
      researchedAt: "2026-11-01T12:00:00Z",
      expired: true,
    },
    facts,
    totalFacts: facts.length,
    whyNow: withTrigger
      ? {
          status: "trigger",
          reason: null,
          gatilho: "Acme abriu vaga de CISO",
          hipoteseDor: "Como vão estruturar o time?",
          confianca: "alta",
          fonteUrl: "https://jobs.com/1",
          data: "2026-10-30",
        }
      : null,
  };
}

function proof(i: number, overrides: Partial<KnowledgeBaseProof> = {}): KnowledgeBaseProof {
  return {
    id: `p${i}`,
    tenant_id: "t1",
    proof_type: "case",
    text: `Case ${i}`,
    sector: null,
    is_authorized: true,
    created_at: `2026-01-${String(i).padStart(2, "0")}T00:00:00Z`,
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function baseInput(overrides: Partial<BuildMeetingPrepSourcesInput> = {}): BuildMeetingPrepSourcesInput {
  return {
    dossier: { status: "found", view: foundView([fact(1), fact(2)]) },
    opportunity: {
      source: "reply",
      replySubject: "Re: Proposta",
      replyText: "Tenho interesse, vamos conversar",
      openCount: null,
      clickCount: null,
      lastEngagementAt: null,
      meetingBookedAt: null,
      createdAt: "2026-11-02T10:00:00Z",
    },
    campaignName: "Q4",
    events: [],
    proofs: [proof(1)],
    icp: { pain_points: "Falta de time", common_objections: "Preço" },
    lead: { title: "CTO", companyName: "Acme" },
    ...overrides,
  };
}

describe("buildMeetingPrepSources", () => {
  it("monta F1..F8 na ordem da view, gatilho, R, provas e KB", () => {
    const facts = Array.from({ length: 10 }, (_, i) => fact(i + 1));
    const { catalog, account } = buildMeetingPrepSources(
      baseInput({ dossier: { status: "found", view: foundView(facts) } })
    );
    expect(catalog.facts.map((f) => f.id)).toEqual(["F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8"]);
    expect(catalog.facts[0].fato).toBe("Fato 1");
    expect(catalog.trigger).toEqual({
      id: "F-GATILHO",
      gatilho: "Acme abriu vaga de CISO",
      hipoteseDor: "Como vão estruturar o time?",
    });
    expect(catalog.reply?.id).toBe("R");
    expect(catalog.proofs[0]).toEqual({ id: "P1", label: "Case", text: "Case 1", sector: null });
    expect(catalog.kbPains).toEqual({ id: "KB-DORES", text: "Falta de time" });
    expect(catalog.kbObjections).toEqual({ id: "KB-OBJ", text: "Preço" });

    expect(account.status).toBe("found");
    expect(account.companyName).toBe("Acme");
    expect(account.expired).toBe(true);
    expect(account.facts).toHaveLength(8);
    expect(account.whyNow?.gatilho).toBe("Acme abriu vaga de CISO");
  });

  it("sem dossiê: account none, sem fatos e sem gatilho", () => {
    const { catalog, account } = buildMeetingPrepSources(baseInput({ dossier: { status: "none" } }));
    expect(account.status).toBe("none");
    expect(account.facts).toEqual([]);
    expect(catalog.facts).toEqual([]);
    expect(catalog.trigger).toBeNull();
    expect(account.companyName).toBe("Acme");
  });

  it("dossiê com erro: account error", () => {
    const { account } = buildMeetingPrepSources(baseInput({ dossier: { status: "error" } }));
    expect(account.status).toBe("error");
    expect(account.facts).toEqual([]);
  });

  it("whyNow sem gatilho não entra no catálogo", () => {
    const view = foundView([fact(1)], false);
    const { catalog, account } = buildMeetingPrepSources(baseInput({ dossier: { status: "found", view } }));
    expect(catalog.trigger).toBeNull();
    expect(account.whyNow).toBeNull();
  });

  it("corta a resposta em 2000 caracteres; sem resposta não há R", () => {
    const long = "a".repeat(5000);
    const withLong = buildMeetingPrepSources(
      baseInput({ opportunity: { ...baseInput().opportunity, replyText: long } })
    );
    expect(withLong.catalog.reply?.text.length).toBe(REPLY_MAX_CHARS);
    expect(withLong.engagement.replyText?.length).toBe(REPLY_MAX_CHARS);

    const empty = buildMeetingPrepSources(
      baseInput({ opportunity: { ...baseInput().opportunity, replyText: "   " } })
    );
    expect(empty.catalog.reply).toBeNull();
    expect(empty.engagement.replyText).toBeNull();
  });

  it("só provas autorizadas, created_at asc, no máximo 20", () => {
    const proofs = [
      proof(3),
      proof(1, { is_authorized: false }),
      proof(2, { text: "  " }),
      ...Array.from({ length: 25 }, (_, i) => proof(i + 4)),
    ];
    const { catalog } = buildMeetingPrepSources(baseInput({ proofs }));
    expect(catalog.proofs).toHaveLength(20);
    expect(catalog.proofs[0].text).toBe("Case 3");
    expect(catalog.proofs[19].id).toBe("P20");
  });

  it("KB vazia não gera KB-DORES/KB-OBJ", () => {
    const { catalog } = buildMeetingPrepSources(baseInput({ icp: { pain_points: "", common_objections: 3 } }));
    expect(catalog.kbPains).toBeNull();
    expect(catalog.kbObjections).toBeNull();
  });

  it("engajamento determinístico: eventos desc, repliedAt do último reply", () => {
    const { engagement } = buildMeetingPrepSources(
      baseInput({
        events: [
          { event_type: "email_opened", event_timestamp: "2026-10-01T00:00:00Z" },
          { event_type: "email_replied", event_timestamp: "2026-10-05T00:00:00Z" },
          { event_type: "email_clicked", event_timestamp: "2026-10-03T00:00:00Z" },
        ],
      })
    );
    expect(engagement.events.map((e) => e.type)).toEqual(["email_replied", "email_clicked", "email_opened"]);
    expect(engagement.repliedAt).toBe("2026-10-05T00:00:00Z");
    expect(engagement.campaignName).toBe("Q4");
  });

  it("reply sem evento usa created_at; engagement sem reply fica null", () => {
    expect(buildMeetingPrepSources(baseInput()).engagement.repliedAt).toBe("2026-11-02T10:00:00Z");
    const eng = buildMeetingPrepSources(
      baseInput({
        opportunity: { ...baseInput().opportunity, source: "engagement", replyText: null, openCount: 4, clickCount: 1 },
      })
    ).engagement;
    expect(eng.repliedAt).toBeNull();
    expect(eng.openCount).toBe(4);
  });
});

describe("catalogRefOrigins", () => {
  it("mapeia cada id à sua origem", () => {
    const { catalog } = buildMeetingPrepSources(baseInput());
    const map = catalogRefOrigins(catalog);
    expect(map.get("F1")).toBe("dossie");
    expect(map.get("F-GATILHO")).toBe("dossie");
    expect(map.get("R")).toBe("resposta");
    expect(map.get("P1")).toBe("kb");
    expect(map.get("KB-DORES")).toBe("kb");
    expect(map.get("KB-OBJ")).toBe("kb");
    expect(map.has("F9")).toBe(false);
  });
});
