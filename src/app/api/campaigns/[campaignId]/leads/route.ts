/**
 * Campaign Leads API Route
 * Story 5.7: Campaign Lead Association
 *
 * GET /api/campaigns/[campaignId]/leads - List leads for a campaign
 * POST /api/campaigns/[campaignId]/leads - Add leads to a campaign
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

/**
 * UUID v4 validation regex
 */
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Schema for adding leads to campaign
 */
const addLeadsSchema = z.object({
  leadIds: z
    .array(z.string().regex(UUID_REGEX, "ID de lead invalido"))
    .min(1, "Selecione pelo menos um lead"),
});

interface RouteParams {
  params: Promise<{ campaignId: string }>;
}

/**
 * GET /api/campaigns/[campaignId]/leads
 * List leads associated with a campaign
 *
 * @returns Array of campaign leads with lead details
 * @returns 401 if not authenticated
 * @returns 400 if campaignId is not a valid UUID
 * @returns 500 on database error
 */
export async function GET(_request: Request, { params }: RouteParams) {
  const supabase = await createClient();
  const { campaignId } = await params;

  // Validate UUID format
  if (!UUID_REGEX.test(campaignId)) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "ID de campanha invalido",
        },
      },
      { status: 400 }
    );
  }

  // Auth check
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Nao autenticado" } },
      { status: 401 }
    );
  }

  // Fetch leads via junction table with lead details
  // Story 6.5.7: Include icebreaker fields for premium icebreaker integration
  const { data, error } = await supabase
    .from("campaign_leads")
    .select(
      `
      id,
      added_at,
      lead:leads (
        id,
        first_name,
        last_name,
        email,
        company_name,
        title,
        photo_url,
        icebreaker,
        icebreaker_generated_at,
        linkedin_posts_cache
      )
    `
    )
    .eq("campaign_id", campaignId)
    .order("added_at", { ascending: false });

  if (error) {
    console.error("[Campaign Leads API] GET error:", error);
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Erro ao buscar leads da campanha",
        },
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ data });
}

/**
 * POST /api/campaigns/[campaignId]/leads
 * Add leads to a campaign
 *
 * @body { leadIds: string[] } - Array of lead UUIDs to add
 * @returns Added campaign_leads records
 * @returns 401 if not authenticated
 * @returns 400 if validation fails
 * @returns 500 on database error
 */
export async function POST(request: Request, { params }: RouteParams) {
  const supabase = await createClient();
  const { campaignId } = await params;

  // Validate UUID format
  if (!UUID_REGEX.test(campaignId)) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "ID de campanha invalido",
        },
      },
      { status: 400 }
    );
  }

  // Auth check
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Nao autenticado" } },
      { status: 401 }
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
          code: "VALIDATION_ERROR",
          message: "JSON invalido",
        },
      },
      { status: 400 }
    );
  }

  const parsed = addLeadsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: parsed.error.issues[0]?.message || "IDs de leads invalidos",
        },
      },
      { status: 400 }
    );
  }

  // Insert campaign_leads (upsert to handle duplicates gracefully)
  const insertData = parsed.data.leadIds.map((leadId) => ({
    campaign_id: campaignId,
    lead_id: leadId,
  }));

  const { data, error } = await supabase
    .from("campaign_leads")
    .upsert(insertData, {
      onConflict: "campaign_id,lead_id",
      ignoreDuplicates: true,
    })
    .select();

  if (error) {
    console.error("[Campaign Leads API] POST error:", error);
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Erro ao adicionar leads",
        },
      },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      data,
      meta: { added: data.length },
    },
    { status: 201 }
  );
}
