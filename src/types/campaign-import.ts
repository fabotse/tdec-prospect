/**
 * Campaign Import Types
 * Story: 4.7 - Import Campaign Results
 *
 * Types for importing campaign results from external tools (Instantly, Snov.io, etc.)
 * to update lead status based on email responses.
 */

import { z } from "zod";
import type { LeadStatus } from "@/types/lead";

// ==============================================
// RESPONSE TYPE ENUM
// ==============================================

/**
 * Response types from campaign tools
 * AC: #4, #5 - Response type mapping
 */
export const responseTypeValues = [
  "replied",
  "clicked",
  "opened",
  "bounced",
  "unsubscribed",
  "unknown",
] as const;

export type ResponseType = (typeof responseTypeValues)[number];

/**
 * UI-friendly response type labels (Portuguese)
 * AC: #4 - Display labels for mapping UI
 */
export const responseTypeLabels: Record<ResponseType, string> = {
  replied: "Respondeu",
  clicked: "Clicou",
  opened: "Abriu",
  bounced: "Bounce",
  unsubscribed: "Descadastrou",
  unknown: "Desconhecido",
};

// ==============================================
// RESPONSE TO STATUS MAPPING
// ==============================================

/**
 * Mapping response type to lead status
 * AC: #5 - Status update logic
 * - replied -> "interessado"
 * - clicked -> null (no status change, just log)
 * - opened -> null (no status change, just log)
 * - bounced -> "nao_interessado"
 * - unsubscribed -> "nao_interessado"
 * - unknown -> null (no status change, just log)
 */
export const responseToStatus: Record<ResponseType, LeadStatus | null> = {
  replied: "interessado",
  clicked: null,
  opened: null,
  bounced: "nao_interessado",
  unsubscribed: "nao_interessado",
  unknown: null,
};

/**
 * Get the status change for a response type
 * Returns null if no status change should occur
 */
export function getStatusForResponse(
  responseType: ResponseType
): LeadStatus | null {
  return responseToStatus[responseType];
}

// ==============================================
// IMPORT ROW INTERFACES
// ==============================================

/**
 * Single import row after parsing
 * AC: #4, #5 - Parsed data structure
 */
export interface CampaignResultRow {
  email: string;
  responseType: ResponseType;
  originalData?: Record<string, string>;
}

/**
 * Parsed CSV/TSV data structure
 * AC: #2, #3 - Data after parsing
 */
export interface ParsedImportData {
  headers: string[];
  rows: string[][];
}

/**
 * Column mapping configuration
 * AC: #4 - User-defined column mapping
 */
export interface ColumnMapping {
  emailColumn: number;
  responseColumn: number;
}

// ==============================================
// ZOD SCHEMAS
// ==============================================

/**
 * Single result row schema
 * AC: #8 - Validation
 */
export const campaignResultRowSchema = z.object({
  email: z.string().email("Email invalido"),
  responseType: z.enum(responseTypeValues),
});

/**
 * Import request schema
 * AC: #5 - Request validation
 */
export const importCampaignResultsSchema = z.object({
  results: z
    .array(campaignResultRowSchema)
    .min(1, "Pelo menos um resultado e necessario"),
  createMissingLeads: z.boolean().optional().default(false),
});

export type ImportCampaignResultsInput = z.infer<
  typeof importCampaignResultsSchema
>;

// ==============================================
// RESPONSE INTERFACES
// ==============================================

/**
 * Import processing result for a single row
 */
export interface ProcessedResult {
  email: string;
  status: "matched" | "updated" | "created" | "not_found" | "error";
  message?: string;
}

/**
 * Import response summary
 * AC: #6 - Summary display
 */
export interface ImportCampaignResultsResponse {
  matched: number;
  updated: number;
  unmatched: string[];
  errors: string[];
  created?: number;
}

// ==============================================
// FILE SIZE LIMITS
// ==============================================

/**
 * Maximum file size for CSV upload (5MB)
 * AC: #2 - File size limit
 */
export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
export const MAX_FILE_SIZE_MB = 5;
