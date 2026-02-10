import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { transformOpportunityConfigRow } from "@/types/tracking";
import { z } from "zod";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const saveConfigSchema = z.object({
  minOpens: z.number().min(1, "Minimo de aberturas deve ser pelo menos 1"),
  periodDays: z.number().min(1, "Periodo deve ser pelo menos 1 dia"),
});

/**
 * GET /api/campaigns/[campaignId]/opportunity-config
 * Buscar config ativa da janela de oportunidade
 * AC: #2
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ campaignId: string }> }
) {
  const { campaignId } = await params;

  if (!UUID_REGEX.test(campaignId)) {
    return NextResponse.json(
      { error: "ID de campanha invalido" },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "Nao autenticado" },
      { status: 401 }
    );
  }

  const { data, error } = await supabase
    .from("opportunity_configs")
    .select("*")
    .eq("campaign_id", campaignId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: "Erro ao buscar configuracao" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    data: data ? transformOpportunityConfigRow(data) : null,
  });
}

/**
 * PUT /api/campaigns/[campaignId]/opportunity-config
 * Upsert config da janela de oportunidade
 * AC: #3
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ campaignId: string }> }
) {
  const { campaignId } = await params;

  if (!UUID_REGEX.test(campaignId)) {
    return NextResponse.json(
      { error: "ID de campanha invalido" },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "Nao autenticado" },
      { status: 401 }
    );
  }

  // Get tenant_id from profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", user.id)
    .single();

  if (!profile?.tenant_id) {
    return NextResponse.json(
      { error: "Sem tenant associado" },
      { status: 403 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Corpo da requisicao invalido" },
      { status: 400 }
    );
  }

  const parsed = saveConfigSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("opportunity_configs")
    .upsert(
      {
        campaign_id: campaignId,
        tenant_id: profile.tenant_id,
        min_opens: parsed.data.minOpens,
        period_days: parsed.data.periodDays,
        is_active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "campaign_id" }
    )
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      { error: "Erro ao salvar configuracao" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    data: transformOpportunityConfigRow(data),
  });
}
