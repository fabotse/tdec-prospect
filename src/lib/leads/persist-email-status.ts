/**
 * persist-email-status.ts — gravação best-effort de `leads.email_status` (Story 24.12).
 *
 * Só servidor. Sempre num UPDATE à parte do UPDATE/INSERT principal: o código pode subir
 * antes da migration 00072, e antes dela o UPDATE falha (coluna inexistente). Nesse caso
 * só loga com `console.warn` — nunca lança e nunca muda a resposta de quem chamou.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { LeadEmailStatus } from "@/lib/leads/email-status";

/** Devolve `true` quando gravou. `status` nulo não grava nada (devolve `false`). */
export async function persistLeadEmailStatus(
  supabase: SupabaseClient,
  tenantId: string,
  leadId: string,
  status: LeadEmailStatus | null
): Promise<boolean> {
  if (!status) return false;
  try {
    const { error } = await supabase
      .from("leads")
      .update({ email_status: status })
      .eq("tenant_id", tenantId)
      .eq("id", leadId);
    if (error) {
      console.warn("[email-status] status do e-mail nao gravado (migration 00072 aplicada?):", error);
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[email-status] status do e-mail nao gravado:", error);
    return false;
  }
}
