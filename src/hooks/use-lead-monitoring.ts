/**
 * Lead Monitoring Hooks
 * Story 13.2: Toggle de Monitoramento na Tabela de Leads
 * Story 13.9: Verificação Inicial ao Ativar Monitoramento
 *
 * AC: #1, #2, #6 - Toggle individual, bulk toggle, contador
 * AC: #6, #7 (13.9) - Initial scan hook com progresso
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

interface PostDetail {
  postUrl: string;
  isRelevant: boolean;
  reasoning: string;
  suggestionGenerated: boolean;
}

interface LeadDetail {
  leadId: string;
  leadName: string;
  success: boolean;
  totalPostsFetched: number;
  newPostsFound: number;
  postsFiltered: number;
  suggestionsGenerated: number;
  postDetails: PostDetail[];
  error?: string;
}

interface InitialScanResult {
  totalProcessed: number;
  totalLeads: number;
  newPostsFound: number;
  insightsGenerated: number;
  errors: Array<{ leadId: string; error: string }>;
  leadDetails: LeadDetail[];
}

async function runInitialScan(leadIds: string[]): Promise<InitialScanResult> {
  const response = await fetch("/api/monitoring/initial-scan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ leadIds }),
  });
  if (!response.ok) {
    const data = await response.json();
    const code = data.error?.code;
    if (code === "APIFY_KEY_MISSING") {
      throw new Error("APIFY_KEY_MISSING");
    }
    throw new Error(data.error?.message || "Erro ao verificar posts");
  }
  return response.json();
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
// Dev logging (browser DevTools)
// ========================================

const IS_DEV = process.env.NODE_ENV === "development";

function logScanDetails(result: InitialScanResult): void {
  if (!IS_DEV) return;
  // eslint-disable-next-line no-console
  const log = console.log.bind(console);
  log(
    "%c[initial-scan] Resultado completo",
    "color: #22c55e; font-weight: bold",
    result
  );
  for (const lead of result.leadDetails) {
    log(
      `%c[initial-scan] Lead: ${lead.leadName} (${lead.leadId})`,
      "color: #3b82f6; font-weight: bold"
    );
    log(
      `  Posts buscados: ${lead.totalPostsFetched} | Novos: ${lead.newPostsFound} | Filtrados: ${lead.postsFiltered} | Insights: ${lead.suggestionsGenerated}`
    );
    if (lead.error) {
      log(`  %cErro: ${lead.error}`, "color: #ef4444");
    }
    for (const post of lead.postDetails) {
      const status = post.isRelevant ? "RELEVANTE ✓" : "NÃO RELEVANTE ✗";
      const color = post.isRelevant ? "color: #22c55e" : "color: #f59e0b";
      log(`  %c┣ ${status}`, color, `— ${post.postUrl}`);
      log(`    Motivo: ${post.reasoning}`);
      if (post.isRelevant) {
        log(`    Sugestão: ${post.suggestionGenerated ? "Gerada ✓" : "Não gerada ✗"}`);
      }
    }
  }
}

// ========================================
// Shared scan result handlers (DRY — used by fireInitialScan)
// ========================================

function handleScanSuccess(
  result: InitialScanResult,
  queryClient: ReturnType<typeof useQueryClient>
): void {
  logScanDetails(result);
  if (result.insightsGenerated > 0) {
    toast.success(
      `Scan concluido: ${result.insightsGenerated} insight${result.insightsGenerated > 1 ? "s" : ""} gerado${result.insightsGenerated > 1 ? "s" : ""}`,
      { id: "initial-scan" }
    );
  } else {
    toast.success("Nenhum post novo encontrado", { id: "initial-scan" });
  }
  queryClient.invalidateQueries({ queryKey: ["leads"] });
  queryClient.invalidateQueries({ queryKey: ["my-leads"] });
  queryClient.invalidateQueries({ queryKey: ["insights"] });
  queryClient.invalidateQueries({ queryKey: ["insights-new-count"] });
}

function handleScanError(error: Error): void {
  if (IS_DEV) {
     
    console.error("[initial-scan] Erro:", error.message);
  }
  const friendlyMessage =
    error.message === "APIFY_KEY_MISSING"
      ? "Configure a chave da Apify em Configurações para buscar posts"
      : error.message;
  toast.error(friendlyMessage, { id: "initial-scan" });
}

// ========================================
// Fire-and-forget initial scan helper (Story 13.9 AC #6)
// ========================================

function fireInitialScan(
  leadIds: string[],
  queryClient: ReturnType<typeof useQueryClient>
): void {
  toast.loading("Verificando posts dos leads...", { id: "initial-scan" });
  runInitialScan(leadIds)
    .then((result) => handleScanSuccess(result, queryClient))
    .catch((error: Error) => handleScanError(error));
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
    onSuccess: (_data, { leadId, isMonitored }) => {
      toast.success(
        isMonitored ? "Lead monitorado" : "Monitoramento desativado"
      );
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["my-leads"] });
      queryClient.invalidateQueries({ queryKey: ["monitored-count"] });
      // Story 13.9 AC #6: fire initial scan after enabling monitoring
      if (isMonitored) {
        fireInitialScan([leadId], queryClient);
      }
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
    onSuccess: (result, { leadIds, isMonitored }) => {
      const action = isMonitored ? "monitorados" : "desmonitorados";
      let message = `${result.updated} leads ${action}`;
      if (result.skippedNoLinkedin.length > 0) {
        message += ` (${result.skippedNoLinkedin.length} sem LinkedIn ignorados)`;
      }
      toast.success(message);
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["my-leads"] });
      queryClient.invalidateQueries({ queryKey: ["monitored-count"] });
      // Story 13.9 AC #6: fire initial scan after enabling monitoring
      if (isMonitored && leadIds.length > 0) {
        // Filter out leads that were skipped (no LinkedIn)
        const activatedIds = leadIds.filter(
          (id) => !result.skippedNoLinkedin.includes(id)
        );
        if (activatedIds.length > 0) {
          fireInitialScan(activatedIds, queryClient);
        }
      }
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

