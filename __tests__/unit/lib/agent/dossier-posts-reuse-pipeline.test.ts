/**
 * FEL-57 — dossie + create_campaign com o toggle de LinkedIn: UMA chamada ao Apify por lead.
 *
 * ResearchAccountsStep REAL seguido do CreateCampaignStep REAL, sobre o MESMO Supabase em
 * memoria (o checkpoint do research e o que o create_campaign le). Apify, Treg, IA, chaves
 * e logs de uso sao fakes: nenhuma rede real.
 *
 * Prova:
 * - (c) com dossie + create_campaign, o Apify e chamado uma unica vez por lead;
 * - (d) `cost.apify` e os logs de uso (`api_usage_logs`) so registram a chamada que
 *   aconteceu (a do dossie), nunca uma segunda que nao existiu;
 * - o texto do prompt premium e o mesmo que a busca do create_campaign teria produzido.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createChainBuilder } from "../../../helpers/mock-supabase";
import type { SearchLeadResult, StepInput } from "@/types/agent";
import type { TregCallResult } from "@/lib/services/treg";

// ==============================================
// MOCKS (nada sai do processo)
// ==============================================

const mockFetchLinkedInPosts = vi.fn();
vi.mock("@/lib/services/apify", () => ({
  ApifyService: class {
    fetchLinkedInPosts = (...args: unknown[]) => mockFetchLinkedInPosts(...args);
  },
}));

vi.mock("@/lib/agent/service-keys", () => ({
  readServiceApiKey: vi.fn(async () => ({ status: "ok", apiKey: "treg-key" })),
  getServiceApiKeyOrNull: vi.fn(async (_tenant: string, service: string) => (service === "apify" ? "apify-key" : null)),
  requireServiceApiKey: vi.fn(async () => "openai-key"),
  getInjectableServiceApiKey: vi.fn(async () => undefined),
}));

const mockLogApiUsage = vi.fn().mockResolvedValue(undefined);
const mockLogApifySuccess = vi.fn().mockResolvedValue(undefined);
const mockLogApifyFailure = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/services/usage-logger", () => ({
  logApiUsage: (...args: unknown[]) => mockLogApiUsage(...args),
  logApifySuccess: (...args: unknown[]) => mockLogApifySuccess(...args),
  logApifyFailure: (...args: unknown[]) => mockLogApifyFailure(...args),
}));

vi.mock("@/lib/utils/relevance-classifier", () => ({
  classifyPostRelevance: vi.fn(async () => ({ isRelevant: true, reasoning: "", promptTokens: 0, completionTokens: 0 })),
}));
vi.mock("@/lib/utils/monitoring-processor", () => ({ loadKBContext: vi.fn(async () => null) }));

vi.mock("@/lib/agent/dossier/repository", () => ({
  findReusableDossier: vi.fn(async () => ({ dossier: null })),
  saveDossier: vi.fn(async (_db: unknown, params: { domain: string }) => ({ dossierId: `dossier-${params.domain}` })),
  insertFacts: vi.fn(async () => ({})),
  findPostLeadIdentifiers: vi.fn(async () => ({ apolloIds: new Set(), emails: new Set() })),
  linkLeads: vi.fn(async (_db: unknown, params: { leads: unknown[] }) => ({ linked: params.leads.length })),
}));

const mockRenderPrompt = vi.fn();
const mockGenerateText = vi.fn();
vi.mock("@/lib/ai", () => ({
  promptManager: { renderPrompt: (...args: unknown[]) => mockRenderPrompt(...args) },
  createAIProvider: () => ({ generateText: (...args: unknown[]) => mockGenerateText(...args) }),
}));

vi.mock("@/lib/services/knowledge-base-context", () => ({ buildAIVariables: () => ({}) }));
vi.mock("@/lib/services/knowledge-base-proofs", () => ({ fetchKnowledgeBaseProofs: vi.fn(async () => []) }));
vi.mock("@/lib/ai/copy-reviewer", () => ({
  reviewEmailCopy: vi.fn(async (input: { subject: string; body: string }) => ({
    subject: input.subject,
    body: input.body,
    status: "not_reviewed",
    reasons: [],
    calls: 0,
    promptTokens: 0,
    completionTokens: 0,
    estimatedCost: 0,
  })),
  logCopyReview: vi.fn(async () => undefined),
}));
vi.mock("@/lib/services/apollo", () => ({ ApolloService: class { enrichPerson = vi.fn(); } }));
vi.mock("@/lib/agent/lead-persistence", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/agent/lead-persistence")>()),
  persistApprovedLeads: vi.fn(async () => ({
    segmentId: "s1", segmentName: "x", inserted: 2, reused: 0, associated: 2, skipped: 0, leadIds: ["l1", "l2"], degraded: false,
  })),
}));
vi.mock("@/lib/agent/campaign-persistence", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/agent/campaign-persistence")>()),
  persistAgentCampaign: vi.fn(async () => ({ campaignId: "c1", associated: 2, nameStale: false, associationDegraded: false, degraded: false })),
}));

import { ResearchAccountsStep } from "@/lib/agent/steps/research-accounts-step";
import { CreateCampaignStep } from "@/lib/agent/steps/create-campaign-step";

// ==============================================
// FAKE SUPABASE (agent_steps com memoria)
// ==============================================

const EXEC = "exec-fel57";

function createDb() {
  const steps = new Map<number, { step_type: string; status: string; output: unknown }>([
    [2, { step_type: "search_leads", status: "approved", output: null }],
    [3, { step_type: "research_accounts", status: "pending", output: null }],
    [4, { step_type: "create_campaign", status: "pending", output: null }],
  ]);

  const from = vi.fn((table: string) => {
    const chain = createChainBuilder({ data: null, error: null });
    chain.then = (resolve, reject) => {
      const eqs = Object.fromEntries(chain.eq.mock.calls as Array<[string, unknown]>);
      let value: { data: unknown; error: unknown } = { data: null, error: null };
      if (table === "agent_steps") {
        const update = chain.update.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
        if (update && eqs.execution_id === EXEC) {
          const row = steps.get(Number(eqs.step_number));
          if (row) Object.assign(row, update);
          // CAS do `running`: devolve a linha reivindicada.
          value = { data: [{ id: `step-${eqs.step_number}` }], error: null };
        } else if (!update) {
          const rows = [...steps.entries()]
            .filter(([n, r]) =>
              (eqs.execution_id === undefined || eqs.execution_id === EXEC) &&
              (eqs.step_type === undefined || r.step_type === eqs.step_type) &&
              (eqs.status === undefined || r.status === eqs.status) &&
              (eqs.step_number === undefined || n === eqs.step_number)
            )
            .map(([n, r]) => ({ id: `step-${n}`, ...r }));
          const single = chain.maybeSingle.mock.calls.length > 0 || chain.single.mock.calls.length > 0;
          value = { data: single ? rows[0] ?? null : rows, error: null };
        }
      }
      if (table === "icebreaker_examples") value = { data: [], error: null };
      return Promise.resolve(value).then(resolve, reject);
    };
    return chain;
  });

  return { client: { from } as never, steps };
}

// ==============================================
// FIXTURES
// ==============================================

const LEADS: SearchLeadResult[] = [
  { name: "Rui Souza", title: "CISO", companyName: "Empresa Y", email: "rui@empresay.com", linkedinUrl: "https://www.linkedin.com/in/rui", apolloId: "ap-1" },
  { name: "Ana Lima", title: "CTO", companyName: "Empresa Y", email: "ana@empresay.com", linkedinUrl: "https://www.linkedin.com/in/ana", apolloId: "ap-2" },
  { name: "Sem Link", title: "CIO", companyName: "Empresa Y", email: "sem@empresay.com", linkedinUrl: null, apolloId: "ap-3" },
];

/** Perfis cujo dataset tem um item VAZIO na posicao 1 (o ApifyService o descarta). */
const WITH_EMPTY_ITEM = new Set<string>();

