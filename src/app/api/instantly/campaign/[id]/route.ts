/**
 * Instantly Campaign Status API Route
 * Story 7.2: Instantly Integration Service - Gestão de Campanhas
 *
 * GET /api/instantly/campaign/[id] — Get campaign status from Instantly
 * AC: #1 - Proxied via API route with tenant auth
 * AC: #4 - Get campaign status
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserProfile } from "@/lib/supabase/tenant";
import { getInjectableServiceApiKey } from "@/lib/agent/service-keys";
import { InstantlyService } from "@/lib/services/instantly";
import { ExternalServiceError } from "@/lib/services/base-service";

export async function GET(
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

    const apiKey = await getInjectableServiceApiKey(
      profile.tenant_id,
      "instantly",
      "Instantly"
    );

    if (!apiKey) {
      return NextResponse.json(
        { error: "API key do Instantly não configurada" },
        { status: 404 }
      );
    }
    const service = new InstantlyService();
    const result = await service.getCampaignStatus({ apiKey, campaignId });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ExternalServiceError) {
      return NextResponse.json(
        { error: error.userMessage },
        { status: error.statusCode || 502 }
      );
    }

    return NextResponse.json(
      { error: "Erro interno ao obter status da campanha" },
      { status: 500 }
    );
  }
}
