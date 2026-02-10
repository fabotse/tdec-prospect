/**
 * Saved Filters API Routes
 * Story 3.7: Saved Filters / Favorites
 *
 * AC: #1 - Save filter with name
 * AC: #2 - List saved filters
 * AC: #6 - RLS for tenant isolation
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserProfile } from "@/lib/supabase/tenant";
import { z } from "zod";

// Zod schema for filter values (must match FilterValues)
const filterValuesSchema = z.object({
  industries: z.array(z.string()),
  companySizes: z.array(z.string()),
  locations: z.array(z.string()),
  titles: z.array(z.string()),
  keywords: z.string(),
  contactEmailStatuses: z.array(z.string()),
});

const createSavedFilterSchema = z.object({
  name: z.string().min(1, "Nome do filtro é obrigatório").max(100),
  filtersJson: filterValuesSchema,
});

/**
 * GET /api/filters/saved
 * List user's saved filters
 * AC: #2 - List saved filters ordered by created_at
 */
export async function GET() {
  const profile = await getCurrentUserProfile();
  if (!profile) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Não autenticado" } },
      { status: 401 }
    );
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("saved_filters")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      {
        error: { code: "INTERNAL_ERROR", message: "Erro ao buscar filtros salvos" },
      },
      { status: 500 }
    );
  }

  // Transform snake_case to camelCase
  const filters = data.map((f) => ({
    id: f.id,
    tenantId: f.tenant_id,
    userId: f.user_id,
    name: f.name,
    filtersJson: f.filters_json,
    createdAt: f.created_at,
  }));

  return NextResponse.json({ data: filters });
}

/**
 * POST /api/filters/saved
 * Create saved filter
 * AC: #1 - Save filter configuration with name
 * AC: #5 - Validate name is required
 */
export async function POST(request: NextRequest) {
  const profile = await getCurrentUserProfile();
  if (!profile) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Não autenticado" } },
      { status: 401 }
    );
  }

  const supabase = await createClient();

  // Parse and validate body
  const body = await request.json();
  const validation = createSavedFilterSchema.safeParse(body);

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

  const { name, filtersJson } = validation.data;

  const { data, error } = await supabase
    .from("saved_filters")
    .insert({
      tenant_id: profile.tenant_id,
      user_id: profile.id,
      name,
      filters_json: filtersJson,
    })
    .select()
    .single();

  if (error) {
    // Handle unique constraint violation
    if (error.code === "23505") {
      return NextResponse.json(
        {
          error: { code: "CONFLICT", message: "Já existe um filtro com esse nome" },
        },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro ao salvar filtro" } },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      data: {
        id: data.id,
        tenantId: data.tenant_id,
        userId: data.user_id,
        name: data.name,
        filtersJson: data.filters_json,
        createdAt: data.created_at,
      },
    },
    { status: 201 }
  );
}
