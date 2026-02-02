/**
 * Campaigns API Routes
 * Story 5.1: Campaigns Page & Data Model
 *
 * AC: #1 - View campaigns list
 * AC: #4 - Create new campaign
 * AC: #5 - Lead count per campaign
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  createCampaignSchema,
  transformCampaignRowWithCount,
  type CampaignRowWithCount,
} from "@/types/campaign";

/**
 * GET /api/campaigns
 * List all campaigns for current tenant with lead counts
 * AC: #1, #5 - View campaigns with lead count
 */
export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Nao autenticado" } },
      { status: 401 }
    );
  }

  // Query campaigns with lead count
  const { data, error } = await supabase
    .from("campaigns")
    .select(
      `
      *,
      lead_count:campaign_leads(count)
    `
    )
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[Campaigns API] GET list error:", error);
    return NextResponse.json(
      {
        error: { code: "INTERNAL_ERROR", message: "Erro ao buscar campanhas" },
      },
      { status: 500 }
    );
  }

  // Transform and flatten lead_count
  const campaigns = (data || []).map((row) => {
    const leadCount = Array.isArray(row.lead_count)
      ? row.lead_count[0]?.count || 0
      : 0;
    return transformCampaignRowWithCount({
      ...row,
      lead_count: leadCount,
    } as CampaignRowWithCount);
  });

  return NextResponse.json({ data: campaigns });
}

/**
 * POST /api/campaigns
 * Create a new campaign
 * AC: #4 - Create new campaign with status draft
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Nao autenticado" } },
      { status: 401 }
    );
  }

  // Get tenant_id
  const { data: profile } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", user.id)
    .single();

  if (!profile?.tenant_id) {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "Sem tenant associado" } },
      { status: 403 }
    );
  }

  // Parse and validate body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_JSON",
          message: "Corpo da requisicao invalido",
        },
      },
      { status: 400 }
    );
  }
  const parsed = createCampaignSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: parsed.error.issues[0]?.message || "Dados invalidos",
        },
      },
      { status: 400 }
    );
  }

  // Insert campaign
  const { data, error } = await supabase
    .from("campaigns")
    .insert({
      tenant_id: profile.tenant_id,
      name: parsed.data.name,
      status: "draft",
    })
    .select()
    .single();

  if (error) {
    console.error("[Campaigns API] POST create error:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro ao criar campanha" } },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      data: transformCampaignRowWithCount({
        ...data,
        lead_count: 0,
      } as CampaignRowWithCount),
    },
    { status: 201 }
  );
}
