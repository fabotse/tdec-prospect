/**
 * useAgentOnboarding
 * Story 16.4: Onboarding & Selecao de Modo
 *
 * AC: #1, #2 - Detecta se usuario e first-time (nenhuma execucao anterior)
 */

import { useQuery } from "@tanstack/react-query";
import type { AgentExecution } from "@/types/agent";

export function useAgentOnboarding() {
  const { data, isLoading, isError } = useQuery<{ data: AgentExecution[] }>({
    queryKey: ["agent-executions-onboarding"],
    queryFn: async () => {
      const response = await fetch("/api/agent/executions");
      if (!response.ok) throw new Error("Falha ao verificar historico");
      return response.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  return {
    isFirstTime: !isLoading && !isError && (data?.data?.length ?? 0) === 0,
    isLoading,
  };
}
