/**
 * Notification Settings Hook
 * Story: 21.7 - Notificações Proativas + Configurações (AC3)
 *
 * Clona use-monitoring-config.ts: useQuery(["notification-settings"], GET) +
 * useMutation(PUT) com invalidateQueries + toast.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { NotificationChannels, OpportunityIntent } from "@/types/opportunity";

/** Shape retornado pelo GET (id/timestamps null quando ainda não há linha configurada). */
export interface NotificationSettingsView {
  id: string | null;
  tenantId: string;
  whatsappNumbers: string[];
  channels: NotificationChannels;
  notifyIntents: OpportunityIntent[];
  createdAt: string | null;
  updatedAt: string | null;
}

/** Payload de escrita (camelCase; a rota converte p/ snake_case + valida E.164). */
export interface NotificationSettingsInput {
  whatsappNumbers: string[];
  channels: NotificationChannels;
  notifyIntents: OpportunityIntent[];
}

interface NotificationSettingsResponse {
  settings: NotificationSettingsView;
  exists: boolean;
}

export function useNotificationSettings() {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery<NotificationSettingsResponse>({
    queryKey: ["notification-settings"],
    queryFn: async () => {
      const res = await fetch("/api/settings/notifications");
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message || "Erro ao carregar configurações");
      }
      const json = await res.json();
      return json.data;
    },
  });

  const saveSettings = useMutation({
    mutationFn: async (input: NotificationSettingsInput) => {
      const res = await fetch("/api/settings/notifications", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message || "Erro ao salvar configurações");
      }
      const json = await res.json();
      return json.data as NotificationSettingsResponse;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notification-settings"] });
      toast.success("Configurações de notificações atualizadas");
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  return {
    settings: data?.settings ?? null,
    settingsExist: data?.exists ?? false,
    isLoading,
    error,
    saveSettings,
  };
}
