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
// VALIDATION SCHEMA
// ==============================================

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

  // 3. Fetch Z-API credentials: api_configs WHERE service_name='zapi' AND tenant_id
  const { data: apiConfig, error: configError } = await supabase
    .from("api_configs")
    .select("encrypted_key")
    .eq("tenant_id", profile.tenant_id)
    .eq("service_name", "zapi")
    .single();

  if (configError || !apiConfig) {
    return {
      success: false,
      error: "Z-API não configurado. Configure a integração em Configurações.",
    };
  }

  // 4. Decrypt API key
  let apiKey: string;
  try {
    apiKey = decryptApiKey(apiConfig.encrypted_key);
  } catch {
    return {
      success: false,
      error: "Erro ao descriptografar credenciais Z-API. Reconfigure a integração.",
    };
  }

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
