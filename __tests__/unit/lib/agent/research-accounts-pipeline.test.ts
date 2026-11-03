/**
 * Story 24.19 (revisao Codex) — fail-open e prazo duro do `research_accounts` NO PIPELINE.
 *
 * Orchestrator REAL + ResearchAccountsStep REAL. Fora do processo, tudo e fake: Supabase
 * em memoria, Treg/Apify/chaves/log de uso mockados. Nenhuma rede real.
 *
 * Prova:
 * - falha de persistencia do proprio step (claim, checkpoint, log) nao lanca, nao grava
 *   `paused` e o `create_campaign` roda em seguida, desde que ALGUMA conclusao grave;
 * - (2a revisao Codex) nenhuma conclusao gravada nunca vira sucesso silencioso com a
 *   linha `pending`/`running`: STEP_PERSISTENCE_ERROR, como nos outros steps;
 * - a continuidade e provada pelo disparo REAL: `useAutoTrigger` renderizado sobre as
 *   linhas do banco, com o `POST .../execute` indo para o `orchestrator.executeStep`;
 * - operacoes que NUNCA resolvem (banco, Treg, log, mensagens) nao seguram o step: ele
 *   devolve o controle antes de 256 s (rota: 300 s) e o `create_campaign` roda.
 */

import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";
import { renderHook } from "@testing-library/react";
import { createChainBuilder } from "../../../helpers/mock-supabase";
import type { AgentStep, ExecutionMode, ParsedBriefing } from "@/types/agent";

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
import { useAutoTrigger } from "@/hooks/use-auto-trigger";

// ==============================================
// FAKE SUPABASE
// ==============================================

const NEVER = new Promise<never>(() => {});

type Mode = "ok" | "error" | "hang";

