import { describe, it, expect } from "vitest";
import {
  KNOWLEDGE_BASE_SECTIONS,
  SECTION_LABELS,
  isValidSection,
  companyProfileSchema,
  type KnowledgeBaseSection,
} from "@/types/knowledge-base";

describe("knowledge-base types", () => {
  describe("KNOWLEDGE_BASE_SECTIONS", () => {
    it("should contain all supported sections", () => {
      expect(KNOWLEDGE_BASE_SECTIONS).toContain("company");
      expect(KNOWLEDGE_BASE_SECTIONS).toContain("tone");
      expect(KNOWLEDGE_BASE_SECTIONS).toContain("examples");
      expect(KNOWLEDGE_BASE_SECTIONS).toContain("icp");
    });

    it("should have exactly 4 sections", () => {
      expect(KNOWLEDGE_BASE_SECTIONS).toHaveLength(4);
    });
  });

  describe("SECTION_LABELS", () => {
    it("should have labels for all sections", () => {
      expect(SECTION_LABELS.company).toBe("Empresa");
      expect(SECTION_LABELS.tone).toBe("Tom de Voz");
      expect(SECTION_LABELS.examples).toBe("Exemplos");
      expect(SECTION_LABELS.icp).toBe("ICP");
    });

    it("should have a label for every section", () => {
      KNOWLEDGE_BASE_SECTIONS.forEach((section) => {
        expect(SECTION_LABELS[section]).toBeDefined();
        expect(typeof SECTION_LABELS[section]).toBe("string");
      });
    });
  });

  describe("isValidSection", () => {
    it("should return true for valid sections", () => {
      expect(isValidSection("company")).toBe(true);
      expect(isValidSection("tone")).toBe(true);
      expect(isValidSection("examples")).toBe(true);
      expect(isValidSection("icp")).toBe(true);
    });

    it("should return false for invalid sections", () => {
      expect(isValidSection("invalid")).toBe(false);
      expect(isValidSection("")).toBe(false);
      expect(isValidSection("Company")).toBe(false); // case sensitive
      expect(isValidSection("COMPANY")).toBe(false);
    });

    it("should work as type guard", () => {
      const testValue: string = "company";

      if (isValidSection(testValue)) {
        // TypeScript should narrow this to KnowledgeBaseSection
        const section: KnowledgeBaseSection = testValue;
        expect(section).toBe("company");
      }
    });
  });

  describe("companyProfileSchema", () => {
    it("should validate a complete company profile", () => {
      const validProfile = {
        company_name: "Test Company",
        business_description: "We do great things",
        products_services: "Product A, Product B",
        competitive_advantages: "We are the best",
      };

      const result = companyProfileSchema.safeParse(validProfile);
      expect(result.success).toBe(true);
    });

    it("should require company_name", () => {
      const invalidProfile = {
        company_name: "",
        business_description: "Description",
        products_services: "Products",
        competitive_advantages: "Advantages",
      };

      const result = companyProfileSchema.safeParse(invalidProfile);
      expect(result.success).toBe(false);
    });

    it("should allow description fields to be empty strings", () => {
      const minimalProfile = {
        company_name: "Test Company",
        business_description: "",
        products_services: "",
        competitive_advantages: "",
      };

      const result = companyProfileSchema.safeParse(minimalProfile);
      expect(result.success).toBe(true);
    });

    it("should reject company_name longer than 255 characters", () => {
      const longNameProfile = {
        company_name: "a".repeat(256),
        business_description: "",
        products_services: "",
        competitive_advantages: "",
      };

      const result = companyProfileSchema.safeParse(longNameProfile);
      expect(result.success).toBe(false);
    });

    it("should reject text fields longer than 5000 characters", () => {
      const longDescProfile = {
        company_name: "Test Company",
        business_description: "a".repeat(5001),
        products_services: "",
        competitive_advantages: "",
      };

      const result = companyProfileSchema.safeParse(longDescProfile);
      expect(result.success).toBe(false);
    });

    it("should provide Portuguese error messages", () => {
      const invalidProfile = {
        company_name: "",
        business_description: "",
        products_services: "",
        competitive_advantages: "",
      };

      const result = companyProfileSchema.safeParse(invalidProfile);
      expect(result.success).toBe(false);

      if (!result.success) {
        const error = result.error.issues[0];
        expect(error?.message).toContain("obrigatório");
      }
    });
  });
});
