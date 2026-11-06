/**
 * Story 24.3 — fonte UNICA da coerencia "mensagem de erro <-> isRetryable".
 *
 * Antes a sanitizacao vivia so no `sendErrorMessage` do orchestrator (22.12). Agora a
 * bolha do chat, a linha do step no painel de progresso e o aviso de falha de disparo
 * usam as mesmas funcoes: um erro NAO retryable nunca diz "tente novamente" nem mostra
 * botao de retry, em lugar nenhum.
 */

import type { AgentStep } from "@/types/agent";

const DEFAULT_ERROR_MESSAGE = "Erro ao processar a etapa";

/**
 * Normaliza a mensagem de erro para exibicao, SEM pontuacao terminal (o chamador
 * compoe a frase).
 *
 * - Retryable: mantem a mensagem original (so tira a pontuacao final).
 * - Nao retryable: remove qualquer "tente novamente" embutido (ex.: o INTERNAL_ERROR
 *   generico do base-service carrega esse texto) e cai num fallback se esvaziar.
 */
export function formatStepErrorMessage(
  message: string | null | undefined,
  isRetryable: boolean
): string {
  const raw = (message ?? "").trim();
  const cleaned = isRetryable
    ? raw.replace(/[.!?]+$/, "").trim()
    : raw
        .replace(/\s*tente novamente\.?/gi, "")
        .replace(/[.!?]+$/, "")
        .trim();
  return cleaned || DEFAULT_ERROR_MESSAGE;
}

/** Sufixo do erro nao retryable — o mesmo da bolha do orchestrator. */
export const NON_RETRYABLE_SUFFIX = "Entre em contato com o suporte.";

/**
 * Frase completa para exibir na UI (linha do step, aviso de disparo). O nao retryable
 * termina mandando falar com o suporte; o retryable nao precisa de sufixo (o botao
 * "Tentar novamente" esta ao lado).
 */
export function formatStepErrorSentence(
  message: string | null | undefined,
  isRetryable: boolean
): string {
  const body = `${formatStepErrorMessage(message, isRetryable)}.`;
  return isRetryable ? body : `${body} ${NON_RETRYABLE_SUFFIX}`;
}

/**
 * Um step `failed` e retryable salvo quando o erro gravado diz explicitamente
 * `isRetryable: false`. Campo ausente (falha legada, output sem `error`) conta como
 * retryable — a rota execute (guards da 24.2) continua sendo quem decide de verdade.
 */
export function isStepErrorRetryable(step: Pick<AgentStep, "output">): boolean {
  const error = (step.output as { error?: { isRetryable?: unknown } } | null)?.error;
  return error?.isRetryable !== false;
}

/** Mensagem de erro do step: `error_message` ou, na falta, `output.error.message`. */
export function getStepErrorMessage(
  step: Pick<AgentStep, "output" | "error_message">
): string | null {
  if (step.error_message) return step.error_message;
  const msg = (step.output as { error?: { message?: unknown } } | null)?.error?.message;
  return typeof msg === "string" && msg.length > 0 ? msg : null;
}

/**
 * DW-11 (FEL-14): um step `running` que passou do limite da function (`maxDuration = 300`
 * na rota execute) quase certamente morreu (timeout, crash, deploy). O banco so o libera
 * com o sweeper da 24.1 (`running` ha mais de 10 min, cron a cada 2 min), entao por ate
 * ~12 min o painel so mostrava o spinner. A partir deste limite a linha explica o que
 * esta acontecendo. 6 min = 5 min da function + 1 min de folga para relogio/latencia.
 */
export const STALE_RUNNING_HINT_AFTER_MS = 6 * 60 * 1000;

/** Texto exibido na linha do step `running` acima do limite. */
export const STALE_RUNNING_HINT =
  'Está demorando mais que o normal. Se a etapa tiver travado, ela é liberada sozinha em até 12 minutos do início e aí aparece "Tentar novamente".';

/**
 * `true` quando o step esta `running` ha mais de `STALE_RUNNING_HINT_AFTER_MS`. Usa
 * `started_at` e, na falta, `created_at` (a mesma referencia do sweeper). Data invalida
 * nunca conta como velha.
 */
export function isStepRunningTooLong(
  step: Pick<AgentStep, "status" | "started_at" | "created_at">,
  nowMs: number
): boolean {
  if (step.status !== "running") return false;
  const startedMs = Date.parse(step.started_at ?? step.created_at);
  if (Number.isNaN(startedMs)) return false;
  return nowMs - startedMs > STALE_RUNNING_HINT_AFTER_MS;
}
