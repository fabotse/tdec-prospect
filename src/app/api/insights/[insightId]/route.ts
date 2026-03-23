import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserProfile } from "@/lib/supabase/tenant";
import { insightStatusValues } from "@/types/monitoring";

/**
 * PATCH /api/insights/:insightId
 * Update insight status
 * Story 13.6: Pagina de Insights - UI
 *
 * Body: { status: "used" | "dismissed" }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ insightId: string }> }
) {
  const profile = await getCurrentUserProfile();
  if (!profile) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Nao autenticado" } },
      { status: 401 }
    );
  }

  const { insightId } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Body deve ser JSON valido" } },
      { status: 400 }
    );
  }

  const { status } = body;

  // Validate status
  if (!status || !(insightStatusValues as readonly string[]).includes(status as string)) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Status invalido. Use: new, used, dismissed" } },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("lead_insights")
    .update({ status })
    .eq("id", insightId)
    .eq("tenant_id", profile.tenant_id)
    .select()
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Insight nao encontrado" } },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro ao atualizar insight" } },
      { status: 500 }
    );
  }

  return NextResponse.json({ data });
}
