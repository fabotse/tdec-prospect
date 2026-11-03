/**
 * readTotalSteps — texto "Etapa N/M" do export/activate (Story 24.19)
 */

import { describe, it, expect, vi } from "vitest";
import { readTotalSteps } from "@/lib/agent/steps/step-progress";
import { createChainBuilder } from "../../../../helpers/mock-supabase";

function client(response: { data: unknown; error: unknown } | Error) {
  return {
    from: vi.fn(() => {
      if (response instanceof Error) throw response;
      return createChainBuilder(response);
    }),
  } as never;
}

describe("readTotalSteps", () => {
  it("le agent_executions.total_steps", async () => {
    expect(await readTotalSteps(client({ data: { total_steps: 6 }, error: null }), "exec-1")).toBe(6);
  });

  it("fallback 5 em erro, valor invalido ou excecao (nunca lanca)", async () => {
    expect(await readTotalSteps(client({ data: null, error: { message: "x" } }), "exec-1")).toBe(5);
    expect(await readTotalSteps(client({ data: { total_steps: 0 }, error: null }), "exec-1")).toBe(5);
    expect(await readTotalSteps(client({ data: { total_steps: "6" }, error: null }), "exec-1")).toBe(6);
    expect(await readTotalSteps(client({ data: null, error: null }), "exec-1")).toBe(5);
    expect(await readTotalSteps(client(new Error("boom")), "exec-1")).toBe(5);
  });
});
