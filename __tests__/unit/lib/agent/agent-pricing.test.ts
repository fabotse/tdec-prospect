/**
 * Unit Tests for agent-pricing (SSOT de preco e volume)
 * Story 24.10 - Custo real e estimativa honesta
 */

import { describe, it, expect } from "vitest";
import {
  AGENT_DEFAULT_COSTS,
  AGENT_PIPELINE_VOLUMES,
  THEIRSTACK_CREDITS_PER_COMPANY,
  computeActualCost,
  estimateAICallsForCampaign,
  formatBRL,
  formatCostLine,
  resolveUnitPrices,
  type StepCostRow,
} from "@/lib/agent/agent-pricing";
import { MAX_REWRITES } from "@/lib/ai/copy-review-config";

const DEFAULT_PRICES = resolveUnitPrices(null);

describe("agent-pricing", () => {
  describe("volumes", () => {
    it("espelha o pipeline real: 2 empresas, 25 leads por busca, 3 e-mails", () => {
      expect(AGENT_PIPELINE_VOLUMES.companies).toBe(2);
      expect(AGENT_PIPELINE_VOLUMES.leadsPerSearch).toBe(25);
      expect(AGENT_PIPELINE_VOLUMES.defaultEmails).toBe(3);
      expect(THEIRSTACK_CREDITS_PER_COMPANY).toBe(3);
    });
  });

  describe("resolveUnitPrices", () => {
    it("usa os defaults sem cost_models", () => {
      expect(DEFAULT_PRICES).toEqual({
        theirstack: 0.1,
        apollo: 0.05,
        apify: 0.15,
        openai: 0.02,
        instantly: 0,
      });
    });

    it("le Map e objeto, com fallback por servico", () => {
      const fromMap = resolveUnitPrices(new Map([["apollo", 0.2]]));
      expect(fromMap.apollo).toBe(0.2);
      expect(fromMap.openai).toBe(AGENT_DEFAULT_COSTS.openai.unitPrice);

      const fromObject = resolveUnitPrices({ openai: 0.03 });
      expect(fromObject.openai).toBe(0.03);
      expect(fromObject.theirstack).toBe(0.1);
    });

    it("ignora valor invalido ou negativo", () => {
      const prices = resolveUnitPrices({ apollo: -1, openai: Number.NaN });
      expect(prices.apollo).toBe(0.05);
      expect(prices.openai).toBe(0.02);
    });
  });

  describe("estimateAICallsForCampaign", () => {
    it("1 estrutura + 2×e-mails + leads + e-mails × (1 + 2×MAX_REWRITES)", () => {
      expect(MAX_REWRITES).toBe(2);
      // matriz do plano: 1 + 6 + 25 + 15 = 47
      expect(estimateAICallsForCampaign(25, 3)).toBe(47);
      expect(estimateAICallsForCampaign(4, 3)).toBe(1 + 6 + 4 + 15);
    });
  });

  describe("computeActualCost", () => {
    const steps: StepCostRow[] = [
      { step_type: "search_companies", status: "approved", cost: { theirstack_search: 6 } },
      { step_type: "search_leads", status: "approved", cost: { apollo_search: 25 } },
      {
        step_type: "create_campaign",
        status: "approved",
        cost: {
          apollo_enrich: 10,
          openai_structure: 1,
          openai_emails: 3,
          openai_icebreakers: 10,
          openai_calls: 17,
          openai_review: 4,
          apify: 2,
        },
      },
      { step_type: "export", status: "awaiting_approval", cost: { instantly_create: 1, instantly_leads: 10 } },
      { step_type: "activate", status: "completed", cost: { instantly_activate: 1 } },
    ];

    it("calcula o custo por step a partir de agent_steps.cost", () => {
      const result = computeActualCost(steps, DEFAULT_PRICES);

      expect(result.currency).toBe("BRL");
      expect(result.steps.search_companies).toBeCloseTo(0.6);
      expect(result.steps.search_leads).toBe(0);
      // 10 × 0,05 + 17 × 0,02 + 4 × 0,02 + 2 × 0,15
      expect(result.steps.create_campaign).toBeCloseTo(0.5 + 0.34 + 0.08 + 0.3);
      expect(result.steps.export).toBe(0);
      expect(result.steps.activate).toBe(0);
      expect(result.total).toBeCloseTo(0.6 + 1.22);
    });

    it("sem openai_calls usa estrutura + 2 × e-mails + icebreakers (execucoes antigas)", () => {
      const legacy: StepCostRow[] = [
        {
          step_type: "create_campaign",
          status: "approved",
          cost: { apollo_enrich: 0, openai_structure: 1, openai_emails: 3, openai_icebreakers: 10 },
        },
      ];
      const result = computeActualCost(legacy, DEFAULT_PRICES);
      // (1 + 6 + 10) × 0,02
      expect(result.steps.create_campaign).toBeCloseTo(0.34);
    });

    it("ignora steps failed/skipped/pending/running", () => {
      const result = computeActualCost(
        [
          { step_type: "search_companies", status: "failed", cost: { theirstack_search: 6 } },
          { step_type: "search_leads", status: "skipped", cost: null },
          { step_type: "create_campaign", status: "running", cost: { apollo_enrich: 5 } },
          { step_type: "export", status: "pending", cost: null },
        ],
        DEFAULT_PRICES
      );
      expect(result.steps).toEqual({});
      expect(result.total).toBe(0);
    });

    it("chave ausente vale 0 e o instantly usa o preco do tenant", () => {
      const prices = { ...DEFAULT_PRICES, instantly: 0.5 };
      const result = computeActualCost(
        [
          { step_type: "export", status: "approved", cost: { instantly_create: 1 } },
          { step_type: "create_campaign", status: "approved", cost: {} },
        ],
        prices
      );
      expect(result.steps.export).toBe(0.5);
      expect(result.steps.create_campaign).toBe(0);
    });

    it("recalcula do zero: chamar duas vezes da o mesmo total (retry nao duplica)", () => {
      const first = computeActualCost(steps, DEFAULT_PRICES);
      const second = computeActualCost(steps, DEFAULT_PRICES);
      expect(second).toEqual(first);
    });
  });

  describe("formatBRL / formatCostLine", () => {
    it("formata em R$", () => {
      expect(formatBRL(2.79)).toMatch(/R\$\s2,79/);
    });

    it("conclusao: estimado e real", () => {
      const line = formatCostLine("completed", 2.79, 1.5);
      expect(line).toMatch(/^Custo da execução — estimado R\$\s2,79 · real R\$\s1,50$/);
    });

    it("pausa: 'Custo até aqui'", () => {
      expect(formatCostLine("paused", 2.79, 0.6)).toMatch(
        /^Custo até aqui — estimado R\$\s2,79 · real R\$\s0,60$/
      );
    });

    it("cancelamento: 'Custo até o cancelamento'", () => {
      expect(formatCostLine("cancelled", 2.79, 0.6)).toMatch(
        /^Custo até o cancelamento — estimado R\$\s2,79 · real R\$\s0,60$/
      );
    });

    it("sem estimativa mostra so o real", () => {
      expect(formatCostLine("completed", null, 1)).toMatch(/^Custo da execução — real R\$\s1,00$/);
    });
  });
});
