/**
 * Lead Tracking API Route
 * Story 10.3: Instantly Analytics Service (Polling)
 *
 * GET /api/campaigns/[campaignId]/leads/tracking — Fetch per-lead tracking
 * AC: #3 — LeadTracking[] with openCount, clickCount, hasReplied, lastOpenAt
 * AC: #4 — Error handling with Portuguese messages
 */

import { NextResponse } from "next/server";
import { getCurrentUserProfile } from "@/lib/supabase/tenant";
import { createClient } from "@/lib/supabase/server";
import { decryptApiKey } from "@/lib/crypto/encryption";
import { TrackingService } from "@/lib/services/tracking";
import { ExternalServiceError } from "@/lib/services/base-service";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface RouteParams {
  params: Promise<{ campaignId: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
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

    // Fetch campaign to get external_campaign_id
    const { data: campaign, error: campaignError } = await supabase
      .from("campaigns")
      .select("id, external_campaign_id")
      .eq("id", campaignId)
      .single();

    if (campaignError || !campaign) {
      return NextResponse.json(
        { error: "Campanha não encontrada" },
        { status: 404 }
      );
    }

    if (!campaign.external_campaign_id) {
      return NextResponse.json(
        { error: "Esta campanha ainda não foi exportada para o Instantly. Exporte a campanha primeiro." },
        { status: 400 }
      );
    }

    // Fetch API key
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
    const service = new TrackingService();
    const leads = await service.getLeadTracking({
      apiKey,
      externalCampaignId: campaign.external_campaign_id,
    });

    // Enrich tracking leads with phone + leadId from local leads table (Story 11.4, 11.5)
    // Instantly API doesn't return phone — fetch from DB by email match
    const emails = leads.map((l) => l.leadEmail).filter(Boolean);
    const phoneMap = new Map<string, string>();
    const emailByLeadId = new Map<string, string>();
    const leadIdMap = new Map<string, string>();

    if (emails.length > 0) {
      const { data: dbLeads } = await supabase
        .from("leads")
        .select("id, email, phone")
        .in("email", emails)
        .eq("tenant_id", profile.tenant_id);

      if (dbLeads) {
        for (const row of dbLeads) {
          if (row.email && row.phone) {
            phoneMap.set(row.email, row.phone);
          }
          if (row.id && row.email) {
            emailByLeadId.set(row.id, row.email);
            leadIdMap.set(row.email, row.id);
          }
        }
      }
    }

    // Fetch sent WhatsApp emails for this campaign (Story 11.4 AC#7)
    // Story 11.7 AC#8: Also build aggregate WhatsApp stats per lead
    const sentLeadEmails: string[] = [];
    const whatsappStats = new Map<string, { count: number; lastSentAt: string | null; lastStatus: string | null }>();

    if (emailByLeadId.size > 0) {
      const { data: allMessages } = await supabase
        .from("whatsapp_messages")
        .select("lead_id, status, sent_at")
        .eq("campaign_id", campaignId)
        .eq("tenant_id", profile.tenant_id);

      if (allMessages) {
        // Group by lead_id for aggregate stats
        for (const msg of allMessages) {
          const email = emailByLeadId.get(msg.lead_id);
          if (!email) continue;

          // Existing: track sent emails (11.4 compat)
          if (msg.status === "sent" && !sentLeadEmails.includes(email)) {
            sentLeadEmails.push(email);
          }

          // Story 11.7 AC#8: Aggregate stats
          const existing = whatsappStats.get(email);
          if (existing) {
            existing.count++;
            // Track latest by sent_at
            if (msg.sent_at && (!existing.lastSentAt || msg.sent_at > existing.lastSentAt)) {
              existing.lastSentAt = msg.sent_at;
              existing.lastStatus = msg.status;
            }
          } else {
            whatsappStats.set(email, {
              count: 1,
              lastSentAt: msg.sent_at ?? null,
              lastStatus: msg.status ?? null,
            });
          }
        }
      }
    }

    // Map campaignId to local ID + merge phone + leadId + WhatsApp stats from DB
    const mappedLeads = leads.map((lead) => {
      const waStats = whatsappStats.get(lead.leadEmail);
      return {
        ...lead,
        campaignId,
        phone: lead.phone || phoneMap.get(lead.leadEmail) || undefined,
        leadId: leadIdMap.get(lead.leadEmail) || undefined,
        whatsappMessageCount: waStats?.count ?? 0,
        lastWhatsAppSentAt: waStats?.lastSentAt ?? null,
        lastWhatsAppStatus: waStats?.lastStatus ?? null,
      };
    });

    return NextResponse.json({ data: mappedLeads, sentLeadEmails });
  } catch (error) {
    if (error instanceof ExternalServiceError) {
      return NextResponse.json(
        { error: error.userMessage },
        { status: error.statusCode || 502 }
      );
    }

    return NextResponse.json(
      { error: "Erro interno ao buscar tracking de leads" },
      { status: 500 }
    );
  }
}
