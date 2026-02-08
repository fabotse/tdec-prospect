/**
 * Campaign Export Status API Route
 * Story 7.5: Export to Instantly - Fluxo Completo
 *
 * PUT /api/campaigns/[campaignId]/export-status — Update export tracking fields
 * AC: #5 - Persist export link (externalCampaignId, platform, timestamp, status)
 *
 * Supports:
 * - Normal update: { externalCampaignId, exportPlatform, exportedAt, exportStatus }
 * - Clear for re-export: { clear: true }
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";
import { updateExportStatus, clearExportStatus } from "@/lib/services/campaign-export-repository";

interface RouteParams {
  params: Promise<{ campaignId: string }>;
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const exportStatusSchema = z.union([
  z.object({
    clear: z.literal(true),
  }),
  z.object({
    externalCampaignId: z.string().optional(),
    exportPlatform: z.enum(["instantly", "snovio"]).optional(),
    exportedAt: z.string().optional(),
    exportStatus: z.enum(["pending", "success", "partial_failure", "failed"]).optional(),
  }),
]);

/**
 * PUT /api/campaigns/[campaignId]/export-status
 * Update or clear export tracking fields
 *
 * @returns 200 { success: true }
 * @returns 401 if not authenticated
 * @returns 400 if invalid body or campaignId
 * @returns 500 on database error
 */
export async function PUT(request: Request, { params }: RouteParams) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "Não autenticado" },
      { status: 401 }
    );
  }

  const { campaignId } = await params;

  if (!UUID_REGEX.test(campaignId)) {
    return NextResponse.json(
      { error: "ID de campanha inválido" },
      { status: 400 }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Body JSON inválido" },
      { status: 400 }
    );
  }

  const parsed = exportStatusSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados inválidos", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const data = parsed.data;

  if ("clear" in data && data.clear) {
    const { error } = await clearExportStatus(supabase, campaignId);
    if (error) {
      return NextResponse.json(
        { error: "Erro ao limpar status de exportação" },
        { status: 500 }
      );
    }
    return NextResponse.json({ success: true });
  }

  const { error } = await updateExportStatus(supabase, campaignId, data);
  if (error) {
    return NextResponse.json(
      { error: "Erro ao atualizar status de exportação" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
