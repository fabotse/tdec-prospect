/**
 * Story 24.15 — triagem dos resultados da busca (lead-screening.ts).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  findContactedLeads,
  isPublicSectorOrganization,
  isReviewEligible,
  orderByScreening,
  screenLeads,
  summarizeScreening,
  suppressedLeadsMessage,
} from "@/lib/agent/lead-screening";
import type { SearchLeadResult } from "@/types/agent";

function lead(apolloId: string | null, companyName: string | null = "Acme"): SearchLeadResult {
  return {
    name: `Lead ${apolloId}`,
    title: "CISO",
    companyName,
    email: null,
    linkedinUrl: null,
    apolloId,
  };
}

type Result = { data: unknown; error: unknown } | Error;

/** Cliente com uma resposta por tabela (o await resolve no fim da cadeia). */
function buildClient(byTable: Record<string, Result>) {
  const chains: Record<string, Record<string, ReturnType<typeof vi.fn>>> = {};
  const from = vi.fn((table: string) => {
    const result = byTable[table] ?? { data: [], error: null };
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in"]) chain[m] = vi.fn(() => chain);
    chain.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      result instanceof Error ? Promise.reject(result).catch(reject) : Promise.resolve(result).then(resolve);
    chains[table] = chain as Record<string, ReturnType<typeof vi.fn>>;
    return chain;
  });
  return { client: { from } as unknown as SupabaseClient, from, chains };
}

describe("isPublicSectorOrganization", () => {
  it.each([
    "Prefeitura de Campinas",
    "Prefeitura Municipal de São Paulo",
    "Câmara Municipal de Santos",
    "Assembleia Legislativa do Estado de SP",
    "Governo do Estado de São Paulo",
    "Secretaria de Estado da Saúde",
    "Ministério da Economia",
    "Tribunal de Justiça de SP",
    "Ministério Público Federal",
    "Defensoria Pública da União",
    "Senado Federal",
    "Município de Atibaia",
    "DETRAN-SP",
    "Universidade Federal de São Paulo",
    "Polícia Militar do Estado de SP",
    "Receita Federal do Brasil",
    "Banco Central do Brasil",
    "Força Aérea Brasileira",
  ])("%s -> true", (name) => {
    expect(isPublicSectorOrganization(name)).toBe(true);
  });

  it.each(["Banco Itaú", "Governança Digital Ltda", "Detranslog Transportes", null, "", "  "])(
    "%s -> false",
    (name) => {
      expect(isPublicSectorOrganization(name)).toBe(false);
    }
  );
});

describe("findContactedLeads", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("nao_interessado -> suprimido; em_campanha/interessado/oportunidade -> ja contatado", async () => {
    const { client, chains } = buildClient({
      leads: {
        data: [
          { id: "l1", apollo_id: "a1", status: "nao_interessado" },
          { id: "l2", apollo_id: "a2", status: "em_campanha" },
          { id: "l3", apollo_id: "a3", status: "interessado" },
          { id: "l4", apollo_id: "a4", status: "oportunidade" },
          { id: "l5", apollo_id: "a5", status: "novo" },
        ],
        error: null,
      },
      opportunities: { data: [], error: null },
    });

    const map = await findContactedLeads(client, "tenant-1", ["a1", "a2", "a3", "a4", "a5", null]);

    expect(chains.leads.eq).toHaveBeenCalledWith("tenant_id", "tenant-1");
    expect(chains.leads.in).toHaveBeenCalledWith("apollo_id", ["a1", "a2", "a3", "a4", "a5"]);
    expect(Object.fromEntries(map)).toEqual({
      a1: "suppressed",
      a2: "already_contacted",
      a3: "already_contacted",
      a4: "already_contacted",
    });
  });

  it("oportunidade contacted/meeting_booked suprime o lead", async () => {
    const { client, chains } = buildClient({
      leads: {
        data: [
          { id: "l2", apollo_id: "a2", status: "em_campanha" },
          { id: "l5", apollo_id: "a5", status: "novo" },
        ],
        error: null,
      },
      opportunities: { data: [{ lead_id: "l2", status: "meeting_booked" }], error: null },
    });

    const map = await findContactedLeads(client, "tenant-1", ["a2", "a5"]);

    expect(chains.opportunities.in).toHaveBeenCalledWith("lead_id", ["l2", "l5"]);
    expect(chains.opportunities.in).toHaveBeenCalledWith("status", ["contacted", "meeting_booked"]);
    expect(Object.fromEntries(map)).toEqual({ a2: "suppressed" });
  });

  it("sem apollo ids: nao consulta o banco", async () => {
    const { client, from } = buildClient({});
    const map = await findContactedLeads(client, "tenant-1", [null, undefined]);
    expect(map.size).toBe(0);
    expect(from).not.toHaveBeenCalled();
  });

  it("erro de leitura -> warn e mapa vazio (fail-open)", async () => {
    const { client } = buildClient({ leads: { data: null, error: { message: "boom" } } });
    expect((await findContactedLeads(client, "t", ["a1"])).size).toBe(0);
    expect(console.warn).toHaveBeenCalled();

    const thrown = buildClient({ leads: new Error("network") });
    expect((await findContactedLeads(thrown.client, "t", ["a1"])).size).toBe(0);

    const oppFail = buildClient({
      leads: { data: [{ id: "l1", apollo_id: "a1", status: "em_campanha" }], error: null },
      opportunities: { data: null, error: { message: "boom" } },
    });
    // falha so nas oportunidades: mantem os status ja lidos dos leads
    expect(Object.fromEntries(await findContactedLeads(oppFail.client, "t", ["a1"]))).toEqual({
      a1: "already_contacted",
    });
  });
});

describe("screenLeads / isReviewEligible / summarizeScreening / orderByScreening", () => {
  it("remove suprimidos e anota publicos e ja contatados, preservando os indices", () => {
    const leads = [
      lead("a1"),
      lead("a2", "Prefeitura de Campinas"),
      lead("a3"),
      lead("a4"),
      lead(null),
    ];
    const contactMap = new Map([
      ["a3", "suppressed" as const],
      ["a4", "already_contacted" as const],
    ]);

    const result = screenLeads(leads, contactMap);

    expect(result.suppressedCount).toBe(1);
    expect(result.keptIndexes).toEqual([0, 1, 3, 4]);
    expect(result.leads.map((l) => l.apolloId)).toEqual(["a1", "a2", "a4", null]);
    expect(result.leads[1].publicSector).toBe(true);
    expect(result.leads[2].contactStatus).toBe("already_contacted");
    expect(result.leads[0]).not.toHaveProperty("publicSector");
    expect(result.leads[0]).not.toHaveProperty("contactStatus");

    expect(result.leads.map(isReviewEligible)).toEqual([true, false, false, true]);
    expect(summarizeScreening(result.leads, result.suppressedCount)).toEqual({
      suppressed: 1,
      publicSector: 1,
      alreadyContacted: 1,
    });
  });

  it("ordem: elegiveis, depois ja contatados, depois publicos (estavel)", () => {
    const ordered = orderByScreening([
      { ...lead("p1"), publicSector: true },
      { ...lead("c1"), contactStatus: "already_contacted" as const },
      lead("e1"),
      lead("e2"),
      { ...lead("c2"), contactStatus: "already_contacted" as const },
    ]);
    expect(ordered.map((l) => l.apolloId)).toEqual(["e1", "e2", "c1", "c2", "p1"]);
  });

  it("mensagem de suprimidos", () => {
    expect(suppressedLeadsMessage(2)).toBe(
      "Removi 2 lead(s) suprimido(s) (pediram para sair ou estao em negociacao)."
    );
  });
});
