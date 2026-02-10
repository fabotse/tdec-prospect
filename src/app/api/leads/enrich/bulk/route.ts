/**
 * Bulk Lead Enrichment API Route
 * Story 4.4.1: Lead Data Enrichment
 *
 * Enriches multiple persisted leads with Apollo People Enrichment API.
 * Processes in batches of 10 (Apollo bulk API limit).
 *
 * AC: #4 - Bulk enrichment with progress tracking
 * AC: #6 - Error handling with Portuguese messages
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserProfile } from "@/lib/supabase/tenant";
import { z } from "zod";
import { ApolloService } from "@/lib/services/apollo";
import { transformEnrichmentToLead } from "@/types/apollo";
import type { LeadRow } from "@/types/lead";

const BATCH_SIZE = 10; // Apollo bulk API limit

// Request body schema
const bulkEnrichSchema = z.object({
  leadIds: z
    .array(z.string().uuid("ID de lead inválido"))
    .min(1, "Pelo menos um lead é necessário")
    .max(100, "Máximo de 100 leads por requisição"),
});

interface EnrichmentResult {
  enriched: number;
  notFound: number;
  failed: number;
  leads: LeadRow[];
}

/**
 * POST /api/leads/enrich/bulk
 * Enrich multiple persisted leads with Apollo data
 * AC: #4
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

  // Parse and validate request body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Corpo da requisição inválido" } },
      { status: 400 }
    );
  }

  const validation = bulkEnrichSchema.safeParse(body);
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

  // Fetch all leads to get apollo_ids (with tenant isolation)
  const { data: leads, error: fetchError } = await supabase
    .from("leads")
    .select("*")
    .in("id", leadIds)
    .eq("tenant_id", profile.tenant_id);

  if (fetchError) {
    console.error("[POST /api/leads/enrich/bulk] Fetch error:", fetchError);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro ao buscar leads" } },
      { status: 500 }
    );
  }

  if (!leads || leads.length === 0) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Nenhum lead encontrado" } },
      { status: 404 }
    );
  }

  // Filter leads that have apollo_id
  const leadsWithApolloId = leads.filter((lead) => lead.apollo_id);
  const leadsWithoutApolloId = leads.filter((lead) => !lead.apollo_id);

  const result: EnrichmentResult = {
    enriched: 0,
    notFound: leadsWithoutApolloId.length,
    failed: 0,
    leads: [],
  };

  if (leadsWithApolloId.length === 0) {
    return NextResponse.json({
      data: result,
      message: "Nenhum lead possui ID do Apollo para enriquecimento",
    });
  }

  // Process in batches of 10
  const apolloService = new ApolloService(profile.tenant_id);

  for (let i = 0; i < leadsWithApolloId.length; i += BATCH_SIZE) {
    const batch = leadsWithApolloId.slice(i, i + BATCH_SIZE);
    const apolloIds = batch.map((lead) => lead.apollo_id!);

    try {
      // Call Apollo bulk enrichment
      const enrichedPersons = await apolloService.enrichPeople(apolloIds, {
        revealPersonalEmails: false,
        revealPhoneNumber: false,
      });

      // Create a map of apollo_id to enriched person for quick lookup
      const enrichedMap = new Map(
        enrichedPersons.map((person) => [person.id, person])
      );

      // Update each lead in the batch
      for (const lead of batch) {
        const enrichedPerson = enrichedMap.get(lead.apollo_id!);

        if (enrichedPerson) {
          const enrichedData = transformEnrichmentToLead(enrichedPerson, null);

          const { data: updatedLead, error: updateError } = await supabase
            .from("leads")
            .update({
              ...enrichedData,
              updated_at: new Date().toISOString(),
            })
            .eq("id", lead.id)
            .select()
            .single();

          if (updateError) {
            console.error(
              `[POST /api/leads/enrich/bulk] Update error for lead ${lead.id}:`,
              updateError
            );
            result.failed++;
          } else {
            result.enriched++;
            result.leads.push(updatedLead as LeadRow);
          }
        } else {
          result.notFound++;
        }
      }
    } catch (error) {
      console.error(
        `[POST /api/leads/enrich/bulk] Batch error at index ${i}:`,
        error
      );
      // Count all leads in failed batch as failed
      result.failed += batch.length;
    }
  }

  return NextResponse.json({
    data: result,
    message: `${result.enriched} leads enriquecidos, ${result.notFound} não encontrados`,
  });
}
