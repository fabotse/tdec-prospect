/**
 * Knowledge Base Context Service Tests
 * Story 6.3: Knowledge Base Integration for Context
 * Story 6.9: Tone of Voice Application
 * Story 6.10: Use of Successful Examples
 *
 * Tests for buildAIVariables and getDefaultAIVariables functions.
 * AC 6.3: #1 - Knowledge Base Context in AI Prompts
 * AC 6.3: #5 - Graceful Degradation
 * AC 6.9: #1-#3 - Tone preset vocabulary hints
 * AC 6.9: #4 - Custom guidelines application
 * AC 6.9: #7 - Graceful degradation (default to casual)
 * AC 6.10: #1 - Examples included in AI prompts
 * AC 6.10: #5 - Examples combined with product context
 * AC 6.10: #6 - Graceful degradation (no examples)
 */

import { describe, it, expect } from "vitest";
import {
  buildAIVariables,
  getDefaultAIVariables,
  type KnowledgeBaseContext,
  DEFAULT_COMPANY_CONTEXT,
  DEFAULT_TONE_DESCRIPTION,
  DEFAULT_TONE_STYLE,
} from "@/lib/services/knowledge-base-context";
import type {
  CompanyProfile,
  ToneOfVoice,
  ICPDefinition,
  EmailExample,
} from "@/types/knowledge-base";

// ==============================================
// TEST DATA
// ==============================================

const mockCompanyProfile: CompanyProfile = {
  company_name: "ACME Corp",
  business_description: "Empresa de tecnologia especializada em soluções B2B",
  products_services: "CRM, ERP, Analytics",
  competitive_advantages: "Integração simples, suporte 24/7",
};

const mockToneOfVoice: ToneOfVoice = {
  preset: "formal",
  custom_description: "Profissional mas acessível",
  writing_guidelines: "Evite gírias, use termos técnicos quando necessário",
};

const mockICP: ICPDefinition = {
  company_sizes: ["51-200", "201-500"],
  industries: ["Tecnologia", "Financeiro", "Saúde"],
  job_titles: ["CEO", "CTO", "Diretor de TI"],
  geographic_focus: ["São Paulo", "Rio de Janeiro"],
  pain_points: "Dificuldade em integrar sistemas legados",
  common_objections: "Preço e tempo de implementação",
};

const mockEmailExamples: EmailExample[] = [
  {
    id: "1",
    tenant_id: "tenant-1",
    subject: "Exemplo de assunto 1",
    body: "Corpo do email exemplo 1",
    context: "Follow-up",
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
  },
  {
    id: "2",
    tenant_id: "tenant-1",
    subject: "Exemplo de assunto 2",
    body: "Corpo do email exemplo 2",
    context: null,
    created_at: "2026-01-02",
    updated_at: "2026-01-02",
  },
];

const fullKBContext: KnowledgeBaseContext = {
  company: mockCompanyProfile,
  tone: mockToneOfVoice,
  icp: mockICP,
  examples: mockEmailExamples,
};

// ==============================================
// TESTS
// ==============================================

