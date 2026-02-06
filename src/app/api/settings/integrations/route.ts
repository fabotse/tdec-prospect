/**
 * API Route: Integration Configurations
 * Story: 2.2 - API Keys Storage & Encryption
 *
 * AC: #1 - Key encrypted before storage
 * AC: #2 - Key stored with tenant_id
 * AC: #3 - Key never returned in plain text
 * AC: #4 - Only last 4 chars shown
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserProfile } from "@/lib/supabase/tenant";
import { encryptApiKey, maskApiKey } from "@/lib/crypto/encryption";
import { z } from "zod";
import {
  SERVICE_NAMES,
  type ServiceName,
  type ApiConfigResponse,
} from "@/types/integration";

// ==============================================
// VALIDATION SCHEMAS
// ==============================================

const saveIntegrationSchema = z.object({
  serviceName: z.enum(SERVICE_NAMES, {
    message: "Serviço inválido. Valores permitidos: apollo, signalhire, snovio, instantly",
  }),
  apiKey: z
    .string()
    .min(8, "API key deve ter no mínimo 8 caracteres")
    .max(500, "API key excede o tamanho máximo"),
});

// ==============================================
// ERROR RESPONSES
// ==============================================

function errorResponse(
  code: string,
  message: string,
  status: number
): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status });
}

// ==============================================
// GET /api/settings/integrations
// Returns all configs for current tenant with masked keys
// ==============================================

export async function GET() {
  try {
    // 1. Check authentication
    const profile = await getCurrentUserProfile();

    if (!profile) {
      return errorResponse("UNAUTHORIZED", "Não autenticado", 401);
    }

    // 2. Check admin role
    if (profile.role !== "admin") {
      return errorResponse(
        "FORBIDDEN",
        "Apenas administradores podem visualizar configurações de integração",
        403
      );
    }

    // 3. Fetch configs from database
    const supabase = await createClient();
    const { data: configs, error } = await supabase
      .from("api_configs")
      .select("service_name, key_suffix, updated_at")
      .eq("tenant_id", profile.tenant_id);

    if (error) {
      console.error("Error fetching api_configs:", error);
      return errorResponse(
        "INTERNAL_ERROR",
        "Erro ao buscar configurações",
        500
      );
    }

    // 4. Build response with all services (configured or not)
    const configMap = new Map(
      configs?.map((c) => [c.service_name, c]) ?? []
    );

    const response: ApiConfigResponse[] = SERVICE_NAMES.map((serviceName) => {
      const config = configMap.get(serviceName);

      if (config) {
        // AC #4: Show last 4 chars for verification using stored key_suffix
        const maskedKey = config.key_suffix
          ? `••••••••${config.key_suffix}`
          : "••••••••••••";

        return {
          serviceName,
          isConfigured: true,
          maskedKey,
          updatedAt: config.updated_at,
        };
      }

      return {
        serviceName,
        isConfigured: false,
        maskedKey: null,
        updatedAt: null,
      };
    });

    return NextResponse.json({ data: { configs: response } });
  } catch (error) {
    console.error("GET /api/settings/integrations error:", error);
    return errorResponse("INTERNAL_ERROR", "Erro interno do servidor", 500);
  }
}

// ==============================================
// POST /api/settings/integrations
// Save or update an integration config with encrypted key
// ==============================================

export async function POST(request: NextRequest) {
  try {
    // 1. Check authentication
    const profile = await getCurrentUserProfile();

    if (!profile) {
      return errorResponse("UNAUTHORIZED", "Não autenticado", 401);
    }

    // 2. Check admin role
    if (profile.role !== "admin") {
      return errorResponse(
        "FORBIDDEN",
        "Apenas administradores podem configurar integrações",
        403
      );
    }

    // 3. Parse and validate request body
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse("VALIDATION_ERROR", "Corpo da requisição inválido", 400);
    }

    const validation = saveIntegrationSchema.safeParse(body);
    if (!validation.success) {
      const message = validation.error.issues[0]?.message ?? "Dados inválidos";
      return errorResponse("VALIDATION_ERROR", message, 400);
    }

    const { serviceName, apiKey } = validation.data;

    // 4. Encrypt the API key
    let encryptedKey: string;
    try {
      encryptedKey = encryptApiKey(apiKey);
    } catch (error) {
      console.error("Encryption error:", error);
      return errorResponse(
        "INTERNAL_ERROR",
        "Erro ao criptografar a chave",
        500
      );
    }

    // 5. Extract last 4 chars for verification (AC #4)
    const keySuffix = apiKey.slice(-4);

    // 6. Upsert config (insert or update)
    const supabase = await createClient();
    const { data: savedConfig, error } = await supabase
      .from("api_configs")
      .upsert(
        {
          tenant_id: profile.tenant_id,
          service_name: serviceName,
          encrypted_key: encryptedKey,
          key_suffix: keySuffix,
        },
        {
          onConflict: "tenant_id,service_name",
        }
      )
      .select("service_name, updated_at")
      .single();

    if (error) {
      console.error("Error saving api_config:", error);
      return errorResponse(
        "INTERNAL_ERROR",
        "Erro ao salvar configuração",
        500
      );
    }

    // 7. Return response with masked key (last 4 chars)
    const maskedKey = maskApiKey(apiKey, 4);

    return NextResponse.json({
      data: {
        serviceName: savedConfig.service_name,
        maskedKey,
        updatedAt: savedConfig.updated_at,
      },
    });
  } catch (error) {
    console.error("POST /api/settings/integrations error:", error);
    return errorResponse("INTERNAL_ERROR", "Erro interno do servidor", 500);
  }
}

// ==============================================
// DELETE /api/settings/integrations
// Delete an integration config
// ==============================================

export async function DELETE(request: NextRequest) {
  try {
    // 1. Check authentication
    const profile = await getCurrentUserProfile();

    if (!profile) {
      return errorResponse("UNAUTHORIZED", "Não autenticado", 401);
    }

    // 2. Check admin role
    if (profile.role !== "admin") {
      return errorResponse(
        "FORBIDDEN",
        "Apenas administradores podem remover configurações",
        403
      );
    }

    // 3. Get service name from query params
    const { searchParams } = new URL(request.url);
    const serviceName = searchParams.get("serviceName");

    if (!serviceName || !SERVICE_NAMES.includes(serviceName as ServiceName)) {
      return errorResponse(
        "VALIDATION_ERROR",
        "Serviço inválido ou não especificado",
        400
      );
    }

    // 4. Delete config
    const supabase = await createClient();
    const { error } = await supabase
      .from("api_configs")
      .delete()
      .eq("tenant_id", profile.tenant_id)
      .eq("service_name", serviceName);

    if (error) {
      console.error("Error deleting api_config:", error);
      return errorResponse(
        "INTERNAL_ERROR",
        "Erro ao remover configuração",
        500
      );
    }

    return NextResponse.json({ data: { deleted: true } });
  } catch (error) {
    console.error("DELETE /api/settings/integrations error:", error);
    return errorResponse("INTERNAL_ERROR", "Erro interno do servidor", 500);
  }
}
