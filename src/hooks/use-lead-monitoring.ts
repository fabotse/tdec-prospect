/**
 * Lead Monitoring Hook
 * Story 13.2: Toggle de Monitoramento na Tabela de Leads
 *
 * AC: #1, #2, #6 - Toggle individual, bulk toggle, contador
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

// ========================================
// Fetch functions
// ========================================

async function toggleMonitoring(
  leadId: string,
  isMonitored: boolean
): Promise<void> {
  const response = await fetch(`/api/leads/${leadId}/monitor`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ isMonitored }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || "Erro ao atualizar monitoramento");
  }
}

interface BulkMonitorResult {
  updated: number;
  skippedNoLinkedin: string[];
  limitExceeded: boolean;
}

async function bulkToggleMonitoring(
  leadIds: string[],
  isMonitored: boolean
): Promise<BulkMonitorResult> {
  const response = await fetch("/api/leads/bulk-monitor", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ leadIds, isMonitored }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || "Erro ao atualizar monitoramento");
  }
  const result = await response.json();
  return result.data;
}

interface MonitoredCountData {
  current: number;
  max: number;
}

async function fetchMonitoredCount(): Promise<MonitoredCountData> {
  const response = await fetch("/api/leads/monitored-count");
  if (!response.ok) {
    throw new Error("Erro ao buscar contagem de monitoramento");
  }
  const result = await response.json();
  return result.data;
}

// ========================================
// Hooks
// ========================================

/**
 * Hook to toggle monitoring for a single lead
 * AC: #1 - Toggle individual
 */
export function useToggleMonitoring() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      leadId,
      isMonitored,
    }: {
      leadId: string;
      isMonitored: boolean;
    }) => toggleMonitoring(leadId, isMonitored),
    onSuccess: (_data, { isMonitored }) => {
      toast.success(
        isMonitored ? "Lead monitorado" : "Monitoramento desativado"
      );
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["my-leads"] });
      queryClient.invalidateQueries({ queryKey: ["monitored-count"] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

/**
 * Hook to toggle monitoring for multiple leads
 * AC: #2 - Bulk toggle
 */
export function useBulkToggleMonitoring() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      leadIds,
      isMonitored,
    }: {
      leadIds: string[];
      isMonitored: boolean;
    }) => bulkToggleMonitoring(leadIds, isMonitored),
    onSuccess: (result, { isMonitored }) => {
      const action = isMonitored ? "monitorados" : "desmonitorados";
      let message = `${result.updated} leads ${action}`;
      if (result.skippedNoLinkedin.length > 0) {
        message += ` (${result.skippedNoLinkedin.length} sem LinkedIn ignorados)`;
      }
      toast.success(message);
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["my-leads"] });
      queryClient.invalidateQueries({ queryKey: ["monitored-count"] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

/**
 * Hook to get monitored count and max limit
 * AC: #6 - Contador "X/100 leads monitorados"
 */
export function useMonitoredCount() {
  return useQuery({
    queryKey: ["monitored-count"],
    queryFn: fetchMonitoredCount,
  });
}