describe("knowledge-base-context service", () => {
  describe("buildAIVariables", () => {
    describe("with complete KB data (AC #1)", () => {
      it("should compile company context correctly", () => {
        const result = buildAIVariables(fullKBContext);

        expect(result.company_context).toBe(
          "ACME Corp - Empresa de tecnologia especializada em soluções B2B"
        );
        expect(result.products_services).toBe("CRM, ERP, Analytics");
        expect(result.competitive_advantages).toBe(
          "Integração simples, suporte 24/7"
        );
      });

      it("should compile tone context correctly with vocabulary hints (AC #3, Story 6.9)", () => {
        const result = buildAIVariables(fullKBContext);

        // Story 6.9: Format is "Tom [Label]. [Vocabulary Hint]. [Custom Description]"
        expect(result.tone_description).toBe(
          "Tom Formal. Linguagem corporativa e respeitosa, mantenha distância profissional. Profissional mas acessível"
        );
        expect(result.tone_style).toBe("formal");
        expect(result.writing_guidelines).toBe(
          "Evite gírias, use termos técnicos quando necessário"
        );
      });

      it("should compile ICP summary correctly", () => {
        const result = buildAIVariables(fullKBContext);

        expect(result.icp_summary).toContain("Foco em Tecnologia");
        expect(result.icp_summary).toContain("Cargos: CEO, CTO, Diretor de TI");
        expect(result.target_industries).toBe("Tecnologia, Financeiro, Saúde");
        expect(result.target_titles).toBe("CEO, CTO, Diretor de TI");
        expect(result.pain_points).toBe("Dificuldade em integrar sistemas legados");
      });

      it("should format email examples correctly (AC #4)", () => {
        const result = buildAIVariables(fullKBContext);

        expect(result.successful_examples).toContain("Exemplo 1:");
        expect(result.successful_examples).toContain("Assunto: Exemplo de assunto 1");
        expect(result.successful_examples).toContain("Corpo: Corpo do email exemplo 1");
        expect(result.successful_examples).toContain("Contexto: Follow-up");
        expect(result.successful_examples).toContain("Exemplo 2:");
      });

      it("should include lead placeholders for Story 6.4", () => {
        const result = buildAIVariables(fullKBContext);

        expect(result.lead_name).toBe("Nome");
        expect(result.lead_title).toBe("Cargo");
        expect(result.lead_company).toBe("Empresa");
        expect(result.lead_industry).toBe("Tecnologia");
        expect(result.lead_location).toBe("Brasil");
      });

      it("should include email context defaults", () => {
        const result = buildAIVariables(fullKBContext);

        expect(result.email_objective).toBe(
          "Prospecção inicial para apresentar soluções"
        );
        expect(result.icebreaker).toBe("");
      });
    });

    describe("with partial KB data", () => {
      it("should handle missing company profile", () => {
        const context: KnowledgeBaseContext = {
          company: null,
          tone: mockToneOfVoice,
          icp: mockICP,
          examples: [],
        };

        const result = buildAIVariables(context);

        expect(result.company_context).toBe(DEFAULT_COMPANY_CONTEXT);
        expect(result.products_services).toBe("");
        expect(result.competitive_advantages).toBe("");
      });

      it("should handle missing tone settings", () => {
        const context: KnowledgeBaseContext = {
          company: mockCompanyProfile,
          tone: null,
          icp: mockICP,
          examples: [],
        };

        const result = buildAIVariables(context);

        expect(result.tone_description).toBe(DEFAULT_TONE_DESCRIPTION);
        expect(result.tone_style).toBe(DEFAULT_TONE_STYLE);
        expect(result.writing_guidelines).toBe("");
      });

      it("should handle missing ICP definition", () => {
        const context: KnowledgeBaseContext = {
          company: mockCompanyProfile,
          tone: mockToneOfVoice,
          icp: null,
          examples: [],
        };

        const result = buildAIVariables(context);

        expect(result.icp_summary).toBe("");
        expect(result.target_industries).toBe("");
        expect(result.target_titles).toBe("");
        expect(result.pain_points).toBe("");
      });

      it("should handle empty examples array", () => {
        const context: KnowledgeBaseContext = {
          company: mockCompanyProfile,
          tone: mockToneOfVoice,
          icp: mockICP,
          examples: [],
        };

        const result = buildAIVariables(context);

        expect(result.successful_examples).toBe("");
      });

      it("should limit examples to MAX_EXAMPLES_IN_PROMPT (3)", () => {
        const manyExamples: EmailExample[] = [
          ...mockEmailExamples,
          {
            id: "3",
            tenant_id: "tenant-1",
            subject: "Subject 3",
            body: "Body 3",
            context: null,
            created_at: "2026-01-03",
            updated_at: "2026-01-03",
          },
          {
            id: "4",
            tenant_id: "tenant-1",
            subject: "Subject 4",
            body: "Body 4",
            context: null,
            created_at: "2026-01-04",
            updated_at: "2026-01-04",
          },
        ];

        const context: KnowledgeBaseContext = {
          company: null,
          tone: null,
          icp: null,
          examples: manyExamples,
        };

        const result = buildAIVariables(context);

        // Should only have 3 examples (not 4)
        expect(result.successful_examples).toContain("Exemplo 1:");
        expect(result.successful_examples).toContain("Exemplo 2:");
        expect(result.successful_examples).toContain("Exemplo 3:");
        expect(result.successful_examples).not.toContain("Exemplo 4:");
      });
    });

    describe("with null context (AC #5 - Graceful Degradation)", () => {
      it("should return defaults when context is null", () => {
        const result = buildAIVariables(null);

        expect(result.company_context).toBe(DEFAULT_COMPANY_CONTEXT);
        expect(result.tone_description).toBe(DEFAULT_TONE_DESCRIPTION);
        expect(result.tone_style).toBe(DEFAULT_TONE_STYLE);
        expect(result.icp_summary).toBe("");
        expect(result.successful_examples).toBe("");
      });

      it("should still include lead and email placeholders", () => {
        const result = buildAIVariables(null);

        expect(result.lead_name).toBe("Nome");
        expect(result.email_objective).toBe(
          "Prospecção inicial para apresentar soluções"
        );
      });
    });

    describe("edge cases", () => {
      it("should handle company with only name (no description)", () => {
        const context: KnowledgeBaseContext = {
          company: {
            company_name: "Simple Corp",
            business_description: "",
            products_services: "",
            competitive_advantages: "",
          },
          tone: null,
          icp: null,
          examples: [],
        };

        const result = buildAIVariables(context);

        expect(result.company_context).toBe("Simple Corp");
      });

      it("should handle tone with only preset (no custom description) - Story 6.9", () => {
        const context: KnowledgeBaseContext = {
          company: null,
          tone: {
            preset: "technical",
            custom_description: "",
            writing_guidelines: "",
          },
          icp: null,
          examples: [],
        };

        const result = buildAIVariables(context);

        // Story 6.9: Includes vocabulary hint even without custom description
        expect(result.tone_description).toBe(
          "Tom Técnico. Linguagem técnica e precisa, use terminologia do setor"
        );
        expect(result.tone_style).toBe("technical");
      });

      it("should handle ICP with empty arrays", () => {
        const context: KnowledgeBaseContext = {
          company: null,
          tone: null,
          icp: {
            company_sizes: [],
            industries: [],
            job_titles: [],
            geographic_focus: [],
            pain_points: "",
            common_objections: "",
          },
          examples: [],
        };

        const result = buildAIVariables(context);

        expect(result.icp_summary).toBe("");
        expect(result.target_industries).toBe("");
        expect(result.target_titles).toBe("");
      });
    });
  });

  describe("getDefaultAIVariables", () => {
    it("should return same result as buildAIVariables(null)", () => {
      const fromDefault = getDefaultAIVariables();
      const fromNull = buildAIVariables(null);

      expect(fromDefault).toEqual(fromNull);
    });

    it("should return default company context", () => {
      const result = getDefaultAIVariables();

      expect(result.company_context).toBe(DEFAULT_COMPANY_CONTEXT);
    });

    it("should return default tone settings", () => {
      const result = getDefaultAIVariables();

      expect(result.tone_description).toBe(DEFAULT_TONE_DESCRIPTION);
      expect(result.tone_style).toBe(DEFAULT_TONE_STYLE);
    });
  });

  // ==============================================
  // STORY 6.10: USE OF SUCCESSFUL EXAMPLES
  // ==============================================

  describe("Story 6.10 - Examples in AI Variables", () => {
    describe("formatEmailExamples output format (Task 2.1)", () => {
      it("should format examples with subject, body, and context", () => {
        const context: KnowledgeBaseContext = {
          company: null,
          tone: null,
          icp: null,
          examples: [
            {
              id: "1",
              tenant_id: "t1",
              subject: "Test Subject",
              body: "Test Body Content",
              context: "Initial Outreach",
              created_at: "2026-01-01",
              updated_at: "2026-01-01",
            },
          ],
        };

        const result = buildAIVariables(context);

        expect(result.successful_examples).toContain("Exemplo 1:");
        expect(result.successful_examples).toContain("Assunto: Test Subject");
        expect(result.successful_examples).toContain("Corpo: Test Body Content");
        expect(result.successful_examples).toContain("Contexto: Initial Outreach");
      });

      it("should omit context line when context is null", () => {
        const context: KnowledgeBaseContext = {
          company: null,
          tone: null,
          icp: null,
          examples: [
            {
              id: "1",
              tenant_id: "t1",
              subject: "Subject Without Context",
              body: "Body Content",
              context: null,
              created_at: "2026-01-01",
              updated_at: "2026-01-01",
            },
          ],
        };

        const result = buildAIVariables(context);

        expect(result.successful_examples).toContain("Assunto: Subject Without Context");
        expect(result.successful_examples).toContain("Corpo: Body Content");
        expect(result.successful_examples).not.toContain("Contexto:");
      });
    });

    describe("MAX_EXAMPLES_IN_PROMPT limit (Task 2.2)", () => {
      it("should limit to exactly 3 examples when more are provided", () => {
        const fiveExamples: EmailExample[] = Array.from({ length: 5 }, (_, i) => ({
          id: `${i + 1}`,
          tenant_id: "t1",
          subject: `Subject ${i + 1}`,
          body: `Body ${i + 1}`,
          context: null,
          created_at: `2026-01-0${i + 1}`,
          updated_at: `2026-01-0${i + 1}`,
        }));

        const context: KnowledgeBaseContext = {
          company: null,
          tone: null,
          icp: null,
          examples: fiveExamples,
        };

        const result = buildAIVariables(context);

        // Should have exactly 3 examples
        expect(result.successful_examples).toContain("Exemplo 1:");
        expect(result.successful_examples).toContain("Exemplo 2:");
        expect(result.successful_examples).toContain("Exemplo 3:");
        expect(result.successful_examples).not.toContain("Exemplo 4:");
        expect(result.successful_examples).not.toContain("Exemplo 5:");
      });
    });

    describe("empty examples handling (Task 2.3, Task 2.6)", () => {
      it("should return empty string when examples array is empty", () => {
        const context: KnowledgeBaseContext = {
          company: null,
          tone: null,
          icp: null,
          examples: [],
        };

        const result = buildAIVariables(context);

        expect(result.successful_examples).toBe("");
      });

      it("should return empty successful_examples when KB is null", () => {
        const result = buildAIVariables(null);

        expect(result.successful_examples).toBe("");
      });
    });

    describe("examples with product context combined (Task 2.5, AC #5)", () => {
      it("should include both examples and product context correctly", () => {
        const contextWithExamples: KnowledgeBaseContext = {
          company: {
            company_name: "Tech Corp",
            business_description: "Software company",
            products_services: "General services",
            competitive_advantages: "Fast delivery",
          },
          tone: { preset: "casual", custom_description: "", writing_guidelines: "" },
          icp: null,
          examples: [
            {
              id: "1",
              tenant_id: "t1",
              subject: "Cool email subject",
              body: "Hey, just checking in about your needs...",
              context: "Follow-up",
              created_at: "2026-01-01",
              updated_at: "2026-01-01",
            },
          ],
        };

        const mockProduct = {
          id: "prod-1",
          tenantId: "t1",
          name: "Super Analytics",
          description: "Real-time analytics platform",
          features: "Dashboard, Reports",
          differentials: "AI-powered insights",
          targetAudience: "Marketing teams",
          createdAt: "2026-01-01",
          updatedAt: "2026-01-01",
        };

        const result = buildAIVariables(contextWithExamples, mockProduct);

        // Examples should be present
        expect(result.successful_examples).toContain("Exemplo 1:");
        expect(result.successful_examples).toContain("Hey, just checking in");
        expect(result.successful_examples).toContain("Follow-up");

        // Product context should be present
        expect(result.product_name).toBe("Super Analytics");
        expect(result.product_description).toBe("Real-time analytics platform");
        expect(result.product_features).toBe("Dashboard, Reports");
        expect(result.product_differentials).toBe("AI-powered insights");
        expect(result.product_target_audience).toBe("Marketing teams");

        // products_services should use product info
        expect(result.products_services).toContain("Super Analytics");

        // Company context should still be present
        expect(result.company_context).toContain("Tech Corp");

        // Tone should be preserved
        expect(result.tone_style).toBe("casual");
      });

      it("should handle examples + product when KB company is null", () => {
        const contextWithOnlyExamples: KnowledgeBaseContext = {
          company: null,
          tone: null,
          icp: null,
          examples: [
            {
              id: "1",
              tenant_id: "t1",
              subject: "Example subject",
              body: "Example body",
              context: null,
              created_at: "2026-01-01",
              updated_at: "2026-01-01",
            },
          ],
        };

        const product = {
          id: "p1",
          tenantId: "t1",
          name: "Product X",
          description: "Description X",
          features: null,
          differentials: null,
          targetAudience: null,
          createdAt: "2026-01-01",
          updatedAt: "2026-01-01",
        };

        const result = buildAIVariables(contextWithOnlyExamples, product);

        // Both should work together
        expect(result.successful_examples).toContain("Example subject");
        expect(result.product_name).toBe("Product X");
      });
    });
  });

  // ==============================================
  // STORY 6.9: TONE OF VOICE APPLICATION
  // ==============================================

  describe("Story 6.9 - Tone Variable Compilation", () => {
    describe("tone_style outputs correct preset value (Task 3.1)", () => {
      it("should output 'formal' when preset is formal", () => {
        const context: KnowledgeBaseContext = {
          company: null,
          tone: { preset: "formal", custom_description: "", writing_guidelines: "" },
          icp: null,
          examples: [],
        };
        const result = buildAIVariables(context);
        expect(result.tone_style).toBe("formal");
      });

      it("should output 'casual' when preset is casual", () => {
        const context: KnowledgeBaseContext = {
          company: null,
          tone: { preset: "casual", custom_description: "", writing_guidelines: "" },
          icp: null,
          examples: [],
        };
        const result = buildAIVariables(context);
        expect(result.tone_style).toBe("casual");
      });

      it("should output 'technical' when preset is technical", () => {
        const context: KnowledgeBaseContext = {
          company: null,
          tone: { preset: "technical", custom_description: "", writing_guidelines: "" },
          icp: null,
          examples: [],
        };
        const result = buildAIVariables(context);
        expect(result.tone_style).toBe("technical");
      });
    });

    describe("tone_description includes preset label and vocabulary hint (Task 3.2)", () => {
      it("should include 'Tom Formal' and formal vocabulary hint", () => {
        const context: KnowledgeBaseContext = {
          company: null,
          tone: { preset: "formal", custom_description: "", writing_guidelines: "" },
          icp: null,
          examples: [],
        };
        const result = buildAIVariables(context);
        expect(result.tone_description).toContain("Tom Formal");
        expect(result.tone_description).toContain("corporativa");
      });

      it("should include 'Tom Casual' and casual vocabulary hint", () => {
        const context: KnowledgeBaseContext = {
          company: null,
          tone: { preset: "casual", custom_description: "", writing_guidelines: "" },
          icp: null,
          examples: [],
        };
        const result = buildAIVariables(context);
        expect(result.tone_description).toContain("Tom Casual");
        expect(result.tone_description).toContain("amigável");
      });

      it("should include 'Tom Técnico' and technical vocabulary hint", () => {
        const context: KnowledgeBaseContext = {
          company: null,
          tone: { preset: "technical", custom_description: "", writing_guidelines: "" },
          icp: null,
          examples: [],
        };
        const result = buildAIVariables(context);
        expect(result.tone_description).toContain("Tom Técnico");
        expect(result.tone_description).toContain("técnica");
      });

      it("should concatenate custom_description after vocabulary hint (AC #4)", () => {
        const context: KnowledgeBaseContext = {
          company: null,
          tone: {
            preset: "casual",
            custom_description: "Mas sem gírias",
            writing_guidelines: "",
          },
          icp: null,
          examples: [],
        };
        const result = buildAIVariables(context);
        expect(result.tone_description).toBe(
          "Tom Casual. Linguagem amigável e próxima, evite formalidades. Mas sem gírias"
        );
      });
    });

    describe("writing_guidelines passed correctly (Task 3.3)", () => {
      it("should pass writing_guidelines when present", () => {
        const context: KnowledgeBaseContext = {
          company: null,
          tone: {
            preset: "formal",
            custom_description: "",
            writing_guidelines: "Use bullet points para listas",
          },
          icp: null,
          examples: [],
        };
        const result = buildAIVariables(context);
        expect(result.writing_guidelines).toBe("Use bullet points para listas");
      });

      it("should return empty string when writing_guidelines is empty", () => {
        const context: KnowledgeBaseContext = {
          company: null,
          tone: { preset: "formal", custom_description: "", writing_guidelines: "" },
          icp: null,
          examples: [],
        };
        const result = buildAIVariables(context);
        expect(result.writing_guidelines).toBe("");
      });
    });

    describe("default tone when KB not configured (Task 3.4, AC #7)", () => {
      it("should default to 'casual' when tone is null", () => {
        const context: KnowledgeBaseContext = {
          company: null,
          tone: null,
          icp: null,
          examples: [],
        };
        const result = buildAIVariables(context);
        expect(result.tone_style).toBe("casual");
      });

      it("should default to 'casual' when context is null", () => {
        const result = buildAIVariables(null);
        expect(result.tone_style).toBe("casual");
      });

      it("should use DEFAULT_TONE_DESCRIPTION when tone is null", () => {
        const result = buildAIVariables(null);
        expect(result.tone_description).toBe(DEFAULT_TONE_DESCRIPTION);
      });
    });

    describe("tone variables with and without product context (Task 3.5)", () => {
      it("should maintain tone variables when product is provided", () => {
        const context: KnowledgeBaseContext = {
          company: null,
          tone: {
            preset: "technical",
            custom_description: "Para engenheiros",
            writing_guidelines: "Use métricas",
          },
          icp: null,
          examples: [],
        };
        const mockProduct = {
          id: "prod-1",
          tenantId: "tenant-1",
          name: "Analytics Pro",
          description: "Plataforma de analytics",
          features: "Dashboards",
          differentials: "IA integrada",
          targetAudience: "CTOs",
          createdAt: "2026-01-01",
          updatedAt: "2026-01-01",
        };

        const result = buildAIVariables(context, mockProduct);

        // Tone variables should be independent of product
        expect(result.tone_style).toBe("technical");
        expect(result.tone_description).toContain("Tom Técnico");
        expect(result.tone_description).toContain("Para engenheiros");
        expect(result.writing_guidelines).toBe("Use métricas");

        // Product variables should also be set
        expect(result.product_name).toBe("Analytics Pro");
      });

      it("should maintain tone variables when product is null", () => {
        const context: KnowledgeBaseContext = {
          company: null,
          tone: {
            preset: "formal",
            custom_description: "Executivo",
            writing_guidelines: "Seja conciso",
          },
          icp: null,
          examples: [],
        };

        const result = buildAIVariables(context, null);

        expect(result.tone_style).toBe("formal");
        expect(result.tone_description).toContain("Tom Formal");
        expect(result.tone_description).toContain("Executivo");
        expect(result.writing_guidelines).toBe("Seja conciso");

        // Product variables should be empty
        expect(result.product_name).toBe("");
      });
    });
  });
});
