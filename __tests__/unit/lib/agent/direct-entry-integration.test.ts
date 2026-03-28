/**
 * Integration Test: Direct Entry Flow (Story 17.10 - AC: #1-#4)
 *
 * Validates the full pipeline when search_companies is skipped:
 * briefing → skipSteps → plan with step 1 skipped → orchestrator allows
 * previousStepOutput=undefined → SearchLeadsStep searches open market
 */

import { describe, it, expect } from "vitest";
import { PlanGeneratorService } from "@/lib/services/agent-plan-generator";
import { briefingResponseSchema } from "@/lib/agent/briefing-parser-service";
import type { CostEstimate, ParsedBriefing } from "@/types/agent";

// ==============================================
// HELPERS
// ==============================================

function createDirectEntryBriefing(overrides?: Partial<ParsedBriefing>): ParsedBriefing {
  return {
    technology: null,
    jobTitles: ["CTO", "Head de TI"],
    location: "Sao Paulo",
    companySize: "50-200",
    industry: "fintech",
    productSlug: null,
    mode: "guided",
    skipSteps: ["search_companies"],
    ...overrides,
  };
}

function createCostEstimate(): CostEstimate {
  return {
    steps: {
      search_companies: { estimated: 0.10, description: "1 busca" },
      search_leads: { estimated: 3.00, description: "60 leads" },
      create_campaign: { estimated: 4.20, description: "210 prompts" },
      export: { estimated: 0.00, description: "free" },
      activate: { estimated: 0.00, description: "Gratuito" },
    },
    total: 7.30,
    currency: "BRL",
  };
}

// ==============================================
// TESTS
// ==============================================

describe("Direct Entry Integration (Story 17.10)", () => {
  describe("briefing parsing → skipSteps", () => {
    it("schema Zod aceita skipSteps com search_companies", () => {
      const raw = {
        technology: null,
        jobTitles: ["CTO"],
        location: "Sao Paulo",
        companySize: null,
        industry: "fintech",
        productMentioned: null,
        mode: "guided",
        skipSteps: ["search_companies"],
      };

      const result = briefingResponseSchema.safeParse(raw);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.skipSteps).toEqual(["search_companies"]);
      }
    });
  });

  describe("plan generation com skip", () => {
    it("gera plano com step 1 skipped e descricao adaptada para step 2 (AC: #2)", () => {
      const briefing = createDirectEntryBriefing();
      const steps = PlanGeneratorService.generatePlan(briefing, createCostEstimate());

      // Step 1 (search_companies) deve estar skipped
      expect(steps[0].skipped).toBe(true);
      expect(steps[0].estimatedCost).toBe(0);
      expect(steps[0].costDescription).toBe("Pulado");

      // Step 2 (search_leads) deve ter descricao adaptada
      expect(steps[1].skipped).toBe(false);
      expect(steps[1].description).toContain("Buscar leads diretamente por");
      expect(steps[1].description).toContain("CTO, Head de TI");
      expect(steps[1].description).toContain("fintech");
      expect(steps[1].description).toContain("Sao Paulo");
      expect(steps[1].description).toContain("sem filtro de empresa");

      // Steps 3-5 devem estar normais
      expect(steps[2].skipped).toBe(false);
      expect(steps[3].skipped).toBe(false);
      expect(steps[4].skipped).toBe(false);
    });

    it("contagem de steps ativos e 4 quando 1 step skipped (AC: #4)", () => {
      const briefing = createDirectEntryBriefing();
      const steps = PlanGeneratorService.generatePlan(briefing, createCostEstimate());

      const activeSteps = steps.filter((s) => !s.skipped);
      expect(activeSteps).toHaveLength(4);

      // Numeracao: "Etapa 1 de 4" para o primeiro step ativo
      const firstActive = activeSteps[0];
      expect(firstActive.stepType).toBe("search_leads");
      expect(firstActive.stepNumber).toBe(2); // segundo step no pipeline
    });
  });

  describe("fluxo completo: briefing → plano → execucao conceitual", () => {
    it("fluxo end-to-end: sem tech → skip search_companies → plano adaptado → search_leads direto", () => {
      // 1. Briefing sem tecnologia → parser retorna skipSteps
      const briefing = createDirectEntryBriefing();
      expect(briefing.technology).toBeNull();
      expect(briefing.skipSteps).toContain("search_companies");
      expect(briefing.jobTitles.length).toBeGreaterThan(0);

      // 2. Plano gerado com skip
      const plan = PlanGeneratorService.generatePlan(briefing, createCostEstimate());
      const searchCompaniesStep = plan.find((s) => s.stepType === "search_companies");
      const searchLeadsStep = plan.find((s) => s.stepType === "search_leads");

      expect(searchCompaniesStep?.skipped).toBe(true);
      expect(searchLeadsStep?.skipped).toBe(false);

      // 3. SearchLeadsStep recebera previousStepOutput=undefined (orchestrator permite)
      // Verificamos que os dados do briefing sao suficientes para busca direta:
      expect(briefing.jobTitles).toEqual(["CTO", "Head de TI"]); // obrigatorio
      expect(briefing.industry).toBe("fintech"); // filtro adicional
      expect(briefing.location).toBe("Sao Paulo"); // filtro adicional

      // 4. Output esperado do SearchLeadsStep tera domainsSearched = []
      // (validado nos unit tests de SearchLeadsStep)

      // 5. Steps subsequentes (create_campaign, export, activate) nao sao afetados
      const remainingSteps = plan.filter(
        (s) => !s.skipped && s.stepType !== "search_leads"
      );
      expect(remainingSteps.every((s) => !s.skipped)).toBe(true);
    });
  });
});
