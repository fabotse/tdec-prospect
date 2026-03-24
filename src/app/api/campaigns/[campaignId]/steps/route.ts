/**
 * Campaign Steps API Route
 * Story 14.6: Tooltip com Preview do Email por Step
 *
 * GET /api/campaigns/[campaignId]/steps
 * Returns CampaignStep[] (stepNumber + subject + body) for tooltip and panel preview.
 *
 * AC 14.6: #2 — Primary source: local email_blocks. Fallback: Instantly API.
 * AC 14.7: #2 — Body field included for panel preview.
 */

import { NextResponse } from "next/server";
import { getCurrentUserProfile } from "@/lib/supabase/tenant";
import { createClient } from "@/lib/supabase/server";
import { decryptApiKey } from "@/lib/crypto/encryption";
import type { CampaignStep } from "@/types/tracking";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface RouteParams {
  params: Promise<{ campaignId: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const profile = await getCurrentUserProfile();
    if (!profile) {
      return NextResponse.json(
        { error: "Nao autenticado" },
        { status: 401 }
      );
    }

    const { campaignId } = await params;

    if (!UUID_RE.test(campaignId)) {
      return NextResponse.json(
        { error: "ID de campanha invalido" },
        { status: 400 }
      );
    }

    // Uses getCurrentUserProfile (not supabase.auth.getUser) because
    // tenant_id is needed for the api_configs query in the Instantly fallback path.
    const supabase = await createClient();

    // Primary source: local email_blocks
    const { data: emailBlocks, error: blocksError } = await supabase
      .from("email_blocks")
      .select("position, subject, body")
      .eq("campaign_id", campaignId)
      .order("position", { ascending: true });

    if (blocksError) {
      return NextResponse.json(
        { error: "Erro ao buscar email blocks" },
        { status: 500 }
      );
    }

    if (emailBlocks && emailBlocks.length > 0) {
      const steps: CampaignStep[] = emailBlocks.map((block) => ({
        stepNumber: block.position,
        subject: typeof block.subject === "string" ? block.subject : "",
        body: typeof block.body === "string" ? block.body : "",
      }));
      return NextResponse.json({ data: steps });
    }

    // Fallback: Instantly API (for imported/external campaigns)
    const { data: campaign, error: campaignError } = await supabase
      .from("campaigns")
      .select("id, external_campaign_id")
      .eq("id", campaignId)
      .single();

    if (campaignError || !campaign?.external_campaign_id) {
      // No blocks and no external ID — return empty array (graceful fallback)
      return NextResponse.json({ data: [] });
    }

    const { data: config } = await supabase
      .from("api_configs")
      .select("encrypted_key")
      .eq("tenant_id", profile.tenant_id)
      .eq("service_name", "instantly")
      .single();

    if (!config) {
      return NextResponse.json({ data: [] });
    }

    const apiKey = decryptApiKey(config.encrypted_key);

    const response = await fetch(
      `https://api.instantly.ai/api/v2/campaigns/${campaign.external_campaign_id}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
      }
    );

    if (!response.ok) {
      return NextResponse.json({ data: [] });
    }

    const rawData = await response.json();
    const sequences = rawData?.sequences;

    if (!Array.isArray(sequences) || sequences.length === 0) {
      return NextResponse.json({ data: [] });
    }

    const rawSteps = sequences[0]?.steps;
    if (!Array.isArray(rawSteps)) {
      return NextResponse.json({ data: [] });
    }

    const steps: CampaignStep[] = rawSteps.map(
      (step: { variants?: Array<{ subject?: string; body?: string }> }, index: number) => {
        const variant = Array.isArray(step.variants) && step.variants.length > 0
          ? step.variants[0]
          : undefined;
        const subject = typeof variant?.subject === "string" ? variant.subject : "";
        const body = typeof variant?.body === "string" ? variant.body : "";
        return { stepNumber: index, subject, body };
      }
    );

    return NextResponse.json({ data: steps });
  } catch {
    return NextResponse.json(
      { error: "Erro ao buscar steps da campanha" },
      { status: 500 }
    );
  }
}
