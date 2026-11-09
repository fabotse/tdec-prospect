/**
 * Meeting Prep Config (SSOT) — Story 24.23
 *
 * Fonte única do modelo, do request e do custo do briefing de preparação de reunião, no
 * molde de `why-now-config.ts` e `copy-review-config.ts`. O gerador usa o SDK `openai`
 * direto.
 *
 * Compat de API: a família gpt-5 pode rejeitar `temperature` custom, então
 * `buildMeetingPrepRequest` omite o campo nesses modelos e sempre usa
 * `response_format: json_object`. Sem `max_completion_tokens`: a família gpt-5 conta os
 * tokens de raciocínio no limite e uma resposta truncada viraria JSON inválido.
 */

import type {
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionMessageParam,
} from "openai/resources/chat/completions";
import { isGpt5Family } from "@/lib/agent/parser-config";

/** Modelo do briefing (pontos de conversa + objeções). */
export const MEETING_PREP_MODEL = "gpt-5.4-mini";

/** Temperatura-alvo, aplicada só a modelos que aceitam override (não-gpt-5). */
export const MEETING_PREP_TEMPERATURE = 0.3;

/** Timeout da chamada (a rota tem `maxDuration = 60`). */
export const MEETING_PREP_TIMEOUT_MS = 30000;

/** Preço por 1M tokens (USD) do gpt-5.4-mini. */
export const MEETING_PREP_PRICE_INPUT_PER_1M = 0.75;
export const MEETING_PREP_PRICE_OUTPUT_PER_1M = 4.5;

/** Monta os parâmetros de `chat.completions.create` de forma compat-safe. */
export function buildMeetingPrepRequest(
  messages: ChatCompletionMessageParam[]
): ChatCompletionCreateParamsNonStreaming {
  const params: ChatCompletionCreateParamsNonStreaming = {
    model: MEETING_PREP_MODEL,
    messages,
    response_format: { type: "json_object" },
  };
  if (!isGpt5Family(MEETING_PREP_MODEL)) {
    params.temperature = MEETING_PREP_TEMPERATURE;
  }
  return params;
}

/** Custo estimado (USD) de uma chamada. */
export function calculateMeetingPrepCost(promptTokens: number, completionTokens: number): number {
  return (
    (promptTokens / 1_000_000) * MEETING_PREP_PRICE_INPUT_PER_1M +
    (completionTokens / 1_000_000) * MEETING_PREP_PRICE_OUTPUT_PER_1M
  );
}
