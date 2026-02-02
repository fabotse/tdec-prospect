/**
 * Segment CRUD API Route
 * Story 4.1: Lead Segments/Lists
 *
 * AC: #5 - Delete segment
 * AC: #6 - RLS for tenant isolation
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

interface RouteParams {
  params: Promise<{ segmentId: string }>;
}

// UUID validation schema
const uuidSchema = z.string().uuid("ID de segmento inválido");

/**
 * GET /api/segments/[segmentId]
 * Get a single segment with lead count
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { segmentId } = await params;

  // Validate UUID format
  const uuidValidation = uuidSchema.safeParse(segmentId);
  if (!uuidValidation.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "ID de segmento inválido" } },
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

  const { data, error } = await supabase
    .from("segments")
    .select(
      `
      *,
      lead_count:lead_segments(count)
    `
    )
    .eq("id", segmentId)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Segmento não encontrado" } },
        { status: 404 }
      );
    }
    console.error("[Segments API] GET error:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro ao buscar segmento" } },
      { status: 500 }
    );
  }

  return NextResponse.json({
    data: {
      id: data.id,
      tenantId: data.tenant_id,
      name: data.name,
      description: data.description,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      leadCount: data.lead_count?.[0]?.count ?? 0,
    },
  });
}

/**
 * DELETE /api/segments/[segmentId]
 * Delete a segment (leads are NOT deleted, only associations)
 * AC: #5 - Delete segment with confirmation
 */
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const { segmentId } = await params;

  // Validate UUID format
  const uuidValidation = uuidSchema.safeParse(segmentId);
  if (!uuidValidation.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "ID de segmento inválido" } },
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

  // RLS handles authorization - user can only delete their tenant's segments
  // CASCADE will automatically delete lead_segments entries
  const { error } = await supabase.from("segments").delete().eq("id", segmentId);

  if (error) {
    console.error("[Segments API] DELETE error:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro ao remover segmento" } },
      { status: 500 }
    );
  }

  return NextResponse.json({ data: { deleted: true } });
}
