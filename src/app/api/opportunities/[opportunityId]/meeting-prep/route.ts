import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserProfile } from "@/lib/supabase/tenant";
import { getApiKey, logMonitoringUsage } from "@/lib/utils/monitoring-processor";
import { fetchKnowledgeBaseProofs } from "@/lib/services/knowledge-base-proofs";
import { lookupAccountDossier } from "@/lib/agent/dossier/dossier-lookup";
import { calculateMeetingPrepCost } from "@/lib/ai/meeting-prep-config";
import {
  buildMeetingPrepSources,
  MAX_EVENTS,
  type MeetingPrepDossierInput,
  type MeetingPrepEventInput,
  type MeetingPrepIcpInput,
} from "@/lib/meeting-prep/sources";
import { generateMeetingPrep } from "@/lib/meeting-prep/generator";
import { parseMeetingPrep, type MeetingPrep } from "@/types/meeting-prep";

/**
 * POST /api/opportunities/:opportunityId/meeting-prep
 * Story 24.23: briefing de preparação de reunião — geração ON-DEMAND com cache em
 * `opportunities.meeting_prep` (migration 00074).
 *
 * Body: { regenerate?: boolean }
 * - Elegível = `intent='interessado'` OU `status='meeting_booked'`; senão 422 NOT_ELIGIBLE.
 * - Briefing salvo e `regenerate !== true` → devolve o salvo (sem LLM e sem custo).
 * - Resumo da conta e engajamento são determinísticos (dossiê + linha + campaign_events).
 *   A LLM só escreve pontos de conversa e objeções, citando ids revalidados no código.
 *
 * Fail-open: sem chave, LLM fora, timeout ou JSON inválido → 200 com `meetingPrep: null`
 * e `reason`, sem gravar. Falha na gravação → devolve o briefing com `saved: false`.
 *
 * Custo: api_usage_logs (service_name='openai', request_type='opportunity_meeting_prep'),
 * só com consumo real de tokens.
 */

// A geração tem timeout interno de 30s — 60s dá folga para as leituras e o round-trip.
export const maxDuration = 60;

interface LeadEmbed {
  id: string;
  email: string | null;
  company_name: string | null;
  title: string | null;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ opportunityId: string }> }
) {
  const profile = await getCurrentUserProfile();
  if (!profile) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Nao autenticado" } },
      { status: 401 }
    );
  }

  const { opportunityId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Body deve ser JSON valido" } },
      { status: 400 }
    );
  }
  if (typeof body !== "object" || body === null) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Body deve ser um objeto JSON" } },
      { status: 400 }
    );
  }
  const regenerate = (body as Record<string, unknown>).regenerate === true;
  const tenantId = profile.tenant_id;

  const supabase = await createClient();

  // `*` traz `meeting_prep` só quando a 00074 estiver aplicada (antes, a chave não vem).
  const { data: row, error: loadError } = await supabase
    .from("opportunities")
    .select("*, lead:leads ( id, email, company_name, title )")
    .eq("id", opportunityId)
    .eq("tenant_id", tenantId)
    .single();

  if (loadError || !row) {
    if (loadError?.code === "PGRST116") {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Oportunidade nao encontrada" } },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro ao carregar oportunidade" } },
      { status: 500 }
    );
  }

  if (row.intent !== "interessado" && row.status !== "meeting_booked") {
    return NextResponse.json(
      {
        error: {
          code: "NOT_ELIGIBLE",
          message: "Preparação de reunião só para lead interessado ou com reunião marcada",
        },
      },
      { status: 422 }
    );
  }

  // Cache: o briefing salvo vale até o usuário pedir para regenerar.
  const saved = parseMeetingPrep(row.meeting_prep);
  if (saved && !regenerate) {
    return NextResponse.json({ data: { meetingPrep: saved, cached: true } });
  }

  // Chave da OpenAI, KB e provas ficam atrás de `is_admin()` (mesma razão da rota
  // `suggestion`): leitura server-side, tenant-scoped, a chave nunca chega ao browser.
  let adminClient: SupabaseClient;
  try {
    adminClient = createAdminClient();
  } catch (adminError) {
    console.error("[meeting-prep] client admin indisponivel:", adminError);
    return NextResponse.json({ data: { meetingPrep: null, reason: "unavailable" } });
  }

  const openaiKey = await getApiKey(adminClient, tenantId, "openai");
  if (!openaiKey) {
    return NextResponse.json({ data: { meetingPrep: null, reason: "no_openai_key" } });
  }

  const lead = (row.lead ?? null) as LeadEmbed | null;
  const leadEmail = lead?.email?.trim() || null;

  const [dossier, campaignName, events, icp, proofs] = await Promise.all([
    readDossier(supabase, tenantId, lead),
    readCampaignName(supabase, tenantId, row.campaign_id as string),
    readEvents(supabase, tenantId, row.campaign_id as string, leadEmail),
    readIcp(adminClient, tenantId),
    fetchKnowledgeBaseProofs(adminClient, tenantId, "[meeting-prep]"),
  ]);

  const sources = buildMeetingPrepSources({
    dossier,
    opportunity: {
      source: row.source === "engagement" ? "engagement" : "reply",
      replySubject: (row.reply_subject ?? null) as string | null,
      replyText: (row.reply_text ?? null) as string | null,
      openCount: (row.open_count ?? null) as number | null,
      clickCount: (row.click_count ?? null) as number | null,
      lastEngagementAt: (row.last_engagement_at ?? null) as string | null,
      meetingBookedAt: (row.meeting_booked_at ?? null) as string | null,
      createdAt: row.created_at as string,
    },
    campaignName,
    events,
    proofs,
    icp,
    lead: lead ? { title: lead.title, companyName: lead.company_name } : null,
  });

  const result = await generateMeetingPrep({ catalog: sources.catalog, apiKey: openaiKey });

  if (result.usage.promptTokens + result.usage.completionTokens > 0) {
    await logMonitoringUsage(supabase, {
      tenantId,
      serviceName: "openai",
      requestType: "opportunity_meeting_prep",
      leadId: (row.lead_id as string | null) ?? undefined,
      estimatedCost: calculateMeetingPrepCost(
        result.usage.promptTokens,
        result.usage.completionTokens
      ),
      status: result.reason ? "failed" : "success",
      errorMessage: result.reason,
      durationMs: result.usage.durationMs,
      metadata: {
        model: result.usage.model,
        promptTokens: result.usage.promptTokens,
        completionTokens: result.usage.completionTokens,
        regenerate,
      },
    });
  }

  if (result.reason) {
    return NextResponse.json({ data: { meetingPrep: null, reason: result.reason } });
  }

  const meetingPrep: MeetingPrep = {
    version: 1,
    generatedAt: new Date().toISOString(),
    account: sources.account,
    engagement: sources.engagement,
    talkingPoints: result.talkingPoints,
    objections: result.objections,
  };

  const { error: updateError } = await supabase
    .from("opportunities")
    .update({ meeting_prep: meetingPrep })
    .eq("id", opportunityId)
    .eq("tenant_id", tenantId);

  if (updateError) {
    // O briefing já foi gerado (e pago): devolver vale mais que falhar. Sem a 00074
    // aplicada, este é o caminho esperado.
    console.error("[meeting-prep] falha ao salvar o briefing:", updateError);
    return NextResponse.json({ data: { meetingPrep, saved: false } });
  }

  return NextResponse.json({ data: { meetingPrep, saved: true } });
}

