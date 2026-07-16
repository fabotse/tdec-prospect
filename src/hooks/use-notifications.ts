/**
 * Notifications Hooks (sino in-app)
 * Story 21.7 (AC2): Central de notificações in-app.
 *
 * Espelha use-opportunities.ts (list + count + mutation). O contador do sino
 * (["notifications-unread-count"]) é SEPARADO do badge de oportunidades
 * (["opportunities-new-count"]) — fontes distintas, NÃO invalidar a do badge aqui.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { AppNotification } from "@/types/opportunity";

interface NotificationsResponse {
  data: AppNotification[];
  meta: { total: number; limit: number };
}

async function fetchNotifications(): Promise<NotificationsResponse> {
  const response = await fetch("/api/notifications");
  if (!response.ok) {
    throw new Error("Erro ao buscar notificações");
  }
  return response.json();
}

async function fetchUnreadCount(): Promise<number> {
  const response = await fetch("/api/notifications/unread-count");
  if (!response.ok) {
    throw new Error("Erro ao buscar contagem de notificações");
  }
  const result = await response.json();
  return result.data.count;
}

async function markNotificationRead(notificationId: string): Promise<void> {
  const response = await fetch(`/api/notifications/${notificationId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
  });
  if (!response.ok) {
    throw new Error("Erro ao marcar notificação como lida");
  }
}

/** Lista das notificações recentes (dropdown do sino). */
export function useNotifications() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["notifications"],
    queryFn: fetchNotifications,
    staleTime: 30 * 1000,
  });

  return {
    notifications: data?.data ?? [],
    meta: data?.meta ?? null,
    isLoading,
    error: error instanceof Error ? error.message : null,
  };
}

/** Contador de não-lidas do SINO (independente do badge de oportunidades). */
export function useUnreadNotificationsCount() {
  return useQuery({
    queryKey: ["notifications-unread-count"],
    queryFn: fetchUnreadCount,
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000, // igual ao useNewOpportunitiesCount
  });
}

/** Marca lida + invalida a lista E o contador do sino (NÃO o badge de oportunidades). */
export function useMarkNotificationRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (notificationId: string) => markNotificationRead(notificationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["notifications-unread-count"] });
    },
  });
}
