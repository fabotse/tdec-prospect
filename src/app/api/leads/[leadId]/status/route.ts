/**
 * Lead Status Update API Route
 * Story 4.2: Lead Status Management
 *
 * AC: #2 - Change individual status
 * AC: #6 - RLS for tenant isolation
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";
import { leadStatusValues } from "@/types/lead";

interface RouteParams {
  params: Promise<{ leadId: string }>;
}

// UUID validation schema
const uuidSchema = z.string().uuid("ID de lead inválido");

// Status update schema
const updateStatusSchema = z.object({
  status: z.enum(leadStatusValues, {
    errorMap: () => ({ message: "Status inválido" }),
  }),
});

/**
 * PATCH /api/leads/[leadId]/status
 * Update a single lead's status
 * AC: #2 - Change individual status
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { leadId } = await params;

  // Validate UUID format
  const uuidValidation = uuidSchema.safeParse(leadId);
  if (!uuidValidation.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "ID de lead inválido" } },
      { status: 400 }
    );
  }

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

  const validation = updateStatusSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: validation.error.errors[0]?.message || "Status inválido",
        },
      },
      { status: 400 }
    );
  }

  const { status } = validation.data;

  // Update lead status - RLS ensures user can only update their tenant's leads
  const { data, error } = await supabase
    .from("leads")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", leadId)
    .select()
    .single();

  if (error) {
    console.error("[PATCH /api/leads/[leadId]/status] Error:", error);
    if (error.code === "PGRST116") {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Lead não encontrado" } },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro ao atualizar status" } },
      { status: 500 }
    );
  }

  return NextResponse.json({ data });
}
