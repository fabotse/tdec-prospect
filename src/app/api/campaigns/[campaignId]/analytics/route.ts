/**
 * Campaign Analytics API Route
 * Story 10.3: Instantly Analytics Service (Polling)
 *
 * GET /api/campaigns/[campaignId]/analytics — Fetch analytics from Instantly
 * AC: #1 — CampaignAnalytics with totals and rates
 * AC: #4 — Error handling with Portuguese messages
 * AC: #5 — Error if campaign not exported
 */

import { NextResponse } from "next/server";
import { getCurrentUserProfile } from "@/lib/supabase/tenant";
import { createClient } from "@/lib/supabase/server";
import { decryptApiKey } from "@/lib/crypto/encryption";
import { TrackingService } from "@/lib/services/tracking";
import { ExternalServiceError } from "@/lib/services/base-service";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface RouteParams {
  params: Promise<{ campaignId: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const profile = await getCurrentUserProfile();
    if (!profile) {
      return NextResponse.json(
        { error: "Não autenticado" },
        { status: 401 }
      );
    }

    const { campaignId } = await params;

    if (!UUID_RE.test(campaignId)) {
      return NextResponse.json(
        { error: "ID de campanha inválido" },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Fetch campaign to get external_campaign_id
    const { data: campaign, error: campaignError } = await supabase
      .from("campaigns")
      .select("id, external_campaign_id")
      .eq("id", campaignId)
      .single();

    if (campaignError || !campaign) {
      return NextResponse.json(
        { error: "Campanha não encontrada" },
        { status: 404 }
      );
    }

    if (!campaign.external_campaign_id) {
      return NextResponse.json(
        { error: "Esta campanha ainda não foi exportada para o Instantly. Exporte a campanha primeiro." },
        { status: 400 }
      );
    }

    // Fetch API key
    const { data: config } = await supabase
      .from("api_configs")
      .select("encrypted_key")
      .eq("tenant_id", profile.tenant_id)
      .eq("service_name", "instantly")
      .single();

    if (!config) {
      return NextResponse.json(
        { error: "API key do Instantly não configurada" },
        { status: 404 }
      );
    }

    const apiKey = decryptApiKey(config.encrypted_key);
    const service = new TrackingService();
    const analytics = await service.getCampaignAnalytics({
      apiKey,
      externalCampaignId: campaign.external_campaign_id,
    });

    // Use local campaignId instead of external
    return NextResponse.json({
      data: { ...analytics, campaignId },
    });
  } catch (error) {
    if (error instanceof ExternalServiceError) {
      return NextResponse.json(
        { error: error.userMessage },
        { status: error.statusCode || 502 }
      );
    }

    return NextResponse.json(
      { error: "Erro interno ao buscar analytics" },
      { status: 500 }
    );
  }
}
