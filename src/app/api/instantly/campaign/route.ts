/**
 * Instantly Campaign API Route
 * Story 7.2: Instantly Integration Service - Gestão de Campanhas
 *
 * POST /api/instantly/campaign — Create a campaign in Instantly
 * AC: #1 - Proxied via API route with tenant auth
 * AC: #2 - Create campaign with sequences
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserProfile } from "@/lib/supabase/tenant";
import { getInjectableServiceApiKey } from "@/lib/agent/service-keys";
import { InstantlyService } from "@/lib/services/instantly";
import { ExternalServiceError } from "@/lib/services/base-service";

interface CreateCampaignBody {
  name: string;
  sequences: Array<{
    subject: string;
    body: string;
    delayDays: number;
  }>;
  sendingAccounts?: string[];
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

    const body: CreateCampaignBody = await request.json();

    if (!body.name || !body.sequences?.length) {
      return NextResponse.json(
        { error: "Nome da campanha e sequências são obrigatórios" },
        { status: 400 }
      );
    }

    const invalidSequence = body.sequences.some(
      (seq) => !seq.subject || !seq.body || seq.delayDays == null
    );
    if (invalidSequence) {
      return NextResponse.json(
        { error: "Cada sequência deve ter subject, body e delayDays" },
        { status: 400 }
      );
    }

    const apiKey = await getInjectableServiceApiKey(
      profile.tenant_id,
      "instantly",
      "Instantly"
    );

    if (!apiKey) {
      return NextResponse.json(
        { error: "API key do Instantly não configurada" },
        { status: 404 }
      );
    }
    const service = new InstantlyService();
    const result = await service.createCampaign({
      apiKey,
      name: body.name,
      sequences: body.sequences,
      sendingAccounts: body.sendingAccounts,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof ExternalServiceError) {
      return NextResponse.json(
        { error: error.userMessage, details: error.details },
        { status: error.statusCode || 502 }
      );
    }

    return NextResponse.json(
      { error: "Erro interno ao criar campanha" },
      { status: 500 }
    );
  }
}
