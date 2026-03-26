/**
 * CostEstimatorService
 * Story: 16.5 - Plano de Execucao & Estimativa de Custo
 *
 * AC: #2 - Calcula estimativa de custo por etapa e total
 * AC: #3 - Usa precos unitarios da tabela cost_models (lazy seed)
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CostEstimate, CostModel, ParsedBriefing } from "@/types/agent";

// ==============================================
// CONSTANTS
// ==============================================

export const DEFAULT_COSTS: Record<string, { unitPrice: number; unitDescription: string }> = {
  theirstack: { unitPrice: 0.10, unitDescription: "por busca" },
  apollo: { unitPrice: 0.05, unitDescription: "por lead" },
  apify: { unitPrice: 0.15, unitDescription: "por perfil LinkedIn" },
  openai: { unitPrice: 0.02, unitDescription: "por prompt medio" },
  instantly: { unitPrice: 0.00, unitDescription: "por export (free tier)" },
};

export const DEFAULT_VOLUMES = {
  ESTIMATED_COMPANIES: 30,
  ESTIMATED_LEADS_PER_COMPANY: 2,
  ESTIMATED_EMAILS_PER_LEAD: 3,
  ESTIMATED_ICEBREAKER_RATIO: 0.5,
} as const;

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
   * Calculate cost per step and total based on cost models and briefing.
   * AC: #2
   */
  static estimateCosts(
    costModels: Map<string, number>,
    briefing: ParsedBriefing
  ): CostEstimate {
    const theirstack = costModels.get("theirstack") ?? DEFAULT_COSTS.theirstack.unitPrice;
    const apollo = costModels.get("apollo") ?? DEFAULT_COSTS.apollo.unitPrice;
    const openai = costModels.get("openai") ?? DEFAULT_COSTS.openai.unitPrice;
    const instantly = costModels.get("instantly") ?? DEFAULT_COSTS.instantly.unitPrice;

    const skipSet = new Set(briefing.skipSteps ?? []);

    const totalLeads = DEFAULT_VOLUMES.ESTIMATED_COMPANIES * DEFAULT_VOLUMES.ESTIMATED_LEADS_PER_COMPANY;

    const stepCosts: Record<string, { estimated: number; description: string }> = {
      search_companies: {
        estimated: skipSet.has("search_companies") ? 0 : 1 * theirstack,
        description: `1 busca × ${CostEstimatorService.formatBRL(theirstack)}`,
      },
      search_leads: {
        estimated: skipSet.has("search_leads") ? 0 : totalLeads * apollo,
        description: `${totalLeads} leads × ${CostEstimatorService.formatBRL(apollo)}`,
      },
      create_campaign: {
        estimated: skipSet.has("create_campaign")
          ? 0
          : (totalLeads * DEFAULT_VOLUMES.ESTIMATED_EMAILS_PER_LEAD * openai) +
            (totalLeads * DEFAULT_VOLUMES.ESTIMATED_ICEBREAKER_RATIO * openai),
        description: `${totalLeads * DEFAULT_VOLUMES.ESTIMATED_EMAILS_PER_LEAD + totalLeads * DEFAULT_VOLUMES.ESTIMATED_ICEBREAKER_RATIO} prompts × ${CostEstimatorService.formatBRL(openai)}`,
      },
      export: {
        estimated: skipSet.has("export") ? 0 : 1 * instantly,
        description: `1 export × ${CostEstimatorService.formatBRL(instantly)}`,
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
    };
  }

  private static formatBRL(value: number): string {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  }
}
