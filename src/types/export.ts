/**
 * Export & Personalization Variable Types
 * Story 7.1: Sistema de Variáveis de Personalização para Exportação
 *
 * Types for personalization variables, platform mappings, and export functionality.
 */

// ==============================================
// PLATFORM TYPES (AC: #5)
// ==============================================

/**
 * Supported export platforms
 * Story 7.1: AC #5 - Platform mapping support
 */
export type ExportPlatform = "instantly" | "snovio" | "csv" | "clipboard";

// ==============================================
// PERSONALIZATION VARIABLE TYPES (AC: #1)
// ==============================================

/**
 * A personalization variable definition
 * Story 7.1: AC #1 - Variable registry entry
 *
 * Maps a template variable (e.g., {{first_name}}) to a Lead field (e.g., firstName)
 */
export interface PersonalizationVariable {
  /** Variable name used in templates, e.g., "first_name" */
  name: string;
  /** Display label for UI, e.g., "Nome" */
  label: string;
  /** Corresponding field name on Lead interface, e.g., "firstName" */
  leadField: string;
  /** Template syntax, e.g., "{{first_name}}" */
  template: string;
  /** Label shown in preview placeholders, e.g., "Nome personalizado para cada lead" */
  placeholderLabel: string;
}

/**
 * Mapping of a variable to a specific platform format
 * Story 7.1: AC #5 - Platform-specific variable format
 */
export interface VariableMapping {
  /** Original variable name, e.g., "first_name" */
  variableName: string;
  /** Platform-specific tag format, e.g., "{{firstName}}" for Snov.io */
  platformTag: string;
}

/**
 * Complete platform mapping with all variable mappings
 * Story 7.1: AC #5 - Per-platform mapping result
 */
export interface PlatformMapping {
  /** Target platform */
  platform: ExportPlatform;
  /** Variable mappings for this platform */
  mappings: VariableMapping[];
}

// ==============================================
// RESOLVE TYPES (AC: #4)
// ==============================================

/**
 * Input for resolving email variables
 * Story 7.1: AC #4 - Template + lead for resolution
 */
export interface ResolveEmailInput {
  /** Email subject template with {{variables}} */
  subject: string;
  /** Email body template with {{variables}} */
  body: string;
}

/**
 * Output of resolved email variables
 * Story 7.1: AC #4 - Resolved email content
 */
export interface ResolveEmailOutput {
  /** Resolved email subject */
  subject: string;
  /** Resolved email body */
  body: string;
}

// ==============================================
// EXPORT TRACKING TYPES (Story 7.3.1: AC #4)
// ==============================================

/**
 * Valid export status values for remote platform exports.
 * Matches CHECK constraint in migration 00037.
 */
export type ExportStatus = "pending" | "success" | "partial_failure" | "failed";

/**
 * Valid remote export platforms (subset of ExportPlatform that persists to DB).
 * csv/clipboard are local-only exports — no tracking needed.
 */
export type RemoteExportPlatform = "instantly" | "snovio";

/**
 * Export record extracted from campaign fields.
 * Convenience type for export-related queries.
 */
export interface ExportRecord {
  campaignId: string;
  externalCampaignId: string | null;
  exportPlatform: RemoteExportPlatform | null;
  exportedAt: string | null;
  exportStatus: ExportStatus | null;
}