interface FakeOptions {
  /** Updates em `agent_steps` (claim, checkpoint, fallback). */
  stepWrites?: Mode;
  /**
   * Modo POR escrita em `agent_steps` (sobrepoe `stepWrites`): permite falhar so o claim,
   * so os checkpoints com output etc.
   */
  stepWriteMode?: (payload: Record<string, unknown>) => Mode | undefined;
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
        const mode = options.stepWriteMode?.(write) ?? options.stepWrites ?? "ok";
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

/** Linhas do fake -> `AgentStep` (o que o Realtime entrega ao hook). */
function toAgentSteps(rows: ReturnType<typeof createFakeDb>["rows"]): AgentStep[] {
  return rows.map((r) => ({
    id: `step-${r.step_number}`,
    execution_id: r.execution_id,
    step_number: r.step_number,
    step_type: r.step_type,
    status: r.status,
    input: null,
    output: r.output,
    cost: null,
    error_message: null,
    started_at: null,
    completed_at: null,
    created_at: "2026-11-03T12:00:00Z",
  })) as unknown as AgentStep[];
}

/**
 * Disparo automatico REAL: renderiza o `useAutoTrigger` com as linhas atuais do banco; o
 * `POST .../steps/N/execute` que ele faz vai para o `orchestrator.executeStep` (o que a
 * rota chama). Devolve os steps que o hook disparou, ja executados.
 */
async function autoTrigger(
  db: ReturnType<typeof createFakeDb>,
  orchestrator: DeterministicOrchestrator,
  mode: ExecutionMode
): Promise<number[]> {
  const dispatched: number[] = [];
  const runs: Promise<unknown>[] = [];
  const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    const match = /\/executions\/([^/]+)\/steps\/(\d+)\/execute$/.exec(String(url));
    if (!match) throw new Error(`fetch inesperado: ${String(url)}`);
    const stepNumber = Number(match[2]);
    dispatched.push(stepNumber);
    const run = orchestrator.executeStep(match[1], stepNumber);
    runs.push(run.catch(() => undefined));
    await run;
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  });
  try {
    const hook = renderHook(() => useAutoTrigger({ executionId: "exec-1", steps: toAgentSteps(db.rows), mode }));
    await Promise.all(runs);
    hook.unmount();
  } finally {
    fetchSpy.mockRestore();
  }
  return dispatched;
}

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
  it("todas as gravacoes do agent_steps falham: STEP_PERSISTENCE_ERROR, execucao pausada com aviso (nunca pending silencioso)", async () => {
    vi.useFakeTimers();
    const db = createFakeDb({ stepWrites: "error" });
    const orchestrator = new DeterministicOrchestrator(db.client, "api-key");

    const research = orchestrator.executeStep("exec-1", 3);
    const settled = research.catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(30_000); // retries curtos dos 3 niveis

    // 2a revisao Codex #1: antes devolvia sucesso com a linha `pending` para sempre.
    expect(await settled).toMatchObject({ code: "STEP_PERSISTENCE_ERROR", isRetryable: true, reportedInChat: true });
    expect(wasPaused(db)).toBe(true);
    // Tentou os 3 niveis da conclusao (completo, minimo, so status).
    const completions = db.stepWrites.filter((w) => w.status === "completed");
    expect(completions.length).toBeGreaterThanOrEqual(3);
    expect(completions.some((w) => !("output" in w))).toBe(true);
    // Nao anunciou "concluida" sem conclusao gravada.
    expect(mockCreateCampaignRun).not.toHaveBeenCalled();
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
  it("Treg, log de uso, mensagens e dossies que NUNCA resolvem: o step termina antes de 256 s e o create_campaign dispara sozinho", async () => {
    vi.useFakeTimers();
    const db = createFakeDb({ messages: "hang", dossiers: "hang" });
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

    const dispatched = await autoTrigger(db, orchestrator, "autopilot");
    expect(dispatched).toEqual([4]);
    expect(mockCreateCampaignRun).toHaveBeenCalledTimes(1);
  });

  it("gravacoes do agent_steps que NUNCA resolvem: devolve o controle antes de 256 s com STEP_PERSISTENCE_ERROR", async () => {
    vi.useFakeTimers();
    // Mensagens respondem: a bolha de erro do orchestrator (pauseWithError) e dele, nao do step.
    const db = createFakeDb({ stepWrites: "hang", dossiers: "hang" });
    mockTregCall.mockReturnValue(NEVER);
    mockLogAgentUsage.mockReturnValue(NEVER);

    let settledAt: number | null = null;
    const startedAt = Date.now();
    const research = new DeterministicOrchestrator(db.client, "api-key").executeStep("exec-1", 3).catch((e: unknown) => {
      settledAt = Date.now() - startedAt;
      return e;
    });

    await vi.advanceTimersByTimeAsync(256_000);
    expect(settledAt).not.toBeNull();
    expect(settledAt!).toBeLessThanOrEqual(256_000);
    expect(await research).toMatchObject({ code: "STEP_PERSISTENCE_ERROR" });
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

describe("research_accounts no pipeline — continuidade sem pending/running (2a revisao Codex #1)", () => {
  it.each<ExecutionMode>(["guided", "autopilot"])(
    "%s: claim e os dois checkpoints com output falham, o 'so status' grava: completed e o auto-trigger dispara o create_campaign",
    async (mode) => {
      vi.useFakeTimers();
      const db = createFakeDb({
        stepWriteMode: (w) => (w.status === "running" || "output" in w ? "error" : undefined),
      });
      const orchestrator = new DeterministicOrchestrator(db.client, "api-key");

      const research = orchestrator.executeStep("exec-1", 3);
      await vi.advanceTimersByTimeAsync(30_000);
      expect((await research).success).toBe(true);
      expect(wasPaused(db)).toBe(false);
      // O claim falhou (linha ficaria `pending`), mas a conclusao "so status" gravou sem filtro de status.
      expect(db.rows[2].status).toBe("completed");
      expect(mockCreateCampaignRun).not.toHaveBeenCalled();

      vi.useRealTimers();
      const dispatched = await autoTrigger(db, orchestrator, mode);

      expect(dispatched).toEqual([4]);
      expect(mockCreateCampaignRun).toHaveBeenCalledTimes(1);
      expect(mockCreateCampaignRun.mock.calls[0][0].previousStepOutput.leads).toEqual([LEAD]);
    }
  );

  it.each<ExecutionMode>(["guided", "autopilot"])(
    "%s: claim grava running e os checkpoints com output falham: nao fica running, o auto-trigger segue",
    async (mode) => {
      vi.useFakeTimers();
      const db = createFakeDb({ stepWriteMode: (w) => ("output" in w ? "error" : undefined) });
      const orchestrator = new DeterministicOrchestrator(db.client, "api-key");

      const research = orchestrator.executeStep("exec-1", 3);
      await vi.advanceTimersByTimeAsync(30_000);
      await research;
      expect(db.rows[2].status).toBe("completed");

      vi.useRealTimers();
      expect(await autoTrigger(db, orchestrator, mode)).toEqual([4]);
      expect(mockCreateCampaignRun).toHaveBeenCalledTimes(1);
    }
  );

  it("caminho feliz: research completed e o auto-trigger (guiado) dispara o create_campaign", async () => {
    const db = createFakeDb();
    const orchestrator = new DeterministicOrchestrator(db.client, "api-key");
    await orchestrator.executeStep("exec-1", 3);
    expect(db.rows[2].status).toBe("completed");

    expect(await autoTrigger(db, orchestrator, "guided")).toEqual([4]);
    expect(mockCreateCampaignRun).toHaveBeenCalledTimes(1);
  });

  it("banco do agent_steps totalmente fora: nenhum step avanca (limitacao igual a dos outros steps), mas nao e silencioso", async () => {
    vi.useFakeTimers();
    const db = createFakeDb({ stepWrites: "error" });
    const orchestrator = new DeterministicOrchestrator(db.client, "api-key");

    const research = orchestrator.executeStep("exec-1", 3).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(await research).toMatchObject({ code: "STEP_PERSISTENCE_ERROR", reportedInChat: true });
    // Pausa + bolha de erro: o usuario ve o problema e tem o "Tentar novamente".
    expect(wasPaused(db)).toBe(true);

    vi.useRealTimers();
    // A linha ficou `pending` (nada gravou): o hook nao dispara o create_campaign, igual a
    // um step existente que nao consegue gravar o checkpoint. O caminho e o "Tentar
    // novamente" do aviso, que reexecuta o research.
    expect(db.rows[2].status).toBe("pending");
    expect(await autoTrigger(db, orchestrator, "guided")).toEqual([]);
    expect(mockCreateCampaignRun).not.toHaveBeenCalled();
  });
});
