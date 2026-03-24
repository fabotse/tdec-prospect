/**
 * theirStack Connection Test API Route
 * Story: 15.1 - Integracao theirStack: Configuracao, Teste e Credits
 *
 * POST /api/integrations/theirstack/test
 * Tests connection to theirStack API using stored credentials.
 *
 * AC: #2 - testConnection validates key via credit-balance endpoint
 * AC: #4 - Portuguese error messages for invalid/expired keys
 */

import { NextResponse } from "next/server";
import { getCurrentUserProfile } from "@/lib/supabase/tenant";
import { createClient } from "@/lib/supabase/server";
import { decryptApiKey } from "@/lib/crypto/encryption";
import { TheirStackService } from "@/lib/services/theirstack";

// ==============================================
// API RESPONSE TYPES
// ==============================================

interface TestResponse {
  success: boolean;
  message: string;
  testedAt: string;
  latencyMs?: number;
}

// ==============================================
// POST /api/integrations/theirstack/test
// ==============================================

export async function POST() {
  try {
    // 1. Check authentication
    const profile = await getCurrentUserProfile();

    if (!profile) {
      return NextResponse.json<TestResponse>(
        {
          success: false,
          message: "Não autenticado",
          testedAt: new Date().toISOString(),
        },
        { status: 401 }
      );
    }

    // 2. Check admin role
    if (profile.role !== "admin") {
      return NextResponse.json<TestResponse>(
        {
          success: false,
          message: "Apenas administradores podem testar conexões",
          testedAt: new Date().toISOString(),
        },
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
      return NextResponse.json<TestResponse>(
        {
          success: false,
          message: "API key do theirStack não configurada",
          testedAt: new Date().toISOString(),
        },
        { status: 404 }
      );
    }

    // 4. Decrypt API key
    let apiKey: string;
    try {
      apiKey = decryptApiKey(config.encrypted_key);
    } catch {
      return NextResponse.json<TestResponse>(
        {
          success: false,
          message: "Erro ao descriptografar API key. Reconfigure a chave.",
          testedAt: new Date().toISOString(),
        },
        { status: 500 }
      );
    }

    // 5. Test connection
    const service = new TheirStackService();
    const result = await service.testConnection(apiKey);

    // 6. Return result with Portuguese message
    return NextResponse.json<TestResponse>(
      {
        success: result.success,
        message: result.success
          ? "Conexão com theirStack estabelecida com sucesso"
          : result.message,
        testedAt: result.testedAt,
        latencyMs: result.latencyMs,
      },
      { status: result.success ? 200 : 400 }
    );
  } catch {
    return NextResponse.json<TestResponse>(
      {
        success: false,
        message: "Erro interno ao testar conexão",
        testedAt: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