/** Dataset BRUTO do actor por perfil (ordem do feed), cortado no `limitPerSource`. */
function datasetFor(url: string, limit: number) {
  const slug = url.split("/").pop();
  const items: Array<Record<string, unknown>> = Array.from({ length: 5 }, (_, i) => ({
    postUrl: `https://www.linkedin.com/feed/update/${slug}-${i + 1}`,
    text: `Post ${i + 1} de ${slug} sobre seguranca`,
    publishedAt: `2026-10-${String(25 - i).padStart(2, "0")}T12:00:00.000Z`,
    likesCount: 10 - i,
    commentsCount: i,
  }));
  if (WITH_EMPTY_ITEM.has(url)) items.splice(1, 0, { postUrl: "", text: "" });
  return items.slice(0, limit);
}

/** O que o `ApifyService.fetchLinkedInPosts` devolve: descarta vazios e informa a posicao. */
function serviceResult(url: string, limit: number) {
  const kept = datasetFor(url, limit)
    .map((item, rawIndex) => ({ item, rawIndex }))
    .filter(({ item }) => item.postUrl || item.text);
  return {
    posts: kept.map(({ item }) => item as never),
    rawIndexes: kept.map(({ rawIndex }) => rawIndex),
  };
}

/** Posts que a busca de HOJE do create_campaign (limite 3) traria. */
function postsFor(url: string, limit: number) {
  return serviceResult(url, limit).posts;
}

