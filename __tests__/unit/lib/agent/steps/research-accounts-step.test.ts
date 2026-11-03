/**
 * ResearchAccountsStep — Story 24.19 (Dossie da conta)
 *
 * Cobre a matriz de I/O da spec: feliz, reuso, sem chave, fonte falha, teto de custo,
 * teto de tempo, banco, sem dominio e importados — mais idempotency key estavel, log
 * `treg` por chamada e o fail-open (o step SEMPRE termina `completed`).
 *
 * Nenhuma rede real: Treg e Apify injetados; chaves, log, classificador e KB mockados;
 * Supabase fake.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash } from "node:crypto";
import { createChainBuilder, type ChainBuilder } from "../../../../helpers/mock-supabase";
import type { SearchLeadResult, StepInput, ResearchAccountsOutput } from "@/types/agent";
import type { TregCallOptions, TregCallResult } from "@/lib/services/treg";

// ==============================================
// MOCKS
// ==============================================

const { mockConfig } = vi.hoisted(() => ({
  mockConfig: {
    reuseDays: 30,
    windowDays: 90,
    maxCostUsdPerExecution: 0.5,
    maxCostUsdPerCall: 0.01,
    apifyUsdPerProfile: 0.03,
    maxNewsPerAccount: 5,
    maxJobsPerAccount: 5,
    maxTechPerAccount: 10,
    maxPostsPerLead: 10,
    accountConcurrency: 3,
    timeBudgetMs: 180_000,
    hardDeadlineMs: 270_000,
    minCallMs: 5_000,
    callTimeoutMs: 60_000,
    siteSummaryMaxChars: 500,
  },
}));
vi.mock("@/lib/agent/dossier/config", () => ({ DOSSIER_CONFIG: mockConfig }));

const mockReadServiceApiKey = vi.fn();
const mockGetServiceApiKeyOrNull = vi.fn();
vi.mock("@/lib/agent/service-keys", () => ({
  readServiceApiKey: (...args: unknown[]) => mockReadServiceApiKey(...args),
  getServiceApiKeyOrNull: (...args: unknown[]) => mockGetServiceApiKeyOrNull(...args),
}));

const mockLogAgentUsage = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/agent/agent-usage", () => ({
  logAgentUsage: (...args: unknown[]) => mockLogAgentUsage(...args),
}));

const mockClassify = vi.fn();
vi.mock("@/lib/utils/relevance-classifier", () => ({
  classifyPostRelevance: (...args: unknown[]) => mockClassify(...args),
}));

const mockLoadKBContext = vi.fn();
vi.mock("@/lib/utils/monitoring-processor", () => ({
  loadKBContext: (...args: unknown[]) => mockLoadKBContext(...args),
}));

// Import depois dos mocks.
import { ResearchAccountsStep, buildIdempotencyKey } from "@/lib/agent/steps/research-accounts-step";

// ==============================================
// FAKES
// ==============================================

const TENANT = "tenant-1";
const EXEC = "exec-1";
const NOW_MS = Date.parse("2026-11-03T12:00:00.000Z");

const SITE_TEXT =
  "Somos uma instituicao financeira com atuacao nacional, oferecendo credito, investimentos e seguros para pessoas e empresas. ".repeat(3);

interface TregCall {
  apiKey: string;
  endpoint: string;
  body: Record<string, unknown>;
  options: TregCallOptions;
}

type TregHandler = (endpoint: string, body: Record<string, unknown>) => TregCallResult | Promise<TregCallResult>;

function ok(json: unknown, costMicro = 1000): TregCallResult {
  return { ok: true, status: 200, json, costMicro, durationMs: 5 };
}

/** Respostas padrao do Treg: site, noticia e vaga que citam a empresa da consulta. */
function defaultTreg(endpoint: string, body: Record<string, unknown>): TregCallResult {
  if (endpoint === "treg.web.search") {
    const q = String(body.q);
    if (q.startsWith("Banco X")) return ok({ output: { results: [{ url: "https://www.bancox.com.br/", title: "Banco X" }] } }, 150);
    if (q.startsWith("Empresa Y")) return ok({ output: { results: [{ url: "https://empresay.com/", title: "Empresa Y" }] } }, 150);
    return ok({ output: { results: [{ url: "https://www.facebook.com/x" }] } }, 150);
  }
  if (endpoint === "treg.web.extract") {
    return ok({ output: { pages: [{ title: "Home", markdown: SITE_TEXT }] } }, 300);
  }
  // exa.web.search
  const query = String(body.query);
  const name = query.includes("Banco X") ? "Banco X" : "Empresa Y";
  if (query.startsWith("noticias")) {
    return ok({ results: [{ url: `https://valor.com.br/${encodeURIComponent(name)}`, title: `${name} anuncia novo CISO`, publishedDate: "2026-10-01T00:00:00.000Z" }] }, 7000);
  }
  return ok({ results: [{ url: `https://gupy.io/${encodeURIComponent(name)}`, title: `Vaga Analista de Segurança - ${name}`, publishedDate: "2026-10-15T00:00:00.000Z" }] }, 7000);
}

function createTreg(handler: TregHandler = defaultTreg) {
  const calls: TregCall[] = [];
  const call = vi.fn(async (apiKey: string, endpoint: string, body: Record<string, unknown>, options: TregCallOptions) => {
    calls.push({ apiKey, endpoint, body, options });
    return handler(endpoint, body);
  });
  return { service: { call } as never, call, calls };
}

interface DbOptions {
  /** Dossie reaproveitavel por dominio (id + numero de fatos). */
  reusable?: Record<string, { id: string; facts: number }>;
  dossierInsertError?: boolean;
  dossierSelectError?: boolean;
  searchCompaniesRow?: { output: unknown; completed_at: string } | null;
  /** Posts ja gravados por dossie (identificadores do lead). */
  existingPosts?: Record<string, Array<{ lead_apollo_id: string | null; lead_email: string | null }>>;
  postsReadError?: boolean;
  linkInsertError?: boolean;
}

interface Inserted {
  table: string;
  payload: unknown;
}

