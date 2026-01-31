/**
 * Bulk Lead Status Update API Route
 * Story 4.2: Lead Status Management
 *
 * AC: #4 - Bulk status update
 * AC: #6 - RLS for tenant isolation
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";
import { leadStatusValues } from "@/types/lead";

// Bulk update schema
const bulkUpdateSchema = z.object({
  leadIds: z
    .array(z.string().uuid("ID de lead inválido"))
    .min(1, "Selecione pelo menos um lead"),
  status: z.enum(leadStatusValues, {
    errorMap: () => ({ message: "Status inválido" }),
  }),
});

/**
 * PATCH /api/leads/bulk-status
 * Update multiple leads' status at once
 * AC: #4 - Bulk status update
 */
export async function PATCH(request: NextRequest) {
  const supabase = await createClient();

  const { data: user } = await supabase.auth.getUser();
  if (!user.user) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Não autenticado" } },
      { status: 401 }
    );
  }

  // Parse request body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Corpo da requisição inválido" } },
      { status: 400 }
    );
  }

  const validation = bulkUpdateSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: validation.error.errors[0]?.message || "Dados inválidos",
        },
      },
      { status: 400 }
    );
  }

  const { leadIds, status } = validation.data;

  // Update multiple leads - RLS ensures user can only update their tenant's leads
  const { error, count } = await supabase
    .from("leads")
    .update({ status, updated_at: new Date().toISOString() })
    .in("id", leadIds);

  if (error) {
    console.error("[PATCH /api/leads/bulk-status] Error:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro ao atualizar status" } },
      { status: 500 }
    );
  }

  const updatedCount = count ?? leadIds.length;

  return NextResponse.json({
    data: { updated: updatedCount },
    message: `${updatedCount} leads atualizados`,
  });
}
