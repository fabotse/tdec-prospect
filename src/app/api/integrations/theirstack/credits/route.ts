/**
 * theirStack Credits API Route
 * Story: 15.1 - Integracao theirStack: Configuracao, Teste e Credits
 *
 * GET /api/integrations/theirstack/credits
 * Returns credit balance from theirStack API.
 *
 * AC: #3 - Display credits utilizados vs disponiveis
 */

import { NextResponse } from "next/server";
import { getCurrentUserProfile } from "@/lib/supabase/tenant";
import { createClient } from "@/lib/supabase/server";
import { decryptApiKey } from "@/lib/crypto/encryption";
import { TheirStackService } from "@/lib/services/theirstack";
import type { TheirStackCredits } from "@/types/theirstack";

// ==============================================
// GET /api/integrations/theirstack/credits
// ==============================================

export async function GET() {
  try {
    // 1. Check authentication
    const profile = await getCurrentUserProfile();

    if (!profile) {
      return NextResponse.json(
        { error: "Não autenticado" },
        { status: 401 }
      );
    }

    // 2. Check admin role
    if (profile.role !== "admin") {
      return NextResponse.json(
        { error: "Apenas administradores podem acessar dados de credits" },
        { status: 403 }
      );
    }

    // 3. Fetch encrypted key from database
    const supabase = await createClient();
    const { data: config, error: fetchError } = await supabase
      .from("api_configs")
      .select("encrypted_key")
      .eq("tenant_id", profile.tenant_id)
      .eq("service_name", "theirstack")
      .single();

    if (fetchError || !config) {
      return NextResponse.json(
        { error: "API key do theirStack não configurada" },
        { status: 404 }
      );
    }

    // 4. Decrypt API key
    let apiKey: string;
    try {
      apiKey = decryptApiKey(config.encrypted_key);
    } catch {
      return NextResponse.json(
        { error: "Erro ao descriptografar API key. Reconfigure a chave." },
        { status: 500 }
      );
    }

    // 5. Get credits
    const service = new TheirStackService();
    const credits: TheirStackCredits = await service.getCredits(apiKey);

    return NextResponse.json({ data: credits });
  } catch {
    return NextResponse.json(
      { error: "Erro interno ao buscar credits" },
      { status: 500 }
    );
  }
}
