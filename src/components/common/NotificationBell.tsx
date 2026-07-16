"use client";

/**
 * NotificationBell — Story 21.7 (AC2)
 *
 * Sino de notificações in-app NOVO no Header. Ícone Bell + badge de não-lidas
 * (useUnreadNotificationsCount) num dropdown listando as recentes (useNotifications).
 * Clicar num item marca lido (useMarkNotificationRead) e navega para a Central (/opportunities).
 *
 * Superfície INDEPENDENTE do badge da sidebar (fonte única = /api/opportunities/new-count,
 * intocado). O contador do sino é próprio (não-lidas de app_notifications).
 */

import { Bell } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
} from "@/components/ui/dropdown-menu";
import {
  useNotifications,
  useUnreadNotificationsCount,
  useMarkNotificationRead,
} from "@/hooks/use-notifications";
import type { AppNotification } from "@/types/opportunity";

function formatRelative(dateStr: string): string {
  const then = new Date(dateStr).getTime();
  if (!Number.isFinite(then)) return "";
  const diffMs = Date.now() - then;
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `${min} min atrás`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours} h atrás`;
  const days = Math.floor(hours / 24);
  return `${days} d atrás`;
}

/** Título legível a partir do payload da notificação (defensivo — payload é JSONB). */
function notificationTitle(notification: AppNotification): string {
  const payload = notification.payload as {
    leadName?: unknown;
    company?: unknown;
    campaignName?: unknown;
  };
  const leadName = typeof payload.leadName === "string" ? payload.leadName : "Novo lead";
  const company = typeof payload.company === "string" ? payload.company : null;
  return company ? `${leadName} (${company})` : leadName;
}

function notificationSubtitle(notification: AppNotification): string | null {
  const payload = notification.payload as { campaignName?: unknown };
  return typeof payload.campaignName === "string" ? payload.campaignName : null;
}

export function NotificationBell() {
  const router = useRouter();
  const { notifications, isLoading, error } = useNotifications();
  const { data: unreadCount = 0 } = useUnreadNotificationsCount();
  const markRead = useMarkNotificationRead();

  const handleOpenNotification = (notification: AppNotification) => {
    if (!notification.readAt) {
      markRead.mutate(notification.id);
    }
    router.push("/opportunities");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Notificações"
          title="Notificações"
          data-testid="notification-bell"
          className="relative"
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span
              data-testid="notification-bell-badge"
              className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground"
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
          <span className="text-body-small font-medium">Notificações</span>
        </div>
        <div className="max-h-96 overflow-y-auto">
          {isLoading ? (
            <p className="px-3 py-6 text-center text-body-small text-foreground-muted">
              Carregando…
            </p>
          ) : error ? (
            <p className="px-3 py-6 text-center text-body-small text-destructive">
              Erro ao carregar notificações
            </p>
          ) : notifications.length === 0 ? (
            <p className="px-3 py-6 text-center text-body-small text-foreground-muted">
              Nenhuma notificação
            </p>
          ) : (
            notifications.map((notification) => {
              const subtitle = notificationSubtitle(notification);
              return (
                <button
                  key={notification.id}
                  type="button"
                  onClick={() => handleOpenNotification(notification)}
                  className={`flex w-full flex-col gap-0.5 px-3 py-2 text-left transition-colors hover:bg-accent ${
                    notification.readAt ? "" : "bg-primary/5"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-body-small font-medium truncate">
                      🔥 {notificationTitle(notification)}
                    </span>
                    {!notification.readAt && (
                      <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />
                    )}
                  </div>
                  {subtitle && (
                    <span className="text-xs text-foreground-muted truncate">{subtitle}</span>
                  )}
                  <span className="text-xs text-foreground-muted">
                    {formatRelative(notification.createdAt)}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
