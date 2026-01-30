/**
 * Knowledge Base Types
 * Story: 2.4 - Knowledge Base Editor - Company Profile
 *
 * Types for knowledge base content management and AI context.
 */

import { z } from "zod";

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
// ACTION RESULT TYPE (SHARED)
// ==============================================

/**
 * Generic action result type for server actions
 * Used across all server actions for consistent error handling
 */
export type ActionResult<T = void> =
  | { success: true; data?: T }
  | { success: false; error: string };
