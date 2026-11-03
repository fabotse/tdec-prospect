/**
 * Story 24.19 (revisao Codex) — fail-open e prazo duro do `research_accounts` NO PIPELINE.
 *
 * Orchestrator REAL + ResearchAccountsStep REAL. Fora do processo, tudo e fake: Supabase
 * em memoria, Treg/Apify/chaves/log de uso mockados. Nenhuma rede real.
 *
 * Prova:
 * - falha de persistencia do proprio step (claim, checkpoint, log) nao lanca, nao grava
 *   `paused` e o `create_campaign` roda em seguida;
 * - operacoes que NUNCA resolvem (banco, Treg, log, mensagens) nao seguram o step: ele
 *   devolve o controle antes de 256 s (rota: 300 s) e o `create_campaign` roda.
 */

import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";
import { createChainBuilder } from "../../../helpers/mock-supabase";
import type { ParsedBriefing } from "@/types/agent";

// ==============================================
// MOCKS (nada sai do processo)
// ==============================================

const mockTregCall = vi.fn();
vi.mock("@/lib/services/treg", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/treg")>();
  return {
    ...actual,
    TregService: class {
      call = (...args: unknown[]) => mockTregCall(...args);
    },
  };
});

vi.mock("@/lib/services/apify", () => ({
  ApifyService: class {
    fetchLinkedInPosts = vi.fn();
  },
}));

const mockReadServiceApiKey = vi.fn();
vi.mock("@/lib/agent/service-keys", () => ({
  readServiceApiKey: (...args: unknown[]) => mockReadServiceApiKey(...args),
  getServiceApiKeyOrNull: vi.fn().mockResolvedValue(null),
  getServiceApiKey: vi.fn(),
}));

const mockLogAgentUsage = vi.fn();
vi.mock("@/lib/agent/agent-usage", () => ({
  logAgentUsage: (...args: unknown[]) => mockLogAgentUsage(...args),
}));

