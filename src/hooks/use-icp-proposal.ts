"use client";

/**
 * useIcpProposal
 * Story: 24.14 - Briefing a partir do ICP
 *
 * Busca a proposta de briefing montada a partir do ICP do tenant
 * (`GET /api/agent/briefing/icp-proposal`). `isLoaded` so fica true quando a leitura deu
 * certo: falha de rede/servidor -> nada aparece (nem proposta, nem dica de preencher o ICP).
 */

import { useQuery } from "@tanstack/react-query";
import type { ParsedBriefing } from "@/types/agent";

export const ICP_PROPOSAL_QUERY_KEY = ["agent-icp-proposal"] as const;

async function fetchIcpProposal(): Promise<ParsedBriefing | null> {
  const response = await fetch("/api/agent/briefing/icp-proposal");
  if (!response.ok) throw new Error("Erro ao carregar a proposta do ICP");
  const body = (await response.json()) as { data?: { proposal?: ParsedBriefing | null } };
  return body.data?.proposal ?? null;
}

export function useIcpProposal(enabled = true): {
  proposal: ParsedBriefing | null;
  isLoaded: boolean;
} {
  const { data, isSuccess } = useQuery({
    queryKey: ICP_PROPOSAL_QUERY_KEY,
    queryFn: fetchIcpProposal,
    enabled,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  return { proposal: isSuccess ? (data ?? null) : null, isLoaded: isSuccess };
}