/** Supabase fake: a resposta e decidida no `await`, pelos metodos usados no chain. */
function createDb(options: DbOptions = {}) {
  const inserts: Inserted[] = [];
  const updates: Inserted[] = [];

  function eqValue(chain: ChainBuilder, column: string): unknown {
    const call = chain.eq.mock.calls.find((c: unknown[]) => c[0] === column);
    return call?.[1];
  }

  function respond(table: string, chain: ChainBuilder): { data: unknown; error: unknown } {
    const insertCall = chain.insert.mock.calls[0];
    const updateCall = chain.update.mock.calls[0];
    if (insertCall) inserts.push({ table, payload: insertCall[0] });
    if (updateCall) updates.push({ table, payload: updateCall[0] });

    switch (table) {
      case "agent_steps":
        if (updateCall) return { data: null, error: null };
        return { data: options.searchCompaniesRow ? [options.searchCompaniesRow] : [], error: null };
      case "account_dossiers": {
        if (insertCall) {
          if (options.dossierInsertError) return { data: null, error: { message: "relation does not exist" } };
          const domain = (insertCall[0] as { company_domain: string }).company_domain;
          return { data: { id: `dossier-${domain}` }, error: null };
        }
        if (options.dossierSelectError) return { data: null, error: { message: "relation does not exist" } };
        const domain = eqValue(chain, "company_domain") as string;
        const reuse = options.reusable?.[domain];
        return { data: reuse ? [{ id: reuse.id, company_name: null }] : [], error: null };
      }
      case "account_dossier_facts": {
        if (insertCall) return { data: null, error: null };
        const dossierId = eqValue(chain, "dossier_id");
        if (eqValue(chain, "kind") === "post") {
          if (options.postsReadError) return { data: null, error: { message: "rls" } };
          return { data: options.existingPosts?.[dossierId as string] ?? [], error: null };
        }
        const reuse = Object.values(options.reusable ?? {}).find((r) => r.id === dossierId);
        return { data: Array.from({ length: reuse?.facts ?? 0 }, (_, i) => ({ id: `f${i}` })), error: null };
      }
      case "account_dossier_leads":
        if (insertCall && options.linkInsertError) return { data: null, error: { message: "relation does not exist" } };
        return { data: null, error: null };
      default:
        return { data: [], error: null };
    }
  }

  const from = vi.fn((table: string) => {
    const chain = createChainBuilder();
    chain.then = (resolve, reject) =>
      Promise.resolve()
        .then(() => respond(table, chain))
        .then(resolve, reject);
    return chain;
  });

  return {
    client: { from } as never,
    from,
    inserts,
    updates,
    insertsTo: (table: string) => inserts.filter((i) => i.table === table).map((i) => i.payload),
  };
}

function lead(overrides: Partial<SearchLeadResult>): SearchLeadResult {
  return {
    name: "Lead",
    title: "CISO",
    companyName: null,
    email: null,
    linkedinUrl: null,
    apolloId: null,
    ...overrides,
  };
}

const THREE_LEADS: SearchLeadResult[] = [
  lead({ name: "Joao", companyName: "Banco X", email: "joao@bancox.com.br", apolloId: "ap-1" }),
  lead({ name: "Ana", companyName: "Banco X S.A.", email: "ana@bancox.com.br", apolloId: "ap-2" }),
  lead({ name: "Rui", companyName: "Empresa Y", email: "rui@empresay.com", apolloId: "ap-3" }),
];

function createInput(overrides: Partial<StepInput["briefing"]> = {}, leads: SearchLeadResult[] = THREE_LEADS): StepInput {
  return {
    executionId: EXEC,
    mode: "guided",
    briefing: {
      technology: null,
      jobTitles: ["CISO"],
      location: null,
      companySize: null,
      industry: null,
      productSlug: null,
      mode: "guided",
      skipSteps: [],
      ...overrides,
    },
    previousStepOutput: { leads, totalFound: leads.length },
  };
}

function createStep(db: ReturnType<typeof createDb>, treg = createTreg(), extra: { apify?: unknown; clock?: () => number } = {}) {
  return new ResearchAccountsStep(3, db.client, TENANT, {
    treg: treg.service,
    apify: (extra.apify ?? { fetchLinkedInPosts: vi.fn() }) as never,
    clock: extra.clock ?? (() => NOW_MS),
  });
}

function outputOf(result: { data: Record<string, unknown> }): ResearchAccountsOutput {
  return result.data as unknown as ResearchAccountsOutput;
}

function checkpoint(db: ReturnType<typeof createDb>) {
  return db.updates.find((u) => u.table === "agent_steps" && (u.payload as { status?: string }).status === "completed")
    ?.payload as { status: string; output: unknown; cost: Record<string, number> } | undefined;
}

function messages(db: ReturnType<typeof createDb>): string[] {
  return db.insertsTo("agent_messages").map((m) => (m as { content: string }).content);
}

// ==============================================
// TESTS
// ==============================================

beforeEach(() => {
  vi.clearAllMocks();
  mockConfig.maxCostUsdPerExecution = 0.5;
  mockConfig.accountConcurrency = 3;
  mockReadServiceApiKey.mockResolvedValue({ status: "ok", apiKey: "treg-key" });
  mockGetServiceApiKeyOrNull.mockResolvedValue(null);
  mockLoadKBContext.mockResolvedValue(null);
  mockClassify.mockResolvedValue({ isRelevant: true, reasoning: "", promptTokens: 0, completionTokens: 0 });
});

describe("ResearchAccountsStep — contrato", () => {
  it("nao exige aprovacao posterior (informativo, sem gate)", () => {
    expect(createStep(createDb()).requiresPostApproval()).toBe(false);
  });

  it("le a chave do Treg por tenant via readServiceApiKey (nunca env)", async () => {
    const db = createDb();
    await createStep(db).run(createInput());
    expect(mockReadServiceApiKey).toHaveBeenCalledWith(TENANT, "treg");
  });
});

