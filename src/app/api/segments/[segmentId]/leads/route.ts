/**
 * Lead-Segment Association API Routes
 * Story 4.1: Lead Segments/Lists
 *
 * AC: #2 - Add leads to segment
 * AC: #3 - Filter leads by segment (via association)
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

interface RouteParams {
  params: Promise<{ segmentId: string }>;
}

/**
 * Schema for lead data to be added to segment
 * Includes minimal data needed to upsert leads before creating associations
 */
const leadDataSchema = z.object({
  apolloId: z.string().min(1, "Apollo ID é obrigatório"),
  firstName: z.string().min(1, "Nome é obrigatório"),
  lastName: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  companyName: z.string().nullable().optional(),
  companySize: z.string().nullable().optional(),
  industry: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  linkedinUrl: z.string().nullable().optional(),
  hasEmail: z.boolean().optional(),
  hasDirectPhone: z.string().nullable().optional(),
});

const addLeadsSchema = z.object({
  leads: z.array(leadDataSchema).min(1, "Selecione pelo menos um lead"),
});

/**
 * Schema for removing leads from segment
 * Uses persisted lead IDs (after leads have been saved to DB)
 */
const removeLeadsSchema = z.object({
  leadIds: z.array(z.string().uuid()).min(1, "Selecione pelo menos um lead"),
});

// UUID validation schema for segmentId
const uuidSchema = z.string().uuid("ID de segmento inválido");

/**
 * GET /api/segments/[segmentId]/leads
 * Get lead IDs in a segment
 * AC: #3 - For filtering leads by segment
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

  // First verify the segment exists and belongs to user's tenant
  const { data: segment, error: segmentError } = await supabase
    .from("segments")
    .select("id")
    .eq("id", segmentId)
    .single();

  if (segmentError || !segment) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Segmento não encontrado" } },
      { status: 404 }
    );
  }

  const { data, error } = await supabase
    .from("lead_segments")
    .select("lead_id")
    .eq("segment_id", segmentId);

  if (error) {
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Erro ao buscar leads do segmento",
        },
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    data: {
      segmentId,
      leadIds: data.map((row) => row.lead_id),
    },
  });
}

/**
 * POST /api/segments/[segmentId]/leads
 * Add leads to segment (upserts leads first, then creates associations)
 * AC: #2 - Add multiple leads to segment
 *
 * Flow:
 * 1. Validate request data
 * 2. Upsert leads using apollo_id as unique key
 * 3. Create segment associations with persisted lead IDs
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
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

  // Get tenant ID from segment (RLS ensures only user's tenant segments are visible)
  const { data: segment, error: segmentError } = await supabase
    .from("segments")
    .select("id, tenant_id")
    .eq("id", segmentId)
    .single();

  if (segmentError || !segment) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Segmento não encontrado" } },
      { status: 404 }
    );
  }

  const body = await request.json();
  const validation = addLeadsSchema.safeParse(body);

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

  const { leads } = validation.data;

  // Step 1: Check which leads already exist by apollo_id
  // Using manual check + insert instead of upsert because the leads table
  // uses a partial unique index (WHERE apollo_id IS NOT NULL) which doesn't
  // work with Supabase's onConflict option
  const apolloIds = leads.map((l) => l.apolloId);
  const { data: existingLeads, error: fetchExistingError } = await supabase
    .from("leads")
    .select("id, apollo_id")
    .eq("tenant_id", segment.tenant_id)
    .in("apollo_id", apolloIds);

  if (fetchExistingError) {
    console.error("[Segment Leads API] Fetch existing leads error:", fetchExistingError);
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Erro ao verificar leads existentes",
        },
      },
      { status: 500 }
    );
  }

  // Create a set of existing apollo_ids for quick lookup
  const existingApolloIds = new Set(existingLeads?.map((l) => l.apollo_id) ?? []);

  // Step 2: Insert only new leads (those not already in DB)
  const newLeads = leads
    .filter((lead) => !existingApolloIds.has(lead.apolloId))
    .map((lead) => ({
      tenant_id: segment.tenant_id,
      apollo_id: lead.apolloId,
      first_name: lead.firstName,
      last_name: lead.lastName ?? null,
      email: lead.email ?? null,
      phone: lead.phone ?? null,
      company_name: lead.companyName ?? null,
      company_size: lead.companySize ?? null,
      industry: lead.industry ?? null,
      location: lead.location ?? null,
      title: lead.title ?? null,
      linkedin_url: lead.linkedinUrl ?? null,
      status: "novo" as const,
    }));

  if (newLeads.length > 0) {
    const { error: insertError } = await supabase
      .from("leads")
      .insert(newLeads);

    if (insertError) {
      console.error("[Segment Leads API] Lead insert error:", insertError);
      return NextResponse.json(
        {
          error: {
            code: "INTERNAL_ERROR",
            message: "Erro ao salvar leads",
          },
        },
        { status: 500 }
      );
    }
  }

  // Step 3: Get all persisted lead IDs (existing + newly inserted)
  const { data: persistedLeads, error: fetchError } = await supabase
    .from("leads")
    .select("id, apollo_id")
    .eq("tenant_id", segment.tenant_id)
    .in("apollo_id", apolloIds);

  if (fetchError || !persistedLeads) {
    console.error("[Segment Leads API] Fetch leads error:", fetchError);
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Erro ao buscar leads salvos",
        },
      },
      { status: 500 }
    );
  }

  // Step 4: Create segment associations
  // Filter out leads that are already in the segment
  const { data: existingAssociations } = await supabase
    .from("lead_segments")
    .select("lead_id")
    .eq("segment_id", segmentId)
    .in("lead_id", persistedLeads.map((l) => l.id));

  const existingLeadIds = new Set(existingAssociations?.map((a) => a.lead_id) ?? []);

  const newAssociations = persistedLeads
    .filter((lead) => !existingLeadIds.has(lead.id))
    .map((lead) => ({
      segment_id: segmentId,
      lead_id: lead.id,
    }));

  if (newAssociations.length > 0) {
    const { error: associationError } = await supabase
      .from("lead_segments")
      .insert(newAssociations);

    if (associationError) {
      console.error("[Segment Leads API] Association error:", associationError);
      return NextResponse.json(
        {
          error: {
            code: "INTERNAL_ERROR",
            message: "Erro ao adicionar leads ao segmento",
          },
        },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({
    data: { added: persistedLeads.length },
    message: `${persistedLeads.length} leads adicionados ao segmento`,
  });
}

/**
 * DELETE /api/segments/[segmentId]/leads
 * Remove leads from segment
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
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

  const body = await request.json();
  const validation = removeLeadsSchema.safeParse(body);

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

  const { error } = await supabase
    .from("lead_segments")
    .delete()
    .eq("segment_id", segmentId)
    .in("lead_id", leadIds);

  if (error) {
    console.error("[Segment Leads API] DELETE error:", error);
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Erro ao remover leads do segmento",
        },
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    data: { removed: leadIds.length },
    message: `${leadIds.length} leads removidos do segmento`,
  });
}
