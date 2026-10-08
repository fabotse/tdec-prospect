/**
 * Snov.io Lists API Route
 * Story 7.3: Snov.io Integration Service - Gestão de Campanhas
 *
 * POST /api/snovio/lists — Create a prospect list in Snov.io
 * GET  /api/snovio/lists — List existing prospect lists
 * AC: #1 - Proxied via API route with tenant auth
 * AC: #2 - Create prospect list
 * AC: #5 - List existing lists
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserProfile } from "@/lib/supabase/tenant";
import { getInjectableServiceApiKey } from "@/lib/agent/service-keys";
import { SnovioService } from "@/lib/services/snovio";
import { ExternalServiceError } from "@/lib/services/base-service";

interface CreateListBody {
  name: string;
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

    const body: CreateListBody = await request.json();

    if (!body.name) {
      return NextResponse.json(
        { error: "Nome da lista é obrigatório" },
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
    const result = await service.createProspectList({
      credentials,
      name: body.name,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof ExternalServiceError) {
      return NextResponse.json(
        { error: error.userMessage },
        { status: error.statusCode || 502 }
      );
    }

    return NextResponse.json(
      { error: "Erro interno ao criar lista" },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const profile = await getCurrentUserProfile();

    if (!profile) {
      return NextResponse.json(
        { error: "Não autenticado" },
        { status: 401 }
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
    const result = await service.getUserLists({ credentials });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ExternalServiceError) {
      return NextResponse.json(
        { error: error.userMessage },
        { status: error.statusCode || 502 }
      );
    }

    return NextResponse.json(
      { error: "Erro interno ao listar listas" },
      { status: 500 }
    );
  }
}
