/**
 * Copy Review Config (SSOT) — Story 24.9
 *
 * Fonte unica do modelo do revisor automatico de copy, no padrao de
 * `src/lib/agent/parser-config.ts`. O revisor usa o SDK `openai` direto (o tipo
 * `AIModel` do provider nao aceita gpt-5.4-mini).
 *
 * Compat de API: a familia gpt-5 pode rejeitar `temperature` custom, entao
 * `buildReviewerRequest` omite o campo nesses modelos e sempre usa
 * `response_format: json_object`.
 */

import type {
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionMessageParam,
} from "openai/resources/chat/completions";
import { isGpt5Family } from "@/lib/agent/parser-config";

/** Modelo do revisor (revisao + reescrita). */
export const REVIEWER_MODEL = "gpt-5.4-mini";

/** Temperatura-alvo, aplicada so a modelos que aceitam override (nao-gpt-5). */
export const REVIEWER_TEMPERATURE = 0.2;

/** Timeout por chamada (revisao ou reescrita). */
export const REVIEWER_TIMEOUT_MS = 20000;

/**
 * Orcamento total da revisao no agente (todos os e-mails em paralelo). Se estourar, os
 * e-mails seguem com o texto gerado e `not_reviewed`, para caber no maxDuration da rota.
 */
export const REVIEW_BUDGET_MS = 60000;

/** Maximo de reescritas por e-mail. Pior caso: 1 + 2 * MAX_REWRITES chamadas. */
export const MAX_REWRITES = 2;

/** Preco por 1M tokens (USD) do gpt-5.4-mini. */
export const REVIEWER_PRICE_INPUT_PER_1M = 0.75;
export const REVIEWER_PRICE_OUTPUT_PER_1M = 4.5;

/** Monta os parametros de `chat.completions.create` de forma compat-safe. */
export function buildReviewerRequest(
  messages: ChatCompletionMessageParam[]
): ChatCompletionCreateParamsNonStreaming {
  const params: ChatCompletionCreateParamsNonStreaming = {
    model: REVIEWER_MODEL,
    messages,
    response_format: { type: "json_object" },
  };
  if (!isGpt5Family(REVIEWER_MODEL)) {
    params.temperature = REVIEWER_TEMPERATURE;
  }
  return params;
}

/** Custo estimado (USD) de uma ou mais chamadas do revisor. */
export function calculateReviewCost(promptTokens: number, completionTokens: number): number {
  return (
    (promptTokens / 1_000_000) * REVIEWER_PRICE_INPUT_PER_1M +
    (completionTokens / 1_000_000) * REVIEWER_PRICE_OUTPUT_PER_1M
  );
}
