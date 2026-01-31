/**
 * Apollo Connection Test API Route
 * Story: 3.2 - Apollo API Integration Service
 *
 * POST /api/integrations/apollo/test
 * Tests connection to Apollo API using stored credentials.
 *
 * AC: #5 - testConnection() method for connection testing
 */

import { NextResponse } from "next/server";
import { getCurrentUserProfile } from "@/lib/supabase/tenant";
import { createClient } from "@/lib/supabase/server";
import { decryptApiKey } from "@/lib/crypto/encryption";
import { ApolloService } from "@/lib/services/apollo";

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
// POST /api/integrations/apollo/test
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
      .eq("service_name", "apollo")
      .single();

    if (fetchError || !config) {
      return NextResponse.json<TestResponse>(
        {
          success: false,
          message: "API key do Apollo não configurada",
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
    const apolloService = new ApolloService();
    const result = await apolloService.testConnection(apiKey);

    // 6. Return result with Portuguese message
    return NextResponse.json<TestResponse>(
      {
        success: result.success,
        message: result.success
          ? "Conexão com Apollo estabelecida com sucesso"
          : result.message,
        testedAt: result.testedAt,
        latencyMs: result.latencyMs,
      },
      { status: result.success ? 200 : 400 }
    );
  } catch (error) {
    console.error("[Apollo Test Route] Error:", error);

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
