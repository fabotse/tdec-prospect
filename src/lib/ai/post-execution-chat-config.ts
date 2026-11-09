/**
 * Post-Execution Chat Config (SSOT) — Story 24.24
 *
 * Fonte unica do modelo, dos timeouts, do request e do custo da conversa depois da
 * execucao (intencao + reescrita de e-mail), no molde de `meeting-prep-config.ts`.
 *
 * Compat de API: a familia gpt-5 pode rejeitar `temperature` custom, entao
 * `buildPostExecutionChatRequest` omite o campo nesses modelos e sempre usa
 * `response_format: json_object`. Sem `max_completion_tokens`: a familia gpt-5 conta os
 * tokens de raciocinio no limite e uma resposta truncada viraria JSON invalido.
 */

import type {
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionMessageParam,
} from "openai/resources/chat/completions";
import { isGpt5Family } from "@/lib/agent/parser-config";

/** Modelo da conversa (intencao e reescrita). */
export const POST_EXECUTION_CHAT_MODEL = "gpt-5.4-mini";

/** Temperatura-alvo, aplicada so a modelos que aceitam override (nao-gpt-5). */
export const POST_EXECUTION_CHAT_TEMPERATURE = 0.3;

/** Timeout da chamada de intencao. */
export const POST_EXECUTION_INTENT_TIMEOUT_MS = 15000;

/** Timeout da chamada de reescrita. */
export const POST_EXECUTION_REWRITE_TIMEOUT_MS = 20000;

/**
 * Orcamento do revisor (24.9) na reescrita. Pior caso do revisor: 5 chamadas de 20s. A
 * rota tem `maxDuration = 120`: intencao (15s) + reescrita (20s) + revisao (70s) cabem.
 */
export const POST_EXECUTION_REVIEW_BUDGET_MS = 70000;

/** Preco por 1M tokens (USD) do gpt-5.4-mini. */
export const POST_EXECUTION_CHAT_PRICE_INPUT_PER_1M = 0.75;
export const POST_EXECUTION_CHAT_PRICE_OUTPUT_PER_1M = 4.5;

/** Monta os parametros de `chat.completions.create` de forma compat-safe. */
export function buildPostExecutionChatRequest(
  messages: ChatCompletionMessageParam[]
): ChatCompletionCreateParamsNonStreaming {
  const params: ChatCompletionCreateParamsNonStreaming = {
    model: POST_EXECUTION_CHAT_MODEL,
    messages,
    response_format: { type: "json_object" },
  };
  if (!isGpt5Family(POST_EXECUTION_CHAT_MODEL)) {
    params.temperature = POST_EXECUTION_CHAT_TEMPERATURE;
  }
  return params;
}

/** Custo estimado (USD) de uma chamada. */
export function calculatePostExecutionChatCost(
  promptTokens: number,
  completionTokens: number
): number {
  return (
    (promptTokens / 1_000_000) * POST_EXECUTION_CHAT_PRICE_INPUT_PER_1M +
    (completionTokens / 1_000_000) * POST_EXECUTION_CHAT_PRICE_OUTPUT_PER_1M
  );
}
