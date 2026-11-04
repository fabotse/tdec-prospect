/**
 * CostEstimatorService
 * Story: 16.5 - Plano de Execucao & Estimativa de Custo
 *
 * AC: #2 - Calcula estimativa de custo por etapa e total
 * AC: #3 - Usa precos unitarios da tabela cost_models (lazy seed)
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { readServiceApiKey } from "@/lib/agent/service-keys";
import type { CostEstimate, CostModel, ParsedBriefing } from "@/types/agent";
import { DOSSIER_CONFIG } from "@/lib/agent/dossier/config";
import {
  AGENT_DEFAULT_COSTS,
  AGENT_PIPELINE_VOLUMES,
  DOSSIER_ESTIMATE_USD_PER_LEAD,
  DOSSIER_ESTIMATE_POSTS_PER_LEAD,
  THEIRSTACK_CREDITS_PER_COMPANY,
  estimateAICallsForCampaign,
  formatBRL,
  resolveLeadVolume,
  resolveUnitPrices,
} from "@/lib/agent/agent-pricing";

// ==============================================
// CONSTANTS
// ==============================================

/**
 * Story 24.10: os defaults (e a unidade de cada preco) moram na fonte unica
 * `agent-pricing.ts`. Re-exportado para o lazy seed e para os chamadores antigos.
 */
export const DEFAULT_COSTS: Record<string, { unitPrice: number; unitDescription: string }> =
  AGENT_DEFAULT_COSTS;

/** FEL-57: espera maxima pela leitura da chave do Treg ao montar o plano (ms). */
const TREG_KEY_CHECK_TIMEOUT_MS = 3000;

export interface EstimateCostsOptions {
  /**
   * FEL-57: o tenant tem chave do Treg utilizavel? `false` = o `research_accounts` vai
   * pular a pesquisa (sem Treg nao ha dossie nem posts), entao a etapa custa 0.
   * `undefined` = desconhecido: mantem o teto de antes (pior caso).
   */
  tregConfigured?: boolean;
}

// ==============================================
// SERVICE
// ==============================================

export class CostEstimatorService {
  /**
   * Query cost_models for tenant. Returns map service_name → unit_price.
   * AC: #3
   */
  static async getCostModels(
    supabase: SupabaseClient
  ): Promise<Map<string, number>> {
    const { data, error } = await supabase
      .from("cost_models")
      .select("service_name, unit_price");

    if (error || !data) {
      return new Map();
    }

    const map = new Map<string, number>();
    for (const row of data as Pick<CostModel, "service_name" | "unit_price">[]) {
      map.set(row.service_name, row.unit_price);
    }
    return map;
  }

  /**
   * Lazy seed: if no cost_models found for tenant, insert DEFAULT_COSTS.
   * Returns cost models (from DB or freshly inserted).
   * AC: #3
   */
  static async ensureCostModels(
    supabase: SupabaseClient,
    tenantId: string
  ): Promise<Map<string, number>> {
    const existing = await CostEstimatorService.getCostModels(supabase);

    if (existing.size > 0) {
      return existing;
    }

    // Lazy seed
    const rows = Object.entries(DEFAULT_COSTS).map(([serviceName, info]) => ({
      tenant_id: tenantId,
      service_name: serviceName,
      unit_price: info.unitPrice,
      unit_description: info.unitDescription,
      currency: "BRL",
    }));

    await supabase.from("cost_models").insert(rows);

    // Re-query to get inserted data
    return CostEstimatorService.getCostModels(supabase);
  }

