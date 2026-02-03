/**
 * Knowledge Base Context Service Tests
 * Story 6.3: Knowledge Base Integration for Context
 *
 * Tests for buildAIVariables and getDefaultAIVariables functions.
 * AC: #1 - Knowledge Base Context in AI Prompts
 * AC: #5 - Graceful Degradation
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

      it("should compile tone context correctly (AC #3)", () => {
        const result = buildAIVariables(fullKBContext);

        expect(result.tone_description).toBe("Tom Formal. Profissional mas acessível");
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

      it("should handle tone with only preset (no custom description)", () => {
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

        expect(result.tone_description).toBe("Tom Técnico");
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
});
