/**
 * API Route: POST /api/agent/briefing/parse-product
 * Story: 16.6 - Cadastro de Produto Inline
 *
 * AC: #2 - Extrai campos estruturados de produto via OpenAI
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserProfile } from "@/lib/supabase/tenant";
import { createClient } from "@/lib/supabase/server";
import { decryptApiKey } from "@/lib/crypto/encryption";
import { ProductParserService } from "@/lib/agent/product-parser-service";

// ==============================================
// REQUEST VALIDATION
// ==============================================

const parseProductRequestSchema = z.object({
  executionId: z.string().uuid(),
  message: z.string().min(1),
  productName: z.string().min(1),
});

// ==============================================
// ROUTE HANDLER
// ==============================================

export async function POST(request: Request) {
  const profile = await getCurrentUserProfile();
  if (!profile) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Nao autenticado" } },
      { status: 401 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_JSON", message: "JSON invalido" } },
      { status: 400 }
    );
  }

  const validation = parseProductRequestSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message:
            "Campos obrigatorios: executionId (UUID), message (string) e productName (string)",
        },
      },
      { status: 400 }
    );
  }

  const { executionId, message, productName } = validation.data;

  const supabase = await createClient();

  // Verify execution exists and belongs to tenant
  const { data: execution, error: execError } = await supabase
    .from("agent_executions")
    .select("id")
    .eq("id", executionId)
    .eq("tenant_id", profile.tenant_id)
    .single();

  if (execError || !execution) {
    return NextResponse.json(
      {
        error: {
          code: "EXECUTION_NOT_FOUND",
          message: "Execucao nao encontrada",
        },
      },
      { status: 404 }
    );
  }

  const { data: apiConfig } = await supabase
    .from("api_configs")
    .select("encrypted_key")
    .eq("tenant_id", profile.tenant_id)
    .eq("service_name", "openai")
    .single();

  if (!apiConfig?.encrypted_key) {
    return NextResponse.json(
      {
        error: {
          code: "API_KEY_MISSING",
          message: "Chave OpenAI nao configurada. Configure em Integracoes.",
        },
      },
      { status: 422 }
    );
  }

  let apiKey: string;
  try {
    apiKey = decryptApiKey(apiConfig.encrypted_key);
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "API_KEY_ERROR",
          message: "Erro ao decriptar chave OpenAI",
        },
      },
      { status: 500 }
    );
  }

  try {
    const product = await ProductParserService.parse(
      message,
      productName,
      apiKey
    );

    return NextResponse.json({ product });
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "PRODUCT_PARSE_ERROR",
          message: "Erro ao extrair dados do produto",
        },
      },
      { status: 500 }
    );
  }
}
