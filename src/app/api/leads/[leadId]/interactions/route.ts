/**
 * Lead Interactions API Route
 * Story 4.3: Lead Detail View & Interaction History
 *
 * GET /api/leads/[leadId]/interactions - Fetch all interactions for a lead
 * POST /api/leads/[leadId]/interactions - Create new interaction
 *
 * AC: #3 - Interaction history section
 * AC: #4 - Add interaction note
 * AC: #5 - Interaction data model
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  type LeadInteractionRow,
  transformInteractionRow,
  createInteractionSchema,
} from "@/types/interaction";

interface RouteContext {
  params: Promise<{ leadId: string }>;
}

/**
 * GET /api/leads/[leadId]/interactions
 * Fetch all interactions for a lead, ordered by most recent first
 */
export async function GET(request: NextRequest, context: RouteContext) {
  const { leadId } = await context.params;
  const supabase = await createClient();

  const { data: user } = await supabase.auth.getUser();
  if (!user.user) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Nao autenticado" } },
      { status: 401 }
    );
  }

  // Get tenant_id from user's profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", user.user.id)
    .single();

  if (!profile?.tenant_id) {
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Perfil nao encontrado" } },
      { status: 500 }
    );
  }

  // Verify lead belongs to tenant
  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("id")
    .eq("id", leadId)
    .eq("tenant_id", profile.tenant_id)
    .single();

  if (leadError || !lead) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Lead nao encontrado" } },
      { status: 404 }
    );
  }

  // Fetch interactions
  const { data: interactions, error } = await supabase
    .from("lead_interactions")
    .select("*")
    .eq("lead_id", leadId)
    .eq("tenant_id", profile.tenant_id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[GET /api/leads/[leadId]/interactions] Error:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro ao buscar interacoes" } },
      { status: 500 }
    );
  }

  // Transform snake_case to camelCase
  const transformedInteractions = (interactions as LeadInteractionRow[]).map(
    transformInteractionRow
  );

  return NextResponse.json({ data: transformedInteractions });
}

/**
 * POST /api/leads/[leadId]/interactions
 * Create a new interaction for a lead
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const { leadId } = await context.params;
  const supabase = await createClient();

  const { data: user } = await supabase.auth.getUser();
  if (!user.user) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Nao autenticado" } },
      { status: 401 }
    );
  }

  // Get tenant_id from user's profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", user.user.id)
    .single();

  if (!profile?.tenant_id) {
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Perfil nao encontrado" } },
      { status: 500 }
    );
  }

  // Verify lead belongs to tenant
  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("id")
    .eq("id", leadId)
    .eq("tenant_id", profile.tenant_id)
    .single();

  if (leadError || !lead) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Lead nao encontrado" } },
      { status: 404 }
    );
  }

  // Parse and validate request body
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: "JSON invalido" } },
      { status: 400 }
    );
  }

  const validation = createInteractionSchema.safeParse(body);
  if (!validation.success) {
    const firstError = validation.error.issues[0]?.message || "Dados invalidos";
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: firstError } },
      { status: 400 }
    );
  }

  const { content, type } = validation.data;

  // Insert interaction
  const { data: interaction, error } = await supabase
    .from("lead_interactions")
    .insert({
      lead_id: leadId,
      tenant_id: profile.tenant_id,
      type,
      content,
      created_by: user.user.id,
    })
    .select()
    .single();

  if (error) {
    console.error("[POST /api/leads/[leadId]/interactions] Error:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro ao salvar nota" } },
      { status: 500 }
    );
  }

  // Transform and return
  const transformedInteraction = transformInteractionRow(
    interaction as LeadInteractionRow
  );

  return NextResponse.json({ data: transformedInteraction }, { status: 201 });
}
