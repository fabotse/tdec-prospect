/**
 * Campaign API Route - Single Campaign
 * Story 5.2: Campaign Builder Canvas
 * Story 5.9: Campaign Save & Multiple Campaigns
 *
 * AC 5.2: #1 - Rota do Builder (404 handling)
 * AC 5.9: #1, #3 - Salvar campanha e blocos
 *
 * GET /api/campaigns/[campaignId]
 * Get a single campaign by ID with lead count
 *
 * PATCH /api/campaigns/[campaignId]
 * Update campaign name and/or blocks
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  transformCampaignRowWithCount,
  type CampaignRowWithCount,
} from "@/types/campaign";
import { z } from "zod";

interface RouteParams {
  params: Promise<{ campaignId: string }>;
}

/**
 * UUID v4 validation regex
 */
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/campaigns/[campaignId]
 * Get a single campaign by ID with lead count
 *
 * @returns Campaign data with leadCount
 * @returns 401 if not authenticated
 * @returns 400 if campaignId is not a valid UUID
 * @returns 404 if campaign not found
 * @returns 500 on database error
 */
export async function GET(_request: Request, { params }: RouteParams) {
  const supabase = await createClient();

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

  // Query campaign with lead count
  const { data, error } = await supabase
    .from("campaigns")
    .select(
      `
      *,
      lead_count:campaign_leads(count)
    `
    )
    .eq("id", campaignId)
    .single();

  if (error) {
    // PGRST116 = Row not found (PostgREST error code)
    if (error.code === "PGRST116") {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Campanha nao encontrada" } },
        { status: 404 }
      );
    }
    console.error("[Campaign API] GET single error:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro ao buscar campanha" } },
      { status: 500 }
    );
  }

  // Transform and flatten lead_count
  const leadCount = Array.isArray(data.lead_count)
    ? data.lead_count[0]?.count || 0
    : 0;

  const campaign = transformCampaignRowWithCount({
    ...data,
    lead_count: leadCount,
  } as CampaignRowWithCount);

  return NextResponse.json({ data: campaign });
}

// ==============================================
// PATCH - Update campaign name and/or blocks
// Story 5.9: Campaign Save & Multiple Campaigns
// ==============================================

/**
 * Schema for block in request body
 */
const blockSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(["email", "delay"]),
  position: z.number().int().min(0),
  data: z.object({}).passthrough(),
});

/**
 * Schema for PATCH request body
 */
const patchCampaignSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  blocks: z.array(blockSchema).optional(),
});

/**
 * PATCH /api/campaigns/[campaignId]
 * Update campaign name and/or blocks
 *
 * @param body.name - New campaign name (optional)
 * @param body.blocks - Array of BuilderBlock to save (optional)
 * @returns Updated campaign data with leadCount
 * @returns 401 if not authenticated
 * @returns 400 if campaignId is not a valid UUID or body is invalid
 * @returns 500 on database error
 */
