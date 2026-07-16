/**
 * Server Actions: WhatsApp Message Sending
 * Story: 11.4 - Envio Individual de WhatsApp
 *
 * AC: #2 - Server action sendWhatsAppMessage
 * Flow: validate → auth → credentials → resolve leadId → insert pending → send → update sent/failed
 */

"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUserProfile } from "@/lib/supabase/tenant";
import { decryptApiKey } from "@/lib/crypto/encryption";
import { ZApiService } from "@/lib/services/zapi";
import type { WhatsAppMessage } from "@/types/database";
import { z } from "zod";

// ==============================================
// VALIDATION SCHEMAS
// ==============================================

const sendFromInsightSchema = z.object({
  leadId: z.string().uuid(),
  insightId: z.string().uuid(),
  phone: z.string().regex(/^\+?\d{10,15}$/, "Formato de telefone inválido"),
  message: z.string().min(1).max(5000),
});

const sendFromOpportunitySchema = z.object({
  opportunityId: z.string().uuid(),
  leadId: z.string().uuid(),
  phone: z.string().regex(/^\+?\d{10,15}$/, "Formato de telefone inválido"),
  message: z.string().min(1).max(5000),
});

const sendWhatsAppSchema = z.object({
  campaignId: z.string().uuid(),
  leadEmail: z.string().email(),
  phone: z.string().regex(/^\+?\d{10,15}$/, "Formato de telefone inválido"),
  message: z.string().min(1).max(5000),
});

// ==============================================
// RESULT TYPE
// ==============================================

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

// ==============================================
// SHARED HELPERS
// ==============================================

async function getZApiCredentials(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string
): Promise<ActionResult<string>> {
  const { data: apiConfig, error: configError } = await supabase
    .from("api_configs")
    .select("encrypted_key")
    .eq("tenant_id", tenantId)
    .eq("service_name", "zapi")
    .single();

  if (configError || !apiConfig) {
    return {
      success: false,
      error: "Z-API não configurado. Configure a integração em Configurações.",
    };
  }

  try {
    const apiKey = decryptApiKey(apiConfig.encrypted_key);
    return { success: true, data: apiKey };
  } catch {
    return {
      success: false,
      error: "Erro ao descriptografar credenciais Z-API. Reconfigure a integração.",
    };
  }
}

// ==============================================
// SERVER ACTION
// ==============================================

/**
 * Send a WhatsApp message to a lead via Z-API
 * AC: #2 — Full flow: pending → sent | pending → failed
 */
