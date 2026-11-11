/**
 * Agent Pricing (SSOT) — Story 24.10
 *
 * Fonte unica de PRECO e VOLUME do agente, em BRL. Alimenta a estimativa do plano
 * (`CostEstimatorService.estimateCosts`) e o custo real gravado em
 * `agent_executions.cost_actual` (`recordExecutionCost`). Os dois usam os mesmos precos
 * unitarios (de `cost_models`, por tenant, com fallback para os defaults abaixo), entao a
 * comparacao "estimado x real" e coerente.
 *
 * Modulo PURO (sem I/O, sem imports de servidor): seguro no cliente.
 *
 * Unidades (a interpretacao dos precos ja semeados em `cost_models` mudou nesta story;
 * os VALORES nao — mudar valor exigiria UPDATE em producao):
 * - theirstack: R$ por credito (3 creditos por empresa devolvida)
 * - apollo:     R$ por credito de enrichment (`/v1/people/match`). A busca (`api_search`) custa 0.
 * - apify:      R$ por perfil LinkedIn consultado
 * - openai:     R$ por chamada ao LLM
 * - instantly:  R$ por export
 * - treg:       R$ por US$ 1 gasto no Treg (Story 24.19; o Treg cobra em US$)
 */

import { MAX_REWRITES } from "@/lib/ai/copy-review-config";
import type { CostActual, ParsedBriefing, StepType } from "@/types/agent";

// ==============================================
// VOLUMES
// ==============================================

/**
 * Volumes reais do pipeline. Os steps importam daqui (sem duplicar), e a estimativa os
 * usa como TETO ("ate").
 */
export const AGENT_PIPELINE_VOLUMES = {
  /** Empresas pedidas ao TheirStack no fluxo com tecnologia (`limit` da busca). */
  companies: 2,
  /** Leads por pagina da busca Apollo do `search_leads`. */
  leadsPerSearch: 25,
  /** Story 24.13: teto de leads por pagina da busca Apollo (limite da API). */
  maxLeadsPerSearch: 100,
} as const;

/**
 * DW-19: e-mails da sequencia quando o usuario nao pede uma quantidade. A heuristica por
 * objetivo do prompt de estrutura (`campaign_structure_generation` em
 * `src/lib/ai/prompts/defaults.ts`) e so "tipica" (COLD_OUTREACH 4-5, REENGAGEMENT 3,
 * FOLLOW_UP 3-4, NURTURE 5-7); a regra dura do prompt e "maximo 7 emails", entao o teto
 * honesto e 7 para qualquer objetivo. Se o prompt padrao mudar, atualizar aqui.
 */
export const MAX_EMAILS_WITHOUT_COUNT = 7;

/**
 * DW-19: quantos e-mails a estimativa considera — o `emailCount` pedido (inteiro
 * positivo, que o prompt manda gerar EXATAMENTE), senao o teto do prompt padrao.
 */
export function resolveEmailVolume(briefing: Pick<ParsedBriefing, "emailCount">): number {
  const requested = briefing.emailCount;
  if (typeof requested === "number" && Number.isInteger(requested) && requested > 0) {
    return requested;
  }
  return MAX_EMAILS_WITHOUT_COUNT;
}

/** Story 24.13: teto de N (mesmo limite do `fetch-leads`). */
export const MAX_LEAD_COUNT = 500;

/**
 * Story 24.13: N valido do briefing (inteiro de 1 a 500) ou null. Valor fora da faixa
 * (JSONB com mais de um escritor) e tratado como ausente — comportamento anterior.
 */
export function resolveLeadCount(briefing: Pick<ParsedBriefing, "leadCount"> | null | undefined): number | null {
  const value = briefing?.leadCount;
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  if (value < 1 || value > MAX_LEAD_COUNT) return null;
  return value;
}

/**
 * Story 24.13: quantos leads a execucao vai processar — a contagem dos importados, se
 * houver; senao N; senao a pagina padrao (25).
 */
export function resolveLeadVolume(
  briefing: Pick<ParsedBriefing, "leadCount" | "importedLeads">
): number {
  const importedCount = Array.isArray(briefing.importedLeads) ? briefing.importedLeads.length : 0;
  if (importedCount > 0) return importedCount;
  return resolveLeadCount(briefing) ?? AGENT_PIPELINE_VOLUMES.leadsPerSearch;
}

