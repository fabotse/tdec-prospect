/**
 * Lead Enrichment API Route
 * Story 4.4.1: Lead Data Enrichment
 *
 * Enriches a persisted lead with complete data from Apollo People Enrichment API.
 * Uses economy mode: reveal_personal_emails=false, reveal_phone_number=false
 *
 * AC: #2 - Enrich lead and update in database
 * AC: #3 - Handle not found case
 * AC: #6 - Error handling with Portuguese messages
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";
import { ApolloService } from "@/lib/services/apollo";
import { ExternalServiceError } from "@/lib/services/base-service";
import { transformEnrichmentToLead } from "@/types/apollo";
import type { LeadRow } from "@/types/lead";

interface RouteParams {
  params: Promise<{ leadId: string }>;
}

// UUID validation schema
const uuidSchema = z.string().uuid("ID de lead inválido");

/**
 * POST /api/leads/[leadId]/enrich
 * Enrich a single persisted lead with Apollo data
 * AC: #2, #3, #6
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
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

  // Get authenticated user
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Não autenticado" } },
      { status: 401 }
    );
  }

  // Get user's tenant from profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", authData.user.id)
    .single();

  if (!profile?.tenant_id) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Tenant não encontrado" } },
      { status: 401 }
    );
  }

  // Fetch lead to get apollo_id (with tenant isolation)
  const { data: lead, error: fetchError } = await supabase
    .from("leads")
    .select("*")
    .eq("id", leadId)
    .eq("tenant_id", profile.tenant_id)
    .single();

  if (fetchError || !lead) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Lead não encontrado" } },
      { status: 404 }
    );
  }

  // Lead must have apollo_id to be enriched
  if (!lead.apollo_id) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Lead não possui ID do Apollo para enriquecimento",
        },
      },
      { status: 400 }
    );
  }

  try {
    // Call Apollo enrichment with economy options
    // AC: #2 - reveal_personal_emails: false, reveal_phone_number: false
    const apolloService = new ApolloService(profile.tenant_id);
    const enrichmentResponse = await apolloService.enrichPerson(lead.apollo_id, {
      revealPersonalEmails: false,
      revealPhoneNumber: false,
    });

    // Transform enrichment response to partial LeadRow
    const enrichedData = transformEnrichmentToLead(
      enrichmentResponse.person!,
      enrichmentResponse.organization
    );

    // Update lead in database with enriched data
    const { data: updatedLead, error: updateError } = await supabase
      .from("leads")
      .update({
        ...enrichedData,
        updated_at: new Date().toISOString(),
      })
      .eq("id", leadId)
      .select()
      .single();

    if (updateError) {
      console.error("[POST /api/leads/[leadId]/enrich] Update error:", updateError);
      return NextResponse.json(
        { error: { code: "INTERNAL_ERROR", message: "Erro ao atualizar lead" } },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: updatedLead as LeadRow });
  } catch (error) {
    console.error("[POST /api/leads/[leadId]/enrich] Error:", error);

    if (error instanceof ExternalServiceError) {
      // AC: #3 - Handle not found case
      if (error.statusCode === 404) {
        return NextResponse.json(
          {
            error: {
              code: "NOT_FOUND",
              message: "Lead não encontrado no Apollo para enriquecimento",
            },
          },
          { status: 404 }
        );
      }

      return NextResponse.json(
        { error: { code: "APOLLO_ERROR", message: error.message } },
        { status: error.statusCode }
      );
    }

    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Erro ao enriquecer lead. Tente novamente.",
        },
      },
      { status: 500 }
    );
  }
}
