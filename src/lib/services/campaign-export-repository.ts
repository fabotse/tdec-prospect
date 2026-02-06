/**
 * Campaign Export Repository
 * Story 7.3.1: Persistência de Campanhas Exportadas no Banco
 *
 * AC: #2 - Update export fields after successful export
 * AC: #3 - Detect previous exports for idempotency
 *
 * Repository pattern: receives supabaseClient as parameter (same as server actions).
 * Caller is responsible for passing an authenticated client.
 */

import type { ExportRecord, ExportStatus, RemoteExportPlatform } from "@/types/export";

interface ExportStatusUpdate {
  externalCampaignId?: string;
  exportPlatform?: RemoteExportPlatform;
  exportedAt?: string;
  exportStatus?: ExportStatus;
}

interface SupabaseClient {
  from: (table: string) => {
    update: (data: Record<string, unknown>) => {
      eq: (column: string, value: string) => PromiseLike<{ data: unknown; error: unknown }>;
    };
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        single: () => PromiseLike<{ data: Record<string, unknown> | null; error: unknown }>;
        maybeSingle: () => PromiseLike<{ data: Record<string, unknown> | null; error: unknown }>;
      } & {
        eq: (column: string, value: string) => {
          maybeSingle: () => PromiseLike<{ data: Record<string, unknown> | null; error: unknown }>;
        };
      };
    };
  };
}

/**
 * Updates export tracking fields on a campaign (AC: #2).
 * Only sends provided fields — supports partial updates.
 */
export async function updateExportStatus(
  client: SupabaseClient,
  campaignId: string,
  data: ExportStatusUpdate
): Promise<{ data: unknown; error: unknown }> {
  const updatePayload: Record<string, unknown> = {};

  if (data.externalCampaignId !== undefined) {
    updatePayload.external_campaign_id = data.externalCampaignId;
  }
  if (data.exportPlatform !== undefined) {
    updatePayload.export_platform = data.exportPlatform;
  }
  if (data.exportedAt !== undefined) {
    updatePayload.exported_at = data.exportedAt;
  }
  if (data.exportStatus !== undefined) {
    updatePayload.export_status = data.exportStatus;
  }

  if (Object.keys(updatePayload).length === 0) {
    return { data: null, error: null };
  }

  return client
    .from("campaigns")
    .update(updatePayload)
    .eq("id", campaignId);
}

const EXPORT_SELECT_COLUMNS =
  "id, external_campaign_id, export_platform, exported_at, export_status";

function toExportRecord(row: Record<string, unknown>): ExportRecord {
  return {
    campaignId: row.id as string,
    externalCampaignId: (row.external_campaign_id as string) ?? null,
    exportPlatform: (row.export_platform as RemoteExportPlatform) ?? null,
    exportedAt: (row.exported_at as string) ?? null,
    exportStatus: (row.export_status as ExportStatus) ?? null,
  };
}

/**
 * Returns the export record for a campaign (AC: #2).
 */
export async function getExportRecord(
  client: SupabaseClient,
  campaignId: string
): Promise<{ data: ExportRecord | null; error: unknown }> {
  const result = await client
    .from("campaigns")
    .select(EXPORT_SELECT_COLUMNS)
    .eq("id", campaignId)
    .single();

  if (result.error || !result.data) {
    return { data: null, error: result.error };
  }

  return { data: toExportRecord(result.data), error: null };
}

/**
 * Finds a campaign by its external ID and platform (AC: #3).
 * Used for duplicate detection / idempotency.
 */
export async function findByExternalId(
  client: SupabaseClient,
  externalCampaignId: string,
  platform: RemoteExportPlatform
): Promise<{ data: ExportRecord | null; error: unknown }> {
  const result = await client
    .from("campaigns")
    .select(EXPORT_SELECT_COLUMNS)
    .eq("external_campaign_id", externalCampaignId)
    .eq("export_platform", platform)
    .maybeSingle();

  if (result.error || !result.data) {
    return { data: result.data as null, error: result.error };
  }

  return { data: toExportRecord(result.data), error: null };
}

/**
 * Quick check: has this campaign been exported before? (AC: #3)
 * Returns { exported, error } so callers can distinguish "never exported" from "DB error".
 */
export async function hasBeenExported(
  client: SupabaseClient,
  campaignId: string
): Promise<{ exported: boolean; error: unknown }> {
  const result = await client
    .from("campaigns")
    .select("external_campaign_id")
    .eq("id", campaignId)
    .single();

  if (result.error) {
    return { exported: false, error: result.error };
  }

  if (!result.data) {
    return { exported: false, error: null };
  }

  return { exported: result.data.external_campaign_id != null, error: null };
}

/**
 * Clears all export fields — used for re-export as new campaign (AC: #3).
 */
export async function clearExportStatus(
  client: SupabaseClient,
  campaignId: string
): Promise<{ data: unknown; error: unknown }> {
  return client
    .from("campaigns")
    .update({
      external_campaign_id: null,
      export_platform: null,
      exported_at: null,
      export_status: null,
    })
    .eq("id", campaignId);
}
