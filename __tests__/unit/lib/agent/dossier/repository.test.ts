/**
 * Dossie da conta — repository (Story 24.19)
 * Erros sao devolvidos, nunca lancados.
 */

import { describe, it, expect } from "vitest";
import {
  findPostLeadIdentifiers,
  findReusableDossier,
  insertFacts,
  linkLeads,
  readDossierFacts,
  saveDossier,
} from "@/lib/agent/dossier/repository";
import type { DossierFact } from "@/lib/agent/dossier/facts";
import { createQueueSupabase } from "../../../../helpers/queue-supabase";

const TENANT = "tenant-1";
const NOW = new Date("2026-11-03T12:00:00.000Z");
const FACT: DossierFact = {
  kind: "news",
  fato: "Banco X anuncia novo CISO",
  fonte_url: "https://valor.com.br/a",
  data: "2026-10-01",
  confianca: "alta",
};

describe("findReusableDossier", () => {
  it("filtra tenant + dominio + complete + nao expirado e conta os fatos", async () => {
    const fake = createQueueSupabase({
      account_dossiers: [{ data: [{ id: "d-1", company_name: "Banco X" }] }],
      account_dossier_facts: [{ data: [{ id: "f1" }, { id: "f2" }] }],
    });
    const result = await findReusableDossier(fake.client, TENANT, "bancox.com.br", NOW);

    expect(result).toEqual({ dossier: { id: "d-1", companyName: "Banco X", factsCount: 2 } });
    const chain = fake.callsTo("account_dossiers")[0].chain;
    expect(chain.eq).toHaveBeenCalledWith("tenant_id", TENANT);
    expect(chain.eq).toHaveBeenCalledWith("company_domain", "bancox.com.br");
    expect(chain.eq).toHaveBeenCalledWith("status", "complete");
    expect(chain.gt).toHaveBeenCalledWith("expires_at", NOW.toISOString());
  });

  it("sem dossie: null; complete sem fatos gravados: nao reaproveita", async () => {
    const none = createQueueSupabase({ account_dossiers: [{ data: [] }] });
    expect(await findReusableDossier(none.client, TENANT, "x.com", NOW)).toEqual({ dossier: null });

    const noFacts = createQueueSupabase({
      account_dossiers: [{ data: [{ id: "d-1", company_name: null }] }],
      account_dossier_facts: [{ data: [] }],
    });
    expect(await findReusableDossier(noFacts.client, TENANT, "x.com", NOW)).toEqual({ dossier: null });
  });

  it("erro de leitura (ex.: tabela inexistente) volta como error, sem lancar", async () => {
    const fake = createQueueSupabase({
      account_dossiers: [{ error: { message: 'relation "account_dossiers" does not exist' } }],
    });
    const result = await findReusableDossier(fake.client, TENANT, "x.com", NOW);
    expect(result.dossier).toBeNull();
    expect(result.error).toContain("does not exist");

    const throwing = createQueueSupabase({ account_dossiers: [new Error("boom")] });
    expect(await findReusableDossier(throwing.client, TENANT, "x.com", NOW)).toEqual({ dossier: null, error: "boom" });
  });
});

describe("saveDossier", () => {
  const params = {
    tenantId: TENANT,
    executionId: "exec-1",
    domain: "bancox.com.br",
    companyName: "Banco X",
    status: "complete" as const,
    failedSources: [],
    costUsd: 0.0151234567,
    facts: [FACT],
    researchedAt: NOW,
    reuseDays: 30,
  };

  it("grava o dossie (expira em 30 dias) e os fatos", async () => {
    const fake = createQueueSupabase({
      account_dossiers: [{ data: { id: "d-1" } }],
      account_dossier_facts: [{ data: null }],
    });
    const result = await saveDossier(fake.client, params);

    expect(result).toEqual({ dossierId: "d-1" });
    const dossierInsert = fake.callsTo("account_dossiers")[0].chain.insert.mock.calls[0][0];
    expect(dossierInsert).toMatchObject({
      tenant_id: TENANT,
      company_domain: "bancox.com.br",
      company_name: "Banco X",
      status: "complete",
      failed_sources: [],
      execution_id: "exec-1",
      cost_usd: 0.015123,
      researched_at: NOW.toISOString(),
      expires_at: "2026-12-03T12:00:00.000Z",
    });
    const factInsert = fake.callsTo("account_dossier_facts")[0].chain.insert.mock.calls[0][0];
    expect(factInsert).toEqual([
      {
        dossier_id: "d-1",
        tenant_id: TENANT,
        kind: "news",
        fato: FACT.fato,
        fonte_url: FACT.fonte_url,
        data: "2026-10-01",
        confianca: "alta",
        lead_apollo_id: null,
        lead_email: null,
      },
    ]);
  });

  it("insert do dossie falha: dossierId null + error, sem lancar", async () => {
    const fake = createQueueSupabase({ account_dossiers: [{ error: { message: "permission denied" } }] });
    expect(await saveDossier(fake.client, params)).toEqual({ dossierId: null, error: "permission denied" });
    expect(fake.callsTo("account_dossier_facts")).toHaveLength(0);
  });

  it("insert dos fatos falha: devolve o id e o erro", async () => {
    const fake = createQueueSupabase({
      account_dossiers: [{ data: { id: "d-1" } }],
      account_dossier_facts: [{ error: { message: "check violation" } }],
    });
    expect(await saveDossier(fake.client, params)).toEqual({ dossierId: "d-1", error: "check violation" });
  });

  it("dossie vazio nao chama insert de fatos", async () => {
    const fake = createQueueSupabase({ account_dossiers: [{ data: { id: "d-2" } }] });
    await saveDossier(fake.client, { ...params, facts: [], status: "empty" });
    expect(fake.callsTo("account_dossier_facts")).toHaveLength(0);
  });
});

