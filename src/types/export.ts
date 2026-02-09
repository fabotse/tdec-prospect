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

// ==============================================
// DEPLOYMENT TYPES (Story 7.5: AC #1, #3, #4, #5)
// ==============================================

/**
 * Step identifiers for the deployment orchestration pipeline
 * Story 7.5: AC #1 - Sequential deployment steps
 */
export type DeploymentStepId =
  | "validate"
  | "create_campaign"
  | "add_accounts"
  | "add_leads"
  | "activate"
  | "persist";

/**
 * A single step in the deployment pipeline with status tracking
 * Story 7.5: AC #1 - Progress indicator with current step
 * Story 7.8: AC #3 - errorInfo for structured error metadata
 */
export interface DeploymentStep {
  id: DeploymentStepId;
  label: string;
  status: "pending" | "running" | "success" | "failed" | "skipped";
  error?: string;
  detail?: string;
  /** Story 7.8: Structured error info with friendly message, retry/fallback flags */
  errorInfo?: import("@/lib/export/error-messages").ExportErrorInfo;
}

/**
 * Result of a complete deployment operation
 * Story 7.5: AC #2, #3, #5 - Success/failure with details
 */
export interface DeploymentResult {
  success: boolean;
  externalCampaignId?: string;
  leadsUploaded?: number;
  duplicatedLeads?: number;
  steps: DeploymentStep[];
  error?: string;
}

/**
 * Result of pre-deploy validation
 * Story 7.5: AC #4 - Blocking errors and non-blocking warnings
 */
export interface PreDeployValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// ==============================================
// EXPORT CONFIG TYPES (Story 7.5: moved from ExportDialog)
// ==============================================

/**
 * Lead selection mode for export
 * Story 7.4/7.5: "all" exports all campaign leads, "selected" exports a subset
 */
export type LeadSelection = "all" | "selected";

/**
 * Export mode: new campaign, re-export, or update existing
 * Story 7.4/7.5: Controls deployment flow
 */
export type ExportMode = "new" | "re-export" | "update";

/**
 * Configuration collected by ExportDialog for deployment
 * Story 7.4/7.5: Passed from dialog to deployment hook
 */
export interface ExportConfig {
  campaignId: string;
  platform: ExportPlatform;
  sendingAccounts?: string[];
  leadSelection: LeadSelection;
  exportMode: ExportMode;
  /** External campaign ID for update mode (from previous export) */
  externalCampaignId?: string;
  /** Story 7.7 AC #2: CSV export mode — resolved (real data) or with_variables (templates) */
  csvMode?: "resolved" | "with_variables";
}

// ==============================================
// EXPORT DIALOG TYPES (Story 7.4: AC #1, #2)
// ==============================================

/**
 * Connection status for a platform in the export dialog
 * Story 7.4: AC #1 - Status badge per platform
 */
export type PlatformConnectionStatus = "connected" | "configured" | "not_configured" | "error";

/**
 * Platform option displayed in the export dialog
 * Story 7.4: AC #1 - Export platform card with status
 */
export interface ExportDialogPlatformOption {
  /** Target platform */
  platform: ExportPlatform;
  /** Display name in PT-BR (e.g., "Instantly", "Snov.io", "CSV", "Clipboard") */
  displayName: string;
  /** Whether integration is configured */
  configured: boolean;
  /** Connection status for badge display */
  connectionStatus: PlatformConnectionStatus;
  /** Previous export record if campaign was exported to this platform */
  exportRecord: ExportRecord | null;
}

/**
 * Summary of leads for export preview
 * Story 7.4: AC #2, #3 - Lead count breakdown
 */
export interface LeadExportSummary {
  /** Total leads in the campaign */
  totalLeads: number;
  /** Leads with valid email (eligible for export) */
  leadsWithEmail: number;
  /** Leads without email (excluded from export) */
  leadsWithoutEmail: number;
  /** Leads without icebreaker (warning only) */
  leadsWithoutIcebreaker: number;
}
