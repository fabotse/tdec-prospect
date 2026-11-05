/**
 * Unit Tests — dossier-view (montagem pura do painel)
 * Story 24.22 - AC 1, 5 · D7, D8
 */

import { describe, it, expect } from "vitest";
import {
  buildDossierView,
  DOSSIER_VIEW_MAX_FACTS,
  findLeadWhyNow,
  toWhyNowView,
} from "@/lib/agent/dossier/dossier-view";
import type { DossierFact } from "@/lib/agent/dossier/facts";
import type { LeadWhyNow } from "@/types/agent";

const NOW = new Date("2026-11-05T12:00:00Z");

const dossierRow = {
  id: "dossier-1",
  company_domain: "acme.com",
  company_name: "Acme",
  status: "complete",
  failed_sources: [],
  researched_at: "2026-11-01T10:00:00Z",
  expires_at: "2026-12-01T10:00:00Z",
};

function fact(overrides: Partial<DossierFact> = {}): DossierFact {
  return {
    kind: "news",
    fato: "Acme abre escritório em Recife",
    fonte_url: "https://news.example.com/acme",
    data: "2026-10-20",
    confianca: "alta",
    lead_apollo_id: null,
    lead_email: null,
    ...overrides,
  };
}

const triggerEntry: LeadWhyNow = {
  leadIndex: 0,
  apolloId: "ap-1",
  email: "ana@acme.com",
  companyDomain: "acme.com",
  dossierId: "dossier-1",
  status: "trigger",
  trigger: {
    gatilho: "Noticia: Acme abre escritório em Recife",
    hipoteseDor: "Como vão contratar para o novo escritório?",
    confianca: "alta",
    fatoOrigem: {
      ref: 0,
      kind: "news",
      fato: "Acme abre escritório em Recife",
      fonte_url: "https://news.example.com/acme",
      data: "2026-10-20",
      confianca: "alta",
    },
  },
};

describe("findLeadWhyNow", () => {
  const whyNow = {
    leads: [
      { ...triggerEntry, apolloId: "ap-1", email: "ana@acme.com" },
      { leadIndex: 1, apolloId: null, email: "bob@acme.com", companyDomain: "acme.com", dossierId: "dossier-1", status: "no_trigger", reason: "no_eligible_facts" },
    ],
  };

  it("casa por apolloId", () => {
    expect(findLeadWhyNow(whyNow, { apolloId: "ap-1", email: "x@y.com" })?.apolloId).toBe("ap-1");
  });

  it("casa por e-mail com caixa mista", () => {
    const entry = findLeadWhyNow(whyNow, { apolloId: "nao-existe", email: "  BOB@Acme.COM " });
    expect(entry?.email).toBe("bob@acme.com");
    expect(entry?.reason).toBe("no_eligible_facts");
  });

  it("output antigo sem whyNow -> null", () => {
    expect(findLeadWhyNow(undefined, { apolloId: "ap-1" })).toBeNull();
    expect(findLeadWhyNow(null, { apolloId: "ap-1" })).toBeNull();
  });

  it("formato inválido -> null", () => {
    expect(findLeadWhyNow({ leads: "x" }, { apolloId: "ap-1" })).toBeNull();
    expect(findLeadWhyNow({ leads: [{ apolloId: "ap-1", status: "talvez" }] }, { apolloId: "ap-1" })).toBeNull();
    expect(findLeadWhyNow([1, 2], { apolloId: "ap-1" })).toBeNull();
  });

  it("trigger fora do formato é descartado (vira entrada sem trigger)", () => {
    const entry = findLeadWhyNow(
      { leads: [{ apolloId: "ap-1", status: "trigger", trigger: { gatilho: 1 } }] },
      { apolloId: "ap-1" }
    );
    expect(entry?.trigger).toBeUndefined();
    expect(toWhyNowView(entry)?.status).toBe("no_trigger");
  });
});

describe("toWhyNowView", () => {
  it("null -> null (não avaliado)", () => {
    expect(toWhyNowView(null)).toBeNull();
  });

  it("gatilho com fonte validada", () => {
    expect(toWhyNowView(triggerEntry)).toEqual({
      status: "trigger",
      reason: null,
      gatilho: "Noticia: Acme abre escritório em Recife",
      hipoteseDor: "Como vão contratar para o novo escritório?",
      confianca: "alta",
      fonteUrl: "https://news.example.com/acme",
      data: "2026-10-20",
    });
  });

  it("fonte do gatilho javascript: -> null", () => {
    const entry: LeadWhyNow = {
      ...triggerEntry,
      trigger: { ...triggerEntry.trigger!, fatoOrigem: { ...triggerEntry.trigger!.fatoOrigem, fonte_url: "javascript:alert(1)" } },
    };
    expect(toWhyNowView(entry)?.fonteUrl).toBeNull();
  });

  it("sem gatilho leva o motivo", () => {
    expect(toWhyNowView({ ...triggerEntry, status: "no_trigger", trigger: undefined, reason: "budget" })).toMatchObject({
      status: "no_trigger",
      reason: "budget",
      gatilho: null,
      hipoteseDor: null,
    });
  });
});

