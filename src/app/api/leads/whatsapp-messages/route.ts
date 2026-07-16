/**
 * Lead WhatsApp Messages API Route
 * Story 11.7: Tracking e Histórico de Mensagens WhatsApp
 *
 * GET /api/leads/whatsapp-messages?email=xxx — Fetch WhatsApp messages for a lead across ALL campaigns
 * AC: #4 — Used by LeadDetailPanel for lead-level WhatsApp history
 * Returns messages grouped by campaign with campaign_name included
 */

import { NextResponse } from "next/server";
import { getCurrentUserProfile } from "@/lib/supabase/tenant";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  try {
    const profile = await getCurrentUserProfile();
    if (!profile) {
      return NextResponse.json(
        { error: "Não autenticado" },
        { status: 401 }
      );
    }

    const url = new URL(request.url);
    const email = url.searchParams.get("email");

    if (!email) {
      return NextResponse.json(
        { error: "Parâmetro email é obrigatório" },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Find lead by email within tenant
    const { data: lead } = await supabase
      .from("leads")
      .select("id")
      .eq("email", email)
      .eq("tenant_id", profile.tenant_id)
      .single();

    if (!lead) {
      return NextResponse.json({ data: [] });
    }

    // Fetch all WhatsApp messages for this lead with campaign names.
    // LEFT join (sem `!inner`): desde a migration 00059 (Story 13.11) `campaign_id`
    // é nullable — mensagens que não nascem de campanha (envio a partir de um insight
    // do LinkedIn, Story 13.7) têm `campaign_id NULL`. Um INNER JOIN as descartaria
    // em silêncio: a mensagem seria enviada e sumiria do histórico do lead.
    const { data: messages, error: messagesError } = await supabase
      .from("whatsapp_messages")
      .select("*, campaigns(name)")
      .eq("lead_id", lead.id)
      .eq("tenant_id", profile.tenant_id)
      .order("created_at", { ascending: false });

    if (messagesError) {
      return NextResponse.json(
        { error: "Erro ao buscar mensagens WhatsApp" },
        { status: 500 }
      );
    }

    // Transform to include campaign_name. Com LEFT join, `campaigns` é null para
    // mensagens sem campanha — o acesso precisa ser null-safe (o `?.` aqui não é
    // defensivo por precaução: é o caminho real do envio a partir do insight).
    // `campaign_name: null` degrada para o rótulo "Sem campanha" na UI.
    const result = (messages ?? []).map((msg) => {
      const campaignData = msg.campaigns as unknown as { name: string } | null;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { campaigns: _campaigns, ...messageFields } = msg;
      return {
        ...messageFields,
        campaign_name: campaignData?.name ?? null,
      };
    });

    return NextResponse.json({ data: result });
  } catch {
    return NextResponse.json(
      { error: "Erro interno ao buscar mensagens WhatsApp do lead" },
      { status: 500 }
    );
  }
}
