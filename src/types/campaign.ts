import { z } from "zod";
import type { ExportStatus, RemoteExportPlatform } from "@/types/export";

// ==============================================
// STATUS TYPES
// ==============================================

/**
 * Campaign status matches database enum
 */
export const campaignStatusValues = [
  "draft",
  "active",
  "paused",
  "completed",
] as const;

export type CampaignStatus = (typeof campaignStatusValues)[number];

/**
 * UI-friendly status labels (Portuguese)
 */
export const campaignStatusLabels: Record<CampaignStatus, string> = {
  draft: "Rascunho",
  active: "Ativa",
  paused: "Pausada",
  completed: "Concluida",
};

/**
 * Status badge color variants
 */
export type CampaignStatusVariant =
  | "secondary"
  | "success"
  | "warning"
  | "default";

export const campaignStatusVariants: Record<
  CampaignStatus,
  CampaignStatusVariant
> = {
  draft: "secondary",
  active: "success",
  paused: "warning",
  completed: "default",
};

/**
 * Status configuration with label and color variant
 */
export interface CampaignStatusConfig {
  value: CampaignStatus;
  label: string;
  variant: CampaignStatusVariant;
}

/**
 * Get status configuration by value
 */
export function getCampaignStatusConfig(
  status: CampaignStatus
): CampaignStatusConfig {
  return {
    value: status,
    label: campaignStatusLabels[status],
    variant: campaignStatusVariants[status],
  };
}

// ==============================================
// CAMPAIGN INTERFACES
// ==============================================

/**
 * Campaign entity from database (camelCase)
 */
export interface Campaign {
  id: string;
  tenantId: string;
  name: string;
  status: CampaignStatus;
  productId: string | null;
  createdAt: string;
  updatedAt: string;
  externalCampaignId: string | null;
  exportPlatform: RemoteExportPlatform | null;
  exportedAt: string | null;
  exportStatus: ExportStatus | null;
}

/**
 * Campaign with lead count for listing
 */
export interface CampaignWithCount extends Campaign {
  leadCount: number;
  productName?: string | null;
}

/**
 * Database row type (snake_case)
 */
export interface CampaignRow {
  id: string;
  tenant_id: string;
  name: string;
  status: CampaignStatus;
  product_id: string | null;
  created_at: string;
  updated_at: string;
  external_campaign_id: string | null;
  export_platform: RemoteExportPlatform | null;
  exported_at: string | null;
  export_status: ExportStatus | null;
}

/**
 * Database row with lead count
 */
export interface CampaignRowWithCount extends CampaignRow {
  lead_count: number;
  product_name?: string | null;
}

/**
 * Transform database row to Campaign interface
 */
export function transformCampaignRow(row: CampaignRow): Campaign {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    status: row.status,
    productId: row.product_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    externalCampaignId: row.external_campaign_id ?? null,
    exportPlatform: row.export_platform ?? null,
    exportedAt: row.exported_at ?? null,
    exportStatus: row.export_status ?? null,
  };
}

/**
 * Transform database row with count to CampaignWithCount
 */
export function transformCampaignRowWithCount(
  row: CampaignRowWithCount
): CampaignWithCount {
  return {
    ...transformCampaignRow(row),
    leadCount: Number(row.lead_count) || 0,
    productName: row.product_name ?? null,
  };
}

// ==============================================
// ZOD SCHEMAS
// ==============================================

/**
 * Schema for creating a campaign
 */
export const createCampaignSchema = z.object({
  name: z.string().min(1, "Nome e obrigatorio").max(200, "Nome muito longo"),
});

export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;

/**
 * Schema for updating a campaign
 */
export const updateCampaignSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  status: z.enum(campaignStatusValues).optional(),
  productId: z.string().uuid().nullable().optional(),
});

export type UpdateCampaignInput = z.infer<typeof updateCampaignSchema>;

// ==============================================
// CAMPAIGN-LEAD ASSOCIATION
// ==============================================

/**
 * Campaign-Lead association
 */
export interface CampaignLead {
  id: string;
  campaignId: string;
  leadId: string;
  addedAt: string;
}

/**
 * Database row type for campaign_leads
 */
export interface CampaignLeadRow {
  id: string;
  campaign_id: string;
  lead_id: string;
  added_at: string;
}

/**
 * Transform campaign_lead row to CampaignLead interface
 */
export function transformCampaignLeadRow(row: CampaignLeadRow): CampaignLead {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    leadId: row.lead_id,
    addedAt: row.added_at,
  };
}
