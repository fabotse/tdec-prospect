/**
 * Preparação de reunião — hook
 * Story: 24.23 - Preparação de reunião
 *
 * Molde: `useOpportunitySuggestion`. `generate()` é passivo (abrir o painel sem briefing
 * salvo): nunca rejeita e nunca dá toast. `regenerate()` é ação explícita e notifica erro.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { OpportunityCardData } from "@/hooks/use-opportunities";
import type { MeetingPrep, MeetingPrepFailureReason } from "@/types/meeting-prep";

export interface MeetingPrepResponse {
  meetingPrep: MeetingPrep | null;
  cached?: boolean;
  saved?: boolean;
  reason?: MeetingPrepFailureReason | string;
}

interface OpportunitiesCache {
  data: OpportunityCardData[];
  [key: string]: unknown;
}

async function postMeetingPrep(
  opportunityId: string,
  regenerate: boolean
): Promise<MeetingPrepResponse> {
  const response = await fetch(`/api/opportunities/${opportunityId}/meeting-prep`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ regenerate }),
  });
  if (!response.ok) {
    let message = "Erro ao preparar a reunião";
    try {
      const error = await response.json();
      message = error?.error?.message || message;
    } catch {
      // corpo não-JSON: mantém a mensagem padrão
    }
    throw new Error(message);
  }
  const result = await response.json();
  return result.data as MeetingPrepResponse;
}

export function useMeetingPrep(opportunityId: string) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: ({ regenerate }: { regenerate: boolean }) =>
      postMeetingPrep(opportunityId, regenerate),
    onSuccess: (data) => {
      // Update PONTUAL do cache da lista (não invalida a lista inteira). Só com o
      // briefing salvo: sem a 00074, reabrir deve gerar de novo.
      if (!data.meetingPrep || data.saved === false) return;
      const meetingPrep = data.meetingPrep;
      queryClient.setQueriesData<OpportunitiesCache>({ queryKey: ["opportunities"] }, (old) => {
        if (!old || !Array.isArray(old.data)) return old;
        return {
          ...old,
          data: old.data.map((opportunity) =>
            opportunity.id === opportunityId ? { ...opportunity, meetingPrep } : opportunity
          ),
        };
      });
    },
    onError: (error: Error, { regenerate }) => {
      if (regenerate) toast.error(error.message);
    },
  });

  const run = async (regenerate: boolean): Promise<MeetingPrepResponse | null> => {
    try {
      return await mutation.mutateAsync({ regenerate });
    } catch {
      return null;
    }
  };

  return {
    generate: () => run(false),
    regenerate: () => run(true),
    isGenerating: mutation.isPending,
    error: mutation.error instanceof Error ? mutation.error.message : null,
    data: mutation.data ?? null,
  };
}
