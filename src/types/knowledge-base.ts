/**
 * Knowledge Base Types
 * Story: 2.4 - Knowledge Base Editor - Company Profile
 *
 * Types for knowledge base content management and AI context.
 */

import { z } from "zod";
import type { IcebreakerCategory } from "./ai-prompt";

// ==============================================
// SHARED VALIDATION SCHEMAS
// ==============================================

/**
 * UUID validation schema
 * Used for validating entity IDs before database operations
 */
export const uuidSchema = z.string().uuid("ID inválido");

// ==============================================
// SECTION TYPES
// ==============================================

/**
 * Knowledge base section types
 * AC: #1 - Sections: Empresa, Tom de Voz, Exemplos, ICP
 */
export const KNOWLEDGE_BASE_SECTIONS = [
  "company",
  "tone",
  "examples",
  "icp",
] as const;

export type KnowledgeBaseSection = (typeof KNOWLEDGE_BASE_SECTIONS)[number];

/**
 * Human-readable section labels (Portuguese)
 */
export const SECTION_LABELS: Record<KnowledgeBaseSection, string> = {
  company: "Empresa",
  tone: "Tom de Voz",
  examples: "Exemplos",
  icp: "ICP",
};

// ==============================================
// COMPANY PROFILE TYPES
// ==============================================

/**
 * Company profile content structure
 * AC: #2 - Fields: Nome, Descrição, Produtos/serviços, Diferenciais
 */
export interface CompanyProfile {
  company_name: string;
  business_description: string;
  products_services: string;
  competitive_advantages: string;
}

/**
 * Zod schema for company profile validation
 * All fields are strings (empty string allowed for optional fields)
 */
export const companyProfileSchema = z.object({
  company_name: z
    .string()
    .min(1, "Nome da empresa é obrigatório")
    .max(255, "Nome muito longo"),
  business_description: z.string().max(5000, "Descrição muito longa"),
  products_services: z.string().max(5000, "Texto muito longo"),
  competitive_advantages: z.string().max(5000, "Texto muito longo"),
});

export type CompanyProfileInput = z.infer<typeof companyProfileSchema>;

// ==============================================
// DATABASE RECORD TYPES
// ==============================================

/**
 * Knowledge base record as stored in database
 * AC: #4 - Table: id, tenant_id, section, content (jsonb), updated_at
 */
