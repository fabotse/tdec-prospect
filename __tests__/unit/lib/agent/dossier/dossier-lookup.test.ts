/**
 * Unit Tests — dossier-lookup (somente leitura)
 * Story 24.22 - AC 1-4 · D3
 */

import { describe, it, expect } from "vitest";
import { lookupAccountDossier } from "@/lib/agent/dossier/dossier-lookup";
import { createQueueSupabase } from "../../../../helpers/queue-supabase";

const TENANT = "tenant-1";
const EXEC = "11111111-1111-1111-1111-111111111111";
const OLD_EXEC = "22222222-2222-2222-2222-222222222222";
const LEAD_ID = "33333333-3333-3333-3333-333333333333";
const NOW = new Date("2026-11-05T12:00:00Z");

const TENANT_TABLES = new Set([
  "agent_executions",
  "account_dossiers",
  "account_dossier_facts",
  "account_dossier_leads",
  "leads",
]);

function dossierRow(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    company_domain: "acme.com",
    company_name: "Acme",
    status: "complete",
    failed_sources: [],
    researched_at: "2026-11-01T10:00:00Z",
    expires_at: "2026-12-01T10:00:00Z",
    ...extra,
  };
}

const factRow = {
  kind: "news",
  fato: "Acme abre escritório",
  fonte_url: "https://news.example.com/acme",
  data: "2026-10-20",
  confianca: "alta",
  lead_apollo_id: null,
  lead_email: null,
};

function whyNowOutput(entry: Record<string, unknown>) {
  return { output: { accounts: [], whyNow: { leads: [entry] } } };
}

const triggerEntry = {
  leadIndex: 0,
  apolloId: "ap-1",
  email: "ana@acme.com",
  companyDomain: "acme.com",
  dossierId: "dossier-exec",
  status: "trigger",
  trigger: {
    gatilho: "Noticia: Acme abre escritório",
    hipoteseDor: "Como vão contratar?",
    confianca: "alta",
    fatoOrigem: { ref: 0, ...factRow, confianca: "alta" },
  },
};

type Fake = ReturnType<typeof createQueueSupabase>;

/** Toda query a tabela com tenant_id leva `.eq("tenant_id", TENANT)`; nada de escrita/or/filter. */
function assertReadOnlyAndTenantScoped(fake: Fake) {
  expect(fake.calls.length).toBeGreaterThan(0);
  for (const { table, chain } of fake.calls) {
    for (const forbidden of ["or", "filter", "insert", "update", "delete", "upsert"] as const) {
      expect(chain[forbidden], `${table}.${forbidden}`).not.toHaveBeenCalled();
    }
    if (TENANT_TABLES.has(table)) {
      expect(chain.eq, `${table} sem tenant_id`).toHaveBeenCalledWith("tenant_id", TENANT);
    }
  }
}

