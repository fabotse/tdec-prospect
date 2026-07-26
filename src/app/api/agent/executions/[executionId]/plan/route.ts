/**
 * API Route: GET /api/agent/executions/[executionId]/plan
 * Story 16.5: Plano de Execucao & Estimativa de Custo
 *
 * AC: #1 - Retorna plano de execucao com etapas em ordem
 * AC: #2 - Retorna estimativa de custo por etapa e total
 * AC: #3 - Usa cost_models do banco (lazy seed)
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserProfile } from "@/lib/supabase/tenant";
import { createClient } from "@/lib/supabase/server";
import { CostEstimatorService } from "@/lib/services/agent-cost-estimator";
import { PlanGeneratorService } from "@/lib/services/agent-plan-generator";
import { ApolloService } from "@/lib/services/apollo";
import { getInjectableServiceApiKey } from "@/lib/agent/service-keys";
import { buildDirectSearchFilters } from "@/lib/agent/search-defaults";
import type { ParsedBriefing } from "@/types/agent";

// ==============================================
// Story 22.14 (AC7) — viabilidade da busca ANTES de gastar
// ==============================================

/** Abaixo disto a campanha nasce fraca e vale avisar antes do "Iniciar Execucao". */
const LOW_VIABILITY_THRESHOLD = 10;

/**
 * Teto de espera da contagem (code review 22.14).
 *
 * `ExternalService` usa `DEFAULT_TIMEOUT_MS = 10000` com `MAX_RETRIES = 1`, ou seja ~20s no
 * pior caso — awaitados INLINE antes do plano responder. O `catch` fail-open captura o
 * AbortError e devolve `null`, entao nunca virava 504; mas o AC7 exige nao estourar o NFR de
 * <5s, e um plano que demora 20s para abrir e um bloqueio na pratica. Passado o prazo,
 * seguimos sem estimativa: a contagem e um conforto, nunca um requisito.
 */
const VIABILITY_DEADLINE_MS = 4000;

export interface SearchViability {
  /** `pagination.totalEntries` da Apollo com os filtros EFETIVOS da busca. */
  estimatedResults: number;
  isLow: boolean;
}

/**
 * Conta quantos leads a busca direta encontraria, SEM executá-la.
 *
 * Por que é seguro: o endpoint `mixed_people/api_search` da Apollo NÃO consome créditos
 * (créditos são de *enrichment* — verificado na doc oficial em 2026-07-25) e `perPage: 1`
 * devolve `pagination.total_entries` completo. O custo real é latência.
 *
 * Por que é OPT-IN por query param (Trap #7): `GET /plan` tem DOIS chamadores. O
 * `AgentExecutionPlan` monta uma vez, antes do "Iniciar Execução" — é o momento certo. Mas
 * `fetchStepEstimatedCost` (22.13) chama este mesmo endpoint a CADA turno de ajuste; sem o
 * opt-in, cada frase digitada no ajuste dispararia uma chamada externa.
 *
 * Fail-open em TUDO (chave ausente, decrypt, rede, rate limit): sem número, o plano sai
 * como sempre saiu. Uma estimativa é um conforto, nunca um bloqueio.
 */
async function estimateSearchViability(
  tenantId: string,
  briefing: ParsedBriefing
): Promise<SearchViability | null> {
  try {
    const hasImportedLeads = Boolean(briefing.importedLeads?.length);
    const skipSteps = Array.isArray(briefing.skipSteps) ? briefing.skipSteps : [];

    // Só a BUSCA DIRETA é contável a partir do briefing. No fluxo com tecnologia, o
    // `search_leads` busca pelos domínios que o step 1 ainda vai descobrir — contar pelos
    // filtros do briefing daria um número que não tem relação com o que vai rodar.
    const isDirectSearch =
      !hasImportedLeads &&
      !skipSteps.includes("search_leads") &&
      (briefing.jobTitles?.length ?? 0) > 0 &&
      (skipSteps.includes("search_companies") || !briefing.technology);

    if (!isDirectSearch) return null;

    // Story 22.9: chave via service-role, injetada no service (RLS de api_configs é
    // admin-only e mataria a leitura de sessão para um `sdr`).
    const apolloApiKey = await getInjectableServiceApiKey(tenantId, "apollo", "Apollo");
    const service = new ApolloService(tenantId, apolloApiKey);

    // Corrida contra o prazo: o que vier primeiro. A promise perdedora continua rodando ate
    // o proprio timeout do service (nao ha custo em credito — o search da Apollo nao consome),
    // mas ninguem mais espera por ela.
    const result = await Promise.race([
      service.searchPeople(buildDirectSearchFilters(briefing, 1)),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), VIABILITY_DEADLINE_MS)),
    ]);
    if (!result) return null;

    const estimatedResults = result.pagination.totalEntries;
    if (typeof estimatedResults !== "number") return null;

    return { estimatedResults, isLow: estimatedResults < LOW_VIABILITY_THRESHOLD };
  } catch {
    return null;
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ executionId: string }> }
) {
  const profile = await getCurrentUserProfile();
  if (!profile) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Nao autenticado" } },
      { status: 401 }
    );
  }

  const { executionId } = await params;
  const supabase = await createClient();

  // Buscar execucao (RLS filtra por tenant)
  const { data: execution } = await supabase
    .from("agent_executions")
    .select("id, briefing, status")
    .eq("id", executionId)
    .single();

  if (!execution) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Execucao nao encontrada" } },
      { status: 404 }
    );
  }

  // Verificar briefing preenchido (Story 17.10: technology pode ser null em direct entry)
  const briefing = execution.briefing as ParsedBriefing | null;
  const hasImportedLeads = briefing?.importedLeads && briefing.importedLeads.length > 0;
  const hasMinimumFields = briefing && (
    briefing.technology ||
    (briefing.jobTitles && briefing.jobTitles.length > 0) ||
    hasImportedLeads
  );
  if (!hasMinimumFields) {
    return NextResponse.json(
      { error: { code: "INVALID_BRIEFING", message: "Briefing incompleto ou ausente" } },
      { status: 400 }
    );
  }

  // Buscar/criar cost models
  const costModels = await CostEstimatorService.ensureCostModels(supabase, profile.tenant_id);

  // Calcular custos
  const costEstimate = CostEstimatorService.estimateCosts(costModels, briefing);

  // Gerar plano
  const steps = PlanGeneratorService.generatePlan(briefing, costEstimate);
  const totalActiveSteps = steps.filter((s) => !s.skipped).length;

  // Story 22.14 (AC7): contagem de viabilidade SÓ quando pedida explicitamente — ver o
  // comentário de `estimateSearchViability` (Trap #7).
  const wantsViability = request.nextUrl.searchParams.get("viability") === "1";
  const viability = wantsViability
    ? await estimateSearchViability(profile.tenant_id, briefing)
    : null;

  return NextResponse.json({
    data: { steps, costEstimate, totalActiveSteps, viability },
  });
}
