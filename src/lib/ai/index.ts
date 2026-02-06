/**
 * AI Module Exports
 * Story: 3.4 - AI Conversational Search
 * Story: 6.1 - AI Provider Service Layer & Prompt Management System
 *
 * AC: #1 - Exports new provider architecture while maintaining backward compatibility
 */

// ==============================================
// LEGACY EXPORTS (Backward Compatibility)
// Story 3.4 - AI Conversational Search
// ==============================================

export { AIService, AI_ERROR_MESSAGES } from "./ai-service";
export {
  FILTER_EXTRACTION_PROMPT,
  FILTER_EXTRACTION_MODEL,
  FILTER_EXTRACTION_MAX_TOKENS,
  FILTER_EXTRACTION_TEMPERATURE,
} from "./prompts/filter-extraction";

// ==============================================
// NEW ARCHITECTURE (Story 6.1)
// ==============================================

// Providers
export {
  createAIProvider,
  AIProvider,
  AIProviderError,
  AI_GENERATION_ERROR_MESSAGES,
  OpenAIProvider,
} from "./providers";

// Prompt Manager
export { PromptManager, promptManager } from "./prompt-manager";

// Code Default Prompts
export { CODE_DEFAULT_PROMPTS } from "./prompts/defaults";
