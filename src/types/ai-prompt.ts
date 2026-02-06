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
- USE dados reais: nome completo ({{lead_name}}), cargo ({{lead_title}}), empresa ({{lead_company}}), setor ({{lead_industry}})
- Exemplos de abordagem:
  * "Com mais de X anos em {{lead_industry}}, sua experiência como {{lead_title}} na {{lead_company}} é notável..."
  * "A combinação de {{lead_title}} em uma empresa como a {{lead_company}} traz uma perspectiva única sobre {{lead_industry}}..."
  * "Sua posição como {{lead_title}} na {{lead_company}} coloca você no centro das decisões de {{lead_industry}}..."
- ANTI-PATTERNS (NÃO faça):
  * NÃO mencione posts ou atividade no LinkedIn
  * NÃO use "Vi que você..." sem referência a dados reais
  * NÃO foque na empresa — foque na PESSOA e sua trajetória`,

  empresa: `FOCO: EMPRESA (Negócio)
- Priorize oportunidade de negócio, crescimento, mercado e desafios do setor da empresa
- Mencione expansão, investimentos, momento de mercado, posição competitiva ou tamanho da empresa
- Conecte a situação da empresa com a oportunidade que seu produto/serviço oferece
- USE dados reais: empresa ({{lead_company}}), setor ({{lead_industry}})
- Exemplos de abordagem:
  * "A {{lead_company}} tem se posicionado de forma interessante no mercado de {{lead_industry}}..."
  * "Empresas de {{lead_industry}} como a {{lead_company}} estão em um momento estratégico para [proposta de valor]..."
  * "O setor de {{lead_industry}} está em transformação, e a {{lead_company}} parece estar bem posicionada..."
- ANTI-PATTERNS (NÃO faça):
  * NÃO mencione conquistas pessoais, perfil ou posts do lead
  * NÃO use o cargo do lead como foco — foco é 100% na EMPRESA
  * NÃO invente dados sobre a empresa que não estão disponíveis`,

  cargo: `FOCO: CARGO (Role) — COMECE PELO CARGO, NÃO PELA EMPRESA
- A PRIMEIRA PALAVRA do quebra-gelo deve referenciar o CARGO ({{lead_title}}), NÃO a empresa
- Priorize os desafios típicos do cargo/função do lead
- Mencione decisões que esse tipo de profissional toma, dores comuns do role
- Conecte as responsabilidades do cargo com problemas que seu produto resolve
- USE dados reais: cargo ({{lead_title}}), empresa ({{lead_company}}), setor ({{lead_industry}})
- Adapte o nível do desafio ao tipo de cargo:
  * C-Level (CEO, CTO, CFO): decisões estratégicas, crescimento, competitividade, inovação
  * Diretor/Head: escala, eficiência operacional, resultados de equipe, processos
  * Gerente: produtividade do time, métricas, ferramentas, otimização do dia-a-dia
  * Analista/Especialista: eficiência pessoal, ferramentas, automação, aprendizado
- Exemplos de abordagem (NOTE: todos começam pelo CARGO, não pela empresa):
  * "Como {{lead_title}}, você provavelmente lida com o desafio de [dor típica do cargo] — é algo que nosso [produto] resolve diretamente."
  * "O dia-a-dia de um {{lead_title}} em {{lead_industry}} envolve decisões sobre [área]. Na {{lead_company}}, isso deve ser especialmente relevante."
  * "Sabemos que {{lead_title}} precisa equilibrar [desafio A] e [desafio B] — especialmente em empresas de {{lead_industry}} como a {{lead_company}}."
- ANTI-PATTERNS (NÃO faça):
  * NÃO comece falando da empresa (crescimento, expansão, mercado) — isso é categoria EMPRESA
  * NÃO foque na pessoa (trajetória, conquistas) — isso é categoria LEAD
  * NÃO mencione posts ou atividade no LinkedIn
  * NÃO generalize — use o cargo específico do lead ({{lead_title}}), não "profissionais"`,

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
