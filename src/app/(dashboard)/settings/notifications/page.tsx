/**
 * Notification Settings Page
 * Story 21.7: Notificações Proativas + Configurações (AC3)
 *
 * Wrapper client trivial (espelha settings/monitoring/page.tsx). Já admin-gated pelo
 * layout.tsx (AdminGuard) + middleware (/settings/*).
 */

"use client";

import { NotificationSettings } from "@/components/settings/NotificationSettings";

export default function NotificationsPage() {
  return <NotificationSettings />;
}
