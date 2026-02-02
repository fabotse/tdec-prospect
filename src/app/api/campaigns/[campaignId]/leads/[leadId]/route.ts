/**
 * Campaign Lead Individual API Route
 * Story 5.7: Campaign Lead Association
 *
 * DELETE /api/campaigns/[campaignId]/leads/[leadId] - Remove a lead from campaign
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * UUID v4 validation regex
 */
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface RouteParams {
  params: Promise<{ campaignId: string; leadId: string }>;
}

/**
 * DELETE /api/campaigns/[campaignId]/leads/[leadId]
 * Remove a lead from a campaign
 *
 * @returns 204 No Content on success
 * @returns 401 if not authenticated
 * @returns 400 if IDs are not valid UUIDs
 * @returns 404 if association not found
 * @returns 500 on database error
 */
export async function DELETE(_request: Request, { params }: RouteParams) {
  const supabase = await createClient();
  const { campaignId, leadId } = await params;

  // Validate UUID formats
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

  if (!UUID_REGEX.test(leadId)) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "ID de lead invalido",
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

  // Delete the campaign_lead association
  const { error, count } = await supabase
    .from("campaign_leads")
    .delete({ count: "exact" })
    .eq("campaign_id", campaignId)
    .eq("lead_id", leadId);

  if (error) {
    console.error("[Campaign Leads API] DELETE error:", error);
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Erro ao remover lead da campanha",
        },
      },
      { status: 500 }
    );
  }

  // Check if anything was deleted
  if (count === 0) {
    return NextResponse.json(
      {
        error: {
          code: "NOT_FOUND",
          message: "Lead nao encontrado nesta campanha",
        },
      },
      { status: 404 }
    );
  }

  // Return 204 No Content on success
  return new NextResponse(null, { status: 204 });
}
