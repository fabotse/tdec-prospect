/**
 * Email Block Types
 * Story 5.3: Email Block Component
 *
 * Types for email blocks in campaign sequences.
 */

import { z } from "zod";

// ==============================================
// EMAIL BLOCK INTERFACES
// ==============================================

/**
 * Email block entity from database (camelCase)
 */
export interface EmailBlock {
  id: string;
  campaignId: string;
  position: number;
  subject: string | null;
  body: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Database row type (snake_case)
 */
export interface EmailBlockRow {
  id: string;
  campaign_id: string;
  position: number;
  subject: string | null;
  body: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Transform database row to EmailBlock interface
 */
export function transformEmailBlockRow(row: EmailBlockRow): EmailBlock {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    position: row.position,
    subject: row.subject,
    body: row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Data structure for email block in BuilderBlock.data
 * Used in useBuilderStore
 */
export interface EmailBlockData {
  subject: string;
  body: string;
}

/**
 * Default data for new email blocks
 */
export const DEFAULT_EMAIL_BLOCK_DATA: EmailBlockData = {
  subject: "",
  body: "",
};

// ==============================================
// ZOD SCHEMAS
// ==============================================

/**
 * Schema for email block data
 */
export const emailBlockDataSchema = z.object({
  subject: z.string().max(200, "Assunto muito longo"),
  body: z.string().max(50000, "Conteudo muito longo"),
});

export type EmailBlockDataInput = z.infer<typeof emailBlockDataSchema>;

/**
 * Schema for creating an email block
 */
export const createEmailBlockSchema = z.object({
  campaignId: z.string().uuid("ID de campanha invalido"),
  position: z.number().int().min(0),
  subject: z.string().max(200).optional(),
  body: z.string().optional(),
});

export type CreateEmailBlockInput = z.infer<typeof createEmailBlockSchema>;

/**
 * Schema for updating an email block
 */
export const updateEmailBlockSchema = z.object({
  position: z.number().int().min(0).optional(),
  subject: z.string().max(200).optional(),
  body: z.string().optional(),
});

export type UpdateEmailBlockInput = z.infer<typeof updateEmailBlockSchema>;
