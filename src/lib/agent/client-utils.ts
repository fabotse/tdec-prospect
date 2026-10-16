/**
 * Client-side utilities for agent pipeline
 * Story 17.7 - AC #6
 */

/**
 * Trigger the next step in a pipeline execution.
 * Guards: does not trigger if currentStepNumber >= totalSteps.
 */
export async function triggerNextStep(
  executionId: string,
  currentStepNumber: number,
  totalSteps: number
): Promise<Response | null> {
  if (currentStepNumber >= totalSteps) return null;

  const nextStep = currentStepNumber + 1;
  return fetch(
    `/api/agent/executions/${executionId}/steps/${nextStep}/execute`,
    { method: "POST" }
  );
}

/**
 * Story 22.18 (AC1) — resultado VERIFICADO do disparo do proximo step.
 *
 * `triggerNextStep` devolve a `Response` crua e nunca checa `ok`: como o `fetch`
 * resolve normalmente em 4xx/5xx, o `.catch(() => {})` dos callers so apanhava
 * rejeicao de REDE. Resultado no gate de ativacao: "✅ Campanha ativada" exibido
 * por cima de um step de ativacao que nunca rodou.
 *
 * Story 24.3: os 3 gates de aprovacao (empresas, leads, campanha), o auto-trigger, os
 * botoes "Tentar novamente" e o disparo do step 1 apos o confirm verificam a resposta via
 * `executeStepChecked` e passam pela regra unica `reportTriggerFailure`. O gate de
 * ativacao mantem o tratamento inline da 22.18 (sem `reportTriggerFailure`).
 * `triggerNextStep` (crua) fica so por compatibilidade.
 */
export type StepTriggerFailedOutcome = {
  status: "failed";
  message: string;
  alreadyReported: boolean;
  /** Story 24.3: `error.code` do servidor, quando houver resposta. */
  code?: string;
  /**
   * Story 24.3: faz sentido oferecer "Tentar novamente"? `false` quando o servidor diz
   * `isRetryable: false` ou a execucao ja encerrou (`EXECUTION_NOT_ACTIVE`). `true` na
   * falha de rede e quando o campo nao vem.
   */
  retryable: boolean;
  /**
   * Story 24.3: 409 `STEP_ALREADY_RUNNING` / `STEP_NOT_EXECUTABLE` — outro executor
   * (outra aba, clique duplo, auto-trigger) ja cuidou do step. Nao e falha para o usuario.
   */
  superseded: boolean;
};

export type StepExecuteOutcome = { status: "ok" } | StepTriggerFailedOutcome;

export type TriggerNextStepOutcome = { status: "skipped" } | StepExecuteOutcome;

const SUPERSEDED_CODES = new Set(["STEP_ALREADY_RUNNING", "STEP_NOT_EXECUTABLE"]);

/** Fallback quando o corpo do erro nao traz mensagem. */
const TRIGGER_FALLBACK_MESSAGE =
  "Nao consegui iniciar a etapa. Tente novamente.";

/**
 * Dispara o proximo step e CLASSIFICA o resultado.
 *
 * `alreadyReported` distingue as duas classes de erro do `POST .../execute`:
 * - **pos-orchestrator**: o `executeStep` ja chamou `sendErrorMessage` e a bolha de erro
 *   ja esta no chat → `true`, o gate nao deve duplicar.
 * - **pre-orchestrator** (409 `EXECUTION_NOT_ACTIVE`, 409 `STEP_NOT_EXECUTABLE`
 *   (Story 24.2), 422 `API_KEY_NOT_FOUND`,
 *   500 `API_KEY_ERROR`, 401/400/404...): nada e escrito em `agent_messages` → `false`,
 *   o gate PRECISA renderizar a mensagem, senao o usuario nao ve nada.
 *
 * Story 22.18 (code review, P2): a deteccao passou a ser um FATO reportado pelo
 * servidor (`error.reportedInChat`, escrito so depois de a bolha existir) em vez da
 * inferencia anterior "`stepType` presente logo ja foi reportado". A inferencia era
 * falsa para `ORCHESTRATOR_INVALID_STEP` e `ORCHESTRATOR_STEP_NOT_READY`, lancados FORA
 * do try/catch que escreve a bolha mas serializados com `stepType` do mesmo jeito — o
 * gate suprimia a mensagem e o usuario nao via absolutamente nada. O default continua
 * sendo MOSTRAR: campo ausente ⇒ `false`.
 */
export async function triggerNextStepChecked(
  executionId: string,
  currentStepNumber: number,
  totalSteps: number
): Promise<TriggerNextStepOutcome> {
  // Guard de ultimo step: nao ha proximo step para disparar — nao e falha.
  if (currentStepNumber >= totalSteps) return { status: "skipped" };
  return executeStepChecked(executionId, currentStepNumber + 1);
}

/**
 * Story 24.3: dispara UM step (`POST .../execute`) e classifica a resposta. Fonte unica
 * da classificacao — usada pelos gates (via `triggerNextStepChecked`), pelo auto-trigger
 * e pelos botoes "Tentar novamente". Nunca rejeita.
 */
export async function executeStepChecked(
  executionId: string,
  stepNumber: number
): Promise<StepExecuteOutcome> {
  let response: Response;
  try {
    response = await fetch(
      `/api/agent/executions/${executionId}/steps/${stepNumber}/execute`,
      { method: "POST" }
    );
  } catch {
    // Rejeicao de rede — nao houve resposta, logo nao ha bolha no chat.
    return {
      status: "failed",
      message: "Erro de conexao ao iniciar a etapa. Tente novamente.",
      alreadyReported: false,
      retryable: true,
      superseded: false,
    };
  }

  if (response.ok) return { status: "ok" };

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // corpo ausente/invalido — cai no fallback abaixo
  }

  const error = (payload as { error?: Record<string, unknown> } | null)?.error;
  const message =
    typeof error?.message === "string" && error.message.length > 0
      ? error.message
      : TRIGGER_FALLBACK_MESSAGE;
  const code = typeof error?.code === "string" ? error.code : undefined;

  return {
    status: "failed",
    message,
    alreadyReported: error?.reportedInChat === true,
    code,
    retryable: error?.isRetryable !== false && code !== "EXECUTION_NOT_ACTIVE",
    superseded: response.status === 409 && code !== undefined && SUPERSEDED_CODES.has(code),
  };
}