function input(): StepInput {
  return {
    executionId: EXEC,
    briefing: {
      technology: null,
      jobTitles: ["CISO"],
      location: null,
      companySize: null,
      industry: null,
      productSlug: null,
      mode: "guided",
      skipSteps: [],
      premiumIcebreakers: true,
      targetAccounts: [{ name: "Empresa Y", domain: "empresay.com", confidence: "high" }],
    },
    previousStepOutput: { leads: LEADS, totalFound: LEADS.length },
  } as StepInput;
}

function treg() {
  const ok = (json: unknown): TregCallResult => ({ ok: true, status: 200, json, costMicro: 1000, durationMs: 1 });
  return {
    call: vi.fn(async (_key: string, endpoint: string) =>
      endpoint === "treg.web.extract" ? ok({ output: { pages: [] } }) : ok({ results: [] })
    ),
  } as never;
}

function premiumPostsVars(): string[] {
  return mockRenderPrompt.mock.calls
    .filter((c: unknown[]) => c[0] === "icebreaker_premium_generation")
    .map((c: unknown[]) => (c[1] as Record<string, string>).linkedin_posts)
    .sort();
}

beforeEach(() => {
  vi.clearAllMocks();
  WITH_EMPTY_ITEM.clear();
  mockFetchLinkedInPosts.mockImplementation(async (_key: string, url: string, limit: number) => ({
    success: true,
    ...serviceResult(url, limit),
    profileUrl: url,
    fetchedAt: new Date().toISOString(),
  }));
  mockRenderPrompt.mockImplementation(async (name: string, vars: Record<string, string>) => ({
    content: name === "campaign_structure_generation" ? "STRUCTURE" : `${name}::${vars.lead_name ?? ""}`,
    modelPreference: "gpt-4o",
    metadata: {},
    source: "default",
  }));
  mockGenerateText.mockImplementation(async (prompt: string) => ({
    text:
      prompt === "STRUCTURE"
        ? JSON.stringify({ items: [{ position: 0, type: "email", context: "Primeiro contato", emailMode: "initial" }] })
        : `Gerado: ${prompt}`,
    model: "gpt-4o",
    usage: {},
  }));
});

