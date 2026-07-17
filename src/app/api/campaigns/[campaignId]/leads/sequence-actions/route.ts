/**
 * Sequence Actions API Route
 * Story 21.9: Controle Manual de Sequência por Lead (FR18)
 *
 * POST /api/campaigns/[campaignId]/leads/sequence-actions
 *
 * O `stop_on_reply` do Instantly só cobre resposta por E-MAIL — lead que responde
 * por outro canal (WhatsApp/telefone) segue recebendo follow-up. Esta rota dá o
 * controle manual:
 *   - `stop`   → POST /api/v2/leads/update-interest-status (202, job assíncrono);
 *                qualquer papel do tenant (ferramenta de trabalho — SDR incluído).
 *   - `remove` → DELETE /api/v2/leads/{id} com lookup do ID por e-mail server-side;
 *                ADMIN-only. Dados locais (leads/campaign_leads) são PRESERVADOS.
 *
 * AC7 (fail-safe): a chamada remota ao Instantly acontece PRIMEIRO; efeitos locais
 * (lead_interactions + leads.status) só são gravados se a remota suceder.
 *
 * TRAP (Dev Notes 21.9): a rota de tracking sobrescreve o Instantly lead id com o
 * id LOCAL — por isso o front envia `leadEmail` e o `remove` resolve o ID interno
 * no server via findLeadIdByEmail. NÃO aceitar id do Instantly vindo do client.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getCurrentUserProfile } from "@/lib/supabase/tenant";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasAdminAccess } from "@/lib/auth/capabilities";
import { getApiKey } from "@/lib/utils/monitoring-processor";
import { matchLeadId } from "@/lib/utils/reply-processor";
import { resolveLeadStatusTransition } from "@/lib/utils/reply-classifier";
import { InstantlyService } from "@/lib/services/instantly";
import { ExternalServiceError } from "@/lib/services/base-service";
import type { OpportunityIntent } from "@/types/opportunity";
import type { LeadStatus } from "@/types/lead";
import type { InteractionType } from "@/types/interaction";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ==============================================
// BODY SCHEMA (Task 4.2)
// ==============================================

const STOP_REASONS = ["responded_other_channel", "do_not_contact"] as const;
export type StopReason = (typeof STOP_REASONS)[number];

const bodySchema = z
  .object({
    action: z.enum(["stop", "remove"]),
    leadEmail: z.string().trim().email("E-mail do lead inválido"),
    reason: z.enum(STOP_REASONS).optional(),
  })
  .refine((body) => body.action !== "stop" || body.reason !== undefined, {
    message: "Informe o motivo para parar a sequência",
    path: ["reason"],
  });

/** Escala do Instantly: 1 = Interested (validado no smoke test), -1 = Not Interested. */
const REASON_TO_INTEREST_VALUE: Record<StopReason, number> = {
  responded_other_channel: 1,
  do_not_contact: -1,
};

/**
 * Motivo → intent da 21.3, para reusar a guarda promote-only de
 * resolveLeadStatusTransition (interessado só promove novo/em_campanha;
 * opt_out é terminal EXCETO para lead já `oportunidade`).
 */
const REASON_TO_INTENT: Record<StopReason, OpportunityIntent> = {
  responded_other_channel: "interessado",
  do_not_contact: "opt_out",
};

const REASON_LABELS: Record<StopReason, string> = {
  responded_other_channel: "respondeu por outro canal",
  do_not_contact: "não contactar mais",
};

interface RouteParams {
  params: Promise<{ campaignId: string }>;
}

// ==============================================
// LOCAL EFFECTS (só após sucesso remoto — AC7)
// ==============================================

/**
 * Registra a interação e retorna se a gravação sincronizou. Erros aqui são
 * SECUNDÁRIOS (a ação remota já aconteceu) — logados sem PII (lição 21.7).
 */
async function insertInteraction(
  supabase: SupabaseClient,
  params: {
    leadId: string;
    tenantId: string;
    userId: string;
    type: InteractionType;
    content: string;
  }
): Promise<boolean> {
  const { error } = await supabase.from("lead_interactions").insert({
    lead_id: params.leadId,
    tenant_id: params.tenantId,
    type: params.type,
    content: params.content,
    created_by: params.userId,
  });

  if (error) {
    // insertInteraction SÓ é chamado com o lead local existente (dentro de `if (leadId)`),
    // então uma falha aqui é o caso ANÔMALO: INSERT recusado com o lead presente —
    // tipicamente 22P02 se a migration 00062 (enum sequence_stopped/lead_removed) não foi
    // aplicada em prod. Log em ERROR (não warn) para o drift de schema não passar silencioso
    // (mesma classe dos bugs 00058/00059 do Epic 21). A ação remota já sucedeu (AC7).
    console.error(
      "[sequence-actions] INSERT de lead_interactions FALHOU com lead local existente — verifique a migration 00062:",
      error.code,
      error.message
    );
    return false;
  }
  return true;
}

/**
 * Atualiza o status do lead com a guarda promote-only da 21.3. SECUNDÁRIO:
 * falha não derruba a requisição (a ação remota já aconteceu).
 */
