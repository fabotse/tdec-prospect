/**
 * Unit Tests for client-utils
 * Story 17.7 - AC #6
 *
 * Tests: triggerNextStep guard logic
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { triggerNextStep, triggerNextStepChecked } from "@/lib/agent/client-utils";

let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ success: true })));
});

afterEach(() => {
  fetchSpy.mockRestore();
});

describe("triggerNextStep (Story 17.7 - AC #6)", () => {
  it("triggers next step when not at last step", async () => {
    await triggerNextStep("exec-001", 2, 5);

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/agent/executions/exec-001/steps/3/execute",
      { method: "POST" }
    );
  });

  it("does NOT trigger when at last step", async () => {
    const result = await triggerNextStep("exec-001", 5, 5);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });

  it("does NOT trigger when currentStep > totalSteps", async () => {
    const result = await triggerNextStep("exec-001", 6, 5);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });

  it("triggers step 2 after step 1 of 3", async () => {
    await triggerNextStep("exec-001", 1, 3);

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/agent/executions/exec-001/steps/2/execute",
      { method: "POST" }
    );
  });
});

// ==============================================
// Story 22.18 (AC1) — triggerNextStepChecked
// ==============================================

describe("triggerNextStepChecked (Story 22.18 - AC1)", () => {
  function mockResponse(body: unknown, ok: boolean, status = 200) {
    fetchSpy.mockResolvedValue({
      ok,
      status,
      json: () => Promise.resolve(body),
    } as unknown as Response);
  }

  it("devolve 'skipped' no guard de ultimo step (nao e falha)", async () => {
    const outcome = await triggerNextStepChecked("exec-001", 5, 5);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(outcome).toEqual({ status: "skipped" });
  });

  it("devolve 'ok' quando o execute responde 2xx", async () => {
    mockResponse({ data: {} }, true);

    const outcome = await triggerNextStepChecked("exec-001", 4, 5);

    expect(outcome).toEqual({ status: "ok" });
  });

  it("classifica erro PRE-orchestrator como nao-reportado (o gate precisa exibir)", async () => {
    mockResponse(
      { error: { code: "EXECUTION_NOT_ACTIVE", message: "Execucao encerrada" } },
      false,
      409
    );

    const outcome = await triggerNextStepChecked("exec-001", 4, 5);

    expect(outcome).toEqual({
      status: "failed",
      message: "Execucao encerrada",
      alreadyReported: false,
    });
  });

  it("classifica como ja reportado quando o servidor afirma reportedInChat", async () => {
    mockResponse(
      {
        error: {
          code: "STEP_ACTIVATE_ERROR",
          message: "Erro na comunicacao com Instantly.",
          stepNumber: 5,
          stepType: "activate",
          isRetryable: true,
          reportedInChat: true,
        },
      },
      false,
      503
    );

    const outcome = await triggerNextStepChecked("exec-001", 4, 5);

    expect(outcome).toMatchObject({ status: "failed", alreadyReported: true });
  });

  // Story 22.18 (code review, P2): guardrail invertido — a presenca de `stepType` NAO
  // pode mais significar "ja tem bolha no chat". `ORCHESTRATOR_INVALID_STEP` e
  // `ORCHESTRATOR_STEP_NOT_READY` sao lancados FORA do try/catch que chama
  // `sendErrorMessage`, mas a rota serializa `stepType` neles do mesmo jeito. Se o gate
  // suprimisse a mensagem, o usuario nao veria absolutamente nada.
  it.each([
    ["ORCHESTRATOR_INVALID_STEP", "Step nao encontrado"],
    ["ORCHESTRATOR_STEP_NOT_READY", "Step anterior nao concluido"],
  ])(
    "%s tem stepType mas NAO tem bolha no chat -> alreadyReported false (gate PRECISA mostrar)",
    async (code, message) => {
      mockResponse(
        {
          error: {
            code,
            message,
            stepNumber: 5,
            stepType: "activate",
            isRetryable: false,
            reportedInChat: false,
          },
        },
        false,
        500
      );

      const outcome = await triggerNextStepChecked("exec-001", 4, 5);

      expect(outcome).toEqual({
        status: "failed",
        message,
        alreadyReported: false,
      });
    }
  );

  it("default e MOSTRAR: campo reportedInChat ausente nao suprime a mensagem", async () => {
    mockResponse(
      {
        error: {
          code: "STEP_ACTIVATE_ERROR",
          message: "Erro na comunicacao com Instantly.",
          stepNumber: 5,
          stepType: "activate",
          isRetryable: true,
        },
      },
      false,
      503
    );

    const outcome = await triggerNextStepChecked("exec-001", 4, 5);

    expect(outcome).toMatchObject({ status: "failed", alreadyReported: false });
  });

  it("usa fallback quando o corpo do erro nao e JSON valido", async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error("not json")),
    } as unknown as Response);

    const outcome = await triggerNextStepChecked("exec-001", 4, 5);

    expect(outcome).toMatchObject({ status: "failed", alreadyReported: false });
    expect((outcome as { message: string }).message).toContain("Tente novamente");
  });

  it("trata rejeicao de rede como falha visivel", async () => {
    fetchSpy.mockRejectedValue(new Error("network down"));

    const outcome = await triggerNextStepChecked("exec-001", 4, 5);

    expect(outcome).toMatchObject({ status: "failed", alreadyReported: false });
  });
});
