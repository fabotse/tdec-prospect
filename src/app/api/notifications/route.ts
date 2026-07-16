import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserProfile } from "@/lib/supabase/tenant";
import { toAppNotification, type AppNotificationRow } from "@/types/opportunity";

/**
 * GET /api/notifications
 * Story 21.7 (AC2): lista as notificações in-app do tenant (mais recentes primeiro, cap 30).
 * Envelope { data, meta } (espelha /api/opportunities). Filtra por tenant (RLS + explícito).
 *
 * Esta é a Central de notificações (sino). Distinta do badge de oportunidades da sidebar
 * (fonte única = /api/opportunities/new-count) — duas superfícies, duas fontes, zero acoplamento.
 */

const NOTIFICATIONS_LIMIT = 30;

export async function GET() {
  const profile = await getCurrentUserProfile();
  if (!profile) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Não autenticado" } },
      { status: 401 }
    );
  }

  const supabase = await createClient();

  const { data, error, count } = await supabase
    .from("app_notifications")
    .select("*", { count: "exact" })
    .eq("tenant_id", profile.tenant_id)
    .order("created_at", { ascending: false })
    .limit(NOTIFICATIONS_LIMIT);

  if (error) {
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro ao buscar notificações" } },
      { status: 500 }
    );
  }

  const notifications = ((data ?? []) as AppNotificationRow[]).map(toAppNotification);

  return NextResponse.json({
    data: notifications,
    meta: { total: count ?? notifications.length, limit: NOTIFICATIONS_LIMIT },
  });
}
