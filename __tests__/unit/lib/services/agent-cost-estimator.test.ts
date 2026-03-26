/**
 * Unit Tests for CostEstimatorService
 * Story 16.5 - AC: #2, #3
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  CostEstimatorService,
  DEFAULT_COSTS,
  DEFAULT_VOLUMES,
} from "@/lib/services/agent-cost-estimator";
import type { ParsedBriefing } from "@/types/agent";
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

  describe("estimateCosts", () => {
    it("calcula custo corretamente com defaults", () => {
      const costModels = new Map<string, number>();
      const briefing = createBriefing();

      const result = CostEstimatorService.estimateCosts(costModels, briefing);

      // search_companies: 1 * 0.10 = 0.10
      expect(result.steps.search_companies.estimated).toBeCloseTo(0.10);
      // search_leads: 30 * 2 * 0.05 = 3.00
      expect(result.steps.search_leads.estimated).toBeCloseTo(3.00);
      // create_campaign: (60 * 3 * 0.02) + (60 * 0.5 * 0.02) = 3.60 + 0.60 = 4.20
      expect(result.steps.create_campaign.estimated).toBeCloseTo(4.20);
      // export: 1 * 0.00 = 0.00
      expect(result.steps.export.estimated).toBeCloseTo(0.00);
      // activate: always 0
      expect(result.steps.activate.estimated).toBe(0);
      // total: 0.10 + 3.00 + 4.20 + 0.00 + 0.00 = 7.30
      expect(result.total).toBeCloseTo(7.30);
      expect(result.currency).toBe("BRL");
    });

    it("usa cost models do DB quando disponiveis", () => {
      const costModels = new Map<string, number>([
        ["theirstack", 0.20],
        ["apollo", 0.10],
        ["openai", 0.05],
        ["instantly", 0.00],
      ]);
      const briefing = createBriefing();

      const result = CostEstimatorService.estimateCosts(costModels, briefing);

      // search_companies: 1 * 0.20 = 0.20
      expect(result.steps.search_companies.estimated).toBeCloseTo(0.20);
      // search_leads: 60 * 0.10 = 6.00
      expect(result.steps.search_leads.estimated).toBeCloseTo(6.00);
      // create_campaign: (60 * 3 * 0.05) + (60 * 0.5 * 0.05) = 9.00 + 1.50 = 10.50
      expect(result.steps.create_campaign.estimated).toBeCloseTo(10.50);
    });

    it("respeita skipSteps com custo 0", () => {
      const costModels = new Map<string, number>();
      const briefing = createBriefing({ skipSteps: ["search_companies", "export"] });

      const result = CostEstimatorService.estimateCosts(costModels, briefing);

      expect(result.steps.search_companies.estimated).toBe(0);
      expect(result.steps.export.estimated).toBe(0);
      // Other steps unaffected
      expect(result.steps.search_leads.estimated).toBeCloseTo(3.00);
      expect(result.total).toBeCloseTo(0 + 3.00 + 4.20 + 0 + 0);
    });

    it("usa defaults quando costModels esta vazio", () => {
      const costModels = new Map<string, number>();
      const briefing = createBriefing();

      const result = CostEstimatorService.estimateCosts(costModels, briefing);

      // Should use DEFAULT_COSTS values
      expect(result.steps.search_companies.estimated).toBeCloseTo(
        1 * DEFAULT_COSTS.theirstack.unitPrice
      );
    });

    it("retorna descricao para cada step", () => {
      const costModels = new Map<string, number>();
      const briefing = createBriefing();

      const result = CostEstimatorService.estimateCosts(costModels, briefing);

      expect(result.steps.search_companies.description).toBeTruthy();
      expect(result.steps.search_leads.description).toBeTruthy();
      expect(result.steps.create_campaign.description).toBeTruthy();
      expect(result.steps.activate.description).toBe("Gratuito");
    });
  });
});
