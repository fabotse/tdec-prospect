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
import { readServiceApiKey } from "@/lib/agent/service-keys";
import { mapLeadRowToSearchLeadResult } from "@/lib/agent/steps/search-leads-step";
import { logAgentUsage } from "@/lib/agent/agent-usage";
import {
  findContactedLeads,
  orderByScreening,
  screenLeads,
  summarizeScreening,
} from "@/lib/agent/lead-screening";
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
  // Story 22.9: chave do Apollo lida via SERVICE-ROLE e injetada no service — a
  // leitura interna dele usa o client de sessao (RLS admin-only de api_configs) e
  // devolveria "API key nao configurada" para um `sdr`.
  const apolloKeyLookup = await readServiceApiKey(profile.tenant_id, "apollo");

  // Chave presente mas nao decriptavel nao pode virar "nao configurada": mesmo split
  // 422/500 das demais rotas do agente. `missing` segue injetando `undefined`, e o
  // service produz a mensagem de "nao configurada" de hoje.
  if (apolloKeyLookup.status === "decrypt_error") {
    return NextResponse.json(
      {
        error: {
          code: "API_KEY_ERROR",
          message: "Erro ao decriptar a API key do Apollo",
        },
      },
      { status: 500 }
    );
  }

  const apolloApiKey =
    apolloKeyLookup.status === "ok" ? apolloKeyLookup.apiKey : undefined;
  const service = new ApolloService(profile.tenant_id, apolloApiKey);
  const allLeads: SearchLeadResult[] = [];

  try {
    for (let page = 1; page <= totalPages; page++) {
      const filters: ApolloSearchFilters = { ...(searchFilters as ApolloSearchFilters), page };
      // Story 24.10: 1 linha `people_search` por chamada (a busca nao consome credito).
      const searchStart = Date.now();
      let result: Awaited<ReturnType<ApolloService["searchPeople"]>>;
      try {
        result = await service.searchPeople(filters);
      } catch (searchError) {
        await logAgentUsage({
          tenantId: profile.tenant_id,
          executionId,
          stepType: "search_leads",
          serviceName: "apollo",
          requestType: "people_search",
          status: "failed",
          calls: 1,
          durationMs: Date.now() - searchStart,
          errorMessage: searchError instanceof Error ? searchError.message : "Erro Apollo",
          metadata: { page, origin: "fetch_leads" },
        });
        throw searchError;
      }
      await logAgentUsage({
        tenantId: profile.tenant_id,
        executionId,
        stepType: "search_leads",
        serviceName: "apollo",
        requestType: "people_search",
        status: "success",
        calls: 1,
        durationMs: Date.now() - searchStart,
        metadata: { page, leads: result.leads.length, origin: "fetch_leads" },
      });
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

  // Story 24.15: mesma triagem do step (antes do dedupe/corte) — remove suprimidos e marca
  // orgaos publicos e ja contatados. Fail-open.
  const contactMap = await findContactedLeads(
    supabase,
    profile.tenant_id,
    allLeads.map((l) => l.apolloId)
  );
  const screened = screenLeads(allLeads, contactMap);

  // Deduplicate by email (case-insensitive), fallback to apolloId
  const seen = new Set<string>();
  const deduplicated = screened.leads.filter((lead) => {
    const key = lead.email
      ? lead.email.toLowerCase()
      : lead.apolloId ?? null;
    if (key === null) return true; // leads without email/apolloId are treated as unique
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Truncate to desiredCount after dedup to ensure user gets the requested amount
  // Story 24.15: elegiveis primeiro, depois ja contatados, depois orgaos publicos.
  const finalLeads = orderByScreening(deduplicated).slice(0, desiredCount);
  const screening = summarizeScreening(finalLeads, screened.suppressedCount);

  // Update step output in DB
  const existingCost = (stepRecord.cost as Record<string, number>) ?? {};
  const previousApolloSearch = existingCost.apollo_search ?? 0;
  const newLeadsCount = finalLeads.length - ((existingOutput.leads as unknown[]) ?? []).length;
  const additionalCost = Math.max(0, newLeadsCount) * CREDITS_PER_LEAD;

  const { error: updateError } = await supabase
    .from("agent_steps")
    .update({
      output: { ...existingOutput, leads: finalLeads, totalFetched: finalLeads.length, screening },
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
      screening,
      cost: { apollo_search: previousApolloSearch + additionalCost },
    },
  });
}
