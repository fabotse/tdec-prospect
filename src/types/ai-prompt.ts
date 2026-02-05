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
 * Story 6.12: Added campaign_structure_generation for AI campaign wizard
 */
export type PromptKey =
  | "search_translation"
  | "email_subject_generation"
  | "email_body_generation"
  | "icebreaker_generation"
  | "icebreaker_premium_generation"
  | "tone_application"
  | "follow_up_email_generation"
  | "follow_up_subject_generation"
  | "campaign_structure_generation";

/**
 * All prompt keys as array (for validation)
 */
export const PROMPT_KEYS: PromptKey[] = [
  "search_translation",
  "email_subject_generation",
  "email_body_generation",
  "icebreaker_generation",
  "icebreaker_premium_generation",
  "tone_application",
  "follow_up_email_generation",
  "follow_up_subject_generation",
  "campaign_structure_generation",
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
 * Story 6.12: Added campaign_structure_generation
 */
export const promptKeySchema = z.enum([
  "search_translation",
  "email_subject_generation",
  "email_body_generation",
  "icebreaker_generation",
  "icebreaker_premium_generation",
  "tone_application",
  "follow_up_email_generation",
  "follow_up_subject_generation",
  "campaign_structure_generation",
]);

// ==============================================
// ICEBREAKER CATEGORIES (Story 9.1)
// ==============================================

/**
 * Icebreaker generation category
 * Story 9.1: AC #1 - Category selection for icebreaker focus
 */
export type IcebreakerCategory = "lead" | "empresa" | "cargo" | "post";

/**
 * Category options with labels in Portuguese for UI
 * Story 9.1: AC #1 - Category selection dropdown
 */
export const ICEBREAKER_CATEGORIES: {
  value: IcebreakerCategory;
  label: string;
  description: string;
}[] = [
  {
    value: "lead",
    label: "Lead",
    description: "Foco na pessoa: trajetória, conquistas, opiniões",
  },
  {
    value: "empresa",
    label: "Empresa",
    description: "Foco na empresa: crescimento, mercado, oportunidade de negócio",
  },
  {
    value: "cargo",
    label: "Cargo",
    description: "Foco no cargo: desafios típicos do role, decisões que toma",
  },
  {
    value: "post",
    label: "Post/LinkedIn",
    description: "Foco em conteúdo publicado no LinkedIn",
  },
];

/**
 * Default category when none is selected
 * Story 9.1: AC #1 - Default is "Empresa"
 */
export const DEFAULT_ICEBREAKER_CATEGORY: IcebreakerCategory = "empresa";

/**
 * Category-specific prompt instructions
 * Story 9.1: AC #2 - Instructions adapted per category
 * Backend fills {{category_instructions}} with these before interpolation.
 */
export const ICEBREAKER_CATEGORY_INSTRUCTIONS: Record<IcebreakerCategory, string> = {
  lead: `FOCO: PESSOA (Lead)
- Priorize a trajetória profissional, posição atual e contexto no mercado da pessoa
- Mencione conquistas, movimentações de carreira ou posição de destaque
- Conecte a experiência do lead com a proposta de valor
- Exemplos de abordagem: "Com sua experiência em [área]...", "Sua trajetória em [setor] mostra que..."
- NÃO foque em posts do LinkedIn — foque no perfil e dados profissionais`,

  empresa: `FOCO: EMPRESA (Negócio)
- Priorize o crescimento, mercado e oportunidades de negócio da empresa
- Mencione expansão, investimentos, momento de mercado ou posição competitiva
- Conecte a situação da empresa com a oportunidade que seu produto/serviço oferece
- Exemplos de abordagem: "A {{lead_company}} tem se destacado em...", "O crescimento da {{lead_company}} no mercado de {{lead_industry}}..."
- Foco é 100% na empresa, não na pessoa`,

  cargo: `FOCO: CARGO (Role)
- Priorize os desafios típicos do cargo/função do lead
- Mencione decisões que esse tipo de profissional toma, dores comuns do role
- Conecte as responsabilidades do cargo com problemas que seu produto resolve
- Exemplos de abordagem: "Como {{lead_title}}, você provavelmente lida com...", "Profissionais na posição de {{lead_title}} frequentemente enfrentam..."
- Foco é no cargo e suas responsabilidades, não na empresa ou pessoa especificamente`,

  post: `FOCO: POST/LINKEDIN (Conteúdo Publicado)
- Este modo normalmente redireciona para o prompt premium com posts reais
- Se chegou aqui como fallback, gere com foco na pessoa (Lead) como alternativa
- Priorize a trajetória profissional e contexto no mercado da pessoa
- Mencione conquistas ou posição de destaque do lead`,
};

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