describe("ResearchAccountsStep — feliz", () => {
  it("3 leads em 2 empresas: 2 dossies complete, leads ligados, fatos com fonte, custo e resumo", async () => {
    const db = createDb();
    const treg = createTreg();
    const result = await createStep(db, treg).run(createInput());
    const output = outputOf(result);

    expect(result.success).toBe(true);
    expect(output.accounts).toHaveLength(2);
    const bancoX = output.accounts.find((a) => a.domain === "bancox.com.br")!;
    const empresaY = output.accounts.find((a) => a.domain === "empresay.com")!;
    expect(bancoX).toMatchObject({ status: "complete", reused: false, factsCount: 3, failedSources: [], leadCount: 2, dossierId: "dossier-bancox.com.br" });
    expect(empresaY).toMatchObject({ status: "complete", factsCount: 3, leadCount: 1, dossierId: "dossier-empresay.com" });
    expect(output.flags).toEqual({});
    expect(output.summary).toMatchObject({ accounts: 2, researched: 2, reused: 0, skipped: 0, facts: 6, leadsLinked: 3 });

    // Fatos gravados: todos com fonte http(s), data e confianca.
    const facts = db.insertsTo("account_dossier_facts").flat() as Array<Record<string, string>>;
    expect(facts).toHaveLength(6);
    for (const fact of facts) {
      expect(fact.fonte_url).toMatch(/^https?:\/\//);
      expect(fact.data).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(["baixa", "media", "alta"]).toContain(fact.confianca);
      expect(fact.tenant_id).toBe(TENANT);
    }
    expect(facts.map((f) => f.kind).sort()).toEqual(["job", "job", "news", "news", "site", "site"]);

    // Leads ligados ao dossie da conta.
    const links = db.insertsTo("account_dossier_leads").flat() as Array<Record<string, string>>;
    expect(links).toHaveLength(3);
    expect(links.filter((l) => l.dossier_id === "dossier-bancox.com.br").map((l) => l.lead_apollo_id).sort()).toEqual(["ap-1", "ap-2"]);
    expect(links.every((l) => l.execution_id === EXEC)).toBe(true);

    // 2 buscas de site + 3 chamadas por conta = 8; custo = soma dos X-Treg-Cost-Micro.
    expect(treg.call).toHaveBeenCalledTimes(8);
    const expectedUsd = (2 * 150 + 2 * 300 + 4 * 7000) / 1_000_000;
    expect(result.cost).toEqual({ treg_usd: expectedUsd, treg_calls: 8, apify: 0, openai_relevance: 0 });
    expect(output.costUsd).toBeCloseTo(expectedUsd, 6);

    // Dossie grava o custo da conta (busca de site + 3 fontes).
    const dossiers = db.insertsTo("account_dossiers") as Array<Record<string, unknown>>;
    expect(dossiers.find((d) => d.company_domain === "bancox.com.br")).toMatchObject({
      tenant_id: TENANT,
      status: "complete",
      execution_id: EXEC,
      failed_sources: [],
      cost_usd: (300 + 7000 * 2) / 1_000_000,
    });

    // Termina completed (sem gate) com o output, e resume no chat.
    expect(checkpoint(db)).toMatchObject({ status: "completed" });
    expect(messages(db).some((m) => m.startsWith("Pesquisa das contas concluida: 2 de 2 contas com dossie, 6 fatos com fonte."))).toBe(true);
    expect(messages(db).some((m) => m.startsWith("Pesquisando 2 contas"))).toBe(true);
  });

  it("output nunca carrega leads (o create_campaign nao le o research)", async () => {
    const result = await createStep(createDb()).run(createInput());
    expect(result.data).not.toHaveProperty("leads");
    expect(result.data).not.toHaveProperty("approvedLeads");
  });

  it("usa so os endpoints autorizados, com teto, meta e timeout por chamada", async () => {
    const treg = createTreg();
    await createStep(createDb(), treg).run(createInput());
    for (const call of treg.calls) {
      expect(["treg.web.search", "treg.web.extract", "exa.web.search"]).toContain(call.endpoint);
      expect(call.apiKey).toBe("treg-key");
      expect(call.options.maxCostUsd).toBe(0.01);
      expect(call.options.timeoutMs).toBe(60_000);
      expect(call.options.meta).toBe(`feature=dossie-24-19,tenant=${TENANT},execution=${EXEC}`);
    }
    const exa = treg.calls.filter((c) => c.endpoint === "exa.web.search");
    expect(exa.every((c) => c.body.userLocation === "BR" && c.body.startPublishedDate === "2026-08-05T00:00:00.000Z")).toBe(true);
    expect(treg.calls.find((c) => c.endpoint === "treg.web.extract")?.body).toEqual({ url: expect.stringMatching(/^https:\/\//) });
  });

  it("Idempotency-Key estavel: sha256 de executionId|endpoint|JSON(body), igual entre tentativas", async () => {
    const first = createTreg();
    await createStep(createDb(), first).run(createInput());
    const second = createTreg();
    await createStep(createDb(), second).run(createInput());

    for (const call of first.calls) {
      const expected = createHash("sha256").update(`${EXEC}|${call.endpoint}|${JSON.stringify(call.body)}`).digest("hex");
      expect(call.options.idempotencyKey).toBe(expected);
      expect(buildIdempotencyKey(EXEC, call.endpoint, call.body)).toBe(expected);
    }
    const keys = (calls: TregCall[]) => calls.map((c) => c.options.idempotencyKey).sort();
    expect(keys(second.calls)).toEqual(keys(first.calls));
  });

  it("uma linha `treg` em api_usage_logs por chamada, com costUsd/costMicro", async () => {
    const treg = createTreg();
    await createStep(createDb(), treg).run(createInput());
    const tregLogs = mockLogAgentUsage.mock.calls.map((c) => c[0]).filter((p) => p.serviceName === "treg");
    expect(tregLogs).toHaveLength(treg.call.mock.calls.length);
    for (const log of tregLogs) {
      expect(log).toMatchObject({ tenantId: TENANT, executionId: EXEC, stepType: "research_accounts", status: "success", calls: 1 });
      expect(["treg.web.search", "treg.web.extract", "exa.web.search"]).toContain(log.requestType);
      expect(log.metadata.costUsd).toBeCloseTo(log.metadata.costMicro / 1_000_000, 9);
    }
  });

  it("tecnologias do search_companies entram como fato com fonte TheirStack", async () => {
    const db = createDb({
      searchCompaniesRow: {
        completed_at: "2026-11-01T10:00:00.000Z",
        output: {
          companies: [
            {
              name: "Banco X",
              domain: "bancox.com.br",
              technologies_found: [
                { technology: { name: "AWS", slug: "aws" }, confidence: "high" },
                { technology: { name: "Moda", slug: "moda" }, confidence: "low" },
              ],
            },
          ],
        },
      },
    });
    const treg = createTreg();
    const result = await createStep(db, treg).run(createInput());

    const tech = (db.insertsTo("account_dossier_facts").flat() as Array<Record<string, string>>).filter((f) => f.kind === "technology");
    expect(tech).toEqual([
      expect.objectContaining({ fato: "AWS", fonte_url: "https://api.theirstack.com/v1/companies/search", data: "2026-11-01", confianca: "alta" }),
    ]);
    // Dominio do search_companies: sem busca de site para o Banco X.
    expect(treg.calls.filter((c) => c.endpoint === "treg.web.search").map((c) => c.body.q)).toEqual(["Empresa Y site oficial"]);
    expect(outputOf(result).accounts.find((a) => a.domain === "bancox.com.br")?.factsCount).toBe(4);
  });

  it("targetAccounts (ABM) da o dominio sem busca de site", async () => {
    const treg = createTreg();
    await createStep(createDb(), treg).run(
      createInput({ targetAccounts: [{ name: "Banco X", domain: "bancox.com.br", confidence: "high" }, { name: "Empresa Y", domain: "empresay.com", confidence: "high" }] })
    );
    expect(treg.calls.filter((c) => c.endpoint === "treg.web.search")).toHaveLength(0);
  });
});

describe("ResearchAccountsStep — reuso", () => {
  it("dossie complete nao expirado: sem Treg para a conta, leads ligados, reused true", async () => {
    const db = createDb({ reusable: { "bancox.com.br": { id: "old-dossier", facts: 4 } } });
    const treg = createTreg();
    const result = await createStep(db, treg).run(
      createInput({ targetAccounts: [{ name: "Banco X", domain: "bancox.com.br", confidence: "high" }] })
    );
    const bancoX = outputOf(result).accounts.find((a) => a.domain === "bancox.com.br")!;

    expect(bancoX).toMatchObject({ dossierId: "old-dossier", reused: true, status: "complete", factsCount: 4 });
    const bancoCalls = treg.calls.filter((c) => JSON.stringify(c.body).includes("bancox") || JSON.stringify(c.body).includes("Banco X"));
    expect(bancoCalls).toHaveLength(0);
    const links = db.insertsTo("account_dossier_leads").flat() as Array<Record<string, string>>;
    expect(links.filter((l) => l.dossier_id === "old-dossier")).toHaveLength(2);
    expect((db.insertsTo("account_dossiers") as Array<Record<string, string>>).map((d) => d.company_domain)).toEqual(["empresay.com"]);
    expect(outputOf(result).summary.reused).toBe(1);
  });
});

describe("ResearchAccountsStep — sem chave", () => {
  it.each(["missing", "decrypt_error"] as const)("%s: completed, sem chamadas, flag e 'pesquisa pulada'", async (status) => {
    mockReadServiceApiKey.mockResolvedValue({ status });
    const db = createDb();
    const treg = createTreg();
    const result = await createStep(db, treg).run(createInput());
    const output = outputOf(result);

    expect(result.success).toBe(true);
    expect(treg.call).not.toHaveBeenCalled();
    expect(output.flags.tregUnavailable).toBe(status);
    expect(output.accounts.every((a) => a.status === "skipped" && a.skippedReason === "treg_unavailable")).toBe(true);
    expect(db.insertsTo("account_dossiers")).toHaveLength(0);
    expect(messages(db).some((m) => m.startsWith("Pesquisa das contas pulada"))).toBe(true);
    expect(checkpoint(db)).toMatchObject({ status: "completed" });
    expect(result.cost).toEqual({ treg_usd: 0, treg_calls: 0, apify: 0, openai_relevance: 0 });
  });
});

describe("ResearchAccountsStep — fonte falha", () => {
  it.each([
    [{ ok: false, status: 503, json: null, costMicro: 0, durationMs: 1, error: "HTTP 503" }, "http"],
    [{ ok: false, status: 0, json: null, costMicro: 0, durationMs: 1, error: "timeout (60000 ms)" }, "timeout"],
    [{ ok: false, status: 402, json: null, costMicro: 0, durationMs: 1, error: "HTTP 402" }, "http"],
  ] as const)("noticias %#: dossie partial, failedSources ['news'], demais fatos salvos", async (failure, reason) => {
    const treg = createTreg((endpoint, body) =>
      endpoint === "exa.web.search" && String(body.query).startsWith("noticias") ? { ...failure } : defaultTreg(endpoint, body)
    );
    const db = createDb();
    const result = await createStep(db, treg).run(createInput());
    const bancoX = outputOf(result).accounts.find((a) => a.domain === "bancox.com.br")!;

    expect(result.success).toBe(true);
    expect(bancoX).toMatchObject({ status: "partial", failedSources: ["news"], failureReasons: { news: reason }, factsCount: 2 });
    expect((db.insertsTo("account_dossiers") as Array<Record<string, unknown>>)[0]).toMatchObject({ status: "partial", failed_sources: ["news"] });
    const failedLogs = mockLogAgentUsage.mock.calls.map((c) => c[0]).filter((p) => p.serviceName === "treg" && p.status === "failed");
    expect(failedLogs).toHaveLength(2);
    expect(checkpoint(db)).toMatchObject({ status: "completed" });
  });

  it("excecao inesperada do Treg vira falha da fonte, sem lancar", async () => {
    const treg = createTreg((endpoint, body) => {
      if (endpoint === "treg.web.extract") throw new Error("boom");
      return defaultTreg(endpoint, body);
    });
    const result = await createStep(createDb(), treg).run(createInput());
    expect(outputOf(result).accounts[0]).toMatchObject({ status: "partial", failedSources: ["site"], failureReasons: { site: "error" } });
  });
});

describe("ResearchAccountsStep — teto de custo", () => {
  it("fontes alem do teto nao sao chamadas; budgetExhausted; conta sem espaco no teto fica skipped", async () => {
    mockConfig.maxCostUsdPerExecution = 0.025;
    mockConfig.accountConcurrency = 1;
    // Cada chamada custa o teto (US$ 0,01): depois da 1a conta sobra so US$ 0,005.
    const treg = createTreg((endpoint, body) => ({ ...defaultTreg(endpoint, body), costMicro: 10_000 }));
    const db = createDb();
    const result = await createStep(db, treg).run(
      createInput({ targetAccounts: [{ name: "Banco X", domain: "bancox.com.br", confidence: "high" }, { name: "Empresa Y", domain: "empresay.com", confidence: "high" }] })
    );
    const output = outputOf(result);

    expect(result.success).toBe(true);
    expect(output.flags.budgetExhausted).toBe(true);
    // Reservas de US$ 0,01: site e noticias cabem em 0,025; vagas nao.
    expect(treg.call).toHaveBeenCalledTimes(2);
    expect(output.accounts[0]).toMatchObject({ domain: "bancox.com.br", status: "partial", failedSources: ["jobs"], failureReasons: { jobs: "budget" } });
    expect(output.accounts[1]).toMatchObject({ domain: "empresay.com", status: "skipped", skippedReason: "budget", dossierId: null });
    expect(output.costUsd).toBeLessThanOrEqual(0.025);
    expect(checkpoint(db)).toMatchObject({ status: "completed" });
    expect(messages(db).some((m) => m.includes("teto de custo"))).toBe(true);
  });

  it("recusa por reservas em voo nao condena as contas seguintes quando o teto e liberado", async () => {
    mockConfig.maxCostUsdPerExecution = 0.025;
    mockConfig.accountConcurrency = 1;
    // Custo real 0: as reservas sao liberadas no settle.
    const treg = createTreg((endpoint, body) => ({ ...defaultTreg(endpoint, body), costMicro: 0 }));
    const result = await createStep(createDb(), treg).run(
      createInput({ targetAccounts: [{ name: "Banco X", domain: "bancox.com.br", confidence: "high" }, { name: "Empresa Y", domain: "empresay.com", confidence: "high" }] })
    );
    const output = outputOf(result);

    // Em cada conta, a 3a reserva simultanea (vagas) e recusada: 0,02 em voo + 0,01 > 0,025.
    expect(output.flags.budgetExhausted).toBe(true);
    expect(output.accounts[0]).toMatchObject({ domain: "bancox.com.br", status: "partial", failureReasons: { jobs: "budget" } });
    expect(output.accounts[1]).toMatchObject({ domain: "empresay.com", status: "partial", failureReasons: { jobs: "budget" } });
    expect(output.accounts[1].dossierId).toBe("dossier-empresay.com");
    expect(treg.call).toHaveBeenCalledTimes(4);
  });
});

describe("ResearchAccountsStep — teto de tempo", () => {
  it("passou de 180 s: nao inicia contas novas; restantes skipped; timeBudgetExhausted", async () => {
    mockConfig.accountConcurrency = 1;
    const clock = vi.fn()
      .mockReturnValueOnce(NOW_MS) // inicio do step
      .mockReturnValueOnce(NOW_MS + 1_000) // 1a conta: dentro do tempo
      .mockReturnValue(NOW_MS + 181_000); // dai em diante: estourou
    const treg = createTreg();
    const result = await createStep(createDb(), treg, { clock }).run(
      createInput({ targetAccounts: [{ name: "Banco X", domain: "bancox.com.br", confidence: "high" }, { name: "Empresa Y", domain: "empresay.com", confidence: "high" }] })
    );
    const output = outputOf(result);

    expect(output.flags.timeBudgetExhausted).toBe(true);
    expect(output.accounts[0]).toMatchObject({ domain: "bancox.com.br", status: "complete" });
    expect(output.accounts[1]).toMatchObject({ domain: "empresay.com", status: "skipped", skippedReason: "time_budget" });
    expect(treg.calls.every((c) => !JSON.stringify(c.body).includes("Empresa Y"))).toBe(true);
  });
});

describe("ResearchAccountsStep — banco", () => {
  it("insert do dossie falha: completed, persistFailed, dossierId null", async () => {
    const db = createDb({ dossierInsertError: true });
    const result = await createStep(db).run(createInput());
    const output = outputOf(result);

    expect(result.success).toBe(true);
    expect(output.flags.persistFailed).toBe(true);
    expect(output.accounts.every((a) => a.dossierId === null)).toBe(true);
    expect(db.insertsTo("account_dossier_leads")).toHaveLength(0);
    expect(checkpoint(db)).toMatchObject({ status: "completed" });
  });

  it("leitura de dossies falha (migration nao aplicada): nao gasta com a conta, persistFailed", async () => {
    const treg = createTreg();
    const db = createDb({ dossierSelectError: true });
    const result = await createStep(db, treg).run(
      createInput({ targetAccounts: [{ name: "Banco X", domain: "bancox.com.br", confidence: "high" }, { name: "Empresa Y", domain: "empresay.com", confidence: "high" }] })
    );
    expect(outputOf(result).flags.persistFailed).toBe(true);
    expect(treg.call).not.toHaveBeenCalled();
    expect(checkpoint(db)).toMatchObject({ status: "completed" });
  });
});

describe("ResearchAccountsStep — sem dominio", () => {
  it("empresa sem dominio e busca sem resultado aproveitavel: skipped no_domain", async () => {
    const treg = createTreg();
    const result = await createStep(createDb(), treg).run(
      createInput({}, [lead({ companyName: "Fulano Consultoria", email: "fulano@gmail.com", apolloId: "ap-9" })])
    );
    const output = outputOf(result);

    expect(output.accounts).toEqual([
      expect.objectContaining({ companyName: "Fulano Consultoria", domain: null, status: "skipped", skippedReason: "no_domain" }),
    ]);
    expect(treg.calls.map((c) => c.endpoint)).toEqual(["treg.web.search"]);
  });

  it("sem lead nenhum: completed sem chamadas", async () => {
    const treg = createTreg();
    const db = createDb();
    const result = await createStep(db, treg).run({ ...createInput(), previousStepOutput: undefined });
    expect(outputOf(result).accounts).toEqual([]);
    expect(treg.call).not.toHaveBeenCalled();
    expect(checkpoint(db)).toMatchObject({ status: "completed" });
  });
});

describe("ResearchAccountsStep — importados", () => {
  it("skipSteps com as duas buscas: le briefing.importedLeads (regra do create_campaign)", async () => {
    const treg = createTreg();
    const imported = [lead({ companyName: "Empresa Y", email: "rui@empresay.com", apolloId: "ap-3" })];
    const result = await createStep(createDb(), treg).run({
      executionId: EXEC,
      mode: "guided",
      briefing: { ...createInput().briefing, skipSteps: ["search_companies", "search_leads"], importedLeads: imported },
      previousStepOutput: undefined,
    });
    expect(outputOf(result).accounts).toEqual([expect.objectContaining({ domain: "empresay.com", status: "complete", leadCount: 1 })]);
  });
});

describe("ResearchAccountsStep — posts (toggle de LinkedIn)", () => {
  const POSTS = [
    { postUrl: "https://www.linkedin.com/feed/update/1", text: "Zero trust e SOC no nosso time de seguranca", publishedAt: "2026-10-20T00:00:00Z", likesCount: 1, commentsCount: 0 },
    { postUrl: "https://www.linkedin.com/feed/update/2", text: "Foto do churrasco da firma com a equipe", publishedAt: "2026-10-21T00:00:00Z", likesCount: 1, commentsCount: 0 },
    { postUrl: "https://www.linkedin.com/feed/update/3", text: "Post de 2024 muito antigo mesmo", publishedAt: "2024-01-01T00:00:00Z", likesCount: 1, commentsCount: 0 },
  ];

  it("so com premiumIcebreakers + chave Apify + linkedinUrl; mantem os relevantes", async () => {
    mockGetServiceApiKeyOrNull.mockImplementation(async (_t: string, service: string) => (service === "apify" ? "apify-key" : "openai-key"));
    mockLoadKBContext.mockResolvedValue({ companyName: "TDec", companyContext: "seguranca", productsServices: "", competitiveAdvantages: "", icpSummary: "" });
    mockClassify.mockImplementation(async (text: string) => ({ isRelevant: text.includes("SOC"), reasoning: "", promptTokens: 10, completionTokens: 5 }));
    const apify = { fetchLinkedInPosts: vi.fn().mockResolvedValue({ success: true, posts: POSTS, profileUrl: "x", fetchedAt: "x" }) };
    const db = createDb();
    const leads = [lead({ companyName: "Empresa Y", email: "rui@empresay.com", apolloId: "ap-3", linkedinUrl: "https://www.linkedin.com/in/rui" })];

    const result = await createStep(db, createTreg(), { apify }).run(createInput({ premiumIcebreakers: true }, leads));

    expect(apify.fetchLinkedInPosts).toHaveBeenCalledWith("apify-key", "https://www.linkedin.com/in/rui", 10);
    expect(mockClassify).toHaveBeenCalledTimes(2); // o post antigo nem e classificado
    const posts = (db.insertsTo("account_dossier_facts").flat() as Array<Record<string, string>>).filter((f) => f.kind === "post");
    expect(posts).toEqual([
      expect.objectContaining({ fonte_url: "https://www.linkedin.com/feed/update/1", lead_apollo_id: "ap-3", lead_email: "rui@empresay.com", confianca: "alta", data: "2026-10-20" }),
    ]);
    expect(result.cost).toMatchObject({ apify: 1, openai_relevance: 2 });
    const apifyLog = mockLogAgentUsage.mock.calls.map((c) => c[0]).find((p) => p.serviceName === "apify");
    expect(apifyLog).toMatchObject({ requestType: "linkedin_posts_dossier", status: "success", postsFetched: 3 });
  });

  it("teto de tempo durante os posts: nao inicia outro perfil no Apify", async () => {
    mockGetServiceApiKeyOrNull.mockImplementation(async (_t: string, service: string) => (service === "apify" ? "apify-key" : null));
    let now = NOW_MS;
    const apify = {
      fetchLinkedInPosts: vi.fn(async () => {
        now += 200_000; // o 1o perfil estoura o tempo
        return { success: true, posts: [], profileUrl: "x", fetchedAt: "x" };
      }),
    };
    const leads = [
      lead({ companyName: "Empresa Y", email: "rui@empresay.com", linkedinUrl: "https://www.linkedin.com/in/rui" }),
      lead({ companyName: "Empresa Y", email: "ana@empresay.com", linkedinUrl: "https://www.linkedin.com/in/ana" }),
    ];
    const result = await createStep(createDb(), createTreg(), { apify, clock: () => now }).run(
      createInput({ premiumIcebreakers: true, targetAccounts: [{ name: "Empresa Y", domain: "empresay.com", confidence: "high" }] }, leads)
    );
    expect(apify.fetchLinkedInPosts).toHaveBeenCalledTimes(1);
    expect(outputOf(result).flags.timeBudgetExhausted).toBe(true);
    expect(outputOf(result).accounts[0]).toMatchObject({ failedSources: ["posts"], failureReasons: { posts: "timeout" } });
  });

  it("toggle desligado: Apify nunca e chamado", async () => {
    mockGetServiceApiKeyOrNull.mockResolvedValue("apify-key");
    const apify = { fetchLinkedInPosts: vi.fn() };
    const leads = [lead({ companyName: "Empresa Y", email: "rui@empresay.com", linkedinUrl: "https://www.linkedin.com/in/rui" })];
    await createStep(createDb(), createTreg(), { apify }).run(createInput({ premiumIcebreakers: false }, leads));
    expect(apify.fetchLinkedInPosts).not.toHaveBeenCalled();
  });

  it("dossie reaproveitado: leads ganham posts proprios no dossie existente", async () => {
    mockGetServiceApiKeyOrNull.mockImplementation(async (_t: string, service: string) => (service === "apify" ? "apify-key" : null));
    const apify = { fetchLinkedInPosts: vi.fn().mockResolvedValue({ success: true, posts: POSTS.slice(0, 1), profileUrl: "x", fetchedAt: "x" }) };
    const db = createDb({ reusable: { "empresay.com": { id: "old-y", facts: 2 } } });
    const leads = [lead({ companyName: "Empresa Y", email: "rui@empresay.com", apolloId: "ap-3", linkedinUrl: "https://www.linkedin.com/in/rui" })];

    const result = await createStep(db, createTreg(), { apify }).run(
      createInput({ premiumIcebreakers: true, targetAccounts: [{ name: "Empresa Y", domain: "empresay.com", confidence: "high" }] }, leads)
    );
    expect(outputOf(result).accounts[0]).toMatchObject({ dossierId: "old-y", reused: true, factsCount: 3 });
    expect(db.insertsTo("account_dossier_facts").flat()).toEqual([expect.objectContaining({ dossier_id: "old-y", kind: "post" })]);
  });

  it("Apify falha: failedSources ['posts'], resto do dossie salvo", async () => {
    mockGetServiceApiKeyOrNull.mockImplementation(async (_t: string, service: string) => (service === "apify" ? "apify-key" : null));
    const apify = { fetchLinkedInPosts: vi.fn().mockResolvedValue({ success: false, posts: [], error: "Actor falhou", profileUrl: "x", fetchedAt: "x" }) };
    const leads = [lead({ companyName: "Empresa Y", email: "rui@empresay.com", linkedinUrl: "https://www.linkedin.com/in/rui" })];
    const result = await createStep(createDb(), createTreg(), { apify }).run(createInput({ premiumIcebreakers: true }, leads));
    expect(outputOf(result).accounts[0]).toMatchObject({ status: "partial", failedSources: ["posts"], factsCount: 3 });
  });
});

describe("ResearchAccountsStep — excecao inesperada", () => {
  it("nunca lanca: completed com flags.unexpectedError", async () => {
    mockReadServiceApiKey.mockRejectedValue(new Error("explodiu"));
    const db = createDb();
    const result = await createStep(db).run(createInput());
    expect(result.success).toBe(true);
    expect(outputOf(result).flags.unexpectedError).toBe(true);
    expect(checkpoint(db)).toMatchObject({ status: "completed" });
    expect(messages(db).some((m) => m.includes("A campanha segue normalmente"))).toBe(true);
  });
});

describe("ResearchAccountsStep — correcoes do review", () => {
  const TWO_TARGETS = { targetAccounts: [{ name: "Banco X", domain: "bancox.com.br", confidence: "high" as const }, { name: "Empresa Y", domain: "empresay.com", confidence: "high" as const }] };

  it("reuso vem antes do teto de tempo: dossie gratis e ligado mesmo com o tempo esgotado", async () => {
    const clock = vi.fn().mockReturnValueOnce(NOW_MS).mockReturnValue(NOW_MS + 200_000);
    const db = createDb({ reusable: { "bancox.com.br": { id: "old-x", facts: 2 } } });
    const treg = createTreg();
    const result = await createStep(db, treg, { clock }).run(createInput(TWO_TARGETS));
    const output = outputOf(result);

    expect(output.accounts[0]).toMatchObject({ domain: "bancox.com.br", reused: true, dossierId: "old-x" });
    expect(output.accounts[1]).toMatchObject({ domain: "empresay.com", status: "skipped", skippedReason: "time_budget" });
    expect(treg.call).not.toHaveBeenCalled();
  });

  it.each([[{}], [null], [{ output: {} }]])("200 sem o formato esperado (%j) e falha da fonte, nao dossie complete", async (body) => {
    const treg = createTreg((endpoint, req) =>
      endpoint === "exa.web.search" && String(req.query).startsWith("noticias") ? ok(body) : defaultTreg(endpoint, req)
    );
    const db = createDb();
    const result = await createStep(db, treg).run(createInput(TWO_TARGETS));
    expect(outputOf(result).accounts[0]).toMatchObject({ status: "partial", failedSources: ["news"], failureReasons: { news: "error" } });
    expect((db.insertsTo("account_dossiers") as Array<Record<string, unknown>>)[0]).toMatchObject({ status: "partial" });
  });

  it("extract 200 sem output.pages tambem e falha (site)", async () => {
    const treg = createTreg((endpoint, req) => (endpoint === "treg.web.extract" ? ok({ output: {} }) : defaultTreg(endpoint, req)));
    const result = await createStep(createDb(), treg).run(createInput(TWO_TARGETS));
    expect(outputOf(result).accounts[0]).toMatchObject({ failedSources: ["site"], failureReasons: { site: "error" } });
  });

  it("prazo duro: timeout de cada chamada recortado ao tempo restante; < 5 s nem chama", async () => {
    mockConfig.accountConcurrency = 1;
    let now = NOW_MS;
    const timeouts: Array<number | undefined> = [];
    const treg = createTreg((endpoint, body) => {
      if (endpoint === "treg.web.extract") now = NOW_MS + 175_000; // site: tempo passa
      else if (String(body.query).startsWith("noticias")) now = NOW_MS + 267_000; // restam 3 s
      return defaultTreg(endpoint, body);
    });
    const result = await createStep(createDb(), treg, { clock: () => now }).run(
      createInput({ targetAccounts: [TWO_TARGETS.targetAccounts[0]] }, THREE_LEADS.slice(0, 2))
    );
    for (const call of treg.calls) timeouts.push(call.options.timeoutMs);

    // site: 60 s (cabe); noticias: 270 - 175 = 95 s -> 60 s; vagas: 3 s restantes -> nao chama
    expect(treg.calls.map((c) => c.endpoint)).toEqual(["treg.web.extract", "exa.web.search"]);
    expect(timeouts).toEqual([60_000, 60_000]);
    expect(outputOf(result).accounts[0]).toMatchObject({ failureReasons: { jobs: "timeout" } });
    expect(outputOf(result).flags.timeBudgetExhausted).toBe(true);
  });

  it("prazo duro: timeout recortado quando restam menos de 60 s", async () => {
    let now = NOW_MS + 170_000; // dentro dos 180 s ao iniciar a conta
    const clock = vi.fn(() => now);
    clock.mockReturnValueOnce(NOW_MS); // inicio do step
    const treg = createTreg((endpoint, body) => {
      now = NOW_MS + 240_000; // depois da 1a chamada restam 30 s
      return defaultTreg(endpoint, body);
    });
    await createStep(createDb(), treg, { clock }).run(
      createInput({ targetAccounts: [TWO_TARGETS.targetAccounts[0]] }, THREE_LEADS.slice(0, 2))
    );
    expect(treg.calls.map((c) => c.options.timeoutMs)).toEqual([60_000, 30_000, 30_000]);
  });

  it("dois nomes no mesmo dominio viram um dossie: uma pesquisa, leadCount somado, todos ligados", async () => {
    const treg = createTreg((endpoint, body) => {
      if (endpoint === "treg.web.search") return ok({ output: { results: [{ url: "https://www.bancox.com.br/" }] } }, 150);
      return defaultTreg(endpoint, body);
    });
    const db = createDb();
    const leads = [
      lead({ companyName: "Banco X", email: "joao@bancox.com.br", apolloId: "ap-1" }),
      lead({ companyName: "BX Holding", email: "ana@bancox.com.br", apolloId: "ap-2" }),
      lead({ companyName: "BX Holding", email: "rui@bancox.com.br", apolloId: "ap-3" }),
    ];
    const result = await createStep(db, treg).run(createInput({}, leads));
    const output = outputOf(result);

    expect(output.accounts).toHaveLength(1);
    expect(output.accounts[0]).toMatchObject({ domain: "bancox.com.br", leadCount: 3, status: "complete" });
    expect(db.insertsTo("account_dossiers")).toHaveLength(1);
    expect(treg.calls.filter((c) => c.endpoint !== "treg.web.search")).toHaveLength(3);
    expect((db.insertsTo("account_dossier_leads").flat() as Array<Record<string, string>>).map((l) => l.lead_apollo_id).sort()).toEqual(["ap-1", "ap-2", "ap-3"]);
    expect(output.summary.leadsLinked).toBe(3);
  });

  it("leadsLinked conta so o que foi gravado", async () => {
    const result = await createStep(createDb({ linkInsertError: true })).run(createInput(TWO_TARGETS));
    expect(outputOf(result).summary.leadsLinked).toBe(0);
    expect(outputOf(result).flags.persistFailed).toBe(true);

    const noIds = await createStep(createDb()).run(
      createInput({ targetAccounts: [TWO_TARGETS.targetAccounts[1]] }, [lead({ companyName: "Empresa Y" })])
    );
    expect(outputOf(noIds).summary.leadsLinked).toBe(0);
  });

  describe("posts", () => {
    const OWN = { postUrl: "https://www.linkedin.com/feed/update/1", text: "Zero trust e SOC no nosso time", publishedAt: "2026-10-20T00:00:00Z", likesCount: 1, commentsCount: 0, authorName: "Rui Silva" };
    const REPOST = { postUrl: "https://www.linkedin.com/feed/update/9", text: "Post de outra pessoa sobre SOC", publishedAt: "2026-10-20T00:00:00Z", likesCount: 1, commentsCount: 0, authorName: "Ana Souza" };
    const RUI = lead({ name: "Rui Silva", companyName: "Empresa Y", email: "rui@empresay.com", apolloId: "ap-3", linkedinUrl: "https://www.linkedin.com/in/rui" });
    const ANA = lead({ name: "Ana Lima", companyName: "Empresa Y", email: "ana@empresay.com", apolloId: "ap-4", linkedinUrl: "https://www.linkedin.com/in/ana" });
    const Y = { targetAccounts: [TWO_TARGETS.targetAccounts[1]] };

    beforeEach(() => {
      mockGetServiceApiKeyOrNull.mockImplementation(async (_t: string, service: string) => (service === "apify" ? "apify-key" : null));
    });

    it("descarta repost/post de terceiro (authorName diferente do lead)", async () => {
      const apify = { fetchLinkedInPosts: vi.fn().mockResolvedValue({ success: true, posts: [OWN, REPOST], profileUrl: "x", fetchedAt: "x" }) };
      const db = createDb();
      await createStep(db, createTreg(), { apify }).run(createInput({ premiumIcebreakers: true, ...Y }, [RUI]));
      const posts = (db.insertsTo("account_dossier_facts").flat() as Array<Record<string, string>>).filter((f) => f.kind === "post");
      expect(posts.map((p) => p.fonte_url)).toEqual([OWN.postUrl]);
    });

    it("reuso: lead que ja tem post no dossie nao vai ao Apify de novo", async () => {
      const apify = { fetchLinkedInPosts: vi.fn().mockResolvedValue({ success: true, posts: [], profileUrl: "x", fetchedAt: "x" }) };
      const db = createDb({
        reusable: { "empresay.com": { id: "old-y", facts: 3 } },
        existingPosts: { "old-y": [{ lead_apollo_id: "ap-3", lead_email: null }] },
      });
      await createStep(db, createTreg(), { apify }).run(createInput({ premiumIcebreakers: true, ...Y }, [RUI, ANA]));
      expect(apify.fetchLinkedInPosts).toHaveBeenCalledTimes(1);
      expect(apify.fetchLinkedInPosts).toHaveBeenCalledWith("apify-key", ANA.linkedinUrl, 10);
    });

    it("reuso: erro ao ler os posts existentes pula os posts do dossie", async () => {
      const apify = { fetchLinkedInPosts: vi.fn() };
      const db = createDb({ reusable: { "empresay.com": { id: "old-y", facts: 3 } }, postsReadError: true });
      const result = await createStep(db, createTreg(), { apify }).run(createInput({ premiumIcebreakers: true, ...Y }, [RUI]));
      expect(apify.fetchLinkedInPosts).not.toHaveBeenCalled();
      expect(outputOf(result).accounts[0]).toMatchObject({ reused: true, status: "complete" });
    });

    it("reuso com falha nos posts e reportado como partial", async () => {
      const apify = { fetchLinkedInPosts: vi.fn().mockResolvedValue({ success: false, posts: [], error: "x", profileUrl: "x", fetchedAt: "x" }) };
      const db = createDb({ reusable: { "empresay.com": { id: "old-y", facts: 3 } } });
      const result = await createStep(db, createTreg(), { apify }).run(createInput({ premiumIcebreakers: true, ...Y }, [RUI]));
      expect(outputOf(result).accounts[0]).toMatchObject({ reused: true, status: "partial", failedSources: ["posts"] });
    });

    it("Apify tem teto proprio: perfis de uma conta nao consomem o teto do Treg da seguinte", async () => {
      mockConfig.maxCostUsdPerExecution = 0.05;
      mockConfig.accountConcurrency = 1;
      const apify = { fetchLinkedInPosts: vi.fn().mockResolvedValue({ success: true, posts: [], profileUrl: "x", fetchedAt: "x" }) };
      const leads = [
        ...Array.from({ length: 4 }, (_, i) =>
          lead({ name: `Lead ${i}`, companyName: "Empresa Y", email: `l${i}@empresay.com`, linkedinUrl: `https://www.linkedin.com/in/l${i}` })
        ),
        lead({ name: "Joao", companyName: "Banco X", email: "joao@bancox.com.br", apolloId: "ap-1" }),
      ];
      const treg = createTreg();
      const result = await createStep(createDb(), treg, { apify }).run(
        createInput({ premiumIcebreakers: true, targetAccounts: [TWO_TARGETS.targetAccounts[1], TWO_TARGETS.targetAccounts[0]] }, leads)
      );
      const output = outputOf(result);
      // Apify: 1 perfil cabe em 0,05; o 2o e recusado no teto DELE.
      expect(apify.fetchLinkedInPosts).toHaveBeenCalledTimes(1);
      expect(output.accounts[0]).toMatchObject({ domain: "empresay.com", failureReasons: { posts: "budget" } });
      // Banco X (depois): site, noticias e vagas no teto do Treg, intacto.
      expect(output.accounts[1]).toMatchObject({ domain: "bancox.com.br", status: "complete", failedSources: [] });
      expect(treg.call).toHaveBeenCalledTimes(6);
    });
  });
});
