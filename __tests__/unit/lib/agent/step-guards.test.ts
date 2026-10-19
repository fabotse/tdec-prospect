/**
 * Unit Tests for step-guards (Story 24.2)
 * Fonte unica da regra de step "rejeitado" — fail-closed em qualquer erro.
 */

import { describe, it, expect, vi } from "vitest";
import { isStepRejected, hasRejectedStep } from "@/lib/agent/step-guards";
import { createChainBuilder, type ChainBuilder } from "../../../helpers/mock-supabase";

const EXEC_ID = "exec-001";

/** `from` que responde por tabela; agent_messages pode responder por stepNumber. */
function buildClient(opts: {
  steps?: { data: unknown; error: unknown };
  gatesByStep?: Record<string, { data: unknown; error: unknown }>;
  gates?: { data: unknown; error: unknown };
}) {
  const messageChains: ChainBuilder[] = [];
  const from = vi.fn((table: string) => {
    if (table === "agent_steps") {
      return createChainBuilder(opts.steps ?? { data: [], error: null });
    }
    if (table === "agent_messages") {
      // O stepNumber so e conhecido no .eq("metadata->>stepNumber", n): resolve no then.
      let stepFilter: string | null = null;
      const chain = createChainBuilder();
      chain.eq.mockImplementation((col: string, value: string) => {
        if (col === "metadata->>stepNumber") stepFilter = value;
        return chain;
      });
      chain.then = (resolve, reject) => {
        const byStep = stepFilter ? opts.gatesByStep?.[stepFilter] : undefined;
        const response = byStep ?? opts.gates ?? { data: [], error: null };
        return Promise.resolve(response).then(resolve, reject);
      };
      messageChains.push(chain);
      return chain;
    }
    return createChainBuilder();
  });
  return { client: { from } as never, from, messageChains };
}

describe("isStepRejected", () => {
  it("gate mais recente rejected:true -> true (mesma query do /reject)", async () => {
    const { client, messageChains } = buildClient({
      gates: { data: [{ id: "g1", metadata: { rejected: true } }], error: null },
    });

    expect(await isStepRejected(client, EXEC_ID, 2)).toBe(true);
    const chain = messageChains[0];
    expect(chain.eq).toHaveBeenCalledWith("execution_id", EXEC_ID);
    expect(chain.eq).toHaveBeenCalledWith("metadata->>messageType", "approval_gate");
    expect(chain.eq).toHaveBeenCalledWith("metadata->>stepNumber", "2");
    expect(chain.order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(chain.limit).toHaveBeenCalledWith(1);
  });

  it("gate mais recente NAO rejeitado -> false", async () => {
    const { client } = buildClient({
      gates: { data: [{ id: "g2", metadata: { messageType: "approval_gate" } }], error: null },
    });
    expect(await isStepRejected(client, EXEC_ID, 2)).toBe(false);
  });

  it("metadata nao-objeto -> false", async () => {
    const { client } = buildClient({
      gates: { data: [{ id: "g3", metadata: "rejected" }], error: null },
    });
    expect(await isStepRejected(client, EXEC_ID, 2)).toBe(false);
  });

  it("erro de query -> false (fail-closed)", async () => {
    const { client } = buildClient({ gates: { data: null, error: { message: "boom" } } });
    expect(await isStepRejected(client, EXEC_ID, 2)).toBe(false);
  });
});

describe("hasRejectedStep", () => {
  it("dois steps awaiting_approval, so o segundo rejeitado -> true", async () => {
    const { client, from } = buildClient({
      steps: { data: [{ step_number: 1 }, { step_number: 3 }], error: null },
      gatesByStep: {
        "1": { data: [{ id: "g1", metadata: {} }], error: null },
        "3": { data: [{ id: "g3", metadata: { rejected: true } }], error: null },
      },
    });

    expect(await hasRejectedStep(client, EXEC_ID)).toBe(true);
    const stepsChain = from.mock.results[0].value as ChainBuilder;
    expect(stepsChain.eq).toHaveBeenCalledWith("execution_id", EXEC_ID);
    expect(stepsChain.eq).toHaveBeenCalledWith("status", "awaiting_approval");
  });

  it("erro na query de agent_steps -> false", async () => {
    const { client, from } = buildClient({
      steps: { data: null, error: { message: "rls" } },
      gates: { data: [{ id: "g", metadata: { rejected: true } }], error: null },
    });

    expect(await hasRejectedStep(client, EXEC_ID)).toBe(false);
    expect(from).not.toHaveBeenCalledWith("agent_messages");
  });

  it("step_number nao-numerico e ignorado", async () => {
    const { client, from } = buildClient({
      steps: { data: [{ step_number: "2" }], error: null },
      gates: { data: [{ id: "g", metadata: { rejected: true } }], error: null },
    });

    expect(await hasRejectedStep(client, EXEC_ID)).toBe(false);
    expect(from).not.toHaveBeenCalledWith("agent_messages");
  });
});
