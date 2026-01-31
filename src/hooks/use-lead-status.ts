/**
 * Lead Status Hook
 * Story 4.2: Lead Status Management
 *
 * AC: #2 - Change individual status
 * AC: #4 - Bulk status update
 *
 * TanStack Query hooks for managing lead status mutations.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { LeadStatus } from "@/types/lead";
import { getStatusConfig } from "@/types/lead";

/**
 * Update a single lead's status
 * AC: #2 - Change individual status
 */
async function updateLeadStatus(leadId: string, status: LeadStatus): Promise<void> {
  const response = await fetch(`/api/leads/${leadId}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || "Erro ao atualizar status");
  }
}

/**
 * Update multiple leads' status at once
 * AC: #4 - Bulk status update
 */
async function bulkUpdateStatus(
  leadIds: string[],
  status: LeadStatus
): Promise<{ updated: number }> {
  const response = await fetch("/api/leads/bulk-status", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ leadIds, status }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || "Erro ao atualizar status");
  }
  const result = await response.json();
  return result.data;
}

/**
 * Hook to update a single lead's status
 * AC: #2 - Change individual status with toast feedback
 */
export function useUpdateLeadStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ leadId, status }: { leadId: string; status: LeadStatus }) =>
      updateLeadStatus(leadId, status),
    onSuccess: (_data, { status }) => {
      const config = getStatusConfig(status);
      toast.success(`Status atualizado para "${config.label}"`);
      // Invalidate all lead-related queries to refresh data
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["searchLeads"] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

/**
 * Hook to update multiple leads' status at once
 * AC: #4 - Bulk status update with count toast feedback
 */
export function useBulkUpdateStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ leadIds, status }: { leadIds: string[]; status: LeadStatus }) =>
      bulkUpdateStatus(leadIds, status),
    onSuccess: (result, { status }) => {
      const config = getStatusConfig(status);
      toast.success(`${result.updated} leads atualizados para "${config.label}"`);
      // Invalidate all lead-related queries to refresh data
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["searchLeads"] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}
