/**
 * theirStack Technology Search API Route
 * Story: 15.2 - Busca Technografica: Autocomplete e Filtros
 *
 * GET /api/integrations/theirstack/search/technologies?q=<query>
 * Searches technology keywords for autocomplete suggestions.
 *
 * AC: #1 - Autocomplete with name, category, company count
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

const querySchema = z.object({
  q: z.string().min(2, "Busca deve ter pelo menos 2 caracteres"),
});

// ==============================================
// GET /api/integrations/theirstack/search/technologies
// ==============================================

export async function GET(request: NextRequest) {
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

    // 3. Validate query params
    const searchParams = request.nextUrl.searchParams;
    const parsed = querySchema.safeParse({ q: searchParams.get("q") });

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

    // 6. Search technologies
    const service = new TheirStackService();
    const data = await service.searchTechnologies(apiKey, parsed.data.q);

    return NextResponse.json({ data });
  } catch (error) {
    if (error instanceof ExternalServiceError) {
      return NextResponse.json(
        { error: error.userMessage },
        { status: error.statusCode || 500 }
      );
    }

    return NextResponse.json(
      { error: "Erro interno ao buscar tecnologias" },
      { status: 500 }
    );
  }
}