describe("insertFacts", () => {
  it("nada a gravar: nenhuma chamada", async () => {
    const fake = createQueueSupabase();
    expect(await insertFacts(fake.client, TENANT, "d-1", [])).toEqual({});
    expect(fake.from).not.toHaveBeenCalled();
  });
});

describe("linkLeads", () => {
  it("resolve lead_id por apollo_id ou e-mail do tenant e grava os identificadores", async () => {
    const fake = createQueueSupabase({
      leads: [
        { data: [{ id: "lead-a", apollo_id: "ap-1" }] },
        { data: [{ id: "lead-b", email: "Maria@BancoX.com.br" }] },
      ],
      account_dossier_leads: [{ data: null }],
    });
    const result = await linkLeads(fake.client, {
      tenantId: TENANT,
      executionId: "exec-1",
      dossierId: "d-1",
      leads: [
        { apolloId: "ap-1", email: "joao@bancox.com.br" },
        { apolloId: null, email: "maria@bancox.com.br" },
        { apolloId: "ap-9", email: null },
        { apolloId: null, email: null },
      ],
    });

    expect(result).toEqual({ linked: 3 });
    const leadsChains = fake.callsTo("leads").map((c) => c.chain);
    expect(leadsChains[0].eq).toHaveBeenCalledWith("tenant_id", TENANT);
    expect(leadsChains[0].in).toHaveBeenCalledWith("apollo_id", ["ap-1", "ap-9"]);
    expect(leadsChains[1].in).toHaveBeenCalledWith("email", ["joao@bancox.com.br", "maria@bancox.com.br"]);
    const rows = fake.callsTo("account_dossier_leads")[0].chain.insert.mock.calls[0][0];
    expect(rows).toEqual([
      { dossier_id: "d-1", tenant_id: TENANT, execution_id: "exec-1", lead_id: "lead-a", lead_apollo_id: "ap-1", lead_email: "joao@bancox.com.br" },
      { dossier_id: "d-1", tenant_id: TENANT, execution_id: "exec-1", lead_id: "lead-b", lead_apollo_id: null, lead_email: "maria@bancox.com.br" },
      { dossier_id: "d-1", tenant_id: TENANT, execution_id: "exec-1", lead_id: null, lead_apollo_id: "ap-9", lead_email: null },
    ]);
  });

  it("e-mail com caixa mista: o IN leva o valor original e o minusculo", async () => {
    const fake = createQueueSupabase({
      leads: [{ data: [{ id: "lead-c", email: "Joao@BancoX.com.br" }] }],
      account_dossier_leads: [{ data: null }],
    });
    await linkLeads(fake.client, {
      tenantId: TENANT,
      executionId: null,
      dossierId: "d-1",
      leads: [{ apolloId: null, email: "Joao@BancoX.com.br" }],
    });
    expect(fake.callsTo("leads")[0].chain.in).toHaveBeenCalledWith("email", ["joao@bancox.com.br", "Joao@BancoX.com.br"]);
    const rows = fake.callsTo("account_dossier_leads")[0].chain.insert.mock.calls[0][0];
    expect(rows[0]).toMatchObject({ lead_id: "lead-c", lead_email: "joao@bancox.com.br" });
  });

  it("falha na leitura de leads nao impede o link; falha no insert volta como error", async () => {
    const fake = createQueueSupabase({
      leads: [{ error: { message: "rls" } }],
      account_dossier_leads: [{ error: { message: "relation does not exist" } }],
    });
    const result = await linkLeads(fake.client, {
      tenantId: TENANT,
      executionId: null,
      dossierId: "d-1",
      leads: [{ apolloId: "ap-1", email: null }],
    });
    expect(result).toEqual({ linked: 0, error: "relation does not exist" });
  });

  it("sem nenhum identificador: nada gravado", async () => {
    const fake = createQueueSupabase();
    expect(
      await linkLeads(fake.client, { tenantId: TENANT, executionId: null, dossierId: "d-1", leads: [{ apolloId: null, email: null }] })
    ).toEqual({ linked: 0 });
    expect(fake.from).not.toHaveBeenCalled();
  });
});

