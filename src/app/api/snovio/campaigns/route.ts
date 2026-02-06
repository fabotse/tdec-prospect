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
import { createClient } from "@/lib/supabase/server";
import { decryptApiKey } from "@/lib/crypto/encryption";
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

    const supabase = await createClient();
    const { data: config } = await supabase
      .from("api_configs")
      .select("encrypted_key")
      .eq("tenant_id", profile.tenant_id)
      .eq("service_name", "snovio")
      .single();

    if (!config) {
      return NextResponse.json(
        { error: "Credenciais do Snov.io não configuradas" },
        { status: 404 }
      );
    }

    const credentials = decryptApiKey(config.encrypted_key);
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