export async function sendWhatsAppMessage(
  input: z.infer<typeof sendWhatsAppSchema>
): Promise<ActionResult<WhatsAppMessage>> {
  // 0. Sanitize phone: strip parens, dashes, spaces — keep + and digits for Z-API
  const sanitizedInput = {
    ...input,
    phone: input.phone.replace(/[^\d+]/g, ""),
  };

  // 1. Validate input with Zod
  const parsed = sendWhatsAppSchema.safeParse(sanitizedInput);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Dados inválidos";
    return { success: false, error: message };
  }

  // 2. Authenticate via getCurrentUserProfile → tenant_id
  const profile = await getCurrentUserProfile();
  if (!profile) {
    return { success: false, error: "Não autenticado" };
  }

  const supabase = await createClient();

  // 3-4. Fetch and decrypt Z-API credentials
  const credentialsResult = await getZApiCredentials(supabase, profile.tenant_id);
  if (!credentialsResult.success) return credentialsResult;
  const apiKey = credentialsResult.data;

  // 5. Resolve leadId FROM leads WHERE email=leadEmail AND tenant_id (CRITICO)
  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("id")
    .eq("email", parsed.data.leadEmail)
    .eq("tenant_id", profile.tenant_id)
    .single();

  if (leadError || !lead) {
    return {
      success: false,
      error: "Lead não encontrado. Verifique o email do lead.",
    };
  }

  // 6. Insert whatsapp_messages with status 'pending'
  const { data: insertedMessage, error: insertError } = await supabase
    .from("whatsapp_messages")
    .insert({
      tenant_id: profile.tenant_id,
      campaign_id: parsed.data.campaignId,
      lead_id: lead.id,
      phone: parsed.data.phone,
      message: parsed.data.message,
      status: "pending",
      external_message_id: null,
      external_zaap_id: null,
      error_message: null,
      sent_at: null,
    })
    .select()
    .single();

  if (insertError || !insertedMessage) {
    // Story 13.11 (AC #4): logar o erro REAL do Postgres. Este early-return genérico
    // engoliu por meses um 23502 no fluxo de insight (13.7) — feature entregue,
    // code-review aprovada e 100% quebrada em produção. A mensagem ao usuário
    // permanece genérica em pt-BR (não vaza detalhe de banco).
    // Logar SÓ code+message: `insertError.details` traz "Failing row contains (...)"
    // com telefone e corpo da mensagem — PII não vai para o log.
    console.error(
      "[whatsapp] falha ao registrar mensagem:",
      insertError?.code ?? "sem código",
      insertError?.message ?? "insert não retornou linha"
    );
    return {
      success: false,
      error: "Erro ao registrar mensagem. Tente novamente.",
    };
  }

  // 7. Call ZApiService.sendText() and update record
  const zapi = new ZApiService();
  try {
    const sendResult = await zapi.sendText(apiKey, parsed.data.phone, parsed.data.message);

    // 8a. Success → update to 'sent'
    const { data: updatedMessage, error: updateError } = await supabase
      .from("whatsapp_messages")
      .update({
        status: "sent",
        external_message_id: sendResult.messageId,
        external_zaap_id: sendResult.zaapId,
        sent_at: new Date().toISOString(),
      })
      .eq("id", insertedMessage.id)
      .select()
      .single();

    if (updateError || !updatedMessage) {
      // Message was sent but update failed — return insert with manual status override
      return {
        success: true,
        data: {
          ...insertedMessage,
          status: "sent",
          external_message_id: sendResult.messageId,
          external_zaap_id: sendResult.zaapId,
        } as WhatsAppMessage,
      };
    }

    return { success: true, data: updatedMessage as WhatsAppMessage };
  } catch (error) {
    // 8b. Failure → update to 'failed'
    const errorMessage =
      error instanceof Error ? error.message : "Erro desconhecido ao enviar mensagem";

    await supabase
      .from("whatsapp_messages")
      .update({
        status: "failed",
        error_message: errorMessage,
      })
      .eq("id", insertedMessage.id);

    return {
      success: false,
      error: `Falha ao enviar mensagem WhatsApp: ${errorMessage}`,
    };
  }
}

// ==============================================
// SERVER ACTION: Send WhatsApp from Insight
// Story 13.7 — AC: #2, #5
// ==============================================

/**
 * Send a WhatsApp message from an insight context.
 * Uses leadId directly (no email resolution), no campaignId.
 * On success, auto-marks insight as "used" (AC #5).
 */
