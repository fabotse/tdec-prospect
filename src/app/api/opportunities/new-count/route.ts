import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserProfile } from "@/lib/supabase/tenant";

/**
 * GET /api/opportunities/new-count
 * Contagem de oportunidades status='new' para o badge da sidebar.
 * Story 21.4: Central de Oportunidades (espelha /api/insights/new-count)
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
    .from("opportunities")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", profile.tenant_id)
    .eq("status", "new");

  if (error) {
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro ao contar oportunidades" } },
      { status: 500 }
    );
  }

  return NextResponse.json({ data: { count: count ?? 0 } });
}
