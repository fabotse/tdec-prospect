/**
 * Knowledge Base Context Service Tests - Product Context
 * Story 6.5: Campaign Product Context
 *
 * AC: #3 - AI Uses Product Context
 * AC: #4 - General Context Fallback
 */

import { describe, it, expect } from "vitest";
import {
  buildAIVariables,
  type KnowledgeBaseContext,
} from "@/lib/services/knowledge-base-context";
import type { Product } from "@/types/product";

describe("buildAIVariables with Product Context", () => {
  const mockKB: KnowledgeBaseContext = {
    company: {
      company_name: "ACME Corp",
      business_description: "Enterprise software company",
      products_services: "Generic company products",
      competitive_advantages: "Market leader",
    },
    tone: {
      preset: "formal",
      custom_description: "Formal and technical",
      writing_guidelines: "Clear and concise",
    },
    icp: {
      company_sizes: ["51-200", "201-500"],
      industries: ["Technology", "Finance"],
      job_titles: ["CTO", "VP Engineering"],
      geographic_focus: ["North America", "Europe"],
      pain_points: "Scalability issues",
      common_objections: "Budget constraints",
    },
    examples: [],
  };

  const mockProduct: Product = {
    id: "product-1",
    tenantId: "tenant-1",
    name: "Enterprise Suite",
    description: "Complete enterprise solution for large organizations",
    features: "Real-time analytics, Custom dashboards, API access",
    differentials: "99.9% uptime SLA, 24/7 support, SOC2 certified",
    targetAudience: "CTOs and IT Directors at Fortune 500 companies",
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  };

  describe("AC #3: AI Uses Product Context", () => {
    it("includes product context when product is provided", () => {
      const result = buildAIVariables(mockKB, mockProduct);

      expect(result.product_name).toBe("Enterprise Suite");
      expect(result.product_description).toBe(
        "Complete enterprise solution for large organizations"
      );
      expect(result.product_features).toBe(
        "Real-time analytics, Custom dashboards, API access"
      );
      expect(result.product_differentials).toBe(
        "99.9% uptime SLA, 24/7 support, SOC2 certified"
      );
      expect(result.product_target_audience).toBe(
        "CTOs and IT Directors at Fortune 500 companies"
      );
    });

    it("replaces products_services with product-specific info", () => {
      const result = buildAIVariables(mockKB, mockProduct);

      expect(result.products_services).toBe(
        "Enterprise Suite: Complete enterprise solution for large organizations"
      );
      // Should not contain generic company products
      expect(result.products_services).not.toBe("Generic company products");
    });

    it("maintains other KB context (company, tone, ICP)", () => {
      const result = buildAIVariables(mockKB, mockProduct);

      // Company context preserved
      expect(result.company_context).toContain("ACME Corp");
      expect(result.competitive_advantages).toBe("Market leader");

      // Tone context preserved
      expect(result.tone_description).toContain("Formal");
      expect(result.writing_guidelines).toBe("Clear and concise");

      // ICP context preserved
      expect(result.target_industries).toBe("Technology, Finance");
      expect(result.target_titles).toBe("CTO, VP Engineering");
      expect(result.pain_points).toBe("Scalability issues");
    });

    it("handles product with null optional fields", () => {
      const minimalProduct: Product = {
        id: "product-2",
        tenantId: "tenant-1",
        name: "Basic Plan",
        description: "Simple starter solution",
        features: null,
        differentials: null,
        targetAudience: null,
        createdAt: "2026-01-01",
        updatedAt: "2026-01-01",
      };

      const result = buildAIVariables(mockKB, minimalProduct);

      expect(result.product_name).toBe("Basic Plan");
      expect(result.product_description).toBe("Simple starter solution");
      expect(result.product_features).toBe("");
      expect(result.product_differentials).toBe("");
      expect(result.product_target_audience).toBe("");
    });
  });

  describe("AC #4: General Context Fallback", () => {
    it("uses company products_services when no product provided", () => {
      const result = buildAIVariables(mockKB);

      expect(result.products_services).toBe("Generic company products");
    });

    it("returns empty product fields when no product", () => {
      const result = buildAIVariables(mockKB);

      expect(result.product_name).toBe("");
      expect(result.product_description).toBe("");
      expect(result.product_features).toBe("");
      expect(result.product_differentials).toBe("");
      expect(result.product_target_audience).toBe("");
    });

    it("uses company products_services when product is null", () => {
      const result = buildAIVariables(mockKB, null);

      expect(result.products_services).toBe("Generic company products");
    });

    it("uses company products_services when product is undefined", () => {
      const result = buildAIVariables(mockKB, undefined);

      expect(result.products_services).toBe("Generic company products");
    });
  });

  describe("Edge Cases", () => {
    it("handles null KB with product", () => {
      const result = buildAIVariables(null, mockProduct);

      // Product context should still be included
      expect(result.product_name).toBe("Enterprise Suite");
      expect(result.products_services).toContain("Enterprise Suite");

      // Should use default company context
      expect(result.company_context).toContain("tecnologia");
    });

    it("handles null KB and null product (graceful degradation)", () => {
      const result = buildAIVariables(null, null);

      // Should return default values
      expect(result.company_context).toBeTruthy();
      expect(result.tone_description).toBeTruthy();
      expect(result.product_name).toBe("");
      expect(result.product_description).toBe("");
    });
  });
});