/**
 * Story 24.16: tamanho da pagina da busca Apollo = universo de 3-5x N para o Fit Score
 * escolher os N melhores — `min(max(3N, min(5N, 25)), 100)`; sem N, 25.
 * Ex.: N=1 -> 5, N=5 -> 25, N=10 -> 30, N=20 -> 60, N>=34 -> 100.
 */
export function resolveLeadsPerPage(briefing: Pick<ParsedBriefing, "leadCount">): number {
  const n = resolveLeadCount(briefing);
  if (n === null) return AGENT_PIPELINE_VOLUMES.leadsPerSearch;
  return Math.min(
    Math.max(3 * n, Math.min(5 * n, AGENT_PIPELINE_VOLUMES.leadsPerSearch)),
    AGENT_PIPELINE_VOLUMES.maxLeadsPerSearch
  );
}

/** Story 24.19: estimativa do dossie por lead (US$ no Treg; spike 24.11: 0,015-0,02 por conta). */
export const DOSSIER_ESTIMATE_USD_PER_LEAD = 0.02;

/** Story 24.19: posts classificados por lead no pior caso (limite do Apify no dossie). */
export const DOSSIER_ESTIMATE_POSTS_PER_LEAD = 10;

/**
 * Cambio padrao (R$ por US$ 1) para o gasto do Treg. Fonte UNICA do 5,5: e o default
 * semeado em `cost_models` (servico `treg`) e o fallback de `resolveUnitPrices`. Para
 * mudar por tenant, basta editar a linha `treg` de `cost_models` (sem env nem secret).
 */
export const TREG_DEFAULT_BRL_PER_USD = 5.5;

/** Creditos TheirStack cobrados por empresa devolvida. */
export const THEIRSTACK_CREDITS_PER_COMPANY = 3;

// ==============================================
// PRECOS
// ==============================================

export type PricedService = "theirstack" | "apollo" | "apify" | "openai" | "instantly" | "treg";

export type UnitPrices = Record<PricedService, number>;

/** Defaults semeados em `cost_models` (lazy seed) e usados como fallback. BRL. */
export const AGENT_DEFAULT_COSTS: Record<PricedService, { unitPrice: number; unitDescription: string }> = {
  theirstack: { unitPrice: 0.1, unitDescription: "por credito TheirStack (3 por empresa)" },
  apollo: { unitPrice: 0.05, unitDescription: "por credito de enrichment Apollo" },
  apify: { unitPrice: 0.15, unitDescription: "por perfil LinkedIn" },
  openai: { unitPrice: 0.02, unitDescription: "por chamada de IA" },
  instantly: { unitPrice: 0.0, unitDescription: "por export (free tier)" },
  // Story 24.19: cambio usado para converter o gasto do Treg (US$) em BRL.
  treg: { unitPrice: TREG_DEFAULT_BRL_PER_USD, unitDescription: "BRL por US$ 1 gasto no Treg" },
};

const PRICED_SERVICES = Object.keys(AGENT_DEFAULT_COSTS) as PricedService[];

/**
 * Resolve os precos unitarios a partir de `cost_models` (Map ou objeto), com fallback
 * por servico para os defaults. Valor nao numerico/negativo cai no default.
 */
export function resolveUnitPrices(
  costModels: Map<string, number> | Record<string, number> | null | undefined
): UnitPrices {
  const read = (service: string): unknown => {
    if (!costModels) return undefined;
    if (costModels instanceof Map) return costModels.get(service);
    return (costModels as Record<string, unknown>)[service];
  };

  const prices = {} as UnitPrices;
  for (const service of PRICED_SERVICES) {
    const value = read(service);
    const raw = Number(value);
    prices[service] =
      value !== undefined && value !== null && Number.isFinite(raw) && raw >= 0
        ? raw
        : AGENT_DEFAULT_COSTS[service].unitPrice;
  }
  return prices;
}

// ==============================================
// FORMATACAO
// ==============================================

const BRL_FORMATTER = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

/** Formato unico de moeda do agente (estimativa, custo real e chat). */
export function formatBRL(value: number): string {
  return BRL_FORMATTER.format(Number.isFinite(value) ? value : 0);
}

