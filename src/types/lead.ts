/**
 * Lead Types
 * Story: 3.1 - Leads Page & Data Model
 *
 * Types for lead management and Apollo API integration.
 */

import { z } from "zod";

// ==============================================
// STATUS TYPES
// ==============================================

/**
 * Lead status matches database enum
 * AC: #3 - Status column with allowed values
 */
export const leadStatusValues = [
  "novo",
  "em_campanha",
  "interessado",
  "oportunidade",
  "nao_interessado",
] as const;

export type LeadStatus = (typeof leadStatusValues)[number];

/**
 * UI-friendly status labels (Portuguese)
 */
export const leadStatusLabels: Record<LeadStatus, string> = {
  novo: "Novo",
  em_campanha: "Em Campanha",
  interessado: "Interessado",
  oportunidade: "Oportunidade",
  nao_interessado: "Não Interessado",
};

/**
 * Status badge color variants for UI
 * Story 4.2: AC #5 - Status colors
 * - Novo: default/neutral (gray)
 * - Em Campanha: blue/primary
 * - Interessado: green/success
 * - Oportunidade: yellow/warning
 * - Não Interessado: red/destructive
 */
export type LeadStatusVariant =
  | "default"
  | "secondary"
  | "success"
  | "warning"
  | "destructive";

export const leadStatusVariants: Record<LeadStatus, LeadStatusVariant> = {
  novo: "default",
  em_campanha: "secondary",
  interessado: "success",
  oportunidade: "warning",
  nao_interessado: "destructive",
};

/**
 * Status configuration with label and color variant
 * Story 4.2: AC #1, #5 - Status display configuration
 */
export interface LeadStatusConfig {
  value: LeadStatus;
  label: string;
  variant: LeadStatusVariant;
}

/**
 * All available lead statuses with their configurations
 * Story 4.2: AC #2 - Status options for dropdown
 */
export const LEAD_STATUSES: LeadStatusConfig[] = leadStatusValues.map(
  (value) => ({
    value,
    label: leadStatusLabels[value],
    variant: leadStatusVariants[value],
  })
);

/**
 * Get status configuration by value
 * Story 4.2: Helper function for status display
 * @param status - Lead status value (defaults to "novo" if undefined/null)
 */
export function getStatusConfig(
  status: LeadStatus | undefined | null
): LeadStatusConfig {
  const safeStatus = status ?? "novo";
  return {
    value: safeStatus,
    label: leadStatusLabels[safeStatus],
    variant: leadStatusVariants[safeStatus],
  };
}

// ==============================================
// LEAD INTERFACES
// ==============================================

/**
 * Main Lead interface (camelCase for TypeScript)
 * AC: #3, #6 - Lead data structure
 * Story 3.5.1: Added hasEmail, hasDirectPhone for availability indicators
 * Story 4.2.1 Fix: Added _isImported for distinguishing DB leads from Apollo-only
 */
export interface Lead {
  id: string;
  tenantId: string;
  apolloId: string | null;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  companyName: string | null;
  companySize: string | null;
  industry: string | null;
  location: string | null;
  title: string | null;
  linkedinUrl: string | null;
  /** Story 4.4.1: URL da foto do lead obtida via Apollo People Enrichment */
  photoUrl: string | null;
  status: LeadStatus;
  hasEmail: boolean;
  hasDirectPhone: string | null;
  createdAt: string;
  updatedAt: string;
  /**
   * Runtime flag indicating if lead exists in database
   * Set by API after checking apollo_id against DB
   * undefined = not checked, true = exists in DB, false = Apollo-only
   */
  _isImported?: boolean;
}

/**
 * Database row type (snake_case, for internal use)
 * Matches database schema exactly
 * Story 3.5.1: Added has_email, has_direct_phone for availability indicators
 * Story 4.2.1 Fix: Added _is_imported for runtime tracking
 */
export interface LeadRow {
  id: string;
  tenant_id: string;
  apollo_id: string | null;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  company_name: string | null;
  company_size: string | null;
  industry: string | null;
  location: string | null;
  title: string | null;
  linkedin_url: string | null;
  /** Story 4.4.1: URL da foto do lead obtida via Apollo People Enrichment */
  photo_url: string | null;
  status: LeadStatus;
  has_email: boolean;
  has_direct_phone: string | null;
  created_at: string;
  updated_at: string;
  /**
   * Runtime flag (not in DB) - indicates if lead exists in database
   * Set by API after checking apollo_id against DB
   */
  _is_imported?: boolean;
}

// ==============================================
// TRANSFORM FUNCTIONS
// ==============================================

/**
 * Transform database row to Lead interface
 * Converts snake_case to camelCase
 * Story 3.5.1: Added hasEmail, hasDirectPhone mapping
 * Story 4.2.1 Fix: Respect _is_imported flag from API if set, otherwise default to true for DB leads
 */
export function transformLeadRow(row: LeadRow): Lead {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    apolloId: row.apollo_id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    phone: row.phone,
    companyName: row.company_name,
    companySize: row.company_size,
    industry: row.industry,
    location: row.location,
    title: row.title,
    linkedinUrl: row.linkedin_url,
    photoUrl: row.photo_url,
    status: row.status,
    hasEmail: row.has_email,
    hasDirectPhone: row.has_direct_phone,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    // Use _is_imported from row if explicitly set (Apollo search), otherwise true (DB query)
    _isImported: row._is_imported ?? true,
  };
}

// ==============================================
// ZOD SCHEMAS
// ==============================================

/**
 * Zod schema for creating a lead
 * AC: #3 - Validation for lead input
 */
export const createLeadSchema = z.object({
  firstName: z.string().min(1, "Nome é obrigatório"),
  lastName: z.string().optional(),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  phone: z.string().optional(),
  companyName: z.string().optional(),
  companySize: z.string().optional(),
  industry: z.string().optional(),
  location: z.string().optional(),
  title: z.string().optional(),
  linkedinUrl: z.string().url("URL inválida").optional().or(z.literal("")),
  apolloId: z.string().optional(),
});

export type CreateLeadInput = z.infer<typeof createLeadSchema>;

/**
 * Zod schema for updating a lead
 * All fields optional, plus status
 */
export const updateLeadSchema = createLeadSchema.partial().extend({
  status: z.enum(leadStatusValues).optional(),
});

export type UpdateLeadInput = z.infer<typeof updateLeadSchema>;

// ==============================================
// IMPORT TRACKING (Story 4.2.1)
// ==============================================

/**
 * Data structure for importing leads from Apollo to database
 * Story 4.2.1: AC #1 - Import mechanism
 */
export interface LeadDataForImport {
  apolloId: string;
  firstName: string;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  companyName?: string | null;
  companySize?: string | null;
  industry?: string | null;
  location?: string | null;
  title?: string | null;
  linkedinUrl?: string | null;
  hasEmail?: boolean;
  hasDirectPhone?: string | null;
}

/**
 * Check if a lead has been imported (exists in database)
 * Story 4.2.1: AC #3 - Import indicator logic
 *
 * Uses the _isImported flag set by API after checking apollo_id against DB.
 * This is more reliable than UUID checking because transformApolloToLeadRow
 * generates random UUIDs for all leads (for React key purposes).
 *
 * @param lead - Lead to check
 * @returns true if lead has been imported to database
 */
export function isLeadImported(lead: Lead): boolean {
  return lead._isImported === true;
}