export async function sendWhatsAppFromInsight(
  input: z.infer<typeof sendFromInsightSchema>
): Promise<ActionResult<WhatsAppMessage>> {
  // 0. Sanitize phone
  const sanitizedInput = {
    ...input,
    phone: input.phone.replace(/[^\d+]/g, ""),
  };

  // 1. Validate
  const parsed = sendFromInsightSchema.safeParse(sanitizedInput);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Dados inválidos";
    return { success: false, error: message };
  }

  // 2. Auth
  const profile = await getCurrentUserProfile();
  if (!profile) {
    return { success: false, error: "Não autenticado" };
  }

  const supabase = await createClient();

  // 3-4. Fetch and decrypt Z-API credentials
  const credentialsResult = await getZApiCredentials(supabase, profile.tenant_id);
  if (!credentialsResult.success) return credentialsResult;
  const apiKey = credentialsResult.data;

  // 5. Verify lead belongs to tenant (security: prevent cross-tenant access)
  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("id")
    .eq("id", parsed.data.leadId)
    .eq("tenant_id", profile.tenant_id)
    .single();

  if (leadError || !lead) {
    return {
      success: false,
      error: "Lead não encontrado ou não pertence à sua organização.",
    };
  }

  // 6. Insert whatsapp_messages with campaign_id=null
  const { data: insertedMessage, error: insertError } = await supabase
    .from("whatsapp_messages")
    .insert({
      tenant_id: profile.tenant_id,
      campaign_id: null,
      lead_id: parsed.data.leadId,
      phone: parsed.data.phone,
      message: parsed.data.message,
      status: "pending",
      external_message_id: null,
      external_zaap_id: null,
      error_message: null,
      sent_at: null,
    })
    .select()
    .single();

  if (insertError || !insertedMessage) {
    // Story 13.11 (AC #4): logar o erro REAL do Postgres. Foi exatamente AQUI que o
    // bug se escondeu: `campaign_id: null` violava o NOT NULL de 00042:35 → 23502 →
    // este early-return genérico → mensagem nunca enviada, erro nunca visto. A
    // migration 00059 legaliza o null; o log garante que a próxima violação de
    // schema não fique invisível. Mensagem ao usuário inalterada (pt-BR, sem
    // detalhe de banco).
    // Logar SÓ code+message: `insertError.details` traz "Failing row contains (...)"
    // com telefone e corpo da mensagem — PII não vai para o log.
    console.error(
      "[whatsapp-from-insight] falha ao registrar mensagem:",
      insertError?.code ?? "sem código",
      insertError?.message ?? "insert não retornou linha"
    );
    return {
      success: false,
      error: "Erro ao registrar mensagem. Tente novamente.",
    };
  }

  // 6. Send via Z-API
  const zapi = new ZApiService();
  try {
    const sendResult = await zapi.sendText(apiKey, parsed.data.phone, parsed.data.message);

    // 7a. Success → update to 'sent'
    const { data: updatedMessage, error: updateError } = await supabase
      .from("whatsapp_messages")
      .update({
        status: "sent",
        external_message_id: sendResult.messageId,
        external_zaap_id: sendResult.zaapId,
        sent_at: new Date().toISOString(),
      })
      .eq("id", insertedMessage.id)
      .select()
      .single();

    // 7b. Auto-mark insight as "used" (AC #5)
    try {
      const { error: insightError } = await supabase
        .from("lead_insights")
        .update({ status: "used" })
        .eq("id", parsed.data.insightId)
        .eq("tenant_id", profile.tenant_id);
      if (insightError) {
        // Message was sent — don't fail the operation, insight stays as-is
      }
    } catch {
      // Network error — isolate from WA message result
    }

    if (updateError || !updatedMessage) {
      return {
        success: true,
        data: {
          ...insertedMessage,
          status: "sent",
          external_message_id: sendResult.messageId,
          external_zaap_id: sendResult.zaapId,
        } as WhatsAppMessage,
      };
    }

    return { success: true, data: updatedMessage as WhatsAppMessage };
  } catch (error) {
    // 7c. Failure → update to 'failed'
    const errorMessage =
      error instanceof Error ? error.message : "Erro desconhecido ao enviar mensagem";

    await supabase
      .from("whatsapp_messages")
      .update({
        status: "failed",
        error_message: errorMessage,
      })
      .eq("id", insertedMessage.id);

    return {
      success: false,
      error: `Falha ao enviar mensagem WhatsApp: ${errorMessage}`,
    };
  }
}