// ==============================================
// ESTIMATIVA
// ==============================================

/**
 * Teto de chamadas de IA do `create_campaign`:
 * 1 (estrutura) + 2 x e-mails (assunto + corpo) + leads (icebreaker)
 * + e-mails x (1 + 2 x MAX_REWRITES) (pior caso do revisor).
 */
export function estimateAICallsForCampaign(leads: number, emails: number): number {
  return 1 + 2 * emails + leads + emails * (1 + 2 * MAX_REWRITES);
}

// ==============================================
// CUSTO REAL
// ==============================================

/** Steps cujo `cost` entra no custo real: so os que terminaram com sucesso. */
const COUNTED_STEP_STATUSES = new Set(["completed", "awaiting_approval", "approved"]);

export interface StepCostRow {
  step_type: string;
  status: string;
  cost: Record<string, unknown> | null | undefined;
}

function count(cost: Record<string, unknown>, key: string): number {
  const value = Number(cost[key]);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/** Custo real (BRL) de UM step a partir das contagens em `agent_steps.cost`. */
export function computeStepActualCost(
  stepType: string,
  cost: Record<string, unknown>,
  prices: UnitPrices
): number {
  switch (stepType as StepType) {
    case "search_companies":
      return count(cost, "theirstack_search") * prices.theirstack;
    case "search_leads":
      // Story 24.16: 1 chamada de IA do Fit Score (a busca Apollo nao consome credito).
      return count(cost, "openai_fit_score") * prices.openai;
    case "research_accounts":
      // Story 24.19: Treg (US$ x cambio) + perfis Apify + chamadas de IA do classificador.
      // Story 24.20: + chamadas de IA do motivo para abordar agora.
      return (
        count(cost, "treg_usd") * prices.treg +
        count(cost, "apify") * prices.apify +
        count(cost, "openai_relevance") * prices.openai +
        count(cost, "openai_why_now") * prices.openai
      );
    case "create_campaign": {
      const generationCalls =
        cost.openai_calls !== undefined && cost.openai_calls !== null
          ? count(cost, "openai_calls")
          : count(cost, "openai_structure") +
            2 * count(cost, "openai_emails") +
            count(cost, "openai_icebreakers");
      return (
        count(cost, "apollo_enrich") * prices.apollo +
        generationCalls * prices.openai +
        count(cost, "openai_review") * prices.openai +
        count(cost, "apify") * prices.apify
      );
    }
    case "export":
      return count(cost, "instantly_create") * prices.instantly;
    case "activate":
      return 0;
    default:
      return 0;
  }
}

/**
 * Custo real da execucao, recalculado do zero a partir dos steps (retry nunca duplica:
 * o step refeito tem UMA linha, com o `cost` da tentativa bem-sucedida).
 */
export function computeActualCost(steps: StepCostRow[], prices: UnitPrices): CostActual {
  const byStep: Record<string, number> = {};
  for (const step of steps) {
    if (!COUNTED_STEP_STATUSES.has(step.status)) continue;
    const cost =
      step.cost && typeof step.cost === "object" ? (step.cost as Record<string, unknown>) : {};
    const value = computeStepActualCost(step.step_type, cost, prices);
    byStep[step.step_type] = (byStep[step.step_type] ?? 0) + value;
  }
  const total = Object.values(byStep).reduce((sum, value) => sum + value, 0);
  return { steps: byStep, total, currency: "BRL" };
}

// ==============================================
// TEXTO DO CHAT
// ==============================================

export type CostPhase = "completed" | "paused" | "cancelled";

/** Linha de custo exibida no chat na conclusao, na pausa ou no cancelamento. */
export function formatCostLine(
  phase: CostPhase,
  estimateTotal: number | null,
  actualTotal: number
): string {
  const prefix =
    phase === "completed"
      ? "Custo da execução"
      : phase === "cancelled"
        ? "Custo até o cancelamento"
        : "Custo até aqui";
  if (estimateTotal === null || !Number.isFinite(estimateTotal)) {
    return `${prefix} — real ${formatBRL(actualTotal)}`;
  }
  return `${prefix} — estimado ${formatBRL(estimateTotal)} · real ${formatBRL(actualTotal)}`;
}
