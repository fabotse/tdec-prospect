import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserProfile } from "@/lib/supabase/tenant";
import { toAppNotification, type AppNotificationRow } from "@/types/opportunity";

/**
 * PATCH /api/notifications/:notificationId
 * Story 21.7 (AC2): marca a notificação como lida (read_at = now()). Só read_at — o trigger de
 * imutabilidade (00060) recusa alteração de qualquer outra coluna. Tenant-scoped (RLS + explícito).
 */
export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ notificationId: string }> }
) {
  const profile = await getCurrentUserProfile();
  if (!profile) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Não autenticado" } },
      { status: 401 }
    );
  }

  const { notificationId } = await params;

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("app_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .eq("tenant_id", profile.tenant_id)
    .select("*")
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro ao marcar notificação como lida" } },
      { status: 500 }
    );
  }

  if (!data) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Notificação não encontrada" } },
      { status: 404 }
    );
  }

  return NextResponse.json({ data: toAppNotification(data as AppNotificationRow) });
}
