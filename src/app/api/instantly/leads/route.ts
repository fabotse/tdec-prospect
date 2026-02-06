/**
 * Instantly Leads API Route
 * Story 7.2: Instantly Integration Service - Gestão de Campanhas
 *
 * POST /api/instantly/leads — Add leads to an Instantly campaign (bulk)
 * AC: #1 - Proxied via API route with tenant auth
 * AC: #3 - Bulk add leads with batching
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserProfile } from "@/lib/supabase/tenant";
import { createClient } from "@/lib/supabase/server";
import { decryptApiKey } from "@/lib/crypto/encryption";
import { InstantlyService } from "@/lib/services/instantly";
import { ExternalServiceError } from "@/lib/services/base-service";

interface AddLeadsBody {
  campaignId: string;
  leads: Array<{
    email: string;
    firstName?: string;
    lastName?: string;
    companyName?: string;
    phone?: string;
    title?: string;
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

    const body: AddLeadsBody = await request.json();

    if (!body.campaignId || !body.leads?.length) {
      return NextResponse.json(
        { error: "ID da campanha e lista de leads são obrigatórios" },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const { data: config } = await supabase
      .from("api_configs")
      .select("encrypted_key")
      .eq("tenant_id", profile.tenant_id)
      .eq("service_name", "instantly")
      .single();

    if (!config) {
      return NextResponse.json(
        { error: "API key do Instantly não configurada" },
        { status: 404 }
      );
    }

    const apiKey = decryptApiKey(config.encrypted_key);
    const service = new InstantlyService();
    const result = await service.addLeadsToCampaign({
      apiKey,
      campaignId: body.campaignId,
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
      { error: "Erro interno ao adicionar leads" },
      { status: 500 }
    );
  }
}
