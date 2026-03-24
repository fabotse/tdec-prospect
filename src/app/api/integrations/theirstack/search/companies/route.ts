/**
 * theirStack Company Search API Route
 * Story: 15.2 - Busca Technografica: Autocomplete e Filtros
 *
 * POST /api/integrations/theirstack/search/companies
 * Searches companies by technology slugs and filters.
 *
 * AC: #3 - Company search with filters
 * AC: #4 - Error handling with retry
 * AC: #5 - Credits/rate limit error messages
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserProfile } from "@/lib/supabase/tenant";
import { createClient } from "@/lib/supabase/server";
import { decryptApiKey } from "@/lib/crypto/encryption";
import { TheirStackService } from "@/lib/services/theirstack";
import { ExternalServiceError } from "@/lib/services/base-service";

// ==============================================
// VALIDATION
// ==============================================

const searchFiltersSchema = z
  .object({
    technologySlugs: z
      .array(z.string())
      .min(1, "Selecione pelo menos uma tecnologia"),
    countryCodes: z.array(z.string()).optional(),
    minEmployeeCount: z.number().int().min(1).optional(),
    maxEmployeeCount: z.number().int().min(1).optional(),
    industryIds: z.array(z.number().int()).optional(),
    page: z.number().int().min(0).optional(),
    limit: z.number().int().min(1).max(50).optional(),
  })
  .refine(
    (data) => {
      if (
        data.minEmployeeCount !== undefined &&
        data.maxEmployeeCount !== undefined
      ) {
        return data.minEmployeeCount <= data.maxEmployeeCount;
      }
      return true;
    },
    {
      message:
        "Funcionários mínimo deve ser menor ou igual ao máximo",
    }
  );

// ==============================================
// POST /api/integrations/theirstack/search/companies
// ==============================================

export async function POST(request: NextRequest) {
  try {
    // 1. Auth check
    const profile = await getCurrentUserProfile();
    if (!profile) {
      return NextResponse.json(
        { error: "Não autenticado" },
        { status: 401 }
      );
    }

    // 2. Admin check
    if (profile.role !== "admin") {
      return NextResponse.json(
        { error: "Apenas administradores podem realizar buscas" },
        { status: 403 }
      );
    }

    // 3. Validate request body
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Body inválido" },
        { status: 400 }
      );
    }

    const parsed = searchFiltersSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    // 4. Fetch encrypted key
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

    // 5. Decrypt key
    let apiKey: string;
    try {
      apiKey = decryptApiKey(config.encrypted_key);
    } catch {
      return NextResponse.json(
        { error: "Erro ao descriptografar API key. Reconfigure a chave." },
        { status: 500 }
      );
    }

    // 6. Search companies
    const service = new TheirStackService();
    const result = await service.searchCompanies(apiKey, parsed.data);

    return NextResponse.json({
      data: result.data,
      meta: result.metadata,
    });
  } catch (error) {
    if (error instanceof ExternalServiceError) {
      return NextResponse.json(
        { error: error.userMessage },
        { status: error.statusCode || 500 }
      );
    }

    return NextResponse.json(
      { error: "Erro interno ao buscar empresas" },
      { status: 500 }
    );
  }
}