export interface KnowledgeBaseRecord {
  id: string;
  tenant_id: string;
  section: KnowledgeBaseSection;
  content: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/**
 * Knowledge base record for insert operations
 */
export type KnowledgeBaseInsert = Omit<
  KnowledgeBaseRecord,
  "id" | "created_at" | "updated_at"
>;

/**
 * Knowledge base record for update operations
 */
export type KnowledgeBaseUpdate = Partial<
  Pick<KnowledgeBaseRecord, "content" | "updated_at">
>;

// ==============================================
// TYPE GUARDS
// ==============================================

/**
 * Check if a string is a valid knowledge base section
 */
export function isValidSection(value: string): value is KnowledgeBaseSection {
  return KNOWLEDGE_BASE_SECTIONS.includes(value as KnowledgeBaseSection);
}

// ==============================================
// TONE OF VOICE TYPES
// ==============================================

/**
 * Tone presets
 * AC: #1 - Preset options: Formal, Casual, Técnico
 */
export const TONE_PRESETS = ["formal", "casual", "technical"] as const;
export type TonePreset = (typeof TONE_PRESETS)[number];

/**
 * Human-readable tone preset labels (Portuguese)
 */
export const TONE_PRESET_LABELS: Record<TonePreset, string> = {
  formal: "Formal",
  casual: "Casual",
  technical: "Técnico",
};

/**
 * Tone of voice content structure
 * AC: #1 - Fields: preset, custom description, writing guidelines
 */
export interface ToneOfVoice {
  preset: TonePreset;
  custom_description: string;
  writing_guidelines: string;
}

/**
 * Zod schema for tone of voice validation
 */
export const toneOfVoiceSchema = z.object({
  preset: z.enum(TONE_PRESETS),
  custom_description: z.string().max(2000, "Descrição muito longa"),
  writing_guidelines: z.string().max(5000, "Diretrizes muito longas"),
});

export type ToneOfVoiceInput = z.infer<typeof toneOfVoiceSchema>;

// ==============================================
// EMAIL EXAMPLES TYPES
// ==============================================

/**
 * Email example record as stored in database
 * AC: #4, #6 - Fields: id, tenant_id, subject, body, context, created_at, updated_at
 */
export interface EmailExample {
  id: string;
  tenant_id: string;
  subject: string;
  body: string;
  context: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Zod schema for email example validation
 */
export const emailExampleSchema = z.object({
  subject: z
    .string()
    .min(1, "Assunto é obrigatório")
    .max(200, "Assunto muito longo"),
  body: z
    .string()
    .min(1, "Corpo do email é obrigatório")
    .max(10000, "Texto muito longo"),
  context: z.string().max(1000, "Contexto muito longo").optional(),
});

export type EmailExampleInput = z.infer<typeof emailExampleSchema>;

/**
 * Email example record for insert operations
 */
export type EmailExampleInsert = Omit<
  EmailExample,
  "id" | "created_at" | "updated_at"
>;

// ==============================================
// ICP DEFINITION TYPES (Story 2.6)
// ==============================================

/**
 * Company size ranges for ICP definition
 * AC: #1 - Options: 1-10, 11-50, 51-200, 201-500, 501-1000, 1000+
 */
export const COMPANY_SIZES = [
  "1-10",
  "11-50",
  "51-200",
  "201-500",
  "501-1000",
  "1000+",
] as const;

export type CompanySize = (typeof COMPANY_SIZES)[number];

/**
 * Human-readable company size labels (Portuguese)
 */
export const COMPANY_SIZE_LABELS: Record<CompanySize, string> = {
  "1-10": "1-10 funcionários",
  "11-50": "11-50 funcionários",
  "51-200": "51-200 funcionários",
  "201-500": "201-500 funcionários",
  "501-1000": "501-1000 funcionários",
  "1000+": "1000+ funcionários",
};

/**
 * ICP (Ideal Customer Profile) definition content structure
 * AC: #1-#6 - All ICP fields
 */
export interface ICPDefinition {
  company_sizes: CompanySize[];
  industries: string[];
  job_titles: string[];
  geographic_focus: string[];
  pain_points: string;
  common_objections: string;
}

/**
 * Zod schema for ICP definition validation
 * AC: #1 - At least one company size required
 */
export const icpDefinitionSchema = z.object({
  company_sizes: z
    .array(z.enum(COMPANY_SIZES))
    .min(1, "Selecione ao menos um tamanho de empresa"),
  industries: z.array(z.string().min(1).max(100)),
  job_titles: z.array(z.string().min(1).max(100)),
  geographic_focus: z.array(z.string().min(1).max(100)),
  pain_points: z.string().max(5000, "Texto muito longo"),
  common_objections: z.string().max(5000, "Texto muito longo"),
});

export type ICPDefinitionInput = z.infer<typeof icpDefinitionSchema>;

// ==============================================
// ICEBREAKER EXAMPLES TYPES (Story 9.2)
// ==============================================

/**
 * Icebreaker example record as stored in database
 * AC: #1, #2 - Fields: id, tenant_id, text, category, created_at, updated_at
 */
export interface IcebreakerExample {
  id: string;
  tenant_id: string;
  text: string;
  category: IcebreakerCategory | null;
  created_at: string;
  updated_at: string;
}

/**
 * Zod schema for icebreaker example validation
 * Story 9.2: text (1-500 chars), category (optional enum)
 */
export const icebreakerExampleSchema = z.object({
  text: z
    .string()
    .min(1, "Texto do ice breaker é obrigatório")
    .max(500, "Texto muito longo (máximo 500 caracteres)"),
  category: z.enum(["lead", "empresa", "cargo", "post"] as const).optional(),
});

export type IcebreakerExampleInput = z.infer<typeof icebreakerExampleSchema>;

/**
 * Icebreaker example record for insert operations
 */
export type IcebreakerExampleInsert = Omit<
  IcebreakerExample,
  "id" | "created_at" | "updated_at"
>;

// ==============================================
// ACTION RESULT TYPE (SHARED)
// ==============================================

/**
 * Generic action result type for server actions
 * Used across all server actions for consistent error handling
 */
export type ActionResult<T = void> =
  | { success: true; data?: T }
  | { success: false; error: string };
