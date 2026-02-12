/**
 * Bulk Lead Enrichment API Route
 * Story 4.4.1: Lead Data Enrichment
 * Story 12.3: Enrichment for leads without apollo_id (match by details)
 *
 * Enriches multiple persisted leads with Apollo People Enrichment API.
 * Processes in batches of 10 (Apollo bulk API limit).
 * Story 12.3: Supports leads without apollo_id via People Match by details.
 *
 * AC: #4 - Bulk enrichment with progress tracking
 * AC: #6 - Error handling with Portuguese messages
 * Story 12.3 AC: #2 - Match by name+company for leads without apollo_id
 * Story 12.3 AC: #3 - Save apollo_id from match for future enrichments
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserProfile } from "@/lib/supabase/tenant";
import { z } from "zod";
import { ApolloService } from "@/lib/services/apollo";
import { transformEnrichmentToLead, buildMatchRequest } from "@/types/apollo";
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
 * Story 12.3: Supports leads with AND without apollo_id
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

  // Fetch all leads (with tenant isolation)
  const { data: leads, error: fetchError } = await supabase
    .from("leads")
    .select("*")
    .in("id", leadIds)
    .eq("tenant_id", profile.tenant_id);

  if (fetchError) {
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

  // Story 12.3: Separate leads into two groups
  const leadsWithApolloId = leads.filter((lead) => lead.apollo_id);
  const leadsWithoutApolloId = leads.filter((lead) => !lead.apollo_id);

  const result: EnrichmentResult = {
    enriched: 0,
    notFound: 0,
    failed: 0,
    leads: [],
  };

  const apolloService = new ApolloService(profile.tenant_id);

  // Group 1: Leads WITH apollo_id — existing flow (enrichPeople by id)
  for (let i = 0; i < leadsWithApolloId.length; i += BATCH_SIZE) {
    const batch = leadsWithApolloId.slice(i, i + BATCH_SIZE);
    const apolloIds = batch.map((lead) => lead.apollo_id!);

    try {
      const enrichedPersons = await apolloService.enrichPeople(apolloIds, {
        revealPersonalEmails: false,
        revealPhoneNumber: false,
      });

      const enrichedMap = new Map(
        enrichedPersons.map((person) => [person.id, person])
      );

      for (const lead of batch) {
        const enrichedPerson = enrichedMap.get(lead.apollo_id!);

        if (enrichedPerson) {
          const enrichedData = transformEnrichmentToLead(enrichedPerson, null);

          const { data: updatedLead, error: updateError } = await supabase
            .from("leads")
            .update(enrichedData)
            .eq("id", lead.id)
            .select()
            .single();

          if (updateError) {
            result.failed++;
          } else {
            result.enriched++;
            result.leads.push(updatedLead as LeadRow);
          }
        } else {
          result.notFound++;
        }
      }
    } catch {
      result.failed += batch.length;
    }
  }

  // Group 2: Leads WITHOUT apollo_id — Story 12.3 flow (enrichPeopleByDetails)
  for (let i = 0; i < leadsWithoutApolloId.length; i += BATCH_SIZE) {
    const batch = leadsWithoutApolloId.slice(i, i + BATCH_SIZE);
    const details = batch.map((lead) => buildMatchRequest(lead as LeadRow));

    try {
      const enrichedResults = await apolloService.enrichPeopleByDetails(details);

      // Correlate by index (Apollo bulk_match preserves order)
      for (let j = 0; j < batch.length; j++) {
        const lead = batch[j];
        const match = enrichedResults[j];

        if (match?.person) {
          const enrichedData = transformEnrichmentToLead(match.person, match.organization);

          // Story 12.3 AC #3: Save apollo_id from match
          const { data: updatedLead, error: updateError } = await supabase
            .from("leads")
            .update({
              ...enrichedData,
              apollo_id: match.person.id,
            })
            .eq("id", lead.id)
            .select()
            .single();

          if (updateError) {
            result.failed++;
          } else {
            result.enriched++;
            result.leads.push(updatedLead as LeadRow);
          }
        } else {
          result.notFound++;
        }
      }
    } catch {
      result.failed += batch.length;
    }
  }

  return NextResponse.json({
    data: result,
    message: `${result.enriched} leads enriquecidos, ${result.notFound} não encontrados`,
  });
}
