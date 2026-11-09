/**
 * Conversa depois da execucao — chamada JSON ao LLM (Story 24.24)
 *
 * Client injetavel (molde de `meeting-prep/generator.ts`), uma requisicao por chamada
 * (`maxRetries: 0`), timeout por AbortController. Nunca lanca: falha vira `error`.
 */

import OpenAI from "openai";
import type {
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionMessageParam,
} from "openai/resources/chat/completions";
import {
  POST_EXECUTION_CHAT_MODEL,
  buildPostExecutionChatRequest,
} from "@/lib/ai/post-execution-chat-config";

/** Client minimo (o SDK `openai` satisfaz). Injetavel nos testes. */
export interface ConversationLlmClient {
  chat: {
    completions: {
      create: (
        params: ChatCompletionCreateParamsNonStreaming,
        options?: { signal?: AbortSignal }
      ) => Promise<{
        choices: Array<{ message?: { content?: string | null } | null }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number } | null;
      }>;
    };
  };
}

export type ConversationLlmClientFactory = (apiKey: string) => ConversationLlmClient;

export const defaultConversationLlmClientFactory: ConversationLlmClientFactory = (apiKey) =>
  new OpenAI({ apiKey, maxRetries: 0 }) as unknown as ConversationLlmClient;

export interface ConversationLlmUsage {
  model: string;
  /** Chamadas feitas (0 = nenhuma tentativa). */
  calls: number;
  promptTokens: number;
  completionTokens: number;
  durationMs: number;
}

export interface ConversationLlmResult {
  parsed: Record<string, unknown> | null;
  usage: ConversationLlmUsage;
  error?: "llm_error" | "invalid_response";
}

/** Uma chamada com `response_format: json_object`. Nunca lanca. */
export async function callConversationLlm(params: {
  messages: ChatCompletionMessageParam[];
  apiKey: string;
  timeoutMs: number;
  clientFactory?: ConversationLlmClientFactory;
  clock?: () => number;
}): Promise<ConversationLlmResult> {
  const clock = params.clock ?? Date.now;
  const started = clock();
  const usage: ConversationLlmUsage = {
    model: POST_EXECUTION_CHAT_MODEL,
    calls: 0,
    promptTokens: 0,
    completionTokens: 0,
    durationMs: 0,
  };
  const finish = (
    parsed: Record<string, unknown> | null,
    error?: ConversationLlmResult["error"]
  ): ConversationLlmResult => ({
    parsed,
    usage: { ...usage, durationMs: Math.max(0, clock() - started) },
    ...(error ? { error } : {}),
  });

  if (!params.apiKey) return finish(null, "llm_error");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), params.timeoutMs);
  let content: string | null | undefined;
  try {
    const client = (params.clientFactory ?? defaultConversationLlmClientFactory)(params.apiKey);
    usage.calls = 1;
    const response = await client.chat.completions.create(
      buildPostExecutionChatRequest(params.messages),
      { signal: controller.signal }
    );
    usage.promptTokens = Number(response.usage?.prompt_tokens) || 0;
    usage.completionTokens = Number(response.usage?.completion_tokens) || 0;
    content = response.choices?.[0]?.message?.content;
  } catch (error) {
    console.error(
      "[post-execution-chat] falha na chamada da LLM:",
      error instanceof Error ? error.message : error
    );
    return finish(null, "llm_error");
  } finally {
    clearTimeout(timer);
  }

  let parsed: unknown;
  try {
    parsed = typeof content === "string" ? JSON.parse(content) : null;
  } catch {
    parsed = null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return finish(null, "invalid_response");
  }
  return finish(parsed as Record<string, unknown>);
}
