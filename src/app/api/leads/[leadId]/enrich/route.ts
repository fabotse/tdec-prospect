/**
 * Lead Enrichment API Route
 * Story 4.4.1: Lead Data Enrichment
 * Story 12.3: Support enrichment for leads without apollo_id
 *
 * Enriches a persisted lead with complete data from Apollo People Enrichment API.
 * Uses economy mode: reveal_personal_emails=false, reveal_phone_number=false
 * Story 12.3: If lead has no apollo_id, uses match by details (name, company, email)
 *
 * AC: #2 - Enrich lead and update in database
 * AC: #3 - Handle not found case
 * AC: #6 - Error handling with Portuguese messages
 * Story 12.3 AC: #7 - Support enrichment for leads without apollo_id
 * Story 12.3 AC: #3 - Save apollo_id from match
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserProfile } from "@/lib/supabase/tenant";
import { z } from "zod";
import { ApolloService } from "@/lib/services/apollo";
import { ExternalServiceError } from "@/lib/services/base-service";
import { transformEnrichmentToLead, buildMatchRequest } from "@/types/apollo";
import type { LeadRow } from "@/types/lead";

interface RouteParams {
  params: Promise<{ leadId: string }>;
}

// UUID validation schema
const uuidSchema = z.string().uuid("ID de lead inválido");

/**
 * POST /api/leads/[leadId]/enrich
 * Enrich a single persisted lead with Apollo data
 * Story 12.3: Supports leads with AND without apollo_id
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

  const profile = await getCurrentUserProfile();
  if (!profile) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Não autenticado" } },
      { status: 401 }
    );
  }

  const supabase = await createClient();

  // Fetch lead (with tenant isolation)
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

  try {
    const apolloService = new ApolloService(profile.tenant_id);
    let enrichmentResponse;

    if (lead.apollo_id) {
      // Existing flow: enrich by apollo_id
      enrichmentResponse = await apolloService.enrichPerson(lead.apollo_id, {
        revealPersonalEmails: false,
        revealPhoneNumber: false,
      });
    } else {
      // Story 12.3 AC #7: enrich by details (name, company, email)
      enrichmentResponse = await apolloService.enrichPersonByDetails(
        buildMatchRequest(lead as LeadRow)
      );
    }

    // Transform enrichment response to partial LeadRow
    const enrichedData = transformEnrichmentToLead(
      enrichmentResponse.person!,
      enrichmentResponse.organization
    );

    // Story 12.3 AC #3: Save apollo_id from match if lead didn't have one
    const updateData: Record<string, unknown> = {
      ...enrichedData,
    };

    if (!lead.apollo_id && enrichmentResponse.person?.id) {
      updateData.apollo_id = enrichmentResponse.person.id;
    }

    // Update lead in database with enriched data
    const { data: updatedLead, error: updateError } = await supabase
      .from("leads")
      .update(updateData)
      .eq("id", leadId)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json(
        { error: { code: "INTERNAL_ERROR", message: "Erro ao atualizar lead" } },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: updatedLead as LeadRow });
  } catch (error) {
    if (error instanceof ExternalServiceError) {
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