vi.mock("@/lib/utils/relevance-classifier", () => ({ classifyPostRelevance: vi.fn() }));
vi.mock("@/lib/utils/monitoring-processor", () => ({ loadKBContext: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/agent/execution-cost", () => ({ recordExecutionCost: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/services/error-logger", () => ({ logServerError: vi.fn().mockResolvedValue(undefined) }));

const mockCreateCampaignRun = vi.fn();
vi.mock("@/lib/agent/steps/create-campaign-step", () => ({
  CreateCampaignStep: class {
    run = (...args: unknown[]) => mockCreateCampaignRun(...args);
    requiresPostApproval() {
      return true;
    }
  },
}));

import { DeterministicOrchestrator } from "@/lib/agent/orchestrator";

// ==============================================
// FAKE SUPABASE
// ==============================================

const NEVER = new Promise<never>(() => {});

type Mode = "ok" | "error" | "hang";

interface FakeOptions {
  /** Updates em `agent_steps` (claim, checkpoint, fallback). */
  stepWrites?: Mode;
  /** Inserts em `agent_messages`. */
  messages?: Mode;
  /** `account_dossiers` e afins. */
  dossiers?: Mode;
}

const LEAD = { name: "Ana", title: "CISO", companyName: "Banco X", email: "ana@bancox.com.br", linkedinUrl: null, apolloId: "ap-1" };

const BRIEFING: ParsedBriefing = {
  technology: null,
  jobTitles: ["CISO"],
  location: null,
  companySize: null,
  industry: null,
  productSlug: null,
  mode: "guided",
  skipSteps: [],
  targetAccounts: [{ name: "Banco X", domain: "bancox.com.br", confidence: "high" }],
} as ParsedBriefing;

function createFakeDb(options: FakeOptions = {}) {
  const rows = [
    { execution_id: "exec-1", step_number: 1, step_type: "search_companies", status: "completed", output: { companies: [] } },
    { execution_id: "exec-1", step_number: 2, step_type: "search_leads", status: "approved", output: { leads: [LEAD], totalFound: 1 } },
    { execution_id: "exec-1", step_number: 3, step_type: "research_accounts", status: "pending", output: null },
    { execution_id: "exec-1", step_number: 4, step_type: "create_campaign", status: "pending", output: null },
  ];
  const executionUpdates: Array<Record<string, unknown>> = [];
  const stepWrites: Array<Record<string, unknown>> = [];

  function respond(mode: Mode, value: { data: unknown; error: unknown }) {
    if (mode === "hang") return NEVER;
    if (mode === "error") return Promise.resolve({ data: null, error: { message: "db down" } });
    return Promise.resolve(value);
  }

  function stepsChain() {
    const filters: Array<(r: (typeof rows)[number]) => boolean> = [];
    let write: Record<string, unknown> | null = null;
    let single = false;
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    Object.assign(chain, { select: self, order: self, limit: self });
    chain.update = (payload: Record<string, unknown>) => { write = payload; return chain; };
    chain.eq = (c: string, v: unknown) => { filters.push((r) => (r as Record<string, unknown>)[c] === v); return chain; };
    chain.neq = (c: string, v: unknown) => { filters.push((r) => (r as Record<string, unknown>)[c] !== v); return chain; };
    chain.lt = (c: string, v: number) => { filters.push((r) => ((r as Record<string, unknown>)[c] as number) < v); return chain; };
    chain.in = (c: string, vs: unknown[]) => { filters.push((r) => vs.includes((r as Record<string, unknown>)[c])); return chain; };
    chain.single = () => { single = true; return chain; };
    chain.maybeSingle = chain.single;
    chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
      const matched = rows.filter((r) => filters.every((f) => f(r)));
      if (write) {
        stepWrites.push(write);
        const mode = options.stepWrites ?? "ok";
        if (mode === "ok") {
          for (const r of matched) Object.assign(r, write);
          return Promise.resolve({ data: matched.map((r) => ({ step_number: r.step_number })), error: null }).then(resolve, reject);
        }
        return respond(mode, { data: null, error: null }).then(resolve, reject);
      }
      const sorted = [...matched].sort((a, b) => b.step_number - a.step_number);
      const data = single ? (sorted[0] ?? null) : sorted;
      return Promise.resolve({ data: data ? JSON.parse(JSON.stringify(data)) : data, error: null }).then(resolve, reject);
    };
    return chain;
  }

  function modeChain(mode: Mode) {
    const chain = createChainBuilder();
    chain.then = (resolve, reject) => respond(mode, { data: [], error: null }).then(resolve, reject);
    return chain;
  }

  const execution = { id: "exec-1", tenant_id: "tenant-1", status: "running", mode: "guided", briefing: BRIEFING, total_steps: 6 };

  const from = vi.fn((table: string) => {
    if (table === "agent_steps") return stepsChain();
    if (table === "agent_executions") {
      const chain = createChainBuilder({ data: execution, error: null });
      const update = chain.update;
      chain.update = vi.fn((payload: Record<string, unknown>) => {
        executionUpdates.push(payload);
        return update(payload);
      });
      return chain;
    }
    if (table === "agent_messages") return modeChain(options.messages ?? "ok");
    if (table.startsWith("account_dossier")) return modeChain(options.dossiers ?? "ok");
    return createChainBuilder();
  });

  return { client: { from } as never, rows, executionUpdates, stepWrites };
}

function tregOk(endpoint: string) {
  const json = endpoint === "treg.web.extract" ? { output: { pages: [] } } : { results: [] };
  return Promise.resolve({ ok: true, status: 200, json, costMicro: 1000, durationMs: 5 });
}

const wasPaused = (db: ReturnType<typeof createFakeDb>) =>
  db.executionUpdates.some((u) => u.status === "paused");

beforeEach(() => {
  vi.clearAllMocks();
  mockReadServiceApiKey.mockResolvedValue({ status: "ok", apiKey: "treg-key" });
  mockLogAgentUsage.mockResolvedValue(undefined);
  mockTregCall.mockImplementation((_key: string, endpoint: string) => tregOk(endpoint));
  mockCreateCampaignRun.mockResolvedValue({ success: true, data: { campaignName: "C" } });
});

afterEach(() => {
  vi.useRealTimers();
});

// ==============================================
// TESTS
// ==============================================

describe("research_accounts no pipeline — fail-open do ciclo inteiro (revisao Codex #2)", () => {
  it("todas as gravacoes do agent_steps falham: executeStep resolve, nada e pausado e o create_campaign roda", async () => {
    vi.useFakeTimers();
    const db = createFakeDb({ stepWrites: "error" });
    const orchestrator = new DeterministicOrchestrator(db.client, "api-key");

    const research = orchestrator.executeStep("exec-1", 3);
    await vi.advanceTimersByTimeAsync(30_000); // retries curtos do checkpoint
    const result = await research;

    expect(result.success).toBe(true);
    expect(wasPaused(db)).toBe(false);
    // Tentou o checkpoint completo e o fallback minimo.
    expect(db.stepWrites.filter((w) => w.status === "completed").length).toBeGreaterThanOrEqual(2);

    await orchestrator.executeStep("exec-1", 4);
    expect(mockCreateCampaignRun).toHaveBeenCalledTimes(1);
    expect(mockCreateCampaignRun.mock.calls[0][0].previousStepOutput.leads).toEqual([LEAD]);
  });

  it("claim running lanca excecao (rede): a pesquisa segue e termina completed, sem STEP_PERSISTENCE_ERROR", async () => {
    const db = createFakeDb();
    const from = (db.client as unknown as { from: Mock<(table: string) => unknown> }).from;
    const original = from.getMockImplementation()!;
    let first = true;
    from.mockImplementation((table: string) => {
      if (table === "agent_steps" && first) {
        const chain = original(table) as Record<string, unknown>;
        const update = chain.update as (p: unknown) => Record<string, unknown>;
        chain.update = (payload: Record<string, unknown>) => {
          if (payload.status === "running") {
            first = false;
            throw new Error("fetch failed");
          }
          return update(payload);
        };
        return chain;
      }
      return original(table);
    });

    const result = await new DeterministicOrchestrator(db.client, "api-key").executeStep("exec-1", 3);

    expect(result.success).toBe(true);
    expect(wasPaused(db)).toBe(false);
    expect(db.rows[2].status).toBe("completed");
  });

  it("STEP_ALREADY_RUNNING continua subindo (outro executor tem a posse; nada rodou)", async () => {
    const db = createFakeDb();
    db.rows[2].status = "running";

    await expect(new DeterministicOrchestrator(db.client, "api-key").executeStep("exec-1", 3)).rejects.toMatchObject({
      code: "STEP_ALREADY_RUNNING",
    });
    expect(mockTregCall).not.toHaveBeenCalled();
    expect(wasPaused(db)).toBe(false);
  });
});

describe("research_accounts no pipeline — prazo duro efetivo (revisao Codex #3)", () => {
  it("banco, Treg, log de uso e mensagens que NUNCA resolvem: o step termina antes de 256 s e o create_campaign roda", async () => {
    vi.useFakeTimers();
    const db = createFakeDb({ stepWrites: "hang", messages: "hang", dossiers: "hang" });
    mockTregCall.mockReturnValue(NEVER);
    mockLogAgentUsage.mockReturnValue(NEVER);
    const orchestrator = new DeterministicOrchestrator(db.client, "api-key");

    let settledAt: number | null = null;
    const startedAt = Date.now();
    const research = orchestrator.executeStep("exec-1", 3).then((r) => {
      settledAt = Date.now() - startedAt;
      return r;
    });

    await vi.advanceTimersByTimeAsync(239_000);
    expect(settledAt).toBeNull(); // ainda dentro do prazo, esperando

    await vi.advanceTimersByTimeAsync(17_000); // 256 s
    expect(settledAt).not.toBeNull();
    expect(settledAt!).toBeLessThanOrEqual(256_000);

    const result = await research;
    expect(result.success).toBe(true);
    expect((result.data as { flags: Record<string, boolean> }).flags.timeBudgetExhausted).toBe(true);
    expect(wasPaused(db)).toBe(false);

    await orchestrator.executeStep("exec-1", 4);
    expect(mockCreateCampaignRun).toHaveBeenCalledTimes(1);
  });

  it("leitura da chave do Treg que nunca resolve: o step termina e segue", async () => {
    vi.useFakeTimers();
    const db = createFakeDb();
    mockReadServiceApiKey.mockReturnValue(NEVER);
    const research = new DeterministicOrchestrator(db.client, "api-key").executeStep("exec-1", 3);

    await vi.advanceTimersByTimeAsync(256_000);
    const result = await research;

    expect(result.success).toBe(true);
    expect(mockTregCall).not.toHaveBeenCalled();
    expect(db.rows[2].status).toBe("completed");
    expect(wasPaused(db)).toBe(false);
  });
});
