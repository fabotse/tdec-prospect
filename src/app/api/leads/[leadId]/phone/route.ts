/**
 * Lead Phone Update API Route
 * Story 4.5: Phone Number Lookup
 *
 * AC: #1 - Phone is saved to the lead record in database
 * AC: #7 - Query invalidation on success
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

interface RouteParams {
  params: Promise<{ leadId: string }>;
}

// UUID validation schema
const uuidSchema = z.string().uuid("ID de lead inválido");

// Phone update schema (AC: #1.5)
const phoneUpdateSchema = z.object({
  phone: z.string().min(1, "Telefone é obrigatório"),
});

/**
 * PATCH /api/leads/[leadId]/phone
 * Update a single lead's phone number
 * AC: #1 - Save phone to lead record
 * AC: #7 - Return updated lead data for query invalidation
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { leadId } = await params;

  // Validate UUID format (AC: #1.5)
  const uuidValidation = uuidSchema.safeParse(leadId);
  if (!uuidValidation.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "ID de lead inválido" } },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  // Verify user is authenticated (AC: #1.3)
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
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

  // Validate body (AC: #1.5)
  const validation = phoneUpdateSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: validation.error.issues[0]?.message || "Telefone inválido",
        },
      },
      { status: 400 }
    );
  }

  const { phone } = validation.data;

  // Update lead phone - RLS ensures user can only update their tenant's leads (AC: #1.3)
  const { data, error } = await supabase
    .from("leads")
    .update({ phone, updated_at: new Date().toISOString() })
    .eq("id", leadId)
    .select()
    .single();

  if (error) {
    console.error("[PATCH /api/leads/[leadId]/phone] Error:", error);
    if (error.code === "PGRST116") {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Lead não encontrado" } },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro ao atualizar telefone" } },
      { status: 500 }
    );
  }

  // AC: #1.4 - Return updated lead data
  return NextResponse.json({ data });
}
