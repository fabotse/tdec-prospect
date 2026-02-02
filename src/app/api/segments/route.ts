/**
 * Segments API Routes
 * Story 4.1: Lead Segments/Lists
 *
 * AC: #1 - Create segment
 * AC: #4 - View segment list with lead count
 * AC: #6 - RLS for tenant isolation
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const createSegmentSchema = z.object({
  name: z.string().min(1, "Nome do segmento é obrigatório").max(100),
  description: z.string().max(500).optional(),
});

/**
 * GET /api/segments
 * List segments with lead count
 * AC: #4 - View segment list ordered alphabetically with lead count
 */
export async function GET() {
  const supabase = await createClient();

  const { data: user } = await supabase.auth.getUser();
  if (!user.user) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Não autenticado" } },
      { status: 401 }
    );
  }

  // Query segments with lead count via subquery
  const { data, error } = await supabase
    .from("segments")
    .select(
      `
      *,
      lead_count:lead_segments(count)
    `
    )
    .order("name", { ascending: true });

  if (error) {
    console.error("[Segments API] GET list error:", error);
    return NextResponse.json(
      {
        error: { code: "INTERNAL_ERROR", message: "Erro ao buscar segmentos" },
      },
      { status: 500 }
    );
  }

  // Transform to camelCase with count
  const segments = data.map((s) => ({
    id: s.id,
    tenantId: s.tenant_id,
    name: s.name,
    description: s.description,
    createdAt: s.created_at,
    updatedAt: s.updated_at,
    leadCount: s.lead_count?.[0]?.count ?? 0,
  }));

  return NextResponse.json({ data: segments });
}

/**
 * POST /api/segments
 * Create segment
 * AC: #1 - Create segment with name and optional description
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const { data: user } = await supabase.auth.getUser();
  if (!user.user) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Não autenticado" } },
      { status: 401 }
    );
  }

  // Get user's tenant_id
  const { data: profile } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", user.user.id)
    .single();

  if (!profile) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Perfil não encontrado" } },
      { status: 404 }
    );
  }

  const body = await request.json();
  const validation = createSegmentSchema.safeParse(body);

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

  const { name, description } = validation.data;

  const { data, error } = await supabase
    .from("segments")
    .insert({
      tenant_id: profile.tenant_id,
      name,
      description: description || null,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        {
          error: {
            code: "CONFLICT",
            message: "Já existe um segmento com esse nome",
          },
        },
        { status: 409 }
      );
    }
    console.error("[Segments API] POST create error:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro ao criar segmento" } },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      data: {
        id: data.id,
        tenantId: data.tenant_id,
        name: data.name,
        description: data.description,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
        leadCount: 0,
      },
    },
    { status: 201 }
  );
}