async function applyLeadStatusTransition(
  supabase: SupabaseClient,
  tenantId: string,
  leadId: string,
  reason: StopReason
): Promise<void> {
  const { data: lead, error: fetchError } = await supabase
    .from("leads")
    .select("status")
    .eq("id", leadId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (fetchError || !lead) {
    if (fetchError) {
      console.warn(
        "[sequence-actions] falha ao ler status do lead (secundário):",
        fetchError.code,
        fetchError.message
      );
    }
    return;
  }

  const target = resolveLeadStatusTransition(
    lead.status as LeadStatus,
    REASON_TO_INTENT[reason]
  );
  if (!target) return;

  const { error: updateError } = await supabase
    .from("leads")
    .update({ status: target })
    .eq("id", leadId)
    .eq("tenant_id", tenantId);

  if (updateError) {
    console.warn(
      "[sequence-actions] falha ao atualizar status do lead (secundário):",
      updateError.code,
      updateError.message
    );
  }
}

// ==============================================
// HANDLER
// ==============================================

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const profile = await getCurrentUserProfile();
    if (!profile) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const { campaignId } = await params;
    if (!UUID_RE.test(campaignId)) {
      return NextResponse.json(
        { error: "ID de campanha inválido" },
        { status: 400 }
      );
    }

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Corpo da requisição inválido" },
        { status: 400 }
      );
    }

    const parsed = bodySchema.safeParse(rawBody);
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? "Dados inválidos";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const { action, leadEmail, reason } = parsed.data;

    // Task 4.3 — remove é admin-only (dialog destrutivo); stop é liberado para
    // qualquer papel do tenant (SDR usa a Central — 21.4 AC7). Defesa em
    // profundidade: a UI também esconde o remove de não-admin.
    if (action === "remove" && !hasAdminAccess(profile.role)) {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    }

    const supabase = await createClient();

    // Campanha do tenant (RLS escopa) → 404; sem export → 400.
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
        { error: "Campanha ainda não exportada para o Instantly" },
        { status: 400 }
      );
    }

    // Task 4.4 — api_configs tem RLS is_admin(): com o client de sessão o SDR
    // (que PODE usar o stop) receberia "key não configurada" em silêncio. Leitura
    // da key com o client ADMIN (service-role), tenant-scoped dentro do getApiKey
    // — mesmo fix do patch 4 da review 21.5. A key nunca chega ao browser.
    let adminClient: SupabaseClient;
    try {
      adminClient = createAdminClient();
    } catch (adminError) {
      console.error("[sequence-actions] client admin indisponível:", adminError);
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    const apiKey = await getApiKey(adminClient, profile.tenant_id, "instantly");
    if (!apiKey) {
      return NextResponse.json(
        { error: "API key do Instantly não configurada" },
        { status: 404 }
      );
    }

    const service = new InstantlyService();

    if (action === "stop") {
      // O refine do schema garante reason em stop; o guard evita non-null assertion.
      if (!reason) {
        return NextResponse.json(
          { error: "Informe o motivo para parar a sequência" },
          { status: 400 }
        );
      }

      // AC7: remoto PRIMEIRO. Falha aqui → catch → nada local gravado.
      await service.updateLeadInterestStatus({
        apiKey,
        campaignId: campaign.external_campaign_id,
        leadEmail,
        interestValue: REASON_TO_INTEREST_VALUE[reason],
      });

      // Efeitos locais (Task 4.5): match por e-mail com escape de ILIKE (21.2).
      const leadId = await matchLeadId(supabase, profile.tenant_id, leadEmail);
      let localSynced = false;

      if (leadId) {
        localSynced = await insertInteraction(supabase, {
          leadId,
          tenantId: profile.tenant_id,
          userId: profile.id,
          type: "sequence_stopped",
          content: `Sequência interrompida (motivo: ${REASON_LABELS[reason]})`,
        });
        await applyLeadStatusTransition(
          supabase,
          profile.tenant_id,
          leadId,
          reason
        );
      }

      // 202 do Instantly = "solicitado" (job assíncrono) — a coluna Sequência
      // reflete no refetch (invalidation no hook), não em verificação síncrona.
      return NextResponse.json({ success: true, action: "stop", localSynced });
    }

    // action === "remove" (Task 4.6)
    const instantlyLeadId = await service.findLeadIdByEmail({
      apiKey,
      campaignId: campaign.external_campaign_id,
      email: leadEmail,
    });

    if (!instantlyLeadId) {
      return NextResponse.json(
        { error: "Lead não encontrado no Instantly — ele pode já ter sido removido" },
        { status: 404 }
      );
    }

    await service.deleteLead({ apiKey, leadId: instantlyLeadId });

    // Dados locais PRESERVADOS (AC3): nem leads nem campaign_leads são tocados —
    // só a interaction registra a ação quando o lead local existe.
    const localLeadId = await matchLeadId(supabase, profile.tenant_id, leadEmail);
    let localSynced = false;

    if (localLeadId) {
      localSynced = await insertInteraction(supabase, {
        leadId: localLeadId,
        tenantId: profile.tenant_id,
        userId: profile.id,
        type: "lead_removed",
        content:
          "Lead removido do Instantly (ação manual — histórico local preservado)",
      });
    }

    return NextResponse.json({ success: true, action: "remove", localSynced });
  } catch (error) {
    if (error instanceof ExternalServiceError) {
      return NextResponse.json(
        { error: error.userMessage },
        { status: error.statusCode || 502 }
      );
    }

    console.error("[sequence-actions] erro inesperado:", error);
    return NextResponse.json(
      { error: "Erro interno ao executar ação de sequência" },
      { status: 500 }
    );
  }
}