describe("FEL-57 — research_accounts + create_campaign (toggle de LinkedIn)", () => {
  it("(c)(d) o Apify e chamado UMA vez por lead; custo e logs so da chamada que aconteceu", async () => {
    const db = createDb();

    const research = await new ResearchAccountsStep(3, db.client, "tenant-1", { treg: treg() }).run(input());
    expect(db.steps.get(3)?.status).toBe("completed");
    expect(research.cost?.apify).toBe(2); // Rui e Ana (o terceiro nao tem LinkedIn)

    const campaign = await new CreateCampaignStep(4, db.client, "tenant-1").run(input());

    // Uma unica chamada por lead com LinkedIn, toda no dossie (limite do dossie: 10).
    expect(mockFetchLinkedInPosts).toHaveBeenCalledTimes(2);
    const calledUrls = mockFetchLinkedInPosts.mock.calls.map((c) => c[1]).sort();
    expect(calledUrls).toEqual(["https://www.linkedin.com/in/ana", "https://www.linkedin.com/in/rui"]);
    expect(mockFetchLinkedInPosts.mock.calls.every((c) => c[2] === 10)).toBe(true);

    // (d) create_campaign nao conta nem loga Apify; o dossie loga as 2 chamadas reais.
    expect(campaign.cost?.apify).toBeUndefined();
    expect(mockLogApifySuccess).not.toHaveBeenCalled();
    expect(mockLogApifyFailure).not.toHaveBeenCalled();
    const apifyLogs = mockLogApiUsage.mock.calls.map((c) => c[0]).filter((p) => p.serviceName === "apify");
    expect(apifyLogs).toHaveLength(2);
    expect(apifyLogs.every((p) => p.requestType === "linkedin_posts_dossier")).toBe(true);

    // Os 2 leads com LinkedIn sairam premium, com o mesmo texto que a busca de hoje (limite 3) daria.
    const stats = (campaign.data as { icebreakerStats: { premium: number; standard: number } }).icebreakerStats;
    expect(stats).toMatchObject({ premium: 2, standard: 1 });
    expect(premiumPostsVars()).toEqual(
      ["https://www.linkedin.com/in/ana", "https://www.linkedin.com/in/rui"]
        .map((url) => CreateCampaignStep.formatLinkedInPostsForPrompt(postsFor(url, 3)))
        .sort()
    );
  });

  it("sem o dossie (step pulado), o create_campaign busca como hoje: 1 chamada por lead, limite 3", async () => {
    const db = createDb();
    db.steps.get(3)!.status = "skipped";

    const campaign = await new CreateCampaignStep(4, db.client, "tenant-1").run(input());

    expect(mockFetchLinkedInPosts).toHaveBeenCalledTimes(2);
    expect(mockFetchLinkedInPosts.mock.calls.every((c) => c[2] === 3)).toBe(true);
    expect(campaign.cost?.apify).toBe(2);
    expect(mockLogApifySuccess).toHaveBeenCalledTimes(2);
    expect(premiumPostsVars()).toEqual(
      ["https://www.linkedin.com/in/ana", "https://www.linkedin.com/in/rui"]
        .map((url) => CreateCampaignStep.formatLinkedInPostsForPrompt(postsFor(url, 3)))
        .sort()
    );
  });

  // FEL-77: antes, a falha no research fazia o create buscar o perfil de novo (2 chamadas).
  // Agora a tentativa fica registrada e o lead cai no icebreaker padrao (1 chamada por lead).
  it("dossie falhou para um lead: o create_campaign NAO busca de novo (icebreaker padrao)", async () => {
    mockFetchLinkedInPosts.mockImplementation(async (_key: string, url: string, limit: number) =>
      url.endsWith("/ana") && limit === 10
        ? { success: false, posts: [], error: "Actor falhou", profileUrl: url, fetchedAt: new Date().toISOString() }
        : { success: true, ...serviceResult(url, limit), profileUrl: url, fetchedAt: new Date().toISOString() }
    );
    const db = createDb();
    await new ResearchAccountsStep(3, db.client, "tenant-1", { treg: treg() }).run(input());
    const campaign = await new CreateCampaignStep(4, db.client, "tenant-1").run(input());

    const calls = mockFetchLinkedInPosts.mock.calls.map((c) => `${c[1]}|${c[2]}`).sort();
    expect(calls).toEqual([
      "https://www.linkedin.com/in/ana|10",
      "https://www.linkedin.com/in/rui|10",
    ]);
    expect(campaign.cost?.apify).toBeUndefined();
    expect(mockLogApifySuccess).not.toHaveBeenCalled();
    const stats = (campaign.data as { icebreakerStats: { premium: number; standard: number } }).icebreakerStats;
    expect(stats.standard).toBeGreaterThanOrEqual(1);
  });
  it("FEL-77: research sem posts para um lead: o create_campaign NAO busca de novo (icebreaker padrao)", async () => {
    mockFetchLinkedInPosts.mockImplementation(async (_key: string, url: string, limit: number) =>
      url.endsWith("/ana")
        ? { success: true, posts: [], rawIndexes: [], profileUrl: url, fetchedAt: new Date().toISOString() }
        : { success: true, ...serviceResult(url, limit), profileUrl: url, fetchedAt: new Date().toISOString() }
    );
    const db = createDb();
    await new ResearchAccountsStep(3, db.client, "tenant-1", { treg: treg() }).run(input());
    const campaign = await new CreateCampaignStep(4, db.client, "tenant-1").run(input());

    const calls = mockFetchLinkedInPosts.mock.calls.map((c) => `${c[1]}|${c[2]}`).sort();
    expect(calls).toEqual(["https://www.linkedin.com/in/ana|10", "https://www.linkedin.com/in/rui|10"]);
    expect(campaign.cost?.apify).toBeUndefined();
    expect(mockLogApifySuccess).not.toHaveBeenCalled();
    expect(mockLogApifyFailure).not.toHaveBeenCalled();
  });

  it("item vazio entre os 3 primeiros do dataset: o prompt e o da busca com limite 3 ([A, B], nao [A, B, C])", async () => {
    WITH_EMPTY_ITEM.add("https://www.linkedin.com/in/rui");
    const db = createDb();
    await new ResearchAccountsStep(3, db.client, "tenant-1", { treg: treg() }).run(input());
    await new CreateCampaignStep(4, db.client, "tenant-1").run(input());

    expect(mockFetchLinkedInPosts).toHaveBeenCalledTimes(2); // so as do dossie
    const expected = postsFor("https://www.linkedin.com/in/rui", 3);
    expect(expected).toHaveLength(2);
    expect(premiumPostsVars()).toContain(CreateCampaignStep.formatLinkedInPostsForPrompt(expected));
    // Com o corte errado (3 primeiros posts JA filtrados) o texto teria o 3o post.
    const wrong = postsFor("https://www.linkedin.com/in/rui", 10).slice(0, 3);
    expect(premiumPostsVars()).not.toContain(CreateCampaignStep.formatLinkedInPostsForPrompt(wrong));
  });
});
