/**
 * Unit Tests for BaseStep
 * Story 17.1 - AC: #4
 *
 * Tests: template method run(), saveCheckpoint(), saveFailure(),
 * updateStepStatus(), logStep(), toPipelineError(), retryStep(), isRetryableStatus()
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { BaseStep } from "@/lib/agent/steps/base-step";
import { createChainBuilder } from "../../../../helpers/mock-supabase";
import type { StepInput, StepOutput, PipelineError } from "@/types/agent";
import { ExternalServiceError } from "@/lib/services/base-service";

// ==============================================
// CONCRETE IMPLEMENTATION FOR TESTING
// ==============================================

class TestStep extends BaseStep {
  public executeResult: StepOutput = { success: true, data: { test: true } };
  public shouldThrow: Error | null = null;
  public callCount = 0;
  /** Story 24.2: parcial registrado antes de lancar/retornar. */
  public partialToRecord: Record<string, unknown> | null = null;

  protected async executeInternal(input: StepInput): Promise<StepOutput> {
    this.callCount++;
    if (this.partialToRecord) {
      await this.recordPartialOutput(input.executionId, this.partialToRecord);
    }
    if (this.shouldThrow) throw this.shouldThrow;
    return this.executeResult;
  }

  // Expose protected method for direct testing
  public testToPipelineError(error: unknown): PipelineError {
    return this.toPipelineError(error);
  }
}

// ==============================================
// HELPERS
// ==============================================

function createMockSupabase() {
  const stepsChain = createChainBuilder({ data: { id: "step-1" }, error: null });
  const messagesChain = createChainBuilder({ data: { id: "msg-1" }, error: null });

  const mockFrom = vi.fn().mockImplementation((table: string) => {
    if (table === "agent_steps") return stepsChain;
    if (table === "agent_messages") return messagesChain;
    return createChainBuilder();
  });

  return { from: mockFrom, stepsChain, messagesChain };
}

const mockInput: StepInput = {
  executionId: "exec-001",
  briefing: {
    technology: "React",
    jobTitles: ["CTO"],
    location: "Brasil",
    companySize: null,
    industry: null,
    productSlug: null,
    mode: "guided",
    skipSteps: [],
  },
};

// ==============================================
// TESTS
// ==============================================

