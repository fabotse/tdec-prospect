/**
 * Fit Score Config (SSOT) — Story 24.16
 *
 * Fonte unica do modelo e do request do Fit Score por LLM, no molde de
 * `copy-review-config.ts`. O scorer usa o SDK `openai` direto.
 *
 * Compat de API: a familia gpt-5 pode rejeitar `temperature` custom, entao
 * `buildFitScoreRequest` omite o campo nesses modelos e sempre usa
 * `response_format: json_object`.
 */

import type {
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionMessageParam,
} from "openai/resources/chat/completions";
import { isGpt5Family } from "@/lib/agent/parser-config";

/** Modelo do Fit Score (barato: classificacao de cargo/empresa). */
export const FIT_SCORE_MODEL = "gpt-5.4-mini";

/** Temperatura-alvo, aplicada so a modelos que aceitam override (nao-gpt-5). */
export const FIT_SCORE_TEMPERATURE = 0.2;

/** Timeout da chamada unica. */
export const FIT_SCORE_TIMEOUT_MS = 20000;

/** Teto de leads numa chamada (a pagina da Apollo tambem vai ate 100). */
export const FIT_SCORE_MAX_LEADS = 100;

/** Corte das dores do ICP no prompt. */
export const FIT_SCORE_PAIN_POINTS_MAX_CHARS = 1500;

/** Monta os parametros de `chat.completions.create` de forma compat-safe. */
export function buildFitScoreRequest(
  messages: ChatCompletionMessageParam[]
): ChatCompletionCreateParamsNonStreaming {
  const params: ChatCompletionCreateParamsNonStreaming = {
    model: FIT_SCORE_MODEL,
    messages,
    response_format: { type: "json_object" },
  };
  if (!isGpt5Family(FIT_SCORE_MODEL)) {
    params.temperature = FIT_SCORE_TEMPERATURE;
  }
  return params;
}
