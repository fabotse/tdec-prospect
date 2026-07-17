/**
 * Lead Sequence Action Hook
 * Story 21.9: Controle Manual de Sequência por Lead (AC#5/#6)
 *
 * Mutation para as ações manuais sobre a sequência do Instantly:
 *   - stop   → para os follow-ups (lead respondeu por outro canal / não contactar)
 *   - remove → remove o lead do Instantly (admin-only na rota; a UI também esconde)
 *
 * Padrão useUpdateOpportunityStatus (use-opportunities.ts): toast PT-BR +
 * invalidation de LEAD_TRACKING_QUERY_KEY — a coluna "Sequência" reflete o novo
 * estado no refetch (o 202 do Instantly é assíncrono: eventual consistency de
 * segundos, por isso a copy diz "em instantes").
 */

"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { LEAD_TRACKING_QUERY_KEY } from "@/hooks/use-lead-tracking";

// ==============================================
// TYPES
// ==============================================

export type SequenceStopReason = "responded_other_channel" | "do_not_contact";

export type LeadSequenceActionInput =
  | { action: "stop"; leadEmail: string; reason: SequenceStopReason }
  | { action: "remove"; leadEmail: string };

export interface LeadSequenceActionResult {
  success: boolean;
  action: "stop" | "remove";
  /** FALSE quando o lead não existe na base local (ação remota ainda aconteceu). */
  localSynced: boolean;
}

/** Labels PT-BR dos motivos de parada — consumidos pelos dialogs (tabela + card). */
export const SEQUENCE_STOP_REASON_LABELS: Record<SequenceStopReason, string> = {
  responded_other_channel: "Respondeu por outro canal",
  do_not_contact: "Não contactar mais",
};

// ==============================================
// FETCH
// ==============================================

async function postSequenceAction(
  campaignId: string,
  input: LeadSequenceActionInput
): Promise<LeadSequenceActionResult> {
  const response = await fetch(
    `/api/campaigns/${campaignId}/leads/sequence-actions`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }
  );
  // Parse defensivo: uma resposta não-JSON (ex.: página de erro HTML de um gateway 5xx)
  // faria `response.json()` estourar SyntaxError em inglês no toast (Review 21.9, patch P2).
  let result: (LeadSequenceActionResult & { error?: string }) | null = null;
  try {
    result = await response.json();
  } catch {
    // corpo não-JSON — result permanece null, tratado abaixo com mensagem PT-BR.
  }
  if (!response.ok) {
    throw new Error(result?.error || "Erro ao executar ação de sequência");
  }
  if (!result) {
    throw new Error("Resposta inválida do servidor");
  }
  return result;
}

// ==============================================
// HOOK
// ==============================================

export function useLeadSequenceAction(campaignId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: LeadSequenceActionInput) =>
      postSequenceAction(campaignId, input),
    onSuccess: (result) => {
      toast.success(
        result.action === "stop"
          ? "Sequência interrompida — o Instantly aplica em instantes"
          : "Lead removido do Instantly"
      );
      queryClient.invalidateQueries({
        queryKey: LEAD_TRACKING_QUERY_KEY(campaignId),
      });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}
