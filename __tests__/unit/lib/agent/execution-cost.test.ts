/**
 * Unit Tests for recordExecutionCost
 * Story 24.10 - Custo real e estimativa honesta
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { recordExecutionCost } from "@/lib/agent/execution-cost";
import { createChainBuilder, type ChainBuilder } from "../../../helpers/mock-supabase";

const STEPS = [
  { step_number: 1, step_type: "search_companies", status: "approved", cost: { theirstack_search: 6 } },
  { step_number: 2, step_type: "search_leads", status: "approved", cost: { apollo_search: 25 } },
  {
    step_number: 3,
    step_type: "create_campaign",
    status: "approved",
    cost: { apollo_enrich: 10, openai_calls: 20, openai_review: 5 },
  },
  { step_number: 4, step_type: "export", status: "failed", cost: { instantly_create: 1 } },
];

function setup(options?: {
  steps?: { data: unknown; error: unknown };
  execution?: { data: unknown; error: unknown };
  costModels?: { data: unknown; error: unknown };
  updateError?: unknown;
  insertError?: unknown;
}) {
  const stepsChain = createChainBuilder(options?.steps ?? { data: STEPS, error: null });
  const execReadChain = createChainBuilder(
    options?.execution ?? { data: { cost_estimate: { total: 2.79 } }, error: null }
  );
  const execWriteChain = createChainBuilder({ data: null, error: options?.updateError ?? null });
  const costModelsChain = createChainBuilder(
    options?.costModels ?? { data: [{ service_name: "apollo", unit_price: 0.1 }], error: null }
  );
  const messagesChain = createChainBuilder({ data: null, error: options?.insertError ?? null });

  let execCalls = 0;
  const from = vi.fn((table: string): ChainBuilder => {
    if (table === "agent_steps") return stepsChain;
    if (table === "agent_executions") {
      execCalls++;
      return execCalls === 1 ? execReadChain : execWriteChain;
    }
    if (table === "cost_models") return costModelsChain;
    if (table === "agent_messages") return messagesChain;
    return createChainBuilder();
  });

  return {
    supabase: { from } as never,
    from,
    execWriteChain,
    messagesChain,
  };
}

describe("recordExecutionCost", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("grava cost_actual (so steps concluidos) e manda a mensagem de custo", async () => {
    const { supabase, execWriteChain, messagesChain } = setup();

    const result = await recordExecutionCost(supabase, "exec-1", { phase: "completed", stepNumber: 5 });

    // theirstack 6 × 0,10 = 0,60 | create_campaign: 10 × 0,10 (tenant) + 25 × 0,02 = 1,50
    // export falhou: nao entra
    expect(result).not.toBeNull();
    expect(result!.steps).toEqual({
      search_companies: expect.closeTo(0.6, 5),
      search_leads: 0,
      create_campaign: expect.closeTo(1.5, 5),
    });
    expect(result!.total).toBeCloseTo(2.1);

    expect(execWriteChain.update).toHaveBeenCalledWith({ cost_actual: result });
    expect(execWriteChain.eq).toHaveBeenCalledWith("id", "exec-1");
    // nunca muda o status
    expect(JSON.stringify(execWriteChain.update.mock.calls)).not.toContain("status");

    const message = messagesChain.insert.mock.calls[0][0];
    expect(message.execution_id).toBe("exec-1");
    expect(message.role).toBe("agent");
    expect(message.content).toMatch(/^Custo da execução — estimado R\$\s2,79 · real R\$\s2,10$/);
    expect(message.metadata).toMatchObject({
      messageType: "cost_estimate",
      stepNumber: 5,
      costPhase: "completed",
    });
  });

  it("pausa: 'Custo até aqui'", async () => {
    const { supabase, messagesChain } = setup();

    await recordExecutionCost(supabase, "exec-1", { phase: "paused" });

    expect(messagesChain.insert.mock.calls[0][0].content).toMatch(/^Custo até aqui — estimado/);
  });

  it("sem cost_estimate mostra so o real", async () => {
    const { supabase, messagesChain } = setup({
      execution: { data: { cost_estimate: null }, error: null },
    });

    await recordExecutionCost(supabase, "exec-1", { phase: "completed" });

    expect(messagesChain.insert.mock.calls[0][0].content).toMatch(/^Custo da execução — real R\$/);
  });

  it("fail-open: erro ao ler os steps so loga e nao grava nada", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { supabase, execWriteChain, messagesChain } = setup({
      steps: { data: null, error: { message: "db down" } },
    });

    await expect(
      recordExecutionCost(supabase, "exec-1", { phase: "completed" })
    ).resolves.toBeNull();
    expect(execWriteChain.update).not.toHaveBeenCalled();
    expect(messagesChain.insert).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("fail-open: erros de escrita so logam", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { supabase } = setup({
      updateError: { message: "rls" },
      insertError: { message: "rls" },
    });

    const result = await recordExecutionCost(supabase, "exec-1", { phase: "completed" });

    expect(result).not.toBeNull();
    expect(errorSpy).toHaveBeenCalledTimes(2);
    errorSpy.mockRestore();
  });

  it("nunca lanca, mesmo se o client explodir", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const supabase = {
      from: () => {
        throw new Error("boom");
      },
    } as never;

    await expect(recordExecutionCost(supabase, "exec-1", { phase: "paused" })).resolves.toBeNull();
    errorSpy.mockRestore();
  });
});
