/**
 * Hook: useWhatsAppMessages
 * Story 11.7 AC#1 — Fetch WhatsApp message history
 *
 * Two modes:
 * - By campaign: useWhatsAppMessages(campaignId) → messages for a specific campaign
 * - By lead email: useWhatsAppMessages(undefined, leadEmail) → messages across all campaigns
 *
 * Returns: { messages, isLoading, error, refetch }
 */

"use client";

import { useQuery } from "@tanstack/react-query";
import type { WhatsAppMessageWithLead } from "@/types/database";

// ==============================================
// QUERY KEYS
// ==============================================

export const WHATSAPP_MESSAGES_QUERY_KEY = (campaignId?: string) =>
  campaignId ? ["whatsapp-messages", campaignId] : ["whatsapp-messages"];

// ==============================================
// TYPES
// ==============================================

interface WhatsAppMessageWithCampaign extends WhatsAppMessageWithLead {
  /**
   * Nome da campanha de origem. `null` quando a mensagem não nasce de uma
   * campanha (envio a partir de um insight — Story 13.7); a UI degrada para
   * o rótulo "Sem campanha".
   */
  campaign_name?: string | null;
}

interface UseWhatsAppMessagesReturn {
  messages: WhatsAppMessageWithCampaign[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

// ==============================================
// FETCH FUNCTIONS
// ==============================================

async function fetchCampaignMessages(campaignId: string, leadEmail?: string): Promise<WhatsAppMessageWithCampaign[]> {
  const url = leadEmail
    ? `/api/campaigns/${campaignId}/whatsapp-messages?leadEmail=${encodeURIComponent(leadEmail)}`
    : `/api/campaigns/${campaignId}/whatsapp-messages`;

  const response = await fetch(url);
  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || "Erro ao buscar mensagens WhatsApp");
  }

  return result.data;
}

async function fetchLeadMessages(leadEmail: string): Promise<WhatsAppMessageWithCampaign[]> {
  const response = await fetch(`/api/leads/whatsapp-messages?email=${encodeURIComponent(leadEmail)}`);
  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || "Erro ao buscar mensagens WhatsApp do lead");
  }

  return result.data;
}

// ==============================================
// HOOK
// ==============================================

/**
 * Fetch WhatsApp messages.
 *
 * AC#1: campaignId mode — fetch messages for a campaign (with optional leadEmail filter)
 * AC#4: leadEmail mode (no campaignId) — fetch messages across all campaigns for a lead
 */
export function useWhatsAppMessages(
  campaignId?: string,
  leadEmail?: string,
  options?: { enabled?: boolean }
): UseWhatsAppMessagesReturn {
  const queryKey = campaignId
    ? ["whatsapp-messages", campaignId, ...(leadEmail ? [leadEmail] : [])]
    : ["whatsapp-messages", "lead", leadEmail ?? ""];

  const enabled = (options?.enabled ?? true) && !!(campaignId || leadEmail);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey,
    queryFn: () => {
      if (campaignId) {
        return fetchCampaignMessages(campaignId, leadEmail);
      }
      // `enabled` já garante campaignId || leadEmail, mas o TS não sabe disso.
      // Leitura guardada em vez de `leadEmail!` (regra no-non-null-assertion).
      if (!leadEmail) {
        throw new Error("leadEmail é obrigatório quando campaignId não é informado");
      }
      return fetchLeadMessages(leadEmail);
    },
    staleTime: 5 * 60 * 1000,
    enabled,
  });

  return {
    messages: data ?? [],
    isLoading,
    error: error as Error | null,
    refetch,
  };
}