export async function PATCH(request: Request, { params }: RouteParams) {
  const supabase = await createClient();

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

  // Parse and validate body
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Body JSON invalido" } },
      { status: 400 }
    );
  }

  const parsed = patchCampaignSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Dados invalidos",
          details: parsed.error.flatten(),
        },
      },
      { status: 400 }
    );
  }

  const { name, blocks } = parsed.data;

  // Update campaign name if provided (updated_at handled at end - CR-5 fix)
  if (name !== undefined) {
    const { error: updateError } = await supabase
      .from("campaigns")
      .update({ name })
      .eq("id", campaignId);

    if (updateError) {
      console.error("[Campaign API] Update name error:", updateError);
      return NextResponse.json(
        {
          error: {
            code: "INTERNAL_ERROR",
            message: "Erro ao atualizar nome da campanha",
          },
        },
        { status: 500 }
      );
    }
  }

  // Update blocks if provided
  if (blocks !== undefined) {
    // CR-1 FIX: Verify campaign exists before modifying blocks
    const { data: existingCampaign, error: existsError } = await supabase
      .from("campaigns")
      .select("id")
      .eq("id", campaignId)
      .single();

    if (existsError || !existingCampaign) {
      return NextResponse.json(
        {
          error: {
            code: "NOT_FOUND",
            message: "Campanha nao encontrada",
          },
        },
        { status: 404 }
      );
    }

    // Separate blocks by type before any modifications
    const emailBlocks = blocks.filter((b) => b.type === "email");
    const delayBlocks = blocks.filter((b) => b.type === "delay");

    // Prepare rows before deletion (CR-2: prepare data first)
    const emailRows = emailBlocks.map((b) => ({
      id: b.id,
      campaign_id: campaignId,
      position: b.position,
      subject: (b.data as { subject?: string }).subject || null,
      body: (b.data as { body?: string }).body || null,
    }));

    const delayRows = delayBlocks.map((b) => ({
      id: b.id,
      campaign_id: campaignId,
      position: b.position,
      delay_value: (b.data as { delayValue?: number }).delayValue || 2,
      delay_unit: (b.data as { delayUnit?: string }).delayUnit || "days",
    }));

    // Delete existing email blocks
    const { error: deleteEmailError } = await supabase
      .from("email_blocks")
      .delete()
      .eq("campaign_id", campaignId);

    if (deleteEmailError) {
      console.error("[Campaign API] Delete email blocks error:", deleteEmailError);
      return NextResponse.json(
        {
          error: {
            code: "INTERNAL_ERROR",
            message: "Erro ao remover blocos antigos",
          },
        },
        { status: 500 }
      );
    }

    // Delete existing delay blocks
    const { error: deleteDelayError } = await supabase
      .from("delay_blocks")
      .delete()
      .eq("campaign_id", campaignId);

    if (deleteDelayError) {
      console.error("[Campaign API] Delete delay blocks error:", deleteDelayError);
      return NextResponse.json(
        {
          error: {
            code: "INTERNAL_ERROR",
            message: "Erro ao remover blocos antigos",
          },
        },
        { status: 500 }
      );
    }

    // Insert email blocks (data already prepared above)
    if (emailRows.length > 0) {
      const { error: insertEmailError } = await supabase
        .from("email_blocks")
        .insert(emailRows);

      if (insertEmailError) {
        console.error("[Campaign API] Insert email blocks error:", insertEmailError);
        return NextResponse.json(
          {
            error: {
              code: "INTERNAL_ERROR",
              message: "Erro ao salvar blocos de email",
            },
          },
          { status: 500 }
        );
      }
    }

    // Insert delay blocks (data already prepared above)
    if (delayRows.length > 0) {
      const { error: insertDelayError } = await supabase
        .from("delay_blocks")
        .insert(delayRows);

      if (insertDelayError) {
        console.error("[Campaign API] Insert delay blocks error:", insertDelayError);
        return NextResponse.json(
          {
            error: {
              code: "INTERNAL_ERROR",
              message: "Erro ao salvar blocos de delay",
            },
          },
          { status: 500 }
        );
      }
    }
  }

  // CR-5 FIX: Update updated_at once at end if any changes were made
  if (name !== undefined || blocks !== undefined) {
    await supabase
      .from("campaigns")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", campaignId);
  }

  // Return updated campaign with lead count
  const { data, error: fetchError } = await supabase
    .from("campaigns")
    .select(
      `
      *,
      lead_count:campaign_leads(count)
    `
    )
    .eq("id", campaignId)
    .single();

  if (fetchError) {
    console.error("[Campaign API] Fetch after update error:", fetchError);
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Campanha salva, mas erro ao buscar dados atualizados",
        },
      },
      { status: 500 }
    );
  }

  // Transform and flatten lead_count
  const leadCount = Array.isArray(data.lead_count)
    ? data.lead_count[0]?.count || 0
    : 0;

  const campaign = transformCampaignRowWithCount({
    ...data,
    lead_count: leadCount,
  } as CampaignRowWithCount);

  return NextResponse.json({ data: campaign });
}