  /**
   * FEL-57: o tenant tem chave do Treg que o `research_accounts` consegue usar?
   * Mesma regra do step (`readServiceApiKey` com status `ok`). NUNCA lanca nem segura o
   * plano: erro ou demora -> `undefined` (a estimativa mantem o pior caso).
   */
  static async isTregConfigured(tenantId: string): Promise<boolean | undefined> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const lookup = await Promise.race([
        readServiceApiKey(tenantId, "treg"),
        new Promise<null>((resolve) => {
          timer = setTimeout(() => resolve(null), TREG_KEY_CHECK_TIMEOUT_MS);
        }),
      ]);
      if (!lookup) return undefined;
      return lookup.status === "ok";
    } catch {
      return undefined;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /**
   * Calculate cost per step and total based on cost models and briefing.
   * AC: #2
   *
   * Story 24.10: estimativa HONESTA, com os volumes reais do pipeline como TETO ("ate").
   * - search_companies: empresas x 3 creditos x theirstack
   * - search_leads: 1 x openai (Fit Score, Story 24.16); a busca Apollo nao consome credito
   * - create_campaign: leads x apollo (enrichment) + chamadas de IA x openai
   *   (+ leads x apify com icebreaker premium)
   * - export: 1 x instantly; activate: 0
   * O pior caso e de proposito (22.5: "custo nao pode errar; cliente precifica em cima").
   */
  static estimateCosts(
    costModels: Map<string, number>,
    briefing: ParsedBriefing,
    options: EstimateCostsOptions = {}
  ): CostEstimate {
    const prices = resolveUnitPrices(costModels);
    const skipSet = new Set(briefing.skipSteps ?? []);

    const companies = AGENT_PIPELINE_VOLUMES.companies;
    // Story 24.13: importados > N > 25 (fonte unica em agent-pricing).
    const leads = resolveLeadVolume(briefing);
    const emails = briefing.emailCount ?? AGENT_PIPELINE_VOLUMES.defaultEmails;
    const aiCalls = estimateAICallsForCampaign(leads, emails);
    const credits = companies * THEIRSTACK_CREDITS_PER_COMPANY;

    const createCampaignSkipped = skipSet.has("create_campaign");
    const premiumTotal = createCampaignSkipped ? 0 : leads * prices.apify;
    const usePremiumIcebreakers = briefing.premiumIcebreakers === true;

    const enrichCost = leads * prices.apollo;
    const aiCost = aiCalls * prices.openai;
    const createCampaignDescription =
      `até ${leads} enriquecimentos Apollo × ${formatBRL(prices.apollo)} + ` +
      `até ${aiCalls} chamadas de IA × ${formatBRL(prices.openai)}` +
      (usePremiumIcebreakers
        ? ` + ${leads} perfis LinkedIn × ${formatBRL(prices.apify)} (icebreakers premium)`
        : "");

    // Story 24.19: pesquisa das contas = Treg ate o teto da execucao (US$ x cambio) e, com
    // o toggle de LinkedIn, perfis Apify + classificacao dos posts (ate 10 por lead).
    const researchSkipped = skipSet.has("research_accounts");
    // FEL-57: sem chave do Treg o step pula a pesquisa inteira (nem Treg, nem Apify).
    const researchWithoutKey = options.tregConfigured === false;
    const researchUsd = Math.min(
      leads * DOSSIER_ESTIMATE_USD_PER_LEAD,
      DOSSIER_CONFIG.maxCostUsdPerExecution
    );
    const researchPremium = usePremiumIcebreakers
      ? leads * prices.apify + leads * DOSSIER_ESTIMATE_POSTS_PER_LEAD * prices.openai
      : 0;
    const researchDescription = researchWithoutKey
      ? "Sem custo: a chave do Treg não está configurada e a pesquisa das contas será pulada"
      : `até US$ ${researchUsd.toFixed(2)} de pesquisa web (Treg) × ${formatBRL(prices.treg)}` +
      (usePremiumIcebreakers
        ? ` + ${leads} perfis LinkedIn × ${formatBRL(prices.apify)} + até ${leads * DOSSIER_ESTIMATE_POSTS_PER_LEAD} classificações de posts × ${formatBRL(prices.openai)}`
        : "");

    const stepCosts: Record<string, { estimated: number; description: string }> = {
      search_companies: {
        estimated: skipSet.has("search_companies") ? 0 : credits * prices.theirstack,
        description: `até ${companies} empresas × ${THEIRSTACK_CREDITS_PER_COMPANY} créditos × ${formatBRL(prices.theirstack)}`,
      },
      search_leads: {
        // Story 24.16: 1 chamada de IA do Fit Score por busca (teto estrutural).
        estimated: skipSet.has("search_leads") ? 0 : 1 * prices.openai,
        description: "1 chamada de IA (Fit Score); busca Apollo não consome créditos",
      },
      research_accounts: {
        estimated: researchSkipped || researchWithoutKey ? 0 : researchUsd * prices.treg + researchPremium,
        description: researchDescription,
      },
      create_campaign: {
        estimated: createCampaignSkipped
          ? 0
          : enrichCost + aiCost + (usePremiumIcebreakers ? premiumTotal : 0),
        description: createCampaignDescription,
      },
      export: {
        estimated: skipSet.has("export") ? 0 : 1 * prices.instantly,
        description: `1 export × ${formatBRL(prices.instantly)}`,
      },
      activate: {
        estimated: 0,
        description: "Gratuito",
      },
    };

    const total = Object.values(stepCosts).reduce(
      (sum, step) => sum + step.estimated,
      0
    );

    return {
      steps: stepCosts,
      total,
      currency: "BRL",
      premiumIcebreakers: { perLead: prices.apify, total: premiumTotal },
    };
  }
}
