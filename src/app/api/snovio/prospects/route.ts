/**
 * Snov.io Prospects API Route
 * Story 7.3: Snov.io Integration Service - Gestão de Campanhas
 *
 * POST /api/snovio/prospects — Add prospect(s) to a Snov.io list
 * AC: #1 - Proxied via API route with tenant auth
 * AC: #3a, #3b - Add single or multiple prospects
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserProfile } from "@/lib/supabase/tenant";
import { createClient } from "@/lib/supabase/server";
import { decryptApiKey } from "@/lib/crypto/encryption";
import { SnovioService } from "@/lib/services/snovio";
import { ExternalServiceError } from "@/lib/services/base-service";

interface AddProspectsBody {
  listId: number;
  leads: Array<{
    email: string;
    firstName?: string;
    lastName?: string;
    companyName?: string;
    title?: string;
    phone?: string;
    icebreaker?: string;
  }>;
}

export async function POST(request: NextRequest) {
  try {
    const profile = await getCurrentUserProfile();

    if (!profile) {
      return NextResponse.json(
        { error: "Não autenticado" },
        { status: 401 }
      );
    }

    const body: AddProspectsBody = await request.json();

    if (!body.listId || !body.leads?.length) {
      return NextResponse.json(
        { error: "ID da lista e lista de leads são obrigatórios" },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const { data: config } = await supabase
      .from("api_configs")
      .select("encrypted_key")
      .eq("tenant_id", profile.tenant_id)
      .eq("service_name", "snovio")
      .single();

    if (!config) {
      return NextResponse.json(
        { error: "Credenciais do Snov.io não configuradas" },
        { status: 404 }
      );
    }

    const credentials = decryptApiKey(config.encrypted_key);
    const service = new SnovioService();
    const result = await service.addProspectsToList({
      credentials,
      listId: body.listId,
      leads: body.leads,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ExternalServiceError) {
      return NextResponse.json(
        { error: error.userMessage },
        { status: error.statusCode || 502 }
      );
    }

    return NextResponse.json(
      { error: "Erro interno ao adicionar prospects" },
      { status: 500 }
    );
  }
}
