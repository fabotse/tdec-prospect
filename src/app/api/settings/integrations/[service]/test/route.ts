/**
 * Test Connection API Route
 * Story: 2.3 - Integration Connection Testing
 *
 * POST /api/settings/integrations/[service]/test
 * Tests the connection to an external service using stored API key.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserProfile } from "@/lib/supabase/tenant";
import { decryptApiKey } from "@/lib/crypto/encryption";
import { testConnection, ERROR_MESSAGES } from "@/lib/services";
import { isValidServiceName, type ServiceName } from "@/types/integration";

// ==============================================
// POST /api/settings/integrations/[service]/test
// ==============================================

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ service: string }> }
) {
  try {
    const { service } = await params;

    // 1. Validate service name
    if (!isValidServiceName(service)) {
      return NextResponse.json(
        { error: "Serviço inválido" },
        { status: 400 }
      );
    }

    const serviceName = service as ServiceName;

    // 2. Check authentication
    const profile = await getCurrentUserProfile();

    if (!profile) {
      return NextResponse.json(
        { error: "Não autenticado" },
        { status: 401 }
      );
    }

    // 3. Check admin role
    if (profile.role !== "admin") {
      return NextResponse.json(
        { error: "Apenas administradores podem testar conexões" },
        { status: 403 }
      );
    }

    // 4. Fetch encrypted key from database
    const supabase = await createClient();
    const { data: config, error: fetchError } = await supabase
      .from("api_configs")
      .select("encrypted_key")
      .eq("tenant_id", profile.tenant_id)
      .eq("service_name", serviceName)
      .single();

    if (fetchError || !config) {
      return NextResponse.json(
        {
          success: false,
          message: "API key não configurada para este serviço",
          testedAt: new Date().toISOString(),
        },
        { status: 404 }
      );
    }

    // 5. Decrypt API key
    let apiKey: string;
    try {
      apiKey = decryptApiKey(config.encrypted_key);
    } catch {
      return NextResponse.json(
        {
          success: false,
          message: "Erro ao descriptografar a API key. Reconfigure a chave.",
          testedAt: new Date().toISOString(),
        },
        { status: 500 }
      );
    }

    // 6. Test connection
    const result = await testConnection(serviceName, apiKey);

    // 7. Return result
    return NextResponse.json(result, {
      status: result.success ? 200 : 400,
    });
  } catch (error) {
    console.error("Test connection API error:", error);

    return NextResponse.json(
      {
        success: false,
        message: ERROR_MESSAGES.INTERNAL_ERROR,
        testedAt: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
