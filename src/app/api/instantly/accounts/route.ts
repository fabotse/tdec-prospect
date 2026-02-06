/**
 * Instantly Accounts API Route
 * Story 7.4: Export Dialog UI com Preview de Variáveis
 *
 * GET /api/instantly/accounts — List sending accounts configured in Instantly
 * AC: #4 - Sending account selection for campaign export
 */

import { NextResponse } from "next/server";
import { getCurrentUserProfile } from "@/lib/supabase/tenant";
import { createClient } from "@/lib/supabase/server";
import { decryptApiKey } from "@/lib/crypto/encryption";
import { InstantlyService } from "@/lib/services/instantly";
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
    const result = await service.listAccounts({ apiKey });

    return NextResponse.json(result.accounts);
  } catch (error) {
    if (error instanceof ExternalServiceError) {
      return NextResponse.json(
        { error: error.userMessage },
        { status: error.statusCode || 502 }
      );
    }

    return NextResponse.json(
      { error: "Erro interno ao listar contas de envio" },
      { status: 500 }
    );
  }
}