/**
 * Send a WhatsApp message from an opportunity card (Story 21.5, AC #3).
 *
 * Espelha `sendWhatsAppFromInsight` com DUAS diferenças deliberadas:
 *
 * 1. `campaign_id` é VINCULADO à campanha da oportunidade (decisão Fabossi #3) —
 *    e não `null` como no insight (insight não tem campanha). Como
 *    `opportunities.campaign_id` não tem FK (00055) mas
 *    `whatsapp_messages.campaign_id` tem (00042:35), um id "dangling" (campanha
 *    deletada) dispararia FK 23503 e quebraria o envio → pré-check obrigatório.
 *
 *    Campanha dangling → `campaign_id: null` e ENVIA MESMO ASSIM: não bloquear um
 *    lead quente por causa de uma campanha deletada. A coluna é nullable desde a
 *    00059 (Story 13.11, aplicada e validada no banco do cliente em 2026-07-15;
 *    FK e UNIQUE preservadas), e a mensagem com `campaign_id NULL` aparece no
 *    histórico do lead — a 13.11 trocou o `campaigns!inner` por LEFT join.
 *
 * 2. O auto-mark da fonte (`opportunity → contacted`) vive EXCLUSIVAMENTE no ramo
 *    de sucesso, depois do `sendText` retornar OK (decisão Fabossi #2).
 */