describe("findPostLeadIdentifiers", () => {
  it("le os identificadores dos posts ja gravados no dossie", async () => {
    const fake = createQueueSupabase({
      account_dossier_facts: [{ data: [{ lead_apollo_id: "ap-1", lead_email: "Rui@Y.com" }, { lead_apollo_id: null, lead_email: null }] }],
    });
    const result = await findPostLeadIdentifiers(fake.client, TENANT, "d-1");
    expect([...result.apolloIds]).toEqual(["ap-1"]);
    expect([...result.emails]).toEqual(["rui@y.com"]);
    expect(fake.callsTo("account_dossier_facts")[0].chain.eq).toHaveBeenCalledWith("kind", "post");
  });

  it("erro de leitura volta como error", async () => {
    const fake = createQueueSupabase({ account_dossier_facts: [{ error: { message: "rls" } }] });
    expect((await findPostLeadIdentifiers(fake.client, TENANT, "d-1")).error).toBe("rls");
  });
});

// Story 24.20: fatos de um dossie reaproveitado, para o gatilho.
describe("readDossierFacts", () => {
  it("le os fatos do dossie (tenant + dossie) no formato DossierFact, descartando linhas invalidas", async () => {
    const fake = createQueueSupabase({
      account_dossier_facts: [
        {
          data: [
            { kind: "news", fato: "Banco X anuncia novo CISO", fonte_url: "https://valor.com.br/a", data: "2026-10-01", confianca: "alta", lead_apollo_id: null, lead_email: null },
            { kind: "post", fato: "Meu post", fonte_url: "https://linkedin.com/p/1", data: "2026-10-02T00:00:00Z", confianca: "alta", lead_apollo_id: "ap-1", lead_email: "Ana@X.com" },
            { kind: "news", fato: null, fonte_url: "https://x.com", data: "2026-10-01", confianca: "alta" },
          ],
        },
      ],
    });
    const result = await readDossierFacts(fake.client, TENANT, "d-1");

    expect(result.error).toBeUndefined();
    expect(result.facts).toEqual([
      { ...FACT, fonte_url: "https://valor.com.br/a", lead_apollo_id: null, lead_email: null },
      { kind: "post", fato: "Meu post", fonte_url: "https://linkedin.com/p/1", data: "2026-10-02", confianca: "alta", lead_apollo_id: "ap-1", lead_email: "Ana@X.com" },
    ]);
    const chain = fake.callsTo("account_dossier_facts")[0].chain;
    expect(chain.select).toHaveBeenCalledWith("kind, fato, fonte_url, data, confianca, lead_apollo_id, lead_email");
    expect(chain.eq).toHaveBeenCalledWith("dossier_id", "d-1");
    expect(chain.eq).toHaveBeenCalledWith("tenant_id", TENANT);
    // Somente leitura.
    expect(chain.insert).not.toHaveBeenCalled();
    expect(chain.update).not.toHaveBeenCalled();
    expect(chain.delete).not.toHaveBeenCalled();
  });

  it("erro de leitura volta como error, sem lancar", async () => {
    const fake = createQueueSupabase({ account_dossier_facts: [{ error: { message: "rls" } }] });
    expect(await readDossierFacts(fake.client, TENANT, "d-1")).toEqual({ facts: [], error: "rls" });
  });

  it("excecao do client volta como error, sem lancar", async () => {
    const client = { from: () => { throw new Error("fetch failed"); } } as never;
    expect(await readDossierFacts(client, TENANT, "d-1")).toEqual({ facts: [], error: "fetch failed" });
  });
});
