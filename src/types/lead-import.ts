/**
 * Lead CSV Import Types
 * Story 12.2: Import Leads via CSV
 *
 * AC: #6 - Processing and lead creation
 * AC: #7 - Import summary
 */

import { z } from "zod";

/**
 * Single lead row after column mapping
 * AC: #6 - Mapped lead data for import
 */
export interface ImportLeadRow {
  firstName: string;
  lastName: string;
  email: string | null;
  companyName: string | null;
  title: string | null;
  linkedinUrl: string | null;
  phone: string | null;
}

/**
 * Import response summary
 * AC: #7 - Summary with counts
 */
export interface ImportLeadsResponse {
  imported: number;
  existing: number;
  errors: string[];
  leads: unknown[];
}

/**
 * Zod schema for a single import lead row
 * AC: #6 - Validation
 */
export const importLeadSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().optional().default(""),
  email: z.string().email().optional().nullable(),
  companyName: z.string().optional().nullable(),
  title: z.string().optional().nullable(),
  linkedinUrl: z.string().url().optional().nullable(),
  phone: z.string().optional().nullable(),
});

/**
 * Zod schema for the import CSV request body
 * AC: #6 - Request validation
 */
export const importLeadsCsvBodySchema = z.object({
  leads: z.array(importLeadSchema).min(1).max(1000),
  segmentId: z.string().uuid().optional().nullable(),
});

export type ImportLeadsCsvBody = z.infer<typeof importLeadsCsvBodySchema>;
