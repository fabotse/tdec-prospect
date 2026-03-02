/**
 * Monitoring Configuration Hook
 * Story: 13.8 - Configuracoes de Monitoramento
 *
 * AC: #2 - Dropdown para frequencia (Semanal/Quinzenal)
 * AC: #3 - Visualizacao read-only leads monitorados
 * AC: #4 - Proxima execucao agendada
 * AC: #5 - Ultima execucao com status
 * AC: #6 - Estimativa de custo mensal
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { MonitoringConfig, MonitoringFrequency } from "@/types/monitoring";

interface MonitoringConfigResponse {
  config: MonitoringConfig;
  exists: boolean;
}

export function useMonitoringConfig() {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery<MonitoringConfigResponse>({
    queryKey: ["monitoring-config"],
    queryFn: async () => {
      const res = await fetch("/api/settings/monitoring");
      if (!res.ok) throw new Error("Erro ao carregar configuracoes");
      const json = await res.json();
      return json.data;
    },
  });

  const updateFrequency = useMutation({
    mutationFn: async (frequency: MonitoringFrequency) => {
      const res = await fetch("/api/settings/monitoring", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frequency }),
      });
      if (!res.ok) throw new Error("Erro ao salvar configuracao");
      const json = await res.json();
      return json.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["monitoring-config"] });
      toast.success("Configuracao de monitoramento atualizada");
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  return {
    config: data?.config ?? null,
    configExists: data?.exists ?? false,
    isLoading,
    error,
    updateFrequency,
  };
}
