/**
 * Unit Tests for PlanGeneratorService
 * Story 16.5 - AC: #1
 */

import { describe, it, expect } from "vitest";
import {
  PlanGeneratorService,
  PIPELINE_STEPS,
} from "@/lib/services/agent-plan-generator";
import type { CostEstimate, ParsedBriefing } from "@/types/agent";

// ==============================================
// HELPERS
// ==============================================

function createBriefing(overrides?: Partial<ParsedBriefing>): ParsedBriefing {
  return {
    technology: "Netskope",
    jobTitles: ["CTO", "Head de TI"],
    location: "Sao Paulo",
    companySize: null,
    industry: null,
    productSlug: null,
    mode: "guided",
    skipSteps: [],
    ...overrides,
  };
}

function createCostEstimate(overrides?: Partial<CostEstimate>): CostEstimate {
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
    ...overrides,
  };
}

// ==============================================
// TESTS
// ==============================================

describe("PlanGeneratorService", () => {
  describe("generatePlan", () => {
    it("gera 5 steps na ordem correta", () => {
      const steps = PlanGeneratorService.generatePlan(
        createBriefing(),
        createCostEstimate()
      );

      expect(steps).toHaveLength(5);
      expect(steps[0].stepNumber).toBe(1);
      expect(steps[0].stepType).toBe("search_companies");
      expect(steps[1].stepNumber).toBe(2);
      expect(steps[1].stepType).toBe("search_leads");
      expect(steps[2].stepNumber).toBe(3);
      expect(steps[2].stepType).toBe("create_campaign");
      expect(steps[3].stepNumber).toBe(4);
      expect(steps[3].stepType).toBe("export");
      expect(steps[4].stepNumber).toBe(5);
      expect(steps[4].stepType).toBe("activate");
    });

    it("interpola briefing na descricao dos steps", () => {
      const briefing = createBriefing({
        technology: "AWS",
        jobTitles: ["CTO", "CISO"],
      });

      const steps = PlanGeneratorService.generatePlan(
        briefing,
        createCostEstimate()
      );

      expect(steps[0].description).toContain("AWS");
      expect(steps[1].description).toContain("CTO");
      expect(steps[1].description).toContain("CISO");
    });

    it("usa descricao generica quando technology e null", () => {
      const briefing = createBriefing({ technology: null });

      const steps = PlanGeneratorService.generatePlan(
        briefing,
        createCostEstimate()
      );

      expect(steps[0].description).toBe("Buscar empresas via TheirStack");
    });

    it("usa descricao generica quando jobTitles esta vazio", () => {
      const briefing = createBriefing({ jobTitles: [] });

      const steps = PlanGeneratorService.generatePlan(
        briefing,
        createCostEstimate()
      );

      expect(steps[1].description).toBe(
        "Encontrar contatos nas empresas via Apollo"
      );
    });

    it("marca steps skipped corretamente", () => {
      const briefing = createBriefing({
        skipSteps: ["search_companies", "export"],
      });

      const steps = PlanGeneratorService.generatePlan(
        briefing,
        createCostEstimate()
      );

      expect(steps[0].skipped).toBe(true);
      expect(steps[1].skipped).toBe(false);
      expect(steps[2].skipped).toBe(false);
      expect(steps[3].skipped).toBe(true);
      expect(steps[4].skipped).toBe(false);
    });

    it("steps skipped tem custo 0 e descricao 'Pulado'", () => {
      const briefing = createBriefing({
        skipSteps: ["search_companies"],
      });

      const steps = PlanGeneratorService.generatePlan(
        briefing,
        createCostEstimate()
      );

      expect(steps[0].estimatedCost).toBe(0);
      expect(steps[0].costDescription).toBe("Pulado");
    });

    it("associa custos do costEstimate corretamente", () => {
      const steps = PlanGeneratorService.generatePlan(
        createBriefing(),
        createCostEstimate()
      );

      expect(steps[0].estimatedCost).toBeCloseTo(0.10);
      expect(steps[1].estimatedCost).toBeCloseTo(3.00);
      expect(steps[2].estimatedCost).toBeCloseTo(4.20);
      expect(steps[3].estimatedCost).toBeCloseTo(0.00);
      expect(steps[4].estimatedCost).toBeCloseTo(0.00);
    });

    it("cada step tem titulo definido", () => {
      const steps = PlanGeneratorService.generatePlan(
        createBriefing(),
        createCostEstimate()
      );

      for (const step of steps) {
        expect(step.title).toBeTruthy();
      }
    });

    it("PIPELINE_STEPS contem 5 step types", () => {
      expect(PIPELINE_STEPS).toHaveLength(5);
    });

    // Story 17.10: descricao adaptada para search_leads quando skip empresas
    it("gera descricao adaptada para search_leads quando skipSteps inclui search_companies (AC: 17.10#2)", () => {
      const briefing = createBriefing({
        technology: null,
        jobTitles: ["CTO", "Head de TI"],
        industry: "fintech",
        location: "Sao Paulo",
        skipSteps: ["search_companies"],
      });

      const steps = PlanGeneratorService.generatePlan(
        briefing,
        createCostEstimate()
      );

      expect(steps[1].description).toBe(
        "Buscar leads diretamente por CTO, Head de TI + fintech + Sao Paulo (sem filtro de empresa)"
      );
    });

    it("gera descricao adaptada com apenas cargos quando skip sem industry/location (AC: 17.10#2)", () => {
      const briefing = createBriefing({
        technology: null,
        jobTitles: ["CISO"],
        industry: null,
        location: null,
        skipSteps: ["search_companies"],
      });

      const steps = PlanGeneratorService.generatePlan(
        briefing,
        createCostEstimate()
      );

      expect(steps[1].description).toBe(
        "Buscar leads diretamente por CISO (sem filtro de empresa)"
      );
    });

    it("usa descricao fallback 'cargos' quando skip sem jobTitles (AC: 17.10#2)", () => {
      const briefing = createBriefing({
        technology: null,
        jobTitles: [],
        location: null,
        industry: null,
        skipSteps: ["search_companies"],
      });

      const steps = PlanGeneratorService.generatePlan(
        briefing,
        createCostEstimate()
      );

      expect(steps[1].description).toBe(
        "Buscar leads diretamente por cargos (sem filtro de empresa)"
      );
    });

    it("usa descricao normal para search_leads quando NAO tem skip (regressao)", () => {
      const briefing = createBriefing({
        technology: "AWS",
        jobTitles: ["CTO"],
        skipSteps: [],
      });

      const steps = PlanGeneratorService.generatePlan(
        briefing,
        createCostEstimate()
      );

      expect(steps[1].description).toBe("Encontrar CTO nas empresas via Apollo");
    });

    // Story 17.11: imported leads flow descriptions
    it("usa descricao 'Etapa pulada' para search_companies quando skipSteps inclui search_companies (CR fix)", () => {
      const briefing = createBriefing({
        skipSteps: ["search_companies", "search_leads"],
        technology: null,
        jobTitles: [],
      });

      const steps = PlanGeneratorService.generatePlan(
        briefing,
        createCostEstimate()
      );

      expect(steps[0].description).toBe("Etapa pulada — busca de empresas nao necessaria");
    });

    it("usa descricao 'Etapa pulada' para search_leads quando skipSteps inclui search_leads (AC: 17.11#4)", () => {
      const briefing = createBriefing({
        skipSteps: ["search_companies", "search_leads"],
        jobTitles: [],
        technology: null,
      });

      const steps = PlanGeneratorService.generatePlan(
        briefing,
        createCostEstimate()
      );

      expect(steps[1].description).toBe("Etapa pulada — leads fornecidos pelo usuario");
    });

    it("usa descricao com quantidade de leads importados para create_campaign (AC: 17.11#4)", () => {
      const briefing = createBriefing({
        skipSteps: ["search_companies", "search_leads"],
        technology: null,
        jobTitles: [],
        importedLeads: [
          { name: "Joao", title: "CTO", companyName: "Acme", email: "joao@acme.com", linkedinUrl: null, apolloId: null },
          { name: "Maria", title: null, companyName: null, email: "maria@beta.com", linkedinUrl: null, apolloId: null },
        ],
      });

      const steps = PlanGeneratorService.generatePlan(
        briefing,
        createCostEstimate()
      );

      expect(steps[2].description).toBe(
        "Criar campanha com emails personalizados para 2 leads importados"
      );
    });

    it("usa descricao default para create_campaign sem importedLeads (regressao)", () => {
      const briefing = createBriefing({
        skipSteps: [],
      });

      const steps = PlanGeneratorService.generatePlan(
        briefing,
        createCostEstimate()
      );

      expect(steps[2].description).toBe("Gerar emails personalizados com IA usando Knowledge Base");
    });
  });
});
