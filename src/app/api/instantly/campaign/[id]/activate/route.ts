/**
 * Instantly Campaign Activate API Route
 * Story 7.2: Instantly Integration Service - Gestão de Campanhas
 *
 * POST /api/instantly/campaign/[id]/activate — Activate a campaign in Instantly
 * AC: #1 - Proxied via API route with tenant auth
 * AC: #4 - Activate campaign
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserProfile } from "@/lib/supabase/tenant";
import { createClient } from "@/lib/supabase/server";
import { decryptApiKey } from "@/lib/crypto/encryption";
import { InstantlyService } from "@/lib/services/instantly";
import { ExternalServiceError } from "@/lib/services/base-service";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const profile = await getCurrentUserProfile();

    if (!profile) {
      return NextResponse.json(
        { error: "Não autenticado" },
        { status: 401 }
      );
    }

    const { id: campaignId } = await params;

    const supabase = await createClient();
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
    const service = new InstantlyService();
    const result = await service.activateCampaign({ apiKey, campaignId });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ExternalServiceError) {
      return NextResponse.json(
        { error: error.userMessage, details: error.details },
        { status: error.statusCode || 502 }
      );
    }

    const errorMsg =
      error instanceof Error ? error.message : "Erro desconhecido";
    return NextResponse.json(
      { error: `Erro interno ao ativar campanha: ${errorMsg}` },
      { status: 500 }
    );
  }
}