describe("lookupAccountDossier", () => {
  it("D3.1: execução do tenant + whyNow com dossierId -> found com gatilho", async () => {
    const fake = createQueueSupabase({
      agent_executions: [{ data: { id: EXEC, tenant_id: TENANT } }],
      agent_steps: [{ data: [whyNowOutput(triggerEntry)] }],
      account_dossiers: [{ data: dossierRow("dossier-exec") }],
      account_dossier_facts: [{ data: [factRow] }],
    });

    const result = await lookupAccountDossier(
      fake.client,
      TENANT,
      { executionId: EXEC, apolloId: "ap-1", email: "ana@acme.com" },
      NOW
    );

    if (!("view" in result) || result.view.status !== "found") throw new Error("esperado found");
    expect(result.view.dossier.id).toBe("dossier-exec");
    expect(result.view.whyNow?.status).toBe("trigger");
    expect(result.view.facts[0].isTriggerSource).toBe(true);
    // research_accounts mais recente da execucao
    const steps = fake.callsTo("agent_steps")[0].chain;
    expect(steps.eq).toHaveBeenCalledWith("execution_id", EXEC);
    expect(steps.eq).toHaveBeenCalledWith("step_type", "research_accounts");
    expect(steps.order).toHaveBeenCalledWith("step_number", { ascending: false });
    expect(steps.limit).toHaveBeenCalledWith(1);
    // nenhuma ligacao lida: a execucao resolveu
    expect(fake.callsTo("account_dossier_leads")).toHaveLength(0);
    assertReadOnlyAndTenantScoped(fake);
  });

  it("execução de outro tenant: ignorada, nada lido depois, executionNotFound", async () => {
    const fake = createQueueSupabase({
      agent_executions: [{ data: null }],
    });
    const result = await lookupAccountDossier(fake.client, TENANT, { executionId: EXEC, apolloId: "ap-1" }, NOW);
    expect(result).toEqual({ view: { status: "none" }, executionNotFound: true });
    expect(fake.callsTo("agent_steps")).toHaveLength(0);
    expect(fake.callsTo("account_dossier_leads")).toHaveLength(0);
    assertReadOnlyAndTenantScoped(fake);
  });

  it("execução que volta com tenant diferente também é ignorada", async () => {
    const fake = createQueueSupabase({
      agent_executions: [{ data: { id: EXEC, tenant_id: "tenant-2" } }],
    });
    const result = await lookupAccountDossier(fake.client, TENANT, { executionId: EXEC, apolloId: "ap-1" }, NOW);
    expect("view" in result && result.executionNotFound).toBe(true);
    expect(fake.callsTo("agent_steps")).toHaveLength(0);
  });

  it("D3.2 por lead_id + apollo_id lido de leads + e-mail minúsculo; a ligação mais recente vence", async () => {
    const fake = createQueueSupabase({
      leads: [{ data: { apollo_id: "ap-77" } }],
      account_dossier_leads: [
        { data: [{ dossier_id: "dossier-old", execution_id: null, created_at: "2026-09-01T00:00:00Z" }] },
        { data: [{ dossier_id: "dossier-new", execution_id: OLD_EXEC, created_at: "2026-10-15T00:00:00Z" }] },
        { data: [{ dossier_id: "dossier-mid", execution_id: null, created_at: "2026-10-01T00:00:00Z" }] },
      ],
      account_dossiers: [{ data: dossierRow("dossier-new") }],
      agent_executions: [{ data: { id: OLD_EXEC, tenant_id: TENANT } }],
      agent_steps: [
        whyNowOutput({
          leadIndex: 0,
          apolloId: "ap-77",
          email: null,
          companyDomain: "acme.com",
          dossierId: "dossier-new",
          status: "no_trigger",
          reason: "llm_declined",
        }),
      ].map((d) => ({ data: [d] })),
      account_dossier_facts: [{ data: [factRow] }],
    });

    const result = await lookupAccountDossier(
      fake.client,
      TENANT,
      { leadId: LEAD_ID, email: "  Ana@ACME.com " },
      NOW
    );

    if (!("view" in result) || result.view.status !== "found") throw new Error("esperado found");
    expect(result.view.dossier.id).toBe("dossier-new");
    expect(result.view.whyNow).toMatchObject({ status: "no_trigger", reason: "llm_declined" });

    const leadsQuery = fake.callsTo("leads")[0].chain;
    expect(leadsQuery.eq).toHaveBeenCalledWith("id", LEAD_ID);
    const links = fake.callsTo("account_dossier_leads").map((c) => c.chain);
    expect(links).toHaveLength(3);
    expect(links[0].eq).toHaveBeenCalledWith("lead_id", LEAD_ID);
    expect(links[1].eq).toHaveBeenCalledWith("lead_apollo_id", "ap-77");
    expect(links[2].eq).toHaveBeenCalledWith("lead_email", "ana@acme.com");
    for (const link of links) {
      expect(link.order).toHaveBeenCalledWith("created_at", { ascending: false });
      expect(link.limit).toHaveBeenCalledWith(1);
    }
    assertReadOnlyAndTenantScoped(fake);
  });

  it("D3.2: whyNow de outro dossiê não é usado (gatilho não avaliado)", async () => {
    const fake = createQueueSupabase({
      account_dossier_leads: [
        { data: [{ dossier_id: "dossier-a", execution_id: OLD_EXEC, created_at: "2026-10-15T00:00:00Z" }] },
      ],
      account_dossiers: [{ data: dossierRow("dossier-a") }],
      agent_executions: [{ data: { id: OLD_EXEC, tenant_id: TENANT } }],
      agent_steps: [{ data: [whyNowOutput({ ...triggerEntry, dossierId: "dossier-b" })] }],
      account_dossier_facts: [{ data: [] }],
    });
    const result = await lookupAccountDossier(fake.client, TENANT, { apolloId: "ap-1" }, NOW);
    if (!("view" in result) || result.view.status !== "found") throw new Error("esperado found");
    expect(result.view.whyNow).toBeNull();
  });

  it("D3.1 sem dossierId cai para a ligação gravada (D3.2)", async () => {
    const fake = createQueueSupabase({
      agent_executions: [
        { data: { id: EXEC, tenant_id: TENANT } },
        { data: { id: OLD_EXEC, tenant_id: TENANT } },
      ],
      agent_steps: [
        { data: [whyNowOutput({ ...triggerEntry, dossierId: null, status: "no_trigger", reason: "not_researched", trigger: undefined })] },
        { data: [{ output: { accounts: [] } }] }, // output antigo, sem whyNow
      ],
      account_dossier_leads: [
        { data: [{ dossier_id: "dossier-old", execution_id: OLD_EXEC, created_at: "2026-10-01T00:00:00Z" }] },
      ],
      account_dossiers: [{ data: dossierRow("dossier-old") }],
      account_dossier_facts: [{ data: [factRow] }],
    });
    const result = await lookupAccountDossier(fake.client, TENANT, { executionId: EXEC, apolloId: "ap-1" }, NOW);
    if (!("view" in result) || result.view.status !== "found") throw new Error("esperado found");
    expect(result.view.dossier.id).toBe("dossier-old");
    expect(result.view.whyNow).toBeNull();
    assertReadOnlyAndTenantScoped(fake);
  });

  it("dossiê apontado mas inexistente/de outro tenant -> próxima ligação; nada sobrou -> none", async () => {
    const fake = createQueueSupabase({
      account_dossier_leads: [
        { data: [{ dossier_id: "dossier-x", execution_id: null, created_at: "2026-10-01T00:00:00Z" }] },
      ],
      account_dossiers: [{ data: null }],
    });
    const result = await lookupAccountDossier(fake.client, TENANT, { apolloId: "ap-1" }, NOW);
    expect(result).toEqual({ view: { status: "none" } });
    expect(fake.callsTo("account_dossier_facts")).toHaveLength(0);
  });

  it("D3.3: nada encontrado -> none", async () => {
    const fake = createQueueSupabase({});
    const result = await lookupAccountDossier(fake.client, TENANT, { email: "ana@acme.com" }, NOW);
    expect(result).toEqual({ view: { status: "none" } });
    assertReadOnlyAndTenantScoped(fake);
  });

  it("erro do readDossierFacts -> error (sem dossiê vazio falso)", async () => {
    const fake = createQueueSupabase({
      account_dossier_leads: [
        { data: [{ dossier_id: "dossier-a", execution_id: null, created_at: "2026-10-01T00:00:00Z" }] },
      ],
      account_dossiers: [{ data: dossierRow("dossier-a") }],
      account_dossier_facts: [{ error: { message: "relation does not exist" } }],
    });
    const result = await lookupAccountDossier(fake.client, TENANT, { apolloId: "ap-1" }, NOW);
    expect(result).toEqual({ error: "relation does not exist" });
  });

  it("erro de banco em qualquer leitura -> error; nunca lança", async () => {
    const fake = createQueueSupabase({
      account_dossier_leads: [new Error("connection reset")],
    });
    const result = await lookupAccountDossier(fake.client, TENANT, { apolloId: "ap-1" }, NOW);
    expect(result).toEqual({ error: "connection reset" });
  });

  it("erro ao ler leads.apollo_id não derruba a busca", async () => {
    const fake = createQueueSupabase({
      leads: [new Error("boom")],
    });
    const result = await lookupAccountDossier(fake.client, TENANT, { leadId: LEAD_ID }, NOW);
    expect(result).toEqual({ view: { status: "none" } });
    expect(fake.callsTo("account_dossier_leads")).toHaveLength(1);
  });
});
