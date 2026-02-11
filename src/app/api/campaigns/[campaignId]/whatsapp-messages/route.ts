/**
 * WhatsApp Messages API Route
 * Story 11.7: Tracking e Histórico de Mensagens WhatsApp
 *
 * GET /api/campaigns/[campaignId]/whatsapp-messages — Fetch WhatsApp messages for a campaign
 * AC: #2 — WhatsAppMessageWithLead[] with lead_email, lead_name, ordered by created_at DESC
 * AC: #2 — Supports ?leadEmail=xxx filter
 * AC: #2 — Auth + RLS by tenant_id
 */

import { NextResponse } from "next/server";
import { getCurrentUserProfile } from "@/lib/supabase/tenant";
import { createClient } from "@/lib/supabase/server";
import type { WhatsAppMessageWithLead } from "@/types/database";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface RouteParams {
  params: Promise<{ campaignId: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  try {
    const profile = await getCurrentUserProfile();
    if (!profile) {
      return NextResponse.json(
        { error: "Não autenticado" },
        { status: 401 }
      );
    }

    const { campaignId } = await params;

    if (!UUID_RE.test(campaignId)) {
      return NextResponse.json(
        { error: "ID de campanha inválido" },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Verify campaign exists and belongs to tenant
    const { data: campaign, error: campaignError } = await supabase
      .from("campaigns")
      .select("id")
      .eq("id", campaignId)
      .eq("tenant_id", profile.tenant_id)
      .single();

    if (campaignError || !campaign) {
      return NextResponse.json(
        { error: "Campanha não encontrada" },
        { status: 404 }
      );
    }

    // Parse optional leadEmail filter
    const url = new URL(request.url);
    const leadEmailFilter = url.searchParams.get("leadEmail");

    // Fetch WhatsApp messages with lead data
    let query = supabase
      .from("whatsapp_messages")
      .select("*, leads!inner(email, first_name, last_name)")
      .eq("campaign_id", campaignId)
      .eq("tenant_id", profile.tenant_id)
      .order("created_at", { ascending: false });

    if (leadEmailFilter) {
      query = query.eq("leads.email", leadEmailFilter);
    }

    const { data: messages, error: messagesError } = await query;

    if (messagesError) {
      return NextResponse.json(
        { error: "Erro ao buscar mensagens WhatsApp" },
        { status: 500 }
      );
    }

    // Transform to WhatsAppMessageWithLead format
    const result: WhatsAppMessageWithLead[] = (messages ?? []).map((msg) => {
      const leadData = msg.leads as unknown as { email: string; first_name: string | null; last_name: string | null };
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { leads: _leads, ...messageFields } = msg;
      return {
        ...messageFields,
        lead_email: leadData.email,
        lead_name: [leadData.first_name, leadData.last_name].filter(Boolean).join(" ") || null,
      };
    });

    return NextResponse.json({ data: result });
  } catch {
    return NextResponse.json(
      { error: "Erro interno ao buscar mensagens WhatsApp" },
      { status: 500 }
    );
  }
}
