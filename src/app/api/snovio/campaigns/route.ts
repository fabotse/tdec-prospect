/**
 * Snov.io Campaigns API Route
 * Story 7.3: Snov.io Integration Service - Gestão de Campanhas
 *
 * GET /api/snovio/campaigns — List existing campaigns from Snov.io
 * AC: #1 - Proxied via API route with tenant auth
 * AC: #4 - List user campaigns
 */

import { NextResponse } from "next/server";
import { getCurrentUserProfile } from "@/lib/supabase/tenant";
import { getInjectableServiceApiKey } from "@/lib/agent/service-keys";
import { SnovioService } from "@/lib/services/snovio";
import { ExternalServiceError } from "@/lib/services/base-service";

export async function GET() {
  try {
    const profile = await getCurrentUserProfile();

    if (!profile) {
      return NextResponse.json(
        { error: "Não autenticado" },
        { status: 401 }
      );
    }

    const credentials = await getInjectableServiceApiKey(
      profile.tenant_id,
      "snovio",
      "Snov.io"
    );

    if (!credentials) {
      return NextResponse.json(
        { error: "Credenciais do Snov.io não configuradas" },
        { status: 404 }
      );
    }
    const service = new SnovioService();
    const result = await service.getUserCampaigns({ credentials });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ExternalServiceError) {
      return NextResponse.json(
        { error: error.userMessage },
        { status: error.statusCode || 502 }
      );
    }

    return NextResponse.json(
      { error: "Erro interno ao listar campanhas" },
      { status: 500 }
    );
  }
}
