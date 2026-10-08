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
import { getInjectableServiceApiKey } from "@/lib/agent/service-keys";
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

    const credentials = await getInjectableServiceApiKey(
      profile.tenant_id,
      "snovio",
      "Snov.io"
    );

    if (!credentials) {
      return NextResponse.json(
        { error: "Credenciais do Snov.io não configuradas" },
        { status: 404 }
      );
    }
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
