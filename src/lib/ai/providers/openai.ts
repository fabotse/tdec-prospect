/**
 * OpenAI Provider
 * Story: 6.1 - AI Provider Service Layer & Prompt Management System
 *
 * OpenAI implementation of AIProvider for text generation.
 * AC: #1, #6 - OpenAI SDK integration with streaming support
 */

import OpenAI from "openai";
import type {
  AIGenerationOptions,
  AIGenerationResult,
  AIModelConfig,
  OpenAIModel,
} from "@/types/ai-provider";
import {
  AIProvider,
  AIProviderError,
  DEFAULT_AI_TIMEOUT_MS,
} from "./base-provider";

// ==============================================
// CONSTANTS
// ==============================================

/** Available OpenAI models per AC #6, updated Story 6.12.1 */
const OPENAI_MODELS: OpenAIModel[] = ["gpt-4o-mini", "gpt-4o", "gpt-4-turbo", "gpt-5-mini"];

/** Default model */
const DEFAULT_MODEL: OpenAIModel = "gpt-4o-mini";

/** Default max tokens */
const DEFAULT_MAX_TOKENS = 500;

/** Default temperature */
const DEFAULT_TEMPERATURE = 0.7;

// ==============================================
// OPENAI PROVIDER
// ==============================================

/**
 * OpenAI Provider implementation
 *
 * AC: #6 - Uses OpenAI SDK with configured API key
 * Supports gpt-4o-mini, gpt-4o, gpt-4-turbo
 */
export class OpenAIProvider extends AIProvider {
  readonly providerName = "OpenAI";

  private client: OpenAI;

  constructor(apiKey: string) {
    super(apiKey);
    this.client = new OpenAI({ apiKey });
  }

  /**
   * Generate text using OpenAI
   * AC: #1 - generateText implementation
   */
  async generateText(
    prompt: string,
    options?: AIGenerationOptions
  ): Promise<AIGenerationResult> {
    const mergedOptions = this.mergeOptions(options, {
      model: DEFAULT_MODEL,
      maxTokens: DEFAULT_MAX_TOKENS,
      temperature: DEFAULT_TEMPERATURE,
      timeoutMs: DEFAULT_AI_TIMEOUT_MS,
    });

    const model = mergedOptions.model as OpenAIModel ?? DEFAULT_MODEL;
    const startTime = Date.now();

    return this.executeWithRetry(
      async (signal) => {
        const completion = await this.client.chat.completions.create(
          {
            model,
            messages: [{ role: "user", content: prompt }],
            max_tokens: mergedOptions.maxTokens,
            temperature: mergedOptions.temperature,
          },
          { signal }
        );

        const content = completion.choices[0]?.message?.content;
        if (!content) {
          throw new AIProviderError(this.providerName, "GENERATION_FAILED");
        }

        return {
          text: content,
          model,
          usage: completion.usage
            ? {
                promptTokens: completion.usage.prompt_tokens,
                completionTokens: completion.usage.completion_tokens,
                totalTokens: completion.usage.total_tokens,
              }
            : undefined,
          metadata: {
            finishReason: completion.choices[0]?.finish_reason ?? undefined,
            latencyMs: Date.now() - startTime,
          },
        };
      },
      mergedOptions.timeoutMs ?? DEFAULT_AI_TIMEOUT_MS
    );
  }

  /**
   * Generate text with streaming response
   * AC: #6 - Streaming with Server-Sent Events pattern
   * AC: #1 - Timeout support for streaming (5 seconds default)
   */
  async *generateStream(
    prompt: string,
    options?: AIGenerationOptions
  ): AsyncIterable<string> {
    const mergedOptions = this.mergeOptions(options, {
      model: DEFAULT_MODEL,
      maxTokens: DEFAULT_MAX_TOKENS,
      temperature: DEFAULT_TEMPERATURE,
      timeoutMs: DEFAULT_AI_TIMEOUT_MS,
    });

    const model = mergedOptions.model as OpenAIModel ?? DEFAULT_MODEL;
    const timeoutMs = mergedOptions.timeoutMs ?? DEFAULT_AI_TIMEOUT_MS;

    // Create AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const stream = await this.client.chat.completions.create(
        {
          model,
          messages: [{ role: "user", content: prompt }],
          max_tokens: mergedOptions.maxTokens,
          temperature: mergedOptions.temperature,
          stream: true,
        },
        { signal: controller.signal }
      );

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content;
        if (content) {
          yield content;
        }
      }
    } catch (error) {
      throw this.handleError(error);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Get OpenAI model configuration
   * AC: #5 - getModelConfig implementation
   */
  getModelConfig(): AIModelConfig {
    return {
      provider: "openai",
      defaultModel: DEFAULT_MODEL,
      availableModels: OPENAI_MODELS,
      defaultMaxTokens: DEFAULT_MAX_TOKENS,
      defaultTemperature: DEFAULT_TEMPERATURE,
      supportsStreaming: true,
    };
  }
}
