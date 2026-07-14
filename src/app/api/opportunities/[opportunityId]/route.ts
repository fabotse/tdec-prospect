import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserProfile } from "@/lib/supabase/tenant";
import { isValidOpportunityStatus } from "@/types/opportunity";

/**
 * PATCH /api/opportunities/:opportunityId
 * Atualiza o status da oportunidade.
 * Story 21.4: escopo = transição new→viewed (abrir card). A rota aceita qualquer
 * status válido, mas grava SÓ `status` — os efeitos colaterais das demais
 * transições (meeting_booked_at, status do lead, etc.) são da Story 21.5.
 *
 * Body: { status: OpportunityStatus }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ opportunityId: string }> }
) {
  const profile = await getCurrentUserProfile();
  if (!profile) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Nao autenticado" } },
      { status: 401 }
    );
  }

  const { opportunityId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Body deve ser JSON valido" } },
      { status: 400 }
    );
  }

  // request.json() aceita `null`/primitivos (JSON válidos) sem lançar — o
  // destructure de null quebraria com 500; validar que é objeto antes.
  if (typeof body !== "object" || body === null) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Body deve ser um objeto JSON" } },
      { status: 400 }
    );
  }

  const { status } = body as Record<string, unknown>;

  if (typeof status !== "string" || !isValidOpportunityStatus(status)) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Status invalido. Use: new, viewed, contacted, meeting_booked, discarded",
        },
      },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("opportunities")
    .update({ status })
    .eq("id", opportunityId)
    .eq("tenant_id", profile.tenant_id)
    .select()
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Oportunidade nao encontrada" } },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro ao atualizar oportunidade" } },
      { status: 500 }
    );
  }

  return NextResponse.json({ data });
}
