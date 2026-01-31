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
 * Status badge variants for UI
 */
export const leadStatusVariants: Record<
  LeadStatus,
  "default" | "secondary" | "success" | "warning" | "destructive"
> = {
  novo: "secondary",
  em_campanha: "default",
  interessado: "success",
  oportunidade: "success",
  nao_interessado: "destructive",
};

// ==============================================
// LEAD INTERFACES
// ==============================================

/**
 * Main Lead interface (camelCase for TypeScript)
 * AC: #3, #6 - Lead data structure
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
  status: LeadStatus;
  createdAt: string;
  updatedAt: string;
}

/**
 * Database row type (snake_case, for internal use)
 * Matches database schema exactly
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
  status: LeadStatus;
  created_at: string;
  updated_at: string;
}

// ==============================================
// TRANSFORM FUNCTIONS
// ==============================================

/**
 * Transform database row to Lead interface
 * Converts snake_case to camelCase
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
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
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