// ==============================================
// LEITURAS (todas tenant-scoped; nenhuma lança)
// ==============================================

async function readDossier(
  supabase: SupabaseClient,
  tenantId: string,
  lead: LeadEmbed | null
): Promise<MeetingPrepDossierInput> {
  if (!lead?.id) return { status: "none" };
  const result = await lookupAccountDossier(supabase, tenantId, {
    leadId: lead.id,
    email: lead.email ?? null,
  });
  if ("error" in result) {
    console.error("[meeting-prep] falha ao ler o dossie:", result.error);
    return { status: "error" };
  }
  return result.view.status === "found" ? { status: "found", view: result.view } : { status: "none" };
}

async function readCampaignName(
  supabase: SupabaseClient,
  tenantId: string,
  campaignId: string | null
): Promise<string | null> {
  if (!campaignId) return null;
  try {
    const { data, error } = await supabase
      .from("campaigns")
      .select("name")
      .eq("id", campaignId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (error || !data) return null;
    return typeof data.name === "string" ? data.name : null;
  } catch {
    return null;
  }
}

async function readEvents(
  supabase: SupabaseClient,
  tenantId: string,
  campaignId: string | null,
  leadEmail: string | null
): Promise<MeetingPrepEventInput[]> {
  if (!campaignId || !leadEmail) return [];
  // O webhook grava `lead_email` na caixa original e o reply-processor em minúsculo:
  // casa os dois (valores via `.in`, nunca filtro montado com string).
  const emails = [...new Set([leadEmail, leadEmail.toLowerCase()])];
  try {
    const { data, error } = await supabase
      .from("campaign_events")
      .select("event_type, event_timestamp")
      .eq("tenant_id", tenantId)
      .eq("campaign_id", campaignId)
      .in("lead_email", emails)
      .order("event_timestamp", { ascending: false })
      .limit(MAX_EVENTS);
    if (error) {
      console.error("[meeting-prep] falha ao ler eventos (seguindo sem):", error);
      return [];
    }
    return Array.isArray(data) ? (data as MeetingPrepEventInput[]) : [];
  } catch (error) {
    console.error("[meeting-prep] falha ao ler eventos (seguindo sem):", error);
    return [];
  }
}

async function readIcp(
  adminClient: SupabaseClient,
  tenantId: string
): Promise<MeetingPrepIcpInput | null> {
  try {
    const { data, error } = await adminClient
      .from("knowledge_base")
      .select("content")
      .eq("tenant_id", tenantId)
      .eq("section", "icp")
      .maybeSingle();
    if (error || !data || typeof data.content !== "object" || data.content === null) return null;
    return data.content as MeetingPrepIcpInput;
  } catch {
    return null;
  }
}
