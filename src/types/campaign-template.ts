/**
 * Campaign Template Types
 * Story 6.13: Smart Campaign Templates
 *
 * AC #2: Template data model
 * AC #6: Structure for campaign_templates table
 */

import { z } from "zod";
import type { EmailMode } from "./email-block";

// ==============================================
// TEMPLATE STRUCTURE TYPES
// ==============================================

/**
 * Email definition within a template
 * AC #2, #6: Each email has position, context, and mode
 */
export interface TemplateEmail {
  position: number;
  context: string;
  emailMode: EmailMode;
}

/**
 * Delay definition within a template
 * AC #6: Delay after specific email position
 */
export interface TemplateDelay {
  afterEmail: number;
  days: number;
}

/**
 * Complete template structure stored in structure_json
 * AC #6: Contains emails array with position and context, delays array with duration
 */
export interface TemplateStructure {
  emails: TemplateEmail[];
  delays: TemplateDelay[];
}

// ==============================================
// CAMPAIGN TEMPLATE TYPE
// ==============================================

/**
 * Campaign template entity
 * AC #6: Matches campaign_templates table schema
 */
export interface CampaignTemplate {
  id: string;
  name: string;
  nameKey: string;
  description: string;
  structureJson: TemplateStructure;
  useCase: string;
  emailCount: number;
  totalDays: number;
  isActive: boolean;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Raw database row type (snake_case)
 */
export interface CampaignTemplateRow {
  id: string;
  name: string;
  name_key: string;
  description: string;
  structure_json: TemplateStructure;
  use_case: string;
  email_count: number;
  total_days: number;
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

// ==============================================
// ZOD SCHEMAS FOR VALIDATION
// ==============================================

/**
 * Template email schema
 */
export const templateEmailSchema = z.object({
  position: z.number().int().positive(),
  context: z.string().min(1),
  emailMode: z.enum(["initial", "follow-up"]),
});

/**
 * Template delay schema
 */
export const templateDelaySchema = z.object({
  afterEmail: z.number().int().positive(),
  days: z.number().int().positive(),
});

/**
 * Template structure schema
 */
export const templateStructureSchema = z.object({
  emails: z.array(templateEmailSchema).min(1),
  delays: z.array(templateDelaySchema),
});

/**
 * Full campaign template schema
 */
export const campaignTemplateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  nameKey: z.string().min(1).max(50),
  description: z.string().min(1),
  structureJson: templateStructureSchema,
  useCase: z.string().min(1).max(100),
  emailCount: z.number().int().positive(),
  totalDays: z.number().int().positive(),
  isActive: z.boolean(),
  displayOrder: z.number().int().min(0),
  createdAt: z.string(),
  updatedAt: z.string(),
});

// ==============================================
// HELPER FUNCTIONS
// ==============================================

/**
 * Transform database row to CampaignTemplate
 * Converts snake_case to camelCase
 */
export function transformTemplateRow(
  row: CampaignTemplateRow
): CampaignTemplate {
  return {
    id: row.id,
    name: row.name,
    nameKey: row.name_key,
    description: row.description,
    structureJson: row.structure_json,
    useCase: row.use_case,
    emailCount: row.email_count,
    totalDays: row.total_days,
    isActive: row.is_active,
    displayOrder: row.display_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Validate template structure_json
 * Returns true if valid, false otherwise
 */
export function isValidTemplateStructure(
  structure: unknown
): structure is TemplateStructure {
  const result = templateStructureSchema.safeParse(structure);
  return result.success;
}