describe("BaseStep (AC #4)", () => {
  let step: TestStep;
  let mockSupabase: ReturnType<typeof createMockSupabase>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockSupabase = createMockSupabase();
    step = new TestStep(
      1,
      "search_companies",
      mockSupabase as never
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("run() template method (2.1, 2.2)", () => {
    it("executes happy path: updateStatus -> executeInternal -> saveCheckpoint -> logStep", async () => {
      const result = await step.run(mockInput);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ test: true });

      // updateStepStatus('running') called
      expect(mockSupabase.from).toHaveBeenCalledWith("agent_steps");
      // saveCheckpoint called
      expect(mockSupabase.stepsChain.update).toHaveBeenCalled();
      // logStep called
      expect(mockSupabase.from).toHaveBeenCalledWith("agent_messages");
    });

    it("catches errors, converts via toPipelineError, saves failure, and throws", async () => {
      step.shouldThrow = new Error("Something broke");

      await expect(step.run(mockInput)).rejects.toMatchObject({
        code: expect.any(String),
        message: expect.any(String),
        stepNumber: 1,
        stepType: "search_companies",
      });
    });

    it("converts ExternalServiceError to PipelineError with externalService", async () => {
      step.shouldThrow = new ExternalServiceError("theirstack", 429, "Rate limited");

      await expect(step.run(mockInput)).rejects.toMatchObject({
        externalService: "theirstack",
        isRetryable: true,
        stepNumber: 1,
      });
    });

    it("converts generic error to non-retryable PipelineError", async () => {
      step.shouldThrow = new Error("Unknown failure");

      await expect(step.run(mockInput)).rejects.toMatchObject({
        isRetryable: false,
        stepNumber: 1,
        stepType: "search_companies",
      });
    });
  });

  describe("toPipelineError() (2.3)", () => {
    it("converts ExternalServiceError with retryable status and dynamic code", () => {
      const error = new ExternalServiceError("theirstack", 429, "Rate limited");
      const pipelineError = step.testToPipelineError(error);

      expect(pipelineError).toMatchObject({
        code: "STEP_SEARCH_COMPANIES_ERROR",
        message: "Rate limited",
        stepNumber: 1,
        stepType: "search_companies",
        isRetryable: true,
        externalService: "theirstack",
      });
    });

    it("derives code from stepType for different step types", () => {
      const leadsStep = new TestStep(2, "search_leads", mockSupabase as never);
      const error = new ExternalServiceError("snovio", 503, "Service down");
      const pipelineError = leadsStep.testToPipelineError(error);

      expect(pipelineError.code).toBe("STEP_SEARCH_LEADS_ERROR");
    });

    it("converts ExternalServiceError with terminal status", () => {
      const error = new ExternalServiceError("theirstack", 401, "Unauthorized");
      const pipelineError = step.testToPipelineError(error);

      expect(pipelineError.isRetryable).toBe(false);
    });

    it("converts generic Error", () => {
      const error = new Error("Something failed");
      const pipelineError = step.testToPipelineError(error);

      expect(pipelineError).toMatchObject({
        code: "STEP_EXECUTION_ERROR",
        isRetryable: false,
        externalService: undefined,
      });
    });
  });

  describe("retryStep() (2.8)", () => {
    it("returns result on first attempt if successful", async () => {
      const result = await step.retryStep(mockInput);

      expect(result.success).toBe(true);
      expect(step.callCount).toBe(1);
    });

    it("retries on retryable error and succeeds on second attempt", async () => {
      let attempt = 0;

      // Override executeInternal to succeed on 2nd attempt
      vi.spyOn(
        step as unknown as { executeInternal: () => Promise<unknown> },
        "executeInternal"
      ).mockImplementation(
        async () => {
          attempt++;
          if (attempt === 1) {
            throw new ExternalServiceError("theirstack", 429, "Rate limited");
          }
          return { success: true, data: { test: true } };
        }
      );

      const retryPromise = step.retryStep(mockInput);
      // Advance past delay [0, 2000]
      await vi.advanceTimersByTimeAsync(3000);

      const result = await retryPromise;

      expect(result.success).toBe(true);
      expect(attempt).toBe(2);
    });

    it("throws immediately on non-retryable error without retrying", async () => {
      step.shouldThrow = new Error("Fatal error");

      await expect(step.retryStep(mockInput)).rejects.toMatchObject({
        isRetryable: false,
      });
      // run() called once, no retries
      expect(step.callCount).toBe(1);
    });

    it("exhausts all 3 retries and throws last error", async () => {
      vi.useRealTimers(); // Use real timers for this test — delays are 0+2000+5000=7s
      step.shouldThrow = new ExternalServiceError("theirstack", 503, "Unavailable");

      await expect(step.retryStep(mockInput)).rejects.toMatchObject({
        isRetryable: true,
        externalService: "theirstack",
      });
      expect(step.callCount).toBe(3);
    }, 10000);
  });

  describe("isRetryableStatus() (2.9)", () => {
    it("returns true for retryable HTTP status codes", () => {
      expect(BaseStep.isRetryableStatus(0)).toBe(true);
      expect(BaseStep.isRetryableStatus(408)).toBe(true);
      expect(BaseStep.isRetryableStatus(429)).toBe(true);
      expect(BaseStep.isRetryableStatus(502)).toBe(true);
      expect(BaseStep.isRetryableStatus(503)).toBe(true);
      expect(BaseStep.isRetryableStatus(504)).toBe(true);
    });

    it("returns false for non-retryable status codes", () => {
      expect(BaseStep.isRetryableStatus(400)).toBe(false);
      expect(BaseStep.isRetryableStatus(401)).toBe(false);
      expect(BaseStep.isRetryableStatus(403)).toBe(false);
      expect(BaseStep.isRetryableStatus(404)).toBe(false);
      expect(BaseStep.isRetryableStatus(500)).toBe(false);
    });
  });

  describe("saveCheckpoint() (2.4)", () => {
    it("updates agent_steps with output, status completed, and completed_at", async () => {
      await step.run(mockInput);

      const updateCalls = mockSupabase.stepsChain.update.mock.calls;
      const checkpointCall = updateCalls.find(
        (call: unknown[]) => (call[0] as Record<string, unknown>).status === "completed"
      );
      expect(checkpointCall).toBeDefined();
      expect(checkpointCall![0]).toMatchObject({
        output: { test: true },
        status: "completed",
        completed_at: expect.any(String),
      });
    });
  });

  describe("saveFailure() (2.5)", () => {
    it("updates agent_steps with failed status and error info on error", async () => {
      step.shouldThrow = new Error("Failure");

      await expect(step.run(mockInput)).rejects.toBeDefined();

      const updateCalls = mockSupabase.stepsChain.update.mock.calls;
      const failureCall = updateCalls.find(
        (call: unknown[]) => (call[0] as Record<string, unknown>).status === "failed"
      );
      expect(failureCall).toBeDefined();
      expect(failureCall![0]).toMatchObject({
        status: "failed",
        error_message: expect.any(String),
      });
    });
  });

  // ==============================================
  // Story 24.2: output parcial sobrevive a falha
  // ==============================================
  describe("recordPartialOutput() + saveFailure aditivo (Story 24.2)", () => {
    it("grava o parcial no step ANTES de terminar", async () => {
      step.partialToRecord = { externalCampaignId: "c1", campaignName: "X" };

      await step.run(mockInput);

      const updateCalls = mockSupabase.stepsChain.update.mock.calls;
      const partialCall = updateCalls.find(
        (call: unknown[]) =>
          !("status" in (call[0] as Record<string, unknown>)) &&
          (call[0] as { output?: Record<string, unknown> }).output?.externalCampaignId === "c1"
      );
      expect(partialCall).toBeDefined();
      expect(partialCall![0]).toEqual({ output: { externalCampaignId: "c1", campaignName: "X" } });
    });

    it("saveFailure grava { ...parcial, error } — o id sobrevive a falha", async () => {
      step.partialToRecord = { externalCampaignId: "c1" };
      step.shouldThrow = new Error("upload falhou");

      await expect(step.run(mockInput)).rejects.toBeDefined();

      const failureCall = mockSupabase.stepsChain.update.mock.calls.find(
        (call: unknown[]) => (call[0] as Record<string, unknown>).status === "failed"
      );
      expect(failureCall![0]).toMatchObject({
        status: "failed",
        output: {
          externalCampaignId: "c1",
          error: expect.objectContaining({ message: "upload falhou" }),
        },
      });
    });

    it("sem parcial, saveFailure continua gravando so { error } (regressao)", async () => {
      step.shouldThrow = new Error("Failure");

      await expect(step.run(mockInput)).rejects.toBeDefined();

      const failureCall = mockSupabase.stepsChain.update.mock.calls.find(
        (call: unknown[]) => (call[0] as Record<string, unknown>).status === "failed"
      );
      expect(Object.keys((failureCall![0] as { output: object }).output)).toEqual(["error"]);
    });

    it("erro ao gravar o parcial NAO derruba o step (loga e segue)", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      // A escrita do parcial devolve { error }. Story 24.1: as gravacoes de status
      // (running/checkpoint) seguem ok — falha persistente nelas agora e falha explicita.
      const failingChain = createChainBuilder({ data: null, error: { message: "rls" } });
      const okChain = createChainBuilder({ data: null, error: null });
      failingChain.update.mockImplementation((payload: Record<string, unknown>) =>
        "status" in payload ? okChain : failingChain
      );
      mockSupabase.from.mockImplementation((table: string) =>
        table === "agent_steps" ? failingChain : mockSupabase.messagesChain
      );
      step.partialToRecord = { externalCampaignId: "c1" };

      const result = await step.run(mockInput);

      expect(result.success).toBe(true);
      expect(errorSpy).toHaveBeenCalled();
      errorSpy.mockRestore();
    });

    it("o parcial de uma tentativa NAO vaza para a proxima run()", async () => {
      step.partialToRecord = { externalCampaignId: "c1" };
      step.shouldThrow = new Error("1a falha");
      await expect(step.run(mockInput)).rejects.toBeDefined();

      mockSupabase.stepsChain.update.mockClear();
      step.partialToRecord = null;
      step.shouldThrow = new Error("2a falha");
      await expect(step.run(mockInput)).rejects.toBeDefined();

      const failureCall = mockSupabase.stepsChain.update.mock.calls.find(
        (call: unknown[]) => (call[0] as Record<string, unknown>).status === "failed"
      );
      expect((failureCall![0] as { output: Record<string, unknown> }).output.externalCampaignId)
        .toBeUndefined();
    });
  });

  describe("updateStepStatus() (2.6)", () => {
    it("updates agent_steps status to running at start", async () => {
      await step.run(mockInput);

      const updateCalls = mockSupabase.stepsChain.update.mock.calls;
      const runningCall = updateCalls.find(
        (call: unknown[]) => (call[0] as Record<string, unknown>).status === "running"
      );
      expect(runningCall).toBeDefined();
      expect(runningCall![0]).toMatchObject({
        status: "running",
        started_at: expect.any(String),
      });
    });

    // ==============================================
    // Story 22.18 (code review, D2): CAS de posse do step
    // ==============================================
    //
    // A retomada da AC2 tornou alcancavel um segundo `POST .../execute` sobre um step que
    // ainda esta rodando (o 409 do approve so fala do step do GATE, nao do step
    // disparado). Sem lock, dois `ActivateStep` concorrentes disparavam dois
    // `POST /activate` num endpoint que e "activate (start), **or resume**".
    describe("CAS de posse ao entrar em running (D2)", () => {
      // Story 24.2: o CAS so reivindica a partir dos estados EXECUTAVEIS. Com o antigo
      // `.neq("status","running")`, o 2o POST de um clique duplo pegava o step ja
      // `completed`/`approved` e rodava (e cobrava) de novo.
      it("a transicao para running so reivindica pending/failed/awaiting_approval (24.2)", async () => {
        await step.run(mockInput);

        expect(mockSupabase.stepsChain.in).toHaveBeenCalledWith("status", [
          "pending",
          "failed",
          "awaiting_approval",
        ]);
        expect(mockSupabase.stepsChain.neq).not.toHaveBeenCalledWith("status", "running");
      });

      it("clique duplo: step ja concluido (CAS sem linha) -> STEP_ALREADY_RUNNING sem chamada externa (24.2)", async () => {
        // O 1o POST ja levou o step a `completed`; o filtro `.in(...)` nao casa e o
        // update devolve zero linhas.
        mockSupabase.stepsChain.select = vi.fn().mockResolvedValue({ data: [], error: null });

        await expect(step.run(mockInput)).rejects.toMatchObject({
          code: "STEP_ALREADY_RUNNING",
          message:
            "Esta etapa ja esta em andamento ou ja foi concluida — nada foi executado de novo.",
        });
        expect(step.callCount).toBe(0);
      });

      it("perder o CAS (zero linhas) lanca STEP_ALREADY_RUNNING e NAO roda o step", async () => {
        // Array VAZIO = ninguem foi atualizado, ou seja, a linha ja estava `running`.
        mockSupabase.stepsChain.select = vi.fn().mockResolvedValue({
          data: [],
          error: null,
        });

        await expect(step.run(mockInput)).rejects.toMatchObject({
          code: "STEP_ALREADY_RUNNING",
          isRetryable: false,
        });

        // O ponto inteiro da guarda: nenhuma chamada externa acontece.
        expect(step.callCount).toBe(0);
      });

      it("ganhar o CAS (linha devolvida) roda o step normalmente", async () => {
        mockSupabase.stepsChain.select = vi.fn().mockResolvedValue({
          data: [{ step_number: 1 }],
          error: null,
        });

        await step.run(mockInput);

        expect(step.callCount).toBe(1);
      });

      // Guardrail invertido: a guarda nova nao pode inventar bloqueio quando o driver
      // simplesmente nao devolve linhas (fail-open, como todas as leituras auxiliares
      // desta story).
      it("resposta sem array de linhas NAO inventa bloqueio (fail-open)", async () => {
        mockSupabase.stepsChain.select = vi.fn().mockResolvedValue({
          data: null,
          error: null,
        });

        await step.run(mockInput);

        expect(step.callCount).toBe(1);
      });
    });
  });

  describe("logStep() (2.7)", () => {
    it("inserts agent_messages with step metadata", async () => {
      await step.run(mockInput);

      expect(mockSupabase.from).toHaveBeenCalledWith("agent_messages");
      expect(mockSupabase.messagesChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          execution_id: "exec-001",
          role: "system",
          metadata: expect.objectContaining({
            stepNumber: 1,
            // Story 22.17 (AC3): o log de CONCLUSAO do step deixou de ser "progress"
            // (que a bolha renderiza como "Processando..." + spinner) e virou um tipo
            // proprio de conclusao.
            messageType: "step_complete",
          }),
        })
      );
    });
  });

  // ==============================================
  // Story 24.1: gravacoes com retry curto e falha explicita
  // ==============================================
  describe("gravacao com retry curto (Story 24.1)", () => {
    type Payload = Record<string, unknown>;
    type Result = { data: unknown; error: unknown };

    /**
     * Mock de `agent_steps` cujo resultado depende do payload do update. O `responder`
     * pode devolver `{ error }` ou lancar.
     */
    function createStepsMock(responder: (payload: Payload) => Result) {
      const update = vi.fn((payload: Payload) => {
        const chain: Record<string, unknown> = {};
        const self = () => chain;
        chain.eq = vi.fn(self);
        chain.in = vi.fn(self);
        chain.select = vi.fn(self);
        chain.then = (
          resolve: (v: Result) => unknown,
          reject?: (r: unknown) => unknown
        ) =>
          new Promise<Result>((res) => res(responder(payload))).then(resolve, reject);
        return chain;
      });
      const messagesChain = createChainBuilder({ data: null, error: null });
      const from = vi.fn((table: string) =>
        table === "agent_steps" ? { update } : messagesChain
      );
      return { from, update, messagesChain };
    }

    const ok: Result = { data: null, error: null };
    const dbError: Result = { data: null, error: { message: "connection reset" } };

    function statusCalls(update: ReturnType<typeof vi.fn>, status: string) {
      return update.mock.calls.filter((c) => (c[0] as Payload).status === status);
    }

    let consoleError: { mock: { calls: unknown[][] }; mockRestore: () => void };
    beforeEach(() => {
      consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    });
    afterEach(() => {
      consoleError.mockRestore();
    });

    it("erro transitorio no checkpoint: recupera na 2a tentativa", async () => {
      let checkpointAttempts = 0;
      const mock = createStepsMock((payload) => {
        if (payload.status === "completed") {
          checkpointAttempts++;
          return checkpointAttempts === 1 ? dbError : ok;
        }
        return ok;
      });
      const s = new TestStep(1, "search_companies", mock as never);

      const promise = s.run(mockInput);
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result.success).toBe(true);
      expect(statusCalls(mock.update, "completed")).toHaveLength(2);
      expect(statusCalls(mock.update, "failed")).toHaveLength(0);
      expect(consoleError).toHaveBeenCalled();
    });

    it("erro persistente no checkpoint: grava failed e rejeita com STEP_PERSISTENCE_ERROR", async () => {
      const mock = createStepsMock((payload) =>
        payload.status === "completed" ? dbError : ok
      );
      const s = new TestStep(2, "search_leads", mock as never);

      const promise = s.run(mockInput);
      const assertion = expect(promise).rejects.toMatchObject({
        code: "STEP_PERSISTENCE_ERROR",
        message: "Nao foi possivel salvar o resultado da etapa",
        isRetryable: true,
        stepNumber: 2,
        stepType: "search_leads",
      });
      await vi.runAllTimersAsync();
      await assertion;

      expect(statusCalls(mock.update, "completed")).toHaveLength(3);
      const failed = statusCalls(mock.update, "failed");
      expect(failed).toHaveLength(1);
      expect(failed[0][0]).toMatchObject({
        error_message: "Nao foi possivel salvar o resultado da etapa",
        output: { error: { code: "STEP_PERSISTENCE_ERROR", isRetryable: true } },
      });
    });

    it("erro persistente em awaiting_approval: grava failed e rejeita com STEP_PERSISTENCE_ERROR", async () => {
      const mock = createStepsMock((payload) =>
        payload.status === "awaiting_approval" ? dbError : ok
      );
      const s = new TestStep(1, "search_companies", mock as never);

      const promise = s.run({ ...mockInput, mode: "guided" });
      const assertion = expect(promise).rejects.toMatchObject({
        code: "STEP_PERSISTENCE_ERROR",
        isRetryable: true,
      });
      await vi.runAllTimersAsync();
      await assertion;

      expect(statusCalls(mock.update, "awaiting_approval")).toHaveLength(3);
      expect(statusCalls(mock.update, "failed")).toHaveLength(1);
      // Sem gate de aprovacao quando o step nao foi gravado.
      expect(mock.messagesChain.insert).not.toHaveBeenCalled();
    });

    it("excecao lancada (nao so { error }) tambem e tratada com retry", async () => {
      const mock = createStepsMock((payload) => {
        if (payload.status === "completed") throw new Error("fetch failed");
        return ok;
      });
      const s = new TestStep(1, "search_companies", mock as never);

      const promise = s.run(mockInput);
      const assertion = expect(promise).rejects.toMatchObject({
        code: "STEP_PERSISTENCE_ERROR",
      });
      await vi.runAllTimersAsync();
      await assertion;

      expect(statusCalls(mock.update, "completed")).toHaveLength(3);
      expect(statusCalls(mock.update, "failed")).toHaveLength(1);
    });

    it("saveFailure persistente: loga e rejeita com o erro ORIGINAL do step", async () => {
      let throwOnFailed = false;
      const mock = createStepsMock((payload) => {
        if (payload.status === "failed") {
          throwOnFailed = !throwOnFailed;
          if (throwOnFailed) throw new Error("socket hang up");
          return dbError;
        }
        return ok;
      });
      const s = new TestStep(1, "search_companies", mock as never);
      s.shouldThrow = new ExternalServiceError("theirstack", 429, "Rate limited");

      const promise = s.run(mockInput);
      const assertion = expect(promise).rejects.toMatchObject({
        code: "STEP_SEARCH_COMPANIES_ERROR",
        externalService: "theirstack",
        isRetryable: true,
      });
      await vi.runAllTimersAsync();
      await assertion;

      expect(statusCalls(mock.update, "failed")).toHaveLength(3);
      const messages = consoleError.mock.calls.map((c: unknown[]) => String(c[0]));
      expect(
        messages.some((m) => m.includes("NAO foi possivel gravar a falha do step 1"))
      ).toBe(true);
    });

    it("toPipelineError devolve um PipelineError recebido sem alterar", () => {
      const original: PipelineError = {
        code: "STEP_PERSISTENCE_ERROR",
        message: "Nao foi possivel salvar o resultado da etapa",
        stepNumber: 3,
        stepType: "create_campaign",
        isRetryable: true,
      };
      expect(step.testToPipelineError(original)).toBe(original);
    });
  });
});