describe("buildDossierView", () => {
  it("D7: post de outro lead some, post do lead fica (apolloId ou e-mail minúsculo)", () => {
    const view = buildDossierView({
      dossierRow,
      facts: [
        fact({ kind: "post", fato: "post do outro", lead_apollo_id: "ap-9", lead_email: "outro@acme.com" }),
        fact({ kind: "post", fato: "post da ana (apollo)", lead_apollo_id: "ap-1" }),
        fact({ kind: "post", fato: "post da ana (email)", lead_email: "Ana@Acme.com" }),
        fact({ kind: "post", fato: "post sem dono" }),
        fact({ kind: "site", fato: "site da conta" }),
      ],
      ident: { apolloId: "ap-1", email: "ANA@acme.com" },
      whyNowEntry: null,
      now: NOW,
    });
    if (view.status !== "found") throw new Error("esperado found");
    const textos = view.facts.map((f) => f.fato);
    expect(textos).toContain("post da ana (apollo)");
    expect(textos).toContain("post da ana (email)");
    expect(textos).toContain("site da conta");
    expect(textos).not.toContain("post do outro");
    expect(textos).not.toContain("post sem dono");
    expect(view.totalFacts).toBe(3);
    // O DTO nao leva identificadores de outros leads.
    expect(JSON.stringify(view)).not.toContain("outro@acme.com");
    expect(JSON.stringify(view)).not.toContain("lead_apollo_id");
  });

  it("D8: ordem por tipo (Notícia, Vaga, Post, Site, Tecnologia) e data desc", () => {
    const view = buildDossierView({
      dossierRow,
      facts: [
        fact({ kind: "technology", fato: "React", data: "2026-10-01" }),
        fact({ kind: "site", fato: "site", data: "2026-10-01" }),
        fact({ kind: "job", fato: "vaga antiga", data: "2026-09-01" }),
        fact({ kind: "news", fato: "noticia antiga", data: "2026-09-01" }),
        fact({ kind: "job", fato: "vaga nova", data: "2026-10-10" }),
        fact({ kind: "news", fato: "noticia nova", data: "2026-10-30" }),
        fact({ kind: "post", fato: "post", lead_apollo_id: "ap-1", data: "2026-10-02" }),
      ],
      ident: { apolloId: "ap-1" },
      whyNowEntry: null,
      now: NOW,
    });
    if (view.status !== "found") throw new Error("esperado found");
    expect(view.facts.map((f) => f.fato)).toEqual([
      "noticia nova",
      "noticia antiga",
      "vaga nova",
      "vaga antiga",
      "post",
      "site",
      "React",
    ]);
  });

  it("D8: corte em 50 com totalFacts antes do corte", () => {
    const facts = Array.from({ length: 60 }, (_, i) => fact({ fato: `fato ${i}` }));
    const view = buildDossierView({ dossierRow, facts, ident: {}, whyNowEntry: null, now: NOW });
    if (view.status !== "found") throw new Error("esperado found");
    expect(DOSSIER_VIEW_MAX_FACTS).toBe(50);
    expect(view.facts).toHaveLength(50);
    expect(view.totalFacts).toBe(60);
  });

  it("D8: isTriggerSource quando kind+fato+fonte_url batem com fatoOrigem", () => {
    const view = buildDossierView({
      dossierRow,
      facts: [
        fact(),
        fact({ fato: "outro fato" }),
        fact({ fonte_url: "https://news.example.com/outra" }),
      ],
      ident: { apolloId: "ap-1" },
      whyNowEntry: triggerEntry,
      now: NOW,
    });
    if (view.status !== "found") throw new Error("esperado found");
    expect(view.facts.filter((f) => f.isTriggerSource)).toHaveLength(1);
    expect(view.facts.find((f) => f.isTriggerSource)?.fato).toBe("Acme abre escritório em Recife");
    expect(view.whyNow?.status).toBe("trigger");
  });

  it("fonteUrl javascript:/data:/relativa -> null", () => {
    const view = buildDossierView({
      dossierRow,
      facts: [
        fact({ fato: "a", fonte_url: "javascript:alert(1)" }),
        fact({ fato: "b", fonte_url: "data:text/html,<script>alert(1)</script>" }),
        fact({ fato: "c", fonte_url: "/relativa" }),
        fact({ fato: "d", fonte_url: "http://ok.example.com/x" }),
      ],
      ident: {},
      whyNowEntry: null,
      now: NOW,
    });
    if (view.status !== "found") throw new Error("esperado found");
    const byText = Object.fromEntries(view.facts.map((f) => [f.fato, f.fonteUrl]));
    expect(byText).toEqual({ a: null, b: null, c: null, d: "http://ok.example.com/x" });
  });

  it("expired quando expires_at < agora; status e fontes sanitizados", () => {
    const view = buildDossierView({
      dossierRow: { ...dossierRow, expires_at: "2026-11-01T00:00:00Z", status: "estranho", failed_sources: ["treg", 3, ""] },
      facts: [],
      ident: {},
      whyNowEntry: null,
      now: NOW,
    });
    if (view.status !== "found") throw new Error("esperado found");
    expect(view.dossier.expired).toBe(true);
    expect(view.dossier.dossierStatus).toBe("partial");
    expect(view.dossier.failedSources).toEqual(["treg"]);
    expect(view.whyNow).toBeNull();

    const fresh = buildDossierView({ dossierRow, facts: [], ident: {}, whyNowEntry: null, now: NOW });
    if (fresh.status !== "found") throw new Error("esperado found");
    expect(fresh.dossier.expired).toBe(false);
    expect(fresh.dossier.dossierStatus).toBe("complete");
  });

  it("descarta tipo/confiança desconhecidos (inclusive chaves do prototype)", () => {
    const view = buildDossierView({
      dossierRow,
      facts: [
        fact({ kind: "toString" as DossierFact["kind"] }),
        fact({ confianca: "enorme" as DossierFact["confianca"] }),
        fact({ fato: "valido" }),
      ],
      ident: {},
      whyNowEntry: null,
      now: NOW,
    });
    if (view.status !== "found") throw new Error("esperado found");
    expect(view.facts.map((f) => f.fato)).toEqual(["valido"]);
  });
});
