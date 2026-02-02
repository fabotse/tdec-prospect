/**
 * AI Providers Exports
 * Story: 6.1 - AI Provider Service Layer & Prompt Management System
 *
 * AC: #1 - Factory function and provider exports
 */

import type { AIProviderType } from "@/types/ai-provider";
import { AIProvider, AIProviderError, AI_GENERATION_ERROR_MESSAGES } from "./base-provider";
import { OpenAIProvider } from "./openai";

// ==============================================
// FACTORY FUNCTION
// ==============================================

/**
 * Create an AI provider instance
 * AC: #1 - Factory function createAIProvider(provider, apiKey)
 *
 * @param provider - Provider type ("openai" | "anthropic")
 * @param apiKey - API key for the provider
 * @returns AIProvider instance
 */
export function createAIProvider(
  provider: AIProviderType,
  apiKey: string
): AIProvider {
  switch (provider) {
    case "openai":
      return new OpenAIProvider(apiKey);
    case "anthropic":
      // Anthropic provider is P1 (optional) - throw error for now
      throw new AIProviderError(
        "Anthropic",
        "PROVIDER_ERROR",
        "Provedor Anthropic ainda não implementado."
      );
    default:
      throw new AIProviderError(
        provider,
        "PROVIDER_ERROR",
        `Provedor "${provider}" não suportado.`
      );
  }
}

// ==============================================
// EXPORTS
// ==============================================

export { AIProvider, AIProviderError, AI_GENERATION_ERROR_MESSAGES } from "./base-provider";
export { OpenAIProvider } from "./openai";
