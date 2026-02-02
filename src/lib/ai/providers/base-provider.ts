/**
 * AI Provider Base Class
 * Story: 6.1 - AI Provider Service Layer & Prompt Management System
 *
 * Abstract base class for AI providers (OpenAI, Anthropic).
 * AC: #5 - AIProvider interface with generateText, generateStream, getModelConfig
 */

import type {
  AIGenerationOptions,
  AIGenerationResult,
  AIModelConfig,
  AIErrorCode,
} from "@/types/ai-provider";
import { AI_GENERATION_ERROR_MESSAGES } from "@/types/ai-provider";

// ==============================================
// AI PROVIDER ERROR
// ==============================================

/**
 * Custom error for AI provider operations
 * Follows ExternalService pattern from base-service.ts
 */
export class AIProviderError extends Error {
  readonly name = "AIProviderError";
  readonly code: AIErrorCode;
  readonly provider: string;
  readonly userMessage: string;

  constructor(provider: string, code: AIErrorCode, message?: string) {
    const userMessage = message ?? AI_GENERATION_ERROR_MESSAGES[code];
    super(userMessage);
    this.provider = provider;
    this.code = code;
    this.userMessage = userMessage;
  }
}

// Re-export error messages for convenience
export { AI_GENERATION_ERROR_MESSAGES } from "@/types/ai-provider";

// ==============================================
// DEFAULT OPTIONS
// ==============================================

/** Default timeout for text generation (5 seconds per AC) */
export const DEFAULT_AI_TIMEOUT_MS = 5000;

/** Default max retries on timeout */
export const DEFAULT_AI_RETRIES = 1;

// ==============================================
// ABSTRACT BASE CLASS
// ==============================================

/**
 * Abstract AI Provider base class
 *
 * All AI providers (OpenAI, Anthropic) must extend this class
 * and implement the abstract methods.
 *
 * AC: #5 - Common interface for all providers
 */
export abstract class AIProvider {
  /**
   * Provider name for error reporting
   */
  abstract readonly providerName: string;

  /**
   * API key for this provider instance
   */
  protected apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Generate text using the AI model
   * AC: #5 - generateText method
   *
   * @param prompt - The prompt to send to the AI
   * @param options - Generation options (model, temperature, etc.)
   * @returns AIGenerationResult with generated text
   */
  abstract generateText(
    prompt: string,
    options?: AIGenerationOptions
  ): Promise<AIGenerationResult>;

  /**
   * Generate text with streaming response
   * AC: #5 - generateStream method
   *
   * @param prompt - The prompt to send to the AI
   * @param options - Generation options
   * @returns AsyncIterable of text chunks
   */
  abstract generateStream(
    prompt: string,
    options?: AIGenerationOptions
  ): AsyncIterable<string>;

  /**
   * Get model configuration for this provider
   * AC: #5 - getModelConfig method
   *
   * @returns AIModelConfig with provider details
   */
  abstract getModelConfig(): AIModelConfig;

  // ==============================================
  // PROTECTED HELPER METHODS
  // ==============================================

  /**
   * Handle and translate errors to AIProviderError
   * Follows ExternalService pattern from base-service.ts
   */
  protected handleError(error: unknown): AIProviderError {
    if (error instanceof AIProviderError) {
      return error;
    }

    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    // Handle abort (timeout)
    if (error instanceof Error && error.name === "AbortError") {
      return new AIProviderError(this.providerName, "TIMEOUT");
    }

    // Check for specific error patterns
    if (errorMessage.includes("401") || errorMessage.includes("invalid_api_key")) {
      return new AIProviderError(this.providerName, "INVALID_API_KEY");
    }

    if (errorMessage.includes("429") || errorMessage.includes("rate_limit")) {
      return new AIProviderError(this.providerName, "RATE_LIMITED");
    }

    if (errorMessage.includes("timeout")) {
      return new AIProviderError(this.providerName, "TIMEOUT");
    }

    // Generic provider error
    return new AIProviderError(this.providerName, "PROVIDER_ERROR");
  }

  /**
   * Merge options with defaults
   */
  protected mergeOptions(
    options?: AIGenerationOptions,
    defaults?: Partial<AIGenerationOptions>
  ): AIGenerationOptions {
    return {
      maxTokens: options?.maxTokens ?? defaults?.maxTokens ?? 500,
      temperature: options?.temperature ?? defaults?.temperature ?? 0.7,
      model: options?.model ?? defaults?.model,
      stream: options?.stream ?? defaults?.stream ?? false,
      timeoutMs: options?.timeoutMs ?? defaults?.timeoutMs ?? DEFAULT_AI_TIMEOUT_MS,
    };
  }

  /**
   * Create an AbortController with timeout
   */
  protected createTimeoutController(timeoutMs: number): {
    controller: AbortController;
    timeoutId: NodeJS.Timeout;
  } {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    return { controller, timeoutId };
  }

  /**
   * Execute with retry on timeout
   * AC: #1 - 1 retry automatic on timeout
   */
  protected async executeWithRetry<T>(
    operation: (signal: AbortSignal) => Promise<T>,
    timeoutMs: number,
    maxRetries: number = DEFAULT_AI_RETRIES
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const { controller, timeoutId } = this.createTimeoutController(timeoutMs);

      try {
        const result = await operation(controller.signal);
        clearTimeout(timeoutId);
        return result;
      } catch (error) {
        clearTimeout(timeoutId);
        lastError = error instanceof Error ? error : new Error(String(error));

        // Only retry on timeout
        const isTimeout =
          lastError.name === "AbortError" ||
          lastError.message.includes("timeout");

        if (!isTimeout || attempt === maxRetries) {
          throw this.handleError(lastError);
        }
      }
    }

    throw this.handleError(lastError ?? new Error("Unknown error"));
  }
}
