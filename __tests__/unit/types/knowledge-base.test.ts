import { describe, it, expect } from "vitest";
import {
  KNOWLEDGE_BASE_SECTIONS,
  SECTION_LABELS,
  isValidSection,
  companyProfileSchema,
  toneOfVoiceSchema,
  emailExampleSchema,
  uuidSchema,
  TONE_PRESETS,
  TONE_PRESET_LABELS,
  COMPANY_SIZES,
  COMPANY_SIZE_LABELS,
  icpDefinitionSchema,
  type KnowledgeBaseSection,
  type TonePreset,
  type CompanySize,
} from "@/types/knowledge-base";

describe("knowledge-base types", () => {
  // ==============================================
  // UUID SCHEMA (Story 2.5 - Security Enhancement)
  // ==============================================

  describe("uuidSchema", () => {
    it("should accept valid UUID v4", () => {
      const validUUIDs = [
        "550e8400-e29b-41d4-a716-446655440000",
        "123e4567-e89b-12d3-a456-426614174000",
        "00000000-0000-0000-0000-000000000000",
      ];

      validUUIDs.forEach((uuid) => {
        const result = uuidSchema.safeParse(uuid);
        expect(result.success).toBe(true);
      });
    });

    it("should reject invalid UUID formats", () => {
      const invalidUUIDs = [
        "1",
        "not-a-uuid",
        "123",
        "550e8400-e29b-41d4-a716",
        "550e8400e29b41d4a716446655440000",
        "",
      ];

      invalidUUIDs.forEach((uuid) => {
        const result = uuidSchema.safeParse(uuid);
        expect(result.success).toBe(false);
      });
    });

    it("should provide Portuguese error message", () => {
      const result = uuidSchema.safeParse("invalid");
      expect(result.success).toBe(false);

      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe("ID inválido");
      }
    });
  });

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

  // ==============================================
  // TONE OF VOICE TYPES (Story 2.5)
  // ==============================================

  describe("TONE_PRESETS", () => {
    it("should contain all supported presets", () => {
      expect(TONE_PRESETS).toContain("formal");
      expect(TONE_PRESETS).toContain("casual");
      expect(TONE_PRESETS).toContain("technical");
    });

    it("should have exactly 3 presets", () => {
      expect(TONE_PRESETS).toHaveLength(3);
    });
  });

  describe("TONE_PRESET_LABELS", () => {
    it("should have labels for all presets", () => {
      expect(TONE_PRESET_LABELS.formal).toBe("Formal");
      expect(TONE_PRESET_LABELS.casual).toBe("Casual");
      expect(TONE_PRESET_LABELS.technical).toBe("Técnico");
    });

    it("should have a label for every preset", () => {
      TONE_PRESETS.forEach((preset) => {
        expect(TONE_PRESET_LABELS[preset]).toBeDefined();
        expect(typeof TONE_PRESET_LABELS[preset]).toBe("string");
      });
    });
  });

  describe("toneOfVoiceSchema", () => {
    it("should validate a complete tone of voice", () => {
      const validTone = {
        preset: "formal",
        custom_description: "Professional and courteous",
        writing_guidelines: "Use formal language",
      };

      const result = toneOfVoiceSchema.safeParse(validTone);
      expect(result.success).toBe(true);
    });

    it("should validate all preset options", () => {
      const presets: TonePreset[] = ["formal", "casual", "technical"];

      presets.forEach((preset) => {
        const tone = {
          preset,
          custom_description: "",
          writing_guidelines: "",
        };

        const result = toneOfVoiceSchema.safeParse(tone);
        expect(result.success).toBe(true);
      });
    });

    it("should reject invalid preset values", () => {
      const invalidTone = {
        preset: "invalid",
        custom_description: "",
        writing_guidelines: "",
      };

      const result = toneOfVoiceSchema.safeParse(invalidTone);
      expect(result.success).toBe(false);
    });

    it("should allow empty custom_description and writing_guidelines", () => {
      const minimalTone = {
        preset: "formal",
        custom_description: "",
        writing_guidelines: "",
      };

      const result = toneOfVoiceSchema.safeParse(minimalTone);
      expect(result.success).toBe(true);
    });

    it("should reject custom_description longer than 2000 characters", () => {
      const longDescTone = {
        preset: "formal",
        custom_description: "a".repeat(2001),
        writing_guidelines: "",
      };

      const result = toneOfVoiceSchema.safeParse(longDescTone);
      expect(result.success).toBe(false);
    });

    it("should reject writing_guidelines longer than 5000 characters", () => {
      const longGuidelinesTone = {
        preset: "formal",
        custom_description: "",
        writing_guidelines: "a".repeat(5001),
      };

      const result = toneOfVoiceSchema.safeParse(longGuidelinesTone);
      expect(result.success).toBe(false);
    });
  });

  // ==============================================
  // EMAIL EXAMPLES TYPES (Story 2.5)
  // ==============================================

  describe("emailExampleSchema", () => {
    it("should validate a complete email example", () => {
      const validExample = {
        subject: "Introduction Email",
        body: "Hello, I am reaching out...",
        context: "First contact after meeting",
      };

      const result = emailExampleSchema.safeParse(validExample);
      expect(result.success).toBe(true);
    });

    it("should require subject", () => {
      const noSubject = {
        subject: "",
        body: "Body content",
      };

      const result = emailExampleSchema.safeParse(noSubject);
      expect(result.success).toBe(false);

      if (!result.success) {
        const error = result.error.issues[0];
        expect(error?.message).toContain("obrigatório");
      }
    });

    it("should require body", () => {
      const noBody = {
        subject: "Subject",
        body: "",
      };

      const result = emailExampleSchema.safeParse(noBody);
      expect(result.success).toBe(false);

      if (!result.success) {
        const error = result.error.issues[0];
        expect(error?.message).toContain("obrigatório");
      }
    });

    it("should allow optional context", () => {
      const noContext = {
        subject: "Subject",
        body: "Body content",
      };

      const result = emailExampleSchema.safeParse(noContext);
      expect(result.success).toBe(true);
    });

    it("should allow empty context", () => {
      const emptyContext = {
        subject: "Subject",
        body: "Body content",
        context: "",
      };

      const result = emailExampleSchema.safeParse(emptyContext);
      expect(result.success).toBe(true);
    });

    it("should reject subject longer than 200 characters", () => {
      const longSubject = {
        subject: "a".repeat(201),
        body: "Body",
      };

      const result = emailExampleSchema.safeParse(longSubject);
      expect(result.success).toBe(false);
    });

    it("should reject body longer than 10000 characters", () => {
      const longBody = {
        subject: "Subject",
        body: "a".repeat(10001),
      };

      const result = emailExampleSchema.safeParse(longBody);
      expect(result.success).toBe(false);
    });

    it("should reject context longer than 1000 characters", () => {
      const longContext = {
        subject: "Subject",
        body: "Body",
        context: "a".repeat(1001),
      };

      const result = emailExampleSchema.safeParse(longContext);
      expect(result.success).toBe(false);
    });
  });

  // ==============================================
  // ICP DEFINITION TYPES (Story 2.6)
  // ==============================================

  describe("COMPANY_SIZES", () => {
    it("should contain all supported size ranges", () => {
      expect(COMPANY_SIZES).toContain("1-10");
      expect(COMPANY_SIZES).toContain("11-50");
      expect(COMPANY_SIZES).toContain("51-200");
      expect(COMPANY_SIZES).toContain("201-500");
      expect(COMPANY_SIZES).toContain("501-1000");
      expect(COMPANY_SIZES).toContain("1000+");
    });

    it("should have exactly 6 size ranges", () => {
      expect(COMPANY_SIZES).toHaveLength(6);
    });
  });

  describe("COMPANY_SIZE_LABELS", () => {
    it("should have labels for all sizes", () => {
      expect(COMPANY_SIZE_LABELS["1-10"]).toBe("1-10 funcionários");
      expect(COMPANY_SIZE_LABELS["11-50"]).toBe("11-50 funcionários");
      expect(COMPANY_SIZE_LABELS["51-200"]).toBe("51-200 funcionários");
      expect(COMPANY_SIZE_LABELS["201-500"]).toBe("201-500 funcionários");
      expect(COMPANY_SIZE_LABELS["501-1000"]).toBe("501-1000 funcionários");
      expect(COMPANY_SIZE_LABELS["1000+"]).toBe("1000+ funcionários");
    });

    it("should have a label for every size", () => {
      COMPANY_SIZES.forEach((size) => {
        expect(COMPANY_SIZE_LABELS[size]).toBeDefined();
        expect(typeof COMPANY_SIZE_LABELS[size]).toBe("string");
      });
    });
  });

  describe("icpDefinitionSchema", () => {
    it("should validate a complete ICP definition", () => {
      const validICP = {
        company_sizes: ["11-50", "51-200"],
        industries: ["Tecnologia", "SaaS"],
        job_titles: ["CEO", "CTO"],
        geographic_focus: ["São Paulo", "Brasil"],
        pain_points: "Dores do cliente",
        common_objections: "Objeções comuns",
      };

      const result = icpDefinitionSchema.safeParse(validICP);
      expect(result.success).toBe(true);
    });

    it("should validate all company size options", () => {
      const sizes: CompanySize[] = ["1-10", "11-50", "51-200", "201-500", "501-1000", "1000+"];

      sizes.forEach((size) => {
        const icp = {
          company_sizes: [size],
          industries: [],
          job_titles: [],
          geographic_focus: [],
          pain_points: "",
          common_objections: "",
        };

        const result = icpDefinitionSchema.safeParse(icp);
        expect(result.success).toBe(true);
      });
    });

    it("should require at least one company size", () => {
      const noSizes = {
        company_sizes: [],
        industries: [],
        job_titles: [],
        geographic_focus: [],
        pain_points: "",
        common_objections: "",
      };

      const result = icpDefinitionSchema.safeParse(noSizes);
      expect(result.success).toBe(false);

      if (!result.success) {
        const error = result.error.issues[0];
        expect(error?.message).toContain("ao menos um tamanho");
      }
    });

    it("should reject invalid company size values", () => {
      const invalidSize = {
        company_sizes: ["invalid-size"],
        industries: [],
        job_titles: [],
        geographic_focus: [],
        pain_points: "",
        common_objections: "",
      };

      const result = icpDefinitionSchema.safeParse(invalidSize);
      expect(result.success).toBe(false);
    });

    it("should allow empty arrays for industries, job_titles, and geographic_focus", () => {
      const minimalICP = {
        company_sizes: ["11-50"],
        industries: [],
        job_titles: [],
        geographic_focus: [],
        pain_points: "",
        common_objections: "",
      };

      const result = icpDefinitionSchema.safeParse(minimalICP);
      expect(result.success).toBe(true);
    });

    it("should accept valid industries array", () => {
      const icp = {
        company_sizes: ["11-50"],
        industries: ["Tecnologia", "SaaS", "Fintech"],
        job_titles: [],
        geographic_focus: [],
        pain_points: "",
        common_objections: "",
      };

      const result = icpDefinitionSchema.safeParse(icp);
      expect(result.success).toBe(true);
    });

    it("should accept valid job_titles array", () => {
      const icp = {
        company_sizes: ["11-50"],
        industries: [],
        job_titles: ["CEO", "CTO", "VP de Vendas"],
        geographic_focus: [],
        pain_points: "",
        common_objections: "",
      };

      const result = icpDefinitionSchema.safeParse(icp);
      expect(result.success).toBe(true);
    });

    it("should accept valid geographic_focus array", () => {
      const icp = {
        company_sizes: ["11-50"],
        industries: [],
        job_titles: [],
        geographic_focus: ["São Paulo", "Brasil", "América Latina"],
        pain_points: "",
        common_objections: "",
      };

      const result = icpDefinitionSchema.safeParse(icp);
      expect(result.success).toBe(true);
    });

    it("should reject pain_points longer than 5000 characters", () => {
      const longPainPoints = {
        company_sizes: ["11-50"],
        industries: [],
        job_titles: [],
        geographic_focus: [],
        pain_points: "a".repeat(5001),
        common_objections: "",
      };

      const result = icpDefinitionSchema.safeParse(longPainPoints);
      expect(result.success).toBe(false);
    });

    it("should reject common_objections longer than 5000 characters", () => {
      const longObjections = {
        company_sizes: ["11-50"],
        industries: [],
        job_titles: [],
        geographic_focus: [],
        pain_points: "",
        common_objections: "a".repeat(5001),
      };

      const result = icpDefinitionSchema.safeParse(longObjections);
      expect(result.success).toBe(false);
    });

    it("should reject individual industry string longer than 100 characters", () => {
      const longIndustry = {
        company_sizes: ["11-50"],
        industries: ["a".repeat(101)],
        job_titles: [],
        geographic_focus: [],
        pain_points: "",
        common_objections: "",
      };

      const result = icpDefinitionSchema.safeParse(longIndustry);
      expect(result.success).toBe(false);
    });

    it("should reject empty string in industries array", () => {
      const emptyIndustry = {
        company_sizes: ["11-50"],
        industries: [""],
        job_titles: [],
        geographic_focus: [],
        pain_points: "",
        common_objections: "",
      };

      const result = icpDefinitionSchema.safeParse(emptyIndustry);
      expect(result.success).toBe(false);
    });
  });
});
