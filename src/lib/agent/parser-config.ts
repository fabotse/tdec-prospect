/**
 * Parser Config (SSOT) — Story 22.11 (Frente B)
 *
 * Fonte unica do modelo de INTENCAO/CONVERSA usado pelos dois parsers do agente
 * (briefing e produto), evitando drift de modelo entre eles (AC7). Este NAO e o modelo
 * do pipeline de EXECUCAO — create-campaign-step usa gpt-4o via modelPreference e nao
 * deve ser tocado (NFR1, determinismo do pipeline).
 *
 * AC6 (compat de API): a familia gpt-5 pode REJEITAR `temperature` custom (aceitando
 * apenas o default). buildParserRequest omite `temperature` para modelos gpt-5, mantendo
 * `response_format: json_object` para ambos.
 */

import type {
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionMessageParam,
} from "openai/resources/chat/completions";

// Story 22.11: gpt-4o-mini -> gpt-5.4-mini. A dor era ma-classificacao de INTENCAO
// (o mini antigo alucinava nextAction, ex.: import_leads para um ajuste de filtro).
// Custo oficial (developers.openai.com, 2026-07-24): $0,75 input / $4,50 output por 1M,
// cached $0,075. O SYSTEM_PROMPT e identico a cada /parse -> prompt caching (~10x mais
// barato no input cacheado) domina o custo real numa conversa de varios turnos.
// Plano B (se surpresa de custo/compat ao vivo): "gpt-5.4-nano" ($0,20 / $1,25, cached $0,02).
export const PARSER_MODEL = "gpt-5.4-mini";

// Temperatura-alvo dos parsers (determinismo do JSON). Aplicada SOMENTE a modelos que
// aceitam override — omitida para a familia gpt-5 (ver isGpt5Family / buildParserRequest).
export const PARSER_TEMPERATURE = 0.1;

// gpt-5.4-mini pode responder mais devagar que o 4o-mini; timeout ampliado (era 5000) para
// reduzir fail-open espurio a cada turno de conversa. A latencia real deve ser confirmada
// no smoke (Task 5); se ficar folgada, pode voltar a 5000.
export const PARSER_TIMEOUT_MS = 8000;

/** true para modelos da familia gpt-5, que restringem `temperature` ao default. */
export function isGpt5Family(model: string): boolean {
  return model.startsWith("gpt-5");
}

/**
 * Monta os parametros de `chat.completions.create` de forma compat-safe (AC6):
 * inclui `temperature` apenas quando o modelo aceita override (nao-gpt-5). Mantem
 * `response_format: json_object` para ambos os parsers.
 */
export function buildParserRequest(
  messages: ChatCompletionMessageParam[]
): ChatCompletionCreateParamsNonStreaming {
  const params: ChatCompletionCreateParamsNonStreaming = {
    model: PARSER_MODEL,
    messages,
    response_format: { type: "json_object" },
  };
  if (!isGpt5Family(PARSER_MODEL)) {
    params.temperature = PARSER_TEMPERATURE;
  }
  return params;
}
