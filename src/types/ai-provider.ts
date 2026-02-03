/**
 * AI Provider Types
 * Story: 6.1 - AI Provider Service Layer & Prompt Management System
 *
 * Types for multi-provider AI service architecture.
 * AC: #1, #5 - AIProvider interface and configuration types
 */

import { z } from "zod";
import { promptKeySchema } from "./ai-prompt";

// ==============================================
// PROVIDER TYPES
// ==============================================

/**
 * Supported AI provider types
 */
export type AIProviderType = "openai" | "anthropic";

/**
 * Supported OpenAI models
 * AC: #6 - gpt-4o-mini, gpt-4o, gpt-4-turbo
 * Updated Story 6.12.1: Added GPT-5 mini (cost-effective GPT-5 variant)
 */
export type OpenAIModel = "gpt-4o-mini" | "gpt-4o" | "gpt-4-turbo" | "gpt-5-mini";

/**
 * Supported Anthropic models (P1 - Optional)
 * AC: #7 - claude-3-haiku, claude-3.5-sonnet
 */
export type AnthropicModel = "claude-3-haiku-20240307" | "claude-3-5-sonnet-20241022";

/**
 * All supported AI models
 */
export type AIModel = OpenAIModel | AnthropicModel;

// ==============================================
// GENERATION OPTIONS
// ==============================================

/**
 * Options for text generation
 * AC: #1 - generateText options
 */
export interface AIGenerationOptions {
  /** Maximum tokens to generate */
  maxTokens?: number;
  /** Temperature for generation (0-1) */
  temperature?: number;
  /** Model to use (overrides provider default) */
  model?: AIModel;
  /** Enable streaming response */
  stream?: boolean;
  /** Timeout in milliseconds (default: 5000 per AC) */
  timeoutMs?: number;
}

/**
 * Zod schema for generation options validation
 */
export const aiGenerationOptionsSchema = z.object({
  maxTokens: z.number().min(1).max(4096).optional(),
  temperature: z.number().min(0).max(1).optional(),
  model: z.string().optional(),
  stream: z.boolean().optional(),
  timeoutMs: z.number().min(1000).max(60000).optional(),
});

// ==============================================
// GENERATION RESULT
// ==============================================

/**
 * Result from text generation
 */
export interface AIGenerationResult {
  /** Generated text content */
  text: string;
  /** Model used for generation */
  model: string;
  /** Token usage statistics */
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  /** Generation metadata */
  metadata?: {
    finishReason?: string;
    latencyMs?: number;
  };
}

// ==============================================
// MODEL CONFIGURATION
// ==============================================

/**
 * Model configuration returned by getModelConfig
 * AC: #5 - getModelConfig() return type
 */
export interface AIModelConfig {
  /** Provider type */
  provider: AIProviderType;
  /** Default model for this provider */
  defaultModel: AIModel;
  /** Available models */
  availableModels: AIModel[];
  /** Default max tokens */
  defaultMaxTokens: number;
  /** Default temperature */
  defaultTemperature: number;
  /** Supports streaming */
  supportsStreaming: boolean;
}

// ==============================================
// API REQUEST/RESPONSE
// ==============================================

/**
 * AI generation API request body
 * AC: #1 - Request for text generation
 * AC 6.5: #3 - Includes optional productId for campaign context
 */
export interface AIGenerateRequest {
  /** Prompt key to use from PromptManager */
  promptKey: string;
  /** Variables to interpolate into prompt template */
  variables: Record<string, string>;
  /** Generation options */
  options?: AIGenerationOptions;
  /** Product ID for campaign-specific context (Story 6.5) */
  productId?: string | null;
}

/**
 * Zod schema for AI generate request validation
 * Uses promptKeySchema to validate against known prompt keys
 * Story 6.5: Added productId for campaign product context
 */
export const aiGenerateRequestSchema = z.object({
  promptKey: promptKeySchema,
  variables: z.record(z.string(), z.string()),
  options: aiGenerationOptionsSchema.optional(),
  productId: z.string().uuid().nullable().optional(),
});

/**
 * AI generation API response
 */
export interface AIGenerateResponse {
  success: boolean;
  data?: AIGenerationResult;
  error?: string;
}

// ==============================================
// ERROR TYPES
// ==============================================

/**
 * AI service error codes
 */
export type AIErrorCode =
  | "PROVIDER_ERROR"
  | "TIMEOUT"
  | "RATE_LIMITED"
  | "INVALID_API_KEY"
  | "PROMPT_NOT_FOUND"
  | "GENERATION_FAILED"
  | "STREAM_ERROR"
  | "QUOTA_EXCEEDED"
  | "MODEL_NOT_AVAILABLE"
  | "CONTENT_FILTERED"
  | "SERVER_ERROR";

/**
 * AI service error messages (Portuguese)
 * AC: #1 - Errors translated to Portuguese
 */
export const AI_GENERATION_ERROR_MESSAGES: Record<AIErrorCode, string> = {
  PROVIDER_ERROR: "Erro no provedor de IA. Tente novamente.",
  TIMEOUT: "A geração demorou muito. Tente novamente.",
  RATE_LIMITED: "Limite de requisições atingido. Aguarde e tente novamente.",
  INVALID_API_KEY: "API key inválida ou expirada.",
  PROMPT_NOT_FOUND: "Prompt não encontrado.",
  GENERATION_FAILED: "Erro ao gerar texto. Tente novamente.",
  STREAM_ERROR: "Erro no streaming. Tente novamente.",
  QUOTA_EXCEEDED: "Quota de uso excedida. Verifique seu plano da OpenAI.",
  MODEL_NOT_AVAILABLE: "Modelo não disponível para esta conta.",
  CONTENT_FILTERED: "Conteúdo bloqueado pelo filtro de segurança.",
  SERVER_ERROR: "Erro no servidor da OpenAI. Tente novamente em alguns minutos.",
};
