/**
 * AI Prompt Types
 * Story: 6.1 - AI Provider Service Layer & Prompt Management System
 *
 * Types for centralized prompt management (ADR-001).
 * AC: #2 - Prompt types and schemas
 */

import { z } from "zod";

// ==============================================
// DATABASE TYPES
// ==============================================

/**
 * AI Prompt from database (ai_prompts table)
 * AC: #3 - Matches table schema from ADR-001
 */
export interface AIPrompt {
  id: string;
  tenantId: string | null;
  promptKey: string;
  promptTemplate: string;
  modelPreference: string | null;
  version: number;
  isActive: boolean;
  metadata: AIPromptMetadata;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
}

/**
 * Prompt metadata (JSONB column)
 */
export interface AIPromptMetadata {
  temperature?: number;
  maxTokens?: number;
  [key: string]: unknown;
}

/**
 * Database row format (snake_case)
 */
export interface AIPromptRow {
  id: string;
  tenant_id: string | null;
  prompt_key: string;
  prompt_template: string;
  model_preference: string | null;
  version: number;
  is_active: boolean;
  metadata: AIPromptMetadata;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

// ==============================================
// PROMPT KEYS
// ==============================================

/**
 * Known prompt keys
 * AC: #4 - Initial prompts
 */
export type PromptKey =
  | "search_translation"
  | "email_subject_generation"
  | "email_body_generation"
  | "icebreaker_generation"
  | "tone_application";

/**
 * All prompt keys as array (for validation)
 */
export const PROMPT_KEYS: PromptKey[] = [
  "search_translation",
  "email_subject_generation",
  "email_body_generation",
  "icebreaker_generation",
  "tone_application",
];

// ==============================================
// RENDERED PROMPT
// ==============================================

/**
 * Rendered prompt ready for AI generation
 * Result of PromptManager.renderPrompt()
 */
export interface RenderedPrompt {
  /** Rendered prompt text with variables interpolated */
  content: string;
  /** Preferred model from prompt config */
  modelPreference: string | null;
  /** Generation metadata from prompt config */
  metadata: AIPromptMetadata;
  /** Source of the prompt (tenant, global, or default) */
  source: PromptSource;
}

/**
 * Source of the prompt (for debugging/logging)
 * AC: #2 - 3-level fallback tracking
 */
export type PromptSource = "tenant" | "global" | "default";

// ==============================================
// PROMPT MANAGER TYPES
// ==============================================

/**
 * Options for getting a prompt
 */
export interface GetPromptOptions {
  /** Tenant ID for tenant-specific prompts */
  tenantId?: string;
  /** If true, skip cache and fetch fresh */
  skipCache?: boolean;
}

/**
 * Cached prompt entry
 * AC: #2 - 5-minute TTL caching
 */
export interface CachedPrompt {
  prompt: AIPrompt | null;
  fetchedAt: number;
  source: PromptSource;
}

// ==============================================
// ZOD SCHEMAS
// ==============================================

/**
 * Schema for prompt metadata
 */
export const aiPromptMetadataSchema = z.object({
  temperature: z.number().min(0).max(1).optional(),
  maxTokens: z.number().min(1).max(4096).optional(),
}).passthrough();

/**
 * Schema for creating/updating a prompt
 */
export const aiPromptCreateSchema = z.object({
  promptKey: z.string().min(1).max(100),
  promptTemplate: z.string().min(1).max(10000),
  modelPreference: z.string().max(50).nullable().optional(),
  version: z.number().int().min(1).optional(),
  isActive: z.boolean().optional(),
  metadata: aiPromptMetadataSchema.optional(),
});

/**
 * Schema for prompt key validation
 */
export const promptKeySchema = z.enum([
  "search_translation",
  "email_subject_generation",
  "email_body_generation",
  "icebreaker_generation",
  "tone_application",
]);

// ==============================================
// HELPER FUNCTIONS
// ==============================================

/**
 * Convert database row to AIPrompt type
 */
export function toAIPrompt(row: AIPromptRow): AIPrompt {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    promptKey: row.prompt_key,
    promptTemplate: row.prompt_template,
    modelPreference: row.model_preference,
    version: row.version,
    isActive: row.is_active,
    metadata: row.metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
  };
}
