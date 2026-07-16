import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserProfile } from "@/lib/supabase/tenant";

/**
 * GET /api/notifications/unread-count
 * Story 21.7 (AC2): contagem de notificações NÃO lidas (read_at IS NULL) para o badge do SINO.
 * Clona /api/opportunities/new-count trocando a tabela. Este contador é do sino e é DISTINTO
 * do badge de oportunidades da sidebar (fonte única = new-count; intocado).
 */
export async function GET() {
  const profile = await getCurrentUserProfile();
  if (!profile) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Não autenticado" } },
      { status: 401 }
    );
  }

  const supabase = await createClient();

  const { count, error } = await supabase
    .from("app_notifications")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", profile.tenant_id)
    .is("read_at", null);

  if (error) {
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro ao contar notificações" } },
      { status: 500 }
    );
  }

  return NextResponse.json({ data: { count: count ?? 0 } });
}