export async function sendWhatsAppFromOpportunity(
  input: z.infer<typeof sendFromOpportunitySchema>
): Promise<ActionResult<WhatsAppMessage>> {
  // 0. Sanitize phone
  const sanitizedInput = {
    ...input,
    phone: input.phone.replace(/[^\d+]/g, ""),
  };

  // 1. Validate
  const parsed = sendFromOpportunitySchema.safeParse(sanitizedInput);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Dados inválidos";
    return { success: false, error: message };
  }

  // 2. Auth
  const profile = await getCurrentUserProfile();
  if (!profile) {
    return { success: false, error: "Não autenticado" };
  }

  const supabase = await createClient();

  // 3. Credenciais Z-API
  const credentialsResult = await getZApiCredentials(supabase, profile.tenant_id);
  if (!credentialsResult.success) return credentialsResult;
  const apiKey = credentialsResult.data;

  // 4. Lead pertence ao tenant (isolamento)
  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("id")
    .eq("id", parsed.data.leadId)
    .eq("tenant_id", profile.tenant_id)
    .single();

  if (leadError || !lead) {
    return {
      success: false,
      error: "Lead não encontrado ou não pertence à sua organização.",
    };
  }

  // 5. Oportunidade tenant-scoped (fonte do campaign_id + do vínculo com o lead)
  const { data: opportunity, error: opportunityError } = await supabase
    .from("opportunities")
    .select("campaign_id, status, lead_id")
    .eq("id", parsed.data.opportunityId)
    .eq("tenant_id", profile.tenant_id)
    .single();

  if (opportunityError || !opportunity) {
    return {
      success: false,
      error: "Oportunidade não encontrada ou não pertence à sua organização.",
    };
  }

  // 5a. `leadId` e `opportunityId` chegam do cliente e até aqui só foram validados
  // de forma INDEPENDENTE contra o tenant — nada garantia que o lead é o DESTA
  // oportunidade. Server action é endpoint HTTP autenticado: sem esta amarração,
  // um par (oportunidade A, lead B) do mesmo tenant registraria o envio sob o lead
  // errado e marcaria a oportunidade errada como `contacted`. A UI sempre manda o
  // par correto (`composerOpportunity.lead.id` vem do embed de `lead_id`).
  if (opportunity.lead_id !== parsed.data.leadId) {
    return {
      success: false,
      error: "O lead informado não pertence a esta oportunidade.",
    };
  }

  // 6. Pré-check da campanha: `opportunities.campaign_id` pode estar dangling
  // (é o caso que a Central renderiza como "Campanha desconhecida").
  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .select("id")
    .eq("id", opportunity.campaign_id)
    .eq("tenant_id", profile.tenant_id)
    .single();

  // PGRST116 = 0 linhas = campanha realmente deletada (dangling) → fallback.
  // Qualquer OUTRO erro (rede/timeout/RLS) NÃO é dangling: tratar como falha
  // gravaria `campaign_id: null` e perderia a atribuição em silêncio.
  if (campaignError && campaignError.code !== "PGRST116") {
    console.error(
      "[whatsapp-from-opportunity] falha ao pre-checar campanha:",
      campaignError.code ?? "sem código",
      campaignError.message ?? "erro sem mensagem"
    );
    return {
      success: false,
      error: "Erro ao verificar a campanha de origem. Tente novamente.",
    };
  }

  // Campanha deletada → grava `null` e ENVIA MESMO ASSIM (00059 aplicada):
  // não bloquear um lead quente por causa de bookkeeping de campanha.
  const resolvedCampaignId = campaign ? opportunity.campaign_id : null;

  // 7. Insert pending com o campaign_id resolvido
  const { data: insertedMessage, error: insertError } = await supabase
    .from("whatsapp_messages")
    .insert({
      tenant_id: profile.tenant_id,
      campaign_id: resolvedCampaignId,
      lead_id: parsed.data.leadId,
      phone: parsed.data.phone,
      message: parsed.data.message,
      status: "pending",
      external_message_id: null,
      external_zaap_id: null,
      error_message: null,
      sent_at: null,
    })
    .select()
    .single();

  if (insertError || !insertedMessage) {
    // Logar o erro REAL: o early-return genérico da 13.7 escondeu um bug de
    // produção por meses (achado do create-story da 21.5 → Story 13.11).
    // Logar SÓ code+message: `insertError.details` traz "Failing row contains (...)"
    // com telefone e corpo da mensagem — PII não vai para o log.
    console.error(
      "[whatsapp-from-opportunity] falha ao registrar mensagem:",
      insertError?.code ?? "sem código",
      insertError?.message ?? "insert não retornou linha"
    );
    return {
      success: false,
      error: "Erro ao registrar mensagem. Tente novamente.",
    };
  }

  // 8. Envio via Z-API
  const zapi = new ZApiService();
  try {
    const sendResult = await zapi.sendText(apiKey, parsed.data.phone, parsed.data.message);

    // 8a. Sucesso → 'sent'
    const { data: updatedMessage, error: updateError } = await supabase
      .from("whatsapp_messages")
      .update({
        status: "sent",
        external_message_id: sendResult.messageId,
        external_zaap_id: sendResult.zaapId,
        sent_at: new Date().toISOString(),
      })
      .eq("id", insertedMessage.id)
      .select()
      .single();

    // 8b. SÓ ENTÃO auto-marcar a oportunidade (decisão #2). Guarda de
    // state-machine: promove só de new/viewed — não rebaixa `meeting_booked`
    // nem ressuscita `discarded`. Isolado: falhar aqui não desfaz o envio.
    try {
      const { error: markError } = await supabase
        .from("opportunities")
        .update({ status: "contacted" })
        .eq("id", parsed.data.opportunityId)
        .eq("tenant_id", profile.tenant_id)
        .in("status", ["new", "viewed"]);
      if (markError) {
        console.error("[whatsapp-from-opportunity] falha ao marcar contacted:", markError);
      }
    } catch (markError) {
      console.error("[whatsapp-from-opportunity] falha ao marcar contacted:", markError);
    }

    if (updateError || !updatedMessage) {
      return {
        success: true,
        data: {
          ...insertedMessage,
          status: "sent",
          external_message_id: sendResult.messageId,
          external_zaap_id: sendResult.zaapId,
        } as WhatsAppMessage,
      };
    }

    return { success: true, data: updatedMessage as WhatsAppMessage };
  } catch (error) {
    // 8c. Falha → 'failed'. A oportunidade permanece no status atual (decisão #2).
    const errorMessage =
      error instanceof Error ? error.message : "Erro desconhecido ao enviar mensagem";

    await supabase
      .from("whatsapp_messages")
      .update({
        status: "failed",
        error_message: errorMessage,
      })
      .eq("id", insertedMessage.id);

    return {
      success: false,
      error: `Falha ao enviar mensagem WhatsApp: ${errorMessage}`,
    };
  }
}
