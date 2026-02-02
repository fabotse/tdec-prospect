/**
 * Campaign API Route - Single Campaign
 * Story 5.2: Campaign Builder Canvas
 *
 * AC: #1 - Rota do Builder (404 handling)
 *
 * GET /api/campaigns/[campaignId]
 * Get a single campaign by ID with lead count
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  transformCampaignRowWithCount,
  type CampaignRowWithCount,
} from "@/types/campaign";

interface RouteParams {
  params: Promise<{ campaignId: string }>;
}

/**
 * UUID v4 validation regex
 */
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/campaigns/[campaignId]
 * Get a single campaign by ID with lead count
 *
 * @returns Campaign data with leadCount
 * @returns 401 if not authenticated
 * @returns 400 if campaignId is not a valid UUID
 * @returns 404 if campaign not found
 * @returns 500 on database error
 */
export async function GET(_request: Request, { params }: RouteParams) {
  const supabase = await createClient();

  // Auth check
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Nao autenticado" } },
      { status: 401 }
    );
  }

  const { campaignId } = await params;

  // Validate UUID format
  if (!UUID_REGEX.test(campaignId)) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "ID de campanha invalido",
        },
      },
      { status: 400 }
    );
  }

  // Query campaign with lead count
  const { data, error } = await supabase
    .from("campaigns")
    .select(
      `
      *,
      lead_count:campaign_leads(count)
    `
    )
    .eq("id", campaignId)
    .single();

  if (error) {
    // PGRST116 = Row not found (PostgREST error code)
    if (error.code === "PGRST116") {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Campanha nao encontrada" } },
        { status: 404 }
      );
    }
    console.error("[Campaign API] GET single error:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro ao buscar campanha" } },
      { status: 500 }
    );
  }

  // Transform and flatten lead_count
  const leadCount = Array.isArray(data.lead_count)
    ? data.lead_count[0]?.count || 0
    : 0;

  const campaign = transformCampaignRowWithCount({
    ...data,
    lead_count: leadCount,
  } as CampaignRowWithCount);

  return NextResponse.json({ data: campaign });
}
