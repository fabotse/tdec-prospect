/**
 * Campaign Blocks API Route
 * Story 5.9: Campaign Save & Multiple Campaigns
 *
 * AC: #2, #7 - Carregar blocos existentes
 *
 * GET /api/campaigns/[campaignId]/blocks
 * Returns all blocks (email + delay) for a campaign, ordered by position
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { type BuilderBlock } from "@/stores/use-builder-store";
import {
  type EmailBlockRow,
  transformEmailBlockRow,
} from "@/types/email-block";
import {
  type DelayBlockRow,
  transformDelayBlockRow,
} from "@/types/delay-block";

interface RouteParams {
  params: Promise<{ campaignId: string }>;
}

/**
 * UUID v4 validation regex
 */
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/campaigns/[campaignId]/blocks
 * Get all blocks (email + delay) for a campaign, ordered by position
 *
 * @returns BuilderBlock[] sorted by position
 * @returns 401 if not authenticated
 * @returns 400 if campaignId is not a valid UUID
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

  // Fetch email blocks
  const { data: emailBlocks, error: emailError } = await supabase
    .from("email_blocks")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("position", { ascending: true });

  if (emailError) {
    console.error("[Blocks API] Email blocks error:", emailError);
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Erro ao buscar blocos de email",
        },
      },
      { status: 500 }
    );
  }

  // Fetch delay blocks
  const { data: delayBlocks, error: delayError } = await supabase
    .from("delay_blocks")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("position", { ascending: true });

  if (delayError) {
    console.error("[Blocks API] Delay blocks error:", delayError);
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Erro ao buscar blocos de delay",
        },
      },
      { status: 500 }
    );
  }

  // Transform to unified BuilderBlock format
  const blocks: BuilderBlock[] = [];

  // Add email blocks
  for (const row of emailBlocks as EmailBlockRow[]) {
    const email = transformEmailBlockRow(row);
    blocks.push({
      id: email.id,
      type: "email",
      position: email.position,
      data: {
        subject: email.subject || "",
        body: email.body || "",
      },
    });
  }

  // Add delay blocks
  for (const row of delayBlocks as DelayBlockRow[]) {
    const delay = transformDelayBlockRow(row);
    blocks.push({
      id: delay.id,
      type: "delay",
      position: delay.position,
      data: {
        delayValue: delay.delayValue,
        delayUnit: delay.delayUnit,
      },
    });
  }

  // Sort by position (unified ordering)
  blocks.sort((a, b) => a.position - b.position);

  return NextResponse.json({ data: blocks });
}
