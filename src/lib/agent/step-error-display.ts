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
