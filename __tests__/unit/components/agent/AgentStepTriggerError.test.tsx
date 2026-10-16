/**
 * Story 24.3 (AC2) — aviso de falha no disparo de step.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { AgentStepTriggerError } from "@/components/agent/AgentStepTriggerError";
import { useAgentStore } from "@/stores/use-agent-store";

let fetchSpy: ReturnType<typeof vi.spyOn>;

const FAILURE = {
  executionId: "exec-1",
  stepNumber: 2,
  message: "API key do TheirStack nao configurada",
  retryable: true,
};

describe("AgentStepTriggerError (Story 24.3)", () => {
  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
    useAgentStore.setState({ stepTriggerFailure: FAILURE });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("mostra a mensagem e o botao quando retryable", () => {
    render(<AgentStepTriggerError failure={FAILURE} />);
    expect(screen.getByText(/API key do TheirStack nao configurada/)).toBeInTheDocument();
    expect(screen.getByTestId("step-trigger-retry")).toBeInTheDocument();
  });

  it("nao retryable: sem botao e sem 'tente novamente'", () => {
    const failure = { ...FAILURE, message: "Execucao encerrada. Tente novamente.", retryable: false };
    render(<AgentStepTriggerError failure={failure} />);
    expect(screen.queryByTestId("step-trigger-retry")).not.toBeInTheDocument();
    const text = screen.getByTestId("step-trigger-error").textContent ?? "";
    expect(text.toLowerCase()).not.toContain("tente novamente");
    expect(text).toContain("Entre em contato com o suporte.");
  });

  it("retry com sucesso limpa o aviso e redispara o mesmo step", async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ data: {} }), { status: 200 }));
    render(<AgentStepTriggerError failure={FAILURE} />);

    await act(async () => {
      fireEvent.click(screen.getByTestId("step-trigger-retry"));
    });

    expect(fetchSpy).toHaveBeenCalledWith("/api/agent/executions/exec-1/steps/2/execute", {
      method: "POST",
    });
    expect(useAgentStore.getState().stepTriggerFailure).toBeNull();
  });

  it("durante a chamada o aviso continua e o botao fica desabilitado", async () => {
    let resolve!: (r: Response) => void;
    fetchSpy.mockReturnValue(new Promise<Response>((r) => (resolve = r)));
    render(<AgentStepTriggerError failure={FAILURE} />);

    await act(async () => {
      fireEvent.click(screen.getByTestId("step-trigger-retry"));
    });
    expect(screen.getByTestId("step-trigger-retry")).toBeDisabled();
    expect(useAgentStore.getState().stepTriggerFailure).toEqual(FAILURE);

    await act(async () => {
      resolve(new Response(JSON.stringify({ data: {} }), { status: 200 }));
    });
    expect(useAgentStore.getState().stepTriggerFailure).toBeNull();
  });

  it("retry que falha de novo substitui o aviso", async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "API_KEY_ERROR", message: "Erro ao decriptar" } }), {
        status: 500,
      })
    );
    render(<AgentStepTriggerError failure={FAILURE} />);

    await act(async () => {
      fireEvent.click(screen.getByTestId("step-trigger-retry"));
    });

    await waitFor(() => {
      expect(useAgentStore.getState().stepTriggerFailure).toEqual({
        executionId: "exec-1",
        stepNumber: 2,
        message: "Erro ao decriptar",
        retryable: true,
      });
    });
  });
});
