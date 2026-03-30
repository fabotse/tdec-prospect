/**
 * API Route: POST /api/agent/executions/[executionId]/steps/[stepNumber]/fetch-leads
 * Story 17.12 - AC: #2, #3
 *
 * Fetches additional leads via Apollo pagination when user requests more
 * than the initial batch (25). Called from AgentLeadReview UI.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserProfile } from "@/lib/supabase/tenant";
import { createClient } from "@/lib/supabase/server";
import { ApolloService } from "@/lib/services/apollo";
import { mapLeadRowToSearchLeadResult } from "@/lib/agent/steps/search-leads-step";
import type { ApolloSearchFilters } from "@/types/apollo";
import type { SearchLeadResult } from "@/types/agent";

const CREDITS_PER_LEAD = 1;

const fetchLeadsSchema = z.object({
  desiredCount: z.number().int().min(1).max(500),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ executionId: string; stepNumber: string }> }
) {
  // Auth
  const profile = await getCurrentUserProfile();
  if (!profile) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Nao autenticado" } },
      { status: 401 }
    );
  }

  const { executionId, stepNumber: stepNumberStr } = await params;

  // Validate params
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_REGEX.test(executionId)) {
    return NextResponse.json(
      { error: { code: "INVALID_PARAMS", message: "executionId deve ser um UUID valido" } },
      { status: 400 }
    );
  }

  const stepNumber = parseInt(stepNumberStr, 10);
  if (isNaN(stepNumber) || stepNumber < 1) {
    return NextResponse.json(
      { error: { code: "INVALID_PARAMS", message: "stepNumber deve ser um numero positivo" } },
      { status: 400 }
    );
  }

  // Parse and validate body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_BODY", message: "Body JSON invalido" } },
      { status: 400 }
    );
  }

  const parsed = fetchLeadsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "desiredCount deve ser inteiro entre 1 e 500" } },
      { status: 400 }
    );
  }

  const { desiredCount } = parsed.data;
  const supabase = await createClient();

  // Verify execution exists and belongs to tenant
  const { data: execution } = await supabase
    .from("agent_executions")
    .select("id, tenant_id")
    .eq("id", executionId)
    .single();

  if (!execution || execution.tenant_id !== profile.tenant_id) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Execucao nao encontrada" } },
      { status: 404 }
    );
  }

  // Fetch step record
  const { data: stepRecord } = await supabase
    .from("agent_steps")
    .select("step_number, step_type, status, output, cost")
    .eq("execution_id", executionId)
    .eq("step_number", stepNumber)
    .single();

  if (!stepRecord) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Step nao encontrado" } },
      { status: 404 }
    );
  }

  // Verify step is awaiting_approval
  if (stepRecord.status !== "awaiting_approval") {
    return NextResponse.json(
      { error: { code: "CONFLICT", message: "Step nao esta aguardando aprovacao" } },
      { status: 400 }
    );
  }

  // Extract searchFilters from step output
  const existingOutput = (stepRecord.output as Record<string, unknown>) ?? {};
  const searchFilters = existingOutput.searchFilters as Record<string, unknown> | undefined;

  if (!searchFilters) {
    return NextResponse.json(
      { error: { code: "MISSING_FILTERS", message: "Step nao possui searchFilters no output" } },
      { status: 400 }
    );
  }

  // Paginate Apollo
  const perPage = (searchFilters.perPage as number) ?? 25;
  const totalPages = Math.ceil(desiredCount / perPage);
  const service = new ApolloService(profile.tenant_id);
  const allLeads: SearchLeadResult[] = [];

  try {
    for (let page = 1; page <= totalPages; page++) {
      const filters: ApolloSearchFilters = { ...(searchFilters as ApolloSearchFilters), page };
      const result = await service.searchPeople(filters);
      const mapped = result.leads.map(mapLeadRowToSearchLeadResult);
      allLeads.push(...mapped);

      if (allLeads.length >= desiredCount) break;
      if (result.pagination.page >= result.pagination.totalPages) break;
    }
  } catch (error) {
    return NextResponse.json(
      { error: { code: "APOLLO_ERROR", message: error instanceof Error ? error.message : "Erro ao buscar leads no Apollo" } },
      { status: 502 }
    );
  }

  // Deduplicate by email (case-insensitive), fallback to apolloId
  const seen = new Set<string>();
  const deduplicated = allLeads.filter((lead) => {
    const key = lead.email
      ? lead.email.toLowerCase()
      : lead.apolloId ?? null;
    if (key === null) return true; // leads without email/apolloId are treated as unique
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Truncate to desiredCount after dedup to ensure user gets the requested amount
  const finalLeads = deduplicated.slice(0, desiredCount);

  // Update step output in DB
  const existingCost = (stepRecord.cost as Record<string, number>) ?? {};
  const previousApolloSearch = existingCost.apollo_search ?? 0;
  const newLeadsCount = finalLeads.length - ((existingOutput.leads as unknown[]) ?? []).length;
  const additionalCost = Math.max(0, newLeadsCount) * CREDITS_PER_LEAD;

  const { error: updateError } = await supabase
    .from("agent_steps")
    .update({
      output: { ...existingOutput, leads: finalLeads, totalFetched: finalLeads.length },
      cost: { ...existingCost, apollo_search: previousApolloSearch + additionalCost },
    })
    .eq("execution_id", executionId)
    .eq("step_number", stepNumber);

  if (updateError) {
    return NextResponse.json(
      { error: { code: "UPDATE_ERROR", message: "Erro ao atualizar step no banco" } },
      { status: 500 }
    );
  }

  return NextResponse.json({
    data: {
      leads: finalLeads,
      totalFetched: finalLeads.length,
      totalFound: existingOutput.totalFound as number,
      cost: { apollo_search: previousApolloSearch + additionalCost },
    },
  });
}
