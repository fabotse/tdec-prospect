import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserProfile } from "@/lib/supabase/tenant";

/**
 * GET /api/insights/new-count
 * Returns count of insights with status='new' for sidebar badge
 * Story 13.6: Pagina de Insights - UI
 */
export async function GET() {
  const profile = await getCurrentUserProfile();
  if (!profile) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Nao autenticado" } },
      { status: 401 }
    );
  }

  const supabase = await createClient();

  const { count, error } = await supabase
    .from("lead_insights")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", profile.tenant_id)
    .eq("status", "new");

  if (error) {
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro ao contar insights" } },
      { status: 500 }
    );
  }

  return NextResponse.json({ data: { count: count ?? 0 } });
}
