/**
 * Unit Tests for CostEstimatorService
 * Story 16.5 - AC: #2, #3
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  CostEstimatorService,
  DEFAULT_COSTS,
} from "@/lib/services/agent-cost-estimator";
import type { ParsedBriefing } from "@/types/agent";
import { estimateAICallsForCampaign } from "@/lib/agent/agent-pricing";
import { createChainBuilder } from "../../../helpers/mock-supabase";

// ==============================================
// HELPERS
// ==============================================

function createBriefing(overrides?: Partial<ParsedBriefing>): ParsedBriefing {
  return {
    technology: "Netskope",
    jobTitles: ["CTO"],
    location: "Sao Paulo",
    companySize: null,
    industry: null,
    productSlug: null,
    mode: "guided",
    skipSteps: [],
    ...overrides,
  };
}

function createMockSupabase(fromImpl: ReturnType<typeof vi.fn>) {
  return { from: fromImpl } as unknown as Parameters<typeof CostEstimatorService.getCostModels>[0];
}

// ==============================================
// TESTS
// ==============================================

describe("CostEstimatorService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getCostModels", () => {
    it("retorna map vazio quando query falha", async () => {
      const chain = createChainBuilder({ data: null, error: { message: "DB error" } });
      const mockFrom = vi.fn().mockReturnValue(chain);
      const supabase = createMockSupabase(mockFrom);

      const result = await CostEstimatorService.getCostModels(supabase);
      expect(result.size).toBe(0);
    });

    it("retorna map de service_name → unit_price do DB", async () => {
      const chain = createChainBuilder({
        data: [
          { service_name: "theirstack", unit_price: 0.20 },
          { service_name: "apollo", unit_price: 0.10 },
        ],
        error: null,
      });
      const mockFrom = vi.fn().mockReturnValue(chain);
      const supabase = createMockSupabase(mockFrom);

      const result = await CostEstimatorService.getCostModels(supabase);
      expect(result.size).toBe(2);
      expect(result.get("theirstack")).toBe(0.20);
      expect(result.get("apollo")).toBe(0.10);
    });
  });

  describe("ensureCostModels", () => {
    it("retorna cost models existentes quando DB nao esta vazio", async () => {
      const chain = createChainBuilder({
        data: [
          { service_name: "theirstack", unit_price: 0.10 },
          { service_name: "apollo", unit_price: 0.05 },
        ],
        error: null,
      });
      const mockFrom = vi.fn().mockReturnValue(chain);
      const supabase = createMockSupabase(mockFrom);

      const result = await CostEstimatorService.ensureCostModels(supabase, "tenant-1");
      expect(result.size).toBe(2);
      // insert should NOT be called
      expect(chain.insert).not.toHaveBeenCalled();
    });

    it("insere defaults quando DB esta vazio (lazy seed)", async () => {
      let callCount = 0;
      const emptyChain = createChainBuilder({ data: [], error: null });
      const seededChain = createChainBuilder({
        data: Object.entries(DEFAULT_COSTS).map(([name, info]) => ({
          service_name: name,
          unit_price: info.unitPrice,
        })),
        error: null,
      });

      const mockFrom = vi.fn().mockImplementation(() => {
        callCount++;
        // First call: getCostModels (empty), second: insert, third: re-query
        if (callCount <= 1) return emptyChain;
        if (callCount === 2) return emptyChain; // insert chain
        return seededChain;
      });
      const supabase = createMockSupabase(mockFrom);

      const result = await CostEstimatorService.ensureCostModels(supabase, "tenant-1");
      expect(result.size).toBe(Object.keys(DEFAULT_COSTS).length);
      expect(emptyChain.insert).toHaveBeenCalled();
    });
  });

  // Story 24.10: estimativa honesta — volumes reais do pipeline como teto.
  // Defaults: theirstack 0,10/credito, apollo 0,05/enrichment, openai 0,02/chamada,
  // apify 0,15/perfil, instantly 0. Fluxo com tecnologia: 2 empresas, 25 leads, 3 e-mails.
  // Chamadas de IA = 1 + 2×3 + 25 + 3×(1 + 2×2) = 47.
  describe("estimateCosts", () => {
    it("calcula a matriz do fluxo com tecnologia com defaults", () => {
      const result = CostEstimatorService.estimateCosts(new Map(), createBriefing());

      // search_companies: 2 empresas × 3 creditos × 0,10 = 0,60
      expect(result.steps.search_companies.estimated).toBeCloseTo(0.6);
      // search_leads (Story 24.16): 1 chamada de IA do Fit Score × 0,02
      expect(result.steps.search_leads.estimated).toBeCloseTo(0.02);
      expect(result.steps.search_leads.description).toBe(
        "1 chamada de IA (Fit Score); busca Apollo não consome créditos"
      );
      // create_campaign: 25 × 0,05 + 47 × 0,02 = 1,25 + 0,94 = 2,19
      expect(result.steps.create_campaign.estimated).toBeCloseTo(2.19);
      expect(result.steps.export.estimated).toBe(0);
      expect(result.steps.activate.estimated).toBe(0);
      expect(result.total).toBeCloseTo(2.81);
      expect(result.currency).toBe("BRL");
    });

    it("usa cost models do DB quando disponiveis", () => {
      const costModels = new Map<string, number>([
        ["theirstack", 0.2],
        ["apollo", 0.1],
        ["openai", 0.05],
        ["instantly", 0.0],
      ]);
      const result = CostEstimatorService.estimateCosts(costModels, createBriefing());

      expect(result.steps.search_companies.estimated).toBeCloseTo(2 * 3 * 0.2);
      expect(result.steps.create_campaign.estimated).toBeCloseTo(25 * 0.1 + 47 * 0.05);
      expect(result.steps.search_leads.estimated).toBeCloseTo(0.05);
      expect(result.total).toBeCloseTo(1.2 + 0.05 + 2.5 + 2.35);
    });

    it("respeita skipSteps com custo 0", () => {
      const briefing = createBriefing({ skipSteps: ["search_companies", "export"] });
      const result = CostEstimatorService.estimateCosts(new Map(), briefing);

      expect(result.steps.search_companies.estimated).toBe(0);
      expect(result.steps.export.estimated).toBe(0);
      expect(result.steps.create_campaign.estimated).toBeCloseTo(2.19);
    });

    it("usa leads importados como volume do create_campaign", () => {
      const lead = { name: "A", title: null, companyName: null, email: null, linkedinUrl: null, apolloId: null };
      const briefing = createBriefing({
        skipSteps: ["search_companies", "search_leads"],
        importedLeads: [lead, lead, lead, lead],
      });
      const result = CostEstimatorService.estimateCosts(new Map(), briefing);

      // 4 × 0,05 + (1 + 6 + 4 + 15) × 0,02 = 0,20 + 0,52
      expect(result.steps.create_campaign.estimated).toBeCloseTo(0.72);
      expect(result.steps.search_companies.estimated).toBe(0);
      // Story 24.16: search_leads pulado (leads importados) -> sem Fit Score
      expect(result.steps.search_leads.estimated).toBe(0);
      expect(result.premiumIcebreakers).toEqual({ perLead: 0.15, total: 4 * 0.15 });
    });

    it("retorna descricao para cada step", () => {
      const result = CostEstimatorService.estimateCosts(new Map(), createBriefing());

      for (const key of ["search_companies", "search_leads", "create_campaign", "export", "activate"]) {
        expect(result.steps[key].description).toBeTruthy();
      }
      expect(result.steps.create_campaign.description).toContain("25 enriquecimentos");
      expect(result.steps.create_campaign.description).toContain("47 chamadas de IA");
    });

    it("expoe premiumIcebreakers (leads × apify) mesmo com o toggle desligado", () => {
      const result = CostEstimatorService.estimateCosts(new Map(), createBriefing());

      expect(result.premiumIcebreakers).toEqual({ perLead: 0.15, total: 25 * 0.15 });
      // desligado: nao entra no create_campaign
      expect(result.steps.create_campaign.estimated).toBeCloseTo(2.19);
    });

    it("soma o premium ao create_campaign quando premiumIcebreakers=true", () => {
      const result = CostEstimatorService.estimateCosts(
        new Map(),
        createBriefing({ premiumIcebreakers: true })
      );

      expect(result.steps.create_campaign.estimated).toBeCloseTo(2.19 + 3.75);
      expect(result.steps.create_campaign.description).toContain("icebreakers premium");
    });

    it("premium total = 0 quando create_campaign esta em skipSteps", () => {
      const result = CostEstimatorService.estimateCosts(
        new Map(),
        createBriefing({ premiumIcebreakers: true, skipSteps: ["create_campaign"] })
      );

      expect(result.steps.create_campaign.estimated).toBe(0);
      expect(result.premiumIcebreakers?.total).toBe(0);
    });

    it("Story 24.13: com N = 5 e 3 e-mails, create_campaign e calculado para 5 leads", () => {
      const result = CostEstimatorService.estimateCosts(
        new Map(),
        createBriefing({ leadCount: 5, emailCount: 3, skipSteps: ["search_companies"] })
      );

      const aiCalls = estimateAICallsForCampaign(5, 3);
      expect(result.steps.create_campaign.estimated).toBeCloseTo(5 * 0.05 + aiCalls * 0.02);
      expect(result.steps.create_campaign.description).toContain("até 5 enriquecimentos");
    });

    it("Story 24.13: leads importados vencem o N (4 importados, N = 10)", () => {
      const lead = { name: "A", title: null, companyName: null, email: null, linkedinUrl: null, apolloId: null };
      const result = CostEstimatorService.estimateCosts(
        new Map(),
        createBriefing({
          leadCount: 10,
          importedLeads: [lead, lead, lead, lead],
          skipSteps: ["search_companies", "search_leads"],
        })
      );

      expect(result.steps.create_campaign.description).toContain("até 4 enriquecimentos");
    });

    it("Story 24.13: sem N, a estimativa continua com 25 leads", () => {
      const result = CostEstimatorService.estimateCosts(new Map(), createBriefing());
      expect(result.steps.create_campaign.description).toContain("até 25 enriquecimentos");
    });

    it("escala as chamadas de IA com emailCount (22.5)", () => {
      const result = CostEstimatorService.estimateCosts(
        new Map(),
        createBriefing({ emailCount: 5 })
      );

      // 1 + 10 + 25 + 5 × 5 = 61 chamadas
      expect(result.steps.create_campaign.estimated).toBeCloseTo(25 * 0.05 + 61 * 0.02);
    });
  });
});
