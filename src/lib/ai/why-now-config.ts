/**
 * Why-Now Config (SSOT) — Story 24.20
 *
 * Fonte unica do modelo e do request do "motivo para abordar agora", no molde de
 * `fit-score-config.ts`. O seletor usa o SDK `openai` direto.
 *
 * Compat de API: a familia gpt-5 pode rejeitar `temperature` custom, entao
 * `buildWhyNowRequest` omite o campo nesses modelos e sempre usa
 * `response_format: json_object`. Sem `max_completion_tokens` (D10): a familia gpt-5
 * conta os tokens de raciocinio no limite e uma resposta truncada viraria JSON invalido.
 */

import type {
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionMessageParam,
} from "openai/resources/chat/completions";
import { isGpt5Family } from "@/lib/agent/parser-config";

/** Modelo do gatilho (barato: selecao de fato + pergunta curta). Mesmo do Fit Score. */
export const WHY_NOW_MODEL = "gpt-5.4-mini";

/** Temperatura-alvo, aplicada so a modelos que aceitam override (nao-gpt-5). */
export const WHY_NOW_TEMPERATURE = 0.2;

/** Monta os parametros de `chat.completions.create` de forma compat-safe. */
export function buildWhyNowRequest(
  messages: ChatCompletionMessageParam[]
): ChatCompletionCreateParamsNonStreaming {
  const params: ChatCompletionCreateParamsNonStreaming = {
    model: WHY_NOW_MODEL,
    messages,
    response_format: { type: "json_object" },
  };
  if (!isGpt5Family(WHY_NOW_MODEL)) {
    params.temperature = WHY_NOW_TEMPERATURE;
  }
  return params;
}
