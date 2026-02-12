/**
 * Bulk Lead Delete API Route
 * Story 12.5: Deleção de Leads (Individual e em Massa)
 *
 * AC: #5 - Hard delete (remoção permanente)
 * AC: #9 - RLS enforced (tenant isolation)
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const bulkDeleteSchema = z.object({
  leadIds: z
    .array(z.string().uuid("ID de lead inválido"))
    .min(1, "Selecione pelo menos um lead")
    .max(500, "Máximo de 500 leads por requisição"),
});

/**
 * DELETE /api/leads/bulk-delete
 * Delete multiple leads at once
 * AC: #5 - Hard delete, AC: #9 - RLS enforced
 */
export async function DELETE(request: NextRequest) {
  const supabase = await createClient();

  const { data: user } = await supabase.auth.getUser();
  if (!user.user) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Não autenticado" } },
      { status: 401 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Corpo da requisição inválido" } },
      { status: 400 }
    );
  }

  const validation = bulkDeleteSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: validation.error.issues[0]?.message || "Dados inválidos",
        },
      },
      { status: 400 }
    );
  }

  const { leadIds } = validation.data;

  // Hard delete - RLS ensures user can only delete their tenant's leads
  const { error, count } = await supabase
    .from("leads")
    .delete({ count: "exact" })
    .in("id", leadIds);

  if (error) {
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro ao deletar leads" } },
      { status: 500 }
    );
  }

  const deletedCount = count ?? leadIds.length;

  return NextResponse.json({
    data: { deleted: deletedCount },
    message: `${deletedCount} leads deletados`,
  });
}
