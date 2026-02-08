/**
 * Instantly Campaign Accounts API Route
 * Story 7.5: Export to Instantly - Fluxo Completo
 *
 * POST /api/instantly/campaign/[id]/accounts — Associate sending accounts with a campaign
 * AC: #1 - Sending accounts linked to campaign before activation
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserProfile } from "@/lib/supabase/tenant";
import { createClient } from "@/lib/supabase/server";
import { decryptApiKey } from "@/lib/crypto/encryption";
import { InstantlyService } from "@/lib/services/instantly";
import { ExternalServiceError } from "@/lib/services/base-service";

export async function POST(
  request: NextRequest,
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

    const body = await request.json();
    const { accountEmails } = body;

    if (!Array.isArray(accountEmails) || accountEmails.length === 0) {
      return NextResponse.json(
        { error: "accountEmails deve ser um array com pelo menos 1 email" },
        { status: 400 }
      );
    }

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
    const result = await service.addAccountsToCampaign({
      apiKey,
      campaignId,
      accountEmails,
    });

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
      { error: `Erro interno ao associar accounts à campanha: ${errorMsg}` },
      { status: 500 }
    );
  }
}
