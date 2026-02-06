/**
 * PromptManager Unit Tests
 * Story: 6.1 - AI Provider Service Layer & Prompt Management System
 * Story: 6.10 - Use of Successful Examples
 * AC: #2 - Prompt fallback logic and caching
 * AC 6.10: #1 - Examples included in AI prompts
 * AC 6.10: #2 - Generated text adopts similar structure
 *
 * Note: Due to complexity of mocking Supabase's chained query builder,
 * these tests focus on code default fallback and caching behavior.
 * Integration tests should cover full DB fallback logic.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PromptManager } from "@/lib/ai/prompt-manager";

// Mock Supabase to always return empty (simulates DB with no prompts)
// Using a chainable mock that supports all query methods
vi.mock("@/lib/supabase/server", () => {
  const createChainableMock = () => {
    const mock: Record<string, unknown> = {};
    const methods = ["select", "eq", "is", "order", "limit"];

    methods.forEach((method) => {
      if (method === "limit") {
        // limit() is terminal and returns the result
        mock[method] = vi.fn(() => Promise.resolve({ data: [], error: null }));
      } else {
        // Other methods return the chainable mock
        mock[method] = vi.fn(() => mock);
      }
    });

    return mock;
  };

  return {
    createClient: vi.fn(() =>
      Promise.resolve({
        from: vi.fn(() => createChainableMock()),
      })
    ),
  };
});

// Mock code defaults - includes conditional block templates for Story 6.3/6.5 tests
// Updated for Story 6.9: Tone variable interpolation tests
// Updated for Story 6.5.3: Icebreaker premium generation
vi.mock("@/lib/ai/prompts/defaults", () => ({
  CODE_DEFAULT_PROMPTS: {
    // Story 6.5.3, updated Story 9.6: Icebreaker premium generation (unified snake_case)
    icebreaker_premium_generation: {
      template:
        "Icebreaker premium for {{lead_name}} ({{lead_title}}) at {{lead_company}} in {{lead_industry}}. Context: {{company_context}}. Posts: {{linkedin_posts}}. Tom: {{tone_style}} - {{tone_description}}.{{#if product_name}} Product: {{product_name}} - {{product_description}}{{/if}}",
      modelPreference: "gpt-4o-mini",
      metadata: { temperature: 0.8, maxTokens: 200 },
    },
    // Story 6.12: Campaign structure generation
    campaign_structure_generation: {
      template: "Campaign structure for {{objective}}",
      modelPreference: "gpt-4o",
      metadata: { temperature: 0.6, maxTokens: 1500 },
    },
    email_subject_generation: {
      // Story 6.9: Includes tone variables for interpolation testing
      template:
        "Subject for {{lead_name}}. Tom: {{tone_style}}. Desc: {{tone_description}}{{#if successful_examples}}\n\nExamples:\n{{successful_examples}}{{/if}}",
      modelPreference: "gpt-4o-mini",
      metadata: { temperature: 0.7 },
    },
    email_body_generation: {
      // Story 6.5: Template with {{else}} for product context fallback
      // Story 6.9: Includes writing_guidelines for tone testing
      template:
        "Email for {{lead_name}}. Tom: {{tone_style}}. Guidelines: {{writing_guidelines}}. {{#if product_name}}Product: {{product_name}} - {{product_description}}{{else}}Services: {{products_services}}{{/if}}",
      modelPreference: "gpt-4o-mini",
      metadata: { temperature: 0.7, maxTokens: 500 },
    },
    icebreaker_generation: {
      // Story 6.9: Includes tone_style for testing
      template: "Icebreaker for {{lead_company}}. Tom: {{tone_style}}",
      modelPreference: "gpt-4o-mini",
      metadata: { temperature: 0.8 },
    },
    tone_application: {
      template: "Default tone prompt: {{original_text}}",
      modelPreference: "gpt-4o-mini",
      metadata: { temperature: 0.5 },
    },
    search_translation: {
      template: "Default search prompt",
      modelPreference: "gpt-4o-mini",
      metadata: { temperature: 0.3 },
    },
    // Story 6.11: Follow-up email generation prompt with previous email context
    follow_up_email_generation: {
      template:
        "Follow-up for {{lead_name}}. Previous subject: {{previous_email_subject}}. Previous body: {{previous_email_body}}. Tom: {{tone_style}}{{#if successful_examples}}\n\nExamples:\n{{successful_examples}}{{/if}}",
      modelPreference: "gpt-4o-mini",
      metadata: { temperature: 0.7, maxTokens: 300 },
    },
    // Story 6.11: Follow-up subject generation prompt with RE: prefix
    follow_up_subject_generation: {
      template:
        "Follow-up subject for {{lead_name}}. Previous subject: {{previous_email_subject}}. Tom: {{tone_style}}. Must start with RE:",
      modelPreference: "gpt-4o-mini",
      metadata: { temperature: 0.6, maxTokens: 80 },
    },
  },
}));

describe("PromptManager", () => {
  let promptManager: PromptManager;

  beforeEach(() => {
    vi.clearAllMocks();
    promptManager = new PromptManager();
  });

  afterEach(() => {
    vi.clearAllMocks();
    promptManager.clearCache();
  });

  describe("getPrompt - code default fallback (Level 3)", () => {
    it("returns code default when DB has no prompts", async () => {
      const result = await promptManager.getPrompt("email_subject_generation", {
        tenantId: "tenant-456",
      });

      expect(result.source).toBe("default");
      expect(result.prompt).not.toBeNull();
      // Updated for Story 6.9: Template includes tone variables
      expect(result.prompt?.promptTemplate).toContain("Subject for {{lead_name}}");
      expect(result.prompt?.promptTemplate).toContain("{{tone_style}}");
    });

    it("returns correct metadata from code default", async () => {
      const result = await promptManager.getPrompt("email_body_generation", {
        tenantId: "tenant-456",
      });

      expect(result.prompt?.metadata).toEqual({
        temperature: 0.7,
        maxTokens: 500,
      });
      expect(result.prompt?.modelPreference).toBe("gpt-4o-mini");
    });

    it("returns null for unknown prompt key", async () => {
      const result = await promptManager.getPrompt(
        "unknown_key" as "email_subject_generation"
      );

      expect(result.prompt).toBeNull();
      expect(result.source).toBe("default");
    });
  });

  describe("renderPrompt - template interpolation", () => {
    it("interpolates single variable", async () => {
      const result = await promptManager.renderPrompt(
        "icebreaker_generation",
        { lead_company: "Acme Corp" },
        { tenantId: "tenant-456" }
      );

      expect(result).not.toBeNull();
      expect(result?.content).toContain("Icebreaker for Acme Corp");
    });

    it("interpolates multiple variables", async () => {
      const result = await promptManager.renderPrompt(
        "email_body_generation",
        {
          lead_name: "Maria",
          tone_style: "formal",
          writing_guidelines: "Be concise",
          product_name: "Acme Product",
          product_description: "Best product ever",
        },
        { tenantId: "tenant-456" }
      );

      expect(result?.content).toBe(
        "Email for Maria. Tom: formal. Guidelines: Be concise. Product: Acme Product - Best product ever"
      );
    });

    it("preserves unmatched variables", async () => {
      const result = await promptManager.renderPrompt(
        "email_subject_generation",
        { other_var: "value" },
        { tenantId: "tenant-456" }
      );

      expect(result?.content).toContain("{{lead_name}}");
    });

    it("returns metadata from prompt", async () => {
      const result = await promptManager.renderPrompt(
        "email_subject_generation",
        { lead_name: "João", tone_style: "casual", tone_description: "Amigável" },
        { tenantId: "tenant-456" }
      );

      expect(result?.metadata.temperature).toBe(0.7);
      expect(result?.modelPreference).toBe("gpt-4o-mini");
      expect(result?.source).toBe("default");
    });

    it("returns null for unknown prompt key", async () => {
      const result = await promptManager.renderPrompt(
        "unknown_key" as "email_subject_generation",
        { lead_name: "João" },
        { tenantId: "tenant-456" }
      );

      expect(result).toBeNull();
    });
  });

  describe("renderPrompt - conditional blocks (Story 6.3)", () => {
    it("includes conditional block content when variable has value", async () => {
      const result = await promptManager.renderPrompt(
        "email_subject_generation",
        {
          lead_name: "João",
          tone_style: "casual",
          tone_description: "Amigável",
          successful_examples: "Subject 1: Test\nSubject 2: Demo",
        },
        { tenantId: "tenant-456" }
      );

      expect(result?.content).toContain("Subject for João");
      expect(result?.content).toContain("Examples:");
      expect(result?.content).toContain("Subject 1: Test");
    });

    it("removes conditional block when variable is empty string", async () => {
      const result = await promptManager.renderPrompt(
        "email_subject_generation",
        {
          lead_name: "João",
          tone_style: "formal",
          tone_description: "Corporativo",
          successful_examples: "",
        },
        { tenantId: "tenant-456" }
      );

      expect(result?.content).toBe(
        "Subject for João. Tom: formal. Desc: Corporativo"
      );
      expect(result?.content).not.toContain("Examples:");
      expect(result?.content).not.toContain("{{#if");
      expect(result?.content).not.toContain("{{/if}}");
    });

    it("removes conditional block when variable is missing", async () => {
      const result = await promptManager.renderPrompt(
        "email_subject_generation",
        {
          lead_name: "João",
          tone_style: "formal",
          tone_description: "Corporativo",
        },
        { tenantId: "tenant-456" }
      );

      expect(result?.content).toBe(
        "Subject for João. Tom: formal. Desc: Corporativo"
      );
      expect(result?.content).not.toContain("Examples:");
      expect(result?.content).not.toContain("{{#if");
    });

    it("removes conditional block when variable is whitespace only", async () => {
      const result = await promptManager.renderPrompt(
        "email_subject_generation",
        {
          lead_name: "João",
          tone_style: "technical",
          tone_description: "Técnico",
          successful_examples: "   \n  ",
        },
        { tenantId: "tenant-456" }
      );

      expect(result?.content).toBe(
        "Subject for João. Tom: technical. Desc: Técnico"
      );
      expect(result?.content).not.toContain("Examples:");
    });
  });

  describe("renderPrompt - {{else}} fallback support (Story 6.5)", () => {
    it("uses if-content when variable has value", async () => {
      const result = await promptManager.renderPrompt(
        "email_body_generation",
        {
          lead_name: "João",
          tone_style: "casual",
          writing_guidelines: "",
          product_name: "AWS Server",
          product_description: "Cloud hosting solution",
          products_services: "General tech services",
        },
        { tenantId: "tenant-456" }
      );

      expect(result?.content).toBe(
        "Email for João. Tom: casual. Guidelines: . Product: AWS Server - Cloud hosting solution"
      );
      expect(result?.content).not.toContain("Services:");
      expect(result?.content).not.toContain("General tech services");
    });

    it("uses else-content when variable is missing", async () => {
      const result = await promptManager.renderPrompt(
        "email_body_generation",
        {
          lead_name: "Maria",
          tone_style: "formal",
          writing_guidelines: "Use formal language",
          products_services: "Consulting and development",
        },
        { tenantId: "tenant-456" }
      );

      expect(result?.content).toBe(
        "Email for Maria. Tom: formal. Guidelines: Use formal language. Services: Consulting and development"
      );
      expect(result?.content).not.toContain("Product:");
    });

    it("uses else-content when variable is empty string", async () => {
      const result = await promptManager.renderPrompt(
        "email_body_generation",
        {
          lead_name: "Carlos",
          tone_style: "technical",
          writing_guidelines: "",
          product_name: "",
          product_description: "",
          products_services: "B2B Solutions",
        },
        { tenantId: "tenant-456" }
      );

      expect(result?.content).toBe(
        "Email for Carlos. Tom: technical. Guidelines: . Services: B2B Solutions"
      );
    });

    it("uses else-content when variable is whitespace only", async () => {
      const result = await promptManager.renderPrompt(
        "email_body_generation",
        {
          lead_name: "Ana",
          tone_style: "casual",
          writing_guidelines: "",
          product_name: "   ",
          products_services: "Enterprise software",
        },
        { tenantId: "tenant-456" }
      );

      expect(result?.content).toBe(
        "Email for Ana. Tom: casual. Guidelines: . Services: Enterprise software"
      );
    });

    it("handles nested variables inside if-content", async () => {
      const result = await promptManager.renderPrompt(
        "email_body_generation",
        {
          lead_name: "Pedro",
          tone_style: "formal",
          writing_guidelines: "Be respectful",
          product_name: "CRM Pro",
          product_description: "Best CRM in market",
          products_services: "Should not appear",
        },
        { tenantId: "tenant-456" }
      );

      expect(result?.content).toContain("CRM Pro");
      expect(result?.content).toContain("Best CRM in market");
      expect(result?.content).not.toContain("Should not appear");
    });

    it("handles nested variables inside else-content", async () => {
      const result = await promptManager.renderPrompt(
        "email_body_generation",
        {
          lead_name: "Julia",
          tone_style: "casual",
          writing_guidelines: "",
          products_services: "Full stack development",
        },
        { tenantId: "tenant-456" }
      );

      expect(result?.content).toContain("Full stack development");
    });
  });

  // ==============================================
  // STORY 6.9: TONE VARIABLE INTERPOLATION TESTS
  // ==============================================

  describe("renderPrompt - tone variable interpolation (Story 6.9)", () => {
    describe("tone_style renders correct preset value (Task 4.2)", () => {
      it("renders tone_style as 'formal'", async () => {
        const result = await promptManager.renderPrompt(
          "icebreaker_generation",
          { lead_company: "Acme", tone_style: "formal" },
          { tenantId: "tenant-456" }
        );

        expect(result?.content).toBe("Icebreaker for Acme. Tom: formal");
      });

      it("renders tone_style as 'casual'", async () => {
        const result = await promptManager.renderPrompt(
          "icebreaker_generation",
          { lead_company: "TechCo", tone_style: "casual" },
          { tenantId: "tenant-456" }
        );

        expect(result?.content).toBe("Icebreaker for TechCo. Tom: casual");
      });

      it("renders tone_style as 'technical'", async () => {
        const result = await promptManager.renderPrompt(
          "icebreaker_generation",
          { lead_company: "StartupXYZ", tone_style: "technical" },
          { tenantId: "tenant-456" }
        );

        expect(result?.content).toBe("Icebreaker for StartupXYZ. Tom: technical");
      });
    });

    describe("tone_description renders human-readable description (Task 4.3)", () => {
      it("renders tone_description with formal preset label", async () => {
        const result = await promptManager.renderPrompt(
          "email_subject_generation",
          {
            lead_name: "João",
            tone_style: "formal",
            tone_description: "Tom Formal. Linguagem corporativa e respeitosa",
          },
          { tenantId: "tenant-456" }
        );

        expect(result?.content).toContain(
          "Desc: Tom Formal. Linguagem corporativa e respeitosa"
        );
      });

      it("renders tone_description with custom description concatenated", async () => {
        const result = await promptManager.renderPrompt(
          "email_subject_generation",
          {
            lead_name: "Maria",
            tone_style: "casual",
            tone_description:
              "Tom Casual. Linguagem amigável e próxima. Seja descontraído",
          },
          { tenantId: "tenant-456" }
        );

        expect(result?.content).toContain("Tom Casual");
        expect(result?.content).toContain("Seja descontraído");
      });
    });

    describe("writing_guidelines renders correctly (Task 4.4)", () => {
      it("renders writing_guidelines when present", async () => {
        const result = await promptManager.renderPrompt(
          "email_body_generation",
          {
            lead_name: "Ana",
            tone_style: "formal",
            writing_guidelines: "Use bullet points para listas",
            products_services: "Serviços",
          },
          { tenantId: "tenant-456" }
        );

        expect(result?.content).toContain(
          "Guidelines: Use bullet points para listas"
        );
      });

      it("renders empty when writing_guidelines is empty", async () => {
        const result = await promptManager.renderPrompt(
          "email_body_generation",
          {
            lead_name: "Carlos",
            tone_style: "casual",
            writing_guidelines: "",
            products_services: "Tech",
          },
          { tenantId: "tenant-456" }
        );

        expect(result?.content).toContain("Guidelines: .");
      });
    });

    describe("complete tone context interpolation (Task 4.1)", () => {
      it("interpolates all tone variables together", async () => {
        const result = await promptManager.renderPrompt(
          "email_body_generation",
          {
            lead_name: "Pedro",
            tone_style: "technical",
            writing_guidelines: "Use métricas quando possível",
            product_name: "Analytics Pro",
            product_description: "Plataforma de analytics",
          },
          { tenantId: "tenant-456" }
        );

        expect(result?.content).toContain("Tom: technical");
        expect(result?.content).toContain(
          "Guidelines: Use métricas quando possível"
        );
        expect(result?.content).toContain("Analytics Pro");
      });

      it("preserves tone variables when product context is missing", async () => {
        const result = await promptManager.renderPrompt(
          "email_body_generation",
          {
            lead_name: "Julia",
            tone_style: "casual",
            writing_guidelines: "Seja amigável",
            products_services: "Consultoria",
          },
          { tenantId: "tenant-456" }
        );

        expect(result?.content).toContain("Tom: casual");
        expect(result?.content).toContain("Guidelines: Seja amigável");
        expect(result?.content).toContain("Services: Consultoria");
      });
    });
  });

  // ==============================================
  // STORY 6.10: EXAMPLES IN PROMPT INTERPOLATION
  // ==============================================

  describe("renderPrompt - examples interpolation (Story 6.10)", () => {
    describe("examples included when available (Task 3.1, AC #1)", () => {
      it("includes formatted examples in subject prompt", async () => {
        const formattedExamples =
          "Exemplo 1:\nAssunto: Oportunidade para TechCo\nCorpo: Olá, vi que vocês...\n\nExemplo 2:\nAssunto: Parceria estratégica\nCorpo: Oi, tudo bem?";

        const result = await promptManager.renderPrompt(
          "email_subject_generation",
          {
            lead_name: "Carlos",
            tone_style: "casual",
            tone_description: "Amigável e próximo",
            successful_examples: formattedExamples,
          },
          { tenantId: "tenant-456" }
        );

        expect(result?.content).toContain("Examples:");
        expect(result?.content).toContain("Exemplo 1:");
        expect(result?.content).toContain("Oportunidade para TechCo");
        expect(result?.content).toContain("Exemplo 2:");
        expect(result?.content).toContain("Parceria estratégica");
      });

      it("preserves example structure including context field", async () => {
        const examplesWithContext =
          "Exemplo 1:\nAssunto: Follow-up reunião\nCorpo: Conforme conversamos...\nContexto: Pós-reunião";

        const result = await promptManager.renderPrompt(
          "email_subject_generation",
          {
            lead_name: "Ana",
            tone_style: "formal",
            tone_description: "Corporativo",
            successful_examples: examplesWithContext,
          },
          { tenantId: "tenant-456" }
        );

        expect(result?.content).toContain("Contexto: Pós-reunião");
      });
    });

    describe("examples omitted when empty (Task 3.2, AC #6)", () => {
      it("removes examples section when empty string", async () => {
        const result = await promptManager.renderPrompt(
          "email_subject_generation",
          {
            lead_name: "Pedro",
            tone_style: "technical",
            tone_description: "Técnico",
            successful_examples: "",
          },
          { tenantId: "tenant-456" }
        );

        expect(result?.content).not.toContain("Examples:");
        expect(result?.content).not.toContain("{{#if");
        expect(result?.content).not.toContain("{{/if}}");
      });

      it("removes examples section when not provided", async () => {
        const result = await promptManager.renderPrompt(
          "email_subject_generation",
          {
            lead_name: "Julia",
            tone_style: "casual",
            tone_description: "Descontraído",
          },
          { tenantId: "tenant-456" }
        );

        expect(result?.content).not.toContain("Examples:");
      });
    });

    describe("examples combined with other contexts (Task 3.3, AC #5)", () => {
      it("preserves examples alongside product context", async () => {
        const result = await promptManager.renderPrompt(
          "email_subject_generation",
          {
            lead_name: "Ricardo",
            tone_style: "formal",
            tone_description: "Corporativo e respeitoso",
            successful_examples: "Exemplo 1:\nAssunto: Demo produto",
          },
          { tenantId: "tenant-456" }
        );

        // Both should be present
        expect(result?.content).toContain("Subject for Ricardo");
        expect(result?.content).toContain("Tom: formal");
        expect(result?.content).toContain("Examples:");
        expect(result?.content).toContain("Demo produto");
      });

      it("handles all three prompts with examples (subject, body, icebreaker)", async () => {
        // Subject prompt
        const subjectResult = await promptManager.renderPrompt(
          "email_subject_generation",
          {
            lead_name: "Test",
            tone_style: "casual",
            tone_description: "Casual",
            successful_examples: "Subject example",
          },
          { tenantId: "tenant-456" }
        );
        expect(subjectResult?.content).toContain("Subject example");

        // Icebreaker prompt (mock doesn't have examples, but conditional is tested elsewhere)
        const icebreakerResult = await promptManager.renderPrompt(
          "icebreaker_generation",
          { lead_company: "TestCo", tone_style: "formal" },
          { tenantId: "tenant-456" }
        );
        expect(icebreakerResult?.content).toContain("TestCo");
      });
    });
  });

  // ==============================================
  // STORY 6.11: FOLLOW-UP EMAIL GENERATION TESTS
  // ==============================================

  describe("renderPrompt - follow-up email interpolation (Story 6.11)", () => {
    describe("previous email context interpolation (Task 10.1, AC #3)", () => {
      it("interpolates previous_email_subject correctly", async () => {
        const result = await promptManager.renderPrompt(
          "follow_up_email_generation",
          {
            lead_name: "João",
            previous_email_subject: "Oportunidade de parceria",
            previous_email_body: "Olá, gostaria de conversar...",
            tone_style: "formal",
          },
          { tenantId: "tenant-456" }
        );

        expect(result?.content).toContain(
          "Previous subject: Oportunidade de parceria"
        );
      });

      it("interpolates previous_email_body correctly", async () => {
        const result = await promptManager.renderPrompt(
          "follow_up_email_generation",
          {
            lead_name: "Maria",
            previous_email_subject: "Demo do produto",
            previous_email_body:
              "Conforme conversamos na última reunião, seguem os detalhes...",
            tone_style: "casual",
          },
          { tenantId: "tenant-456" }
        );

        expect(result?.content).toContain(
          "Previous body: Conforme conversamos na última reunião, seguem os detalhes..."
        );
      });

      it("interpolates all follow-up variables together", async () => {
        const result = await promptManager.renderPrompt(
          "follow_up_email_generation",
          {
            lead_name: "Carlos",
            previous_email_subject: "Proposta comercial",
            previous_email_body: "Apresento nossa proposta...",
            tone_style: "technical",
          },
          { tenantId: "tenant-456" }
        );

        expect(result?.content).toBe(
          "Follow-up for Carlos. Previous subject: Proposta comercial. Previous body: Apresento nossa proposta.... Tom: technical"
        );
      });
    });

    describe("follow-up with successful examples (Task 10.2, AC #3)", () => {
      it("includes examples when provided for follow-up prompt", async () => {
        const result = await promptManager.renderPrompt(
          "follow_up_email_generation",
          {
            lead_name: "Ana",
            previous_email_subject: "Primeiro contato",
            previous_email_body: "Olá, tudo bem?",
            tone_style: "casual",
            successful_examples:
              "Exemplo 1:\nAssunto: Follow-up reunião\nCorpo: Conforme combinamos...",
          },
          { tenantId: "tenant-456" }
        );

        expect(result?.content).toContain("Examples:");
        expect(result?.content).toContain("Follow-up reunião");
        expect(result?.content).toContain("Conforme combinamos...");
      });

      it("omits examples section when not provided", async () => {
        const result = await promptManager.renderPrompt(
          "follow_up_email_generation",
          {
            lead_name: "Pedro",
            previous_email_subject: "Apresentação",
            previous_email_body: "Segue apresentação...",
            tone_style: "formal",
          },
          { tenantId: "tenant-456" }
        );

        expect(result?.content).not.toContain("Examples:");
        expect(result?.content).not.toContain("{{#if");
        expect(result?.content).not.toContain("{{/if}}");
      });
    });

    describe("chain follow-up context (Task 10.3, AC #4)", () => {
      it("handles Email 2 reading Email 1 context", async () => {
        // Simulating Email 2 getting context from Email 1
        const email1Content = {
          subject: "Apresentação da TechCorp",
          body: "Olá, somos a TechCorp e oferecemos soluções inovadoras...",
        };

        const result = await promptManager.renderPrompt(
          "follow_up_email_generation",
          {
            lead_name: "Ricardo",
            previous_email_subject: email1Content.subject,
            previous_email_body: email1Content.body,
            tone_style: "formal",
          },
          { tenantId: "tenant-456" }
        );

        expect(result?.content).toContain("Apresentação da TechCorp");
        expect(result?.content).toContain("soluções inovadoras");
      });

      it("handles Email 3 reading Email 2 context (chain)", async () => {
        // Simulating Email 3 getting context from Email 2 (not Email 1)
        const email2Content = {
          subject: "Re: Próximos passos",
          body: "Conforme conversamos, gostaria de agendar uma demo...",
        };

        const result = await promptManager.renderPrompt(
          "follow_up_email_generation",
          {
            lead_name: "Julia",
            previous_email_subject: email2Content.subject,
            previous_email_body: email2Content.body,
            tone_style: "casual",
          },
          { tenantId: "tenant-456" }
        );

        expect(result?.content).toContain("Re: Próximos passos");
        expect(result?.content).toContain("agendar uma demo");
      });
    });

    describe("follow-up prompt metadata (AC #2)", () => {
      it("returns correct metadata for follow-up prompt", async () => {
        const result = await promptManager.renderPrompt(
          "follow_up_email_generation",
          {
            lead_name: "Test",
            previous_email_subject: "Test",
            previous_email_body: "Test",
            tone_style: "formal",
          },
          { tenantId: "tenant-456" }
        );

        expect(result?.metadata.temperature).toBe(0.7);
        expect(result?.metadata.maxTokens).toBe(300);
        expect(result?.modelPreference).toBe("gpt-4o-mini");
        expect(result?.source).toBe("default");
      });
    });
  });

  describe("renderPrompt - follow-up subject interpolation (Story 6.11)", () => {
    describe("previous subject context for RE: prefix (Task 12)", () => {
      it("interpolates previous_email_subject for RE: generation", async () => {
        const result = await promptManager.renderPrompt(
          "follow_up_subject_generation",
          {
            lead_name: "João",
            previous_email_subject: "Oportunidade para TechCorp",
            tone_style: "formal",
          },
          { tenantId: "tenant-456" }
        );

        expect(result?.content).toContain(
          "Previous subject: Oportunidade para TechCorp"
        );
        expect(result?.content).toContain("Must start with RE:");
      });

      it("interpolates all follow-up subject variables together", async () => {
        const result = await promptManager.renderPrompt(
          "follow_up_subject_generation",
          {
            lead_name: "Maria",
            previous_email_subject: "Proposta comercial",
            tone_style: "casual",
          },
          { tenantId: "tenant-456" }
        );

        expect(result?.content).toBe(
          "Follow-up subject for Maria. Previous subject: Proposta comercial. Tom: casual. Must start with RE:"
        );
      });
    });

    describe("follow-up subject prompt metadata", () => {
      it("returns correct metadata for follow-up subject prompt", async () => {
        const result = await promptManager.renderPrompt(
          "follow_up_subject_generation",
          {
            lead_name: "Test",
            previous_email_subject: "Test Subject",
            tone_style: "formal",
          },
          { tenantId: "tenant-456" }
        );

        expect(result?.metadata.temperature).toBe(0.6);
        expect(result?.metadata.maxTokens).toBe(80);
        expect(result?.modelPreference).toBe("gpt-4o-mini");
        expect(result?.source).toBe("default");
      });
    });
  });

  // ==============================================
  // STORY 6.5.3: ICEBREAKER PREMIUM GENERATION TESTS
  // ==============================================

  describe("renderPrompt - icebreaker premium generation (Story 6.5.3)", () => {
    describe("code default prompt retrieval (Task 4.1, AC #1, #4)", () => {
      it("returns icebreaker_premium_generation from code default", async () => {
        const result = await promptManager.getPrompt(
          "icebreaker_premium_generation",
          { tenantId: "tenant-456" }
        );

        expect(result.source).toBe("default");
        expect(result.prompt).not.toBeNull();
        expect(result.prompt?.promptTemplate).toContain("Icebreaker premium for");
        expect(result.prompt?.promptTemplate).toContain("{{linkedin_posts}}");
      });

      it("returns correct metadata for icebreaker_premium_generation", async () => {
        const result = await promptManager.getPrompt(
          "icebreaker_premium_generation",
          { tenantId: "tenant-456" }
        );

        expect(result.prompt?.metadata).toEqual({
          temperature: 0.8,
          maxTokens: 200,
        });
        expect(result.prompt?.modelPreference).toBe("gpt-4o-mini");
      });
    });

    describe("linkedin_posts variable interpolation (Task 4.2, AC #3)", () => {
      it("interpolates {{linkedin_posts}} variable with formatted posts", async () => {
        const formattedPosts = `POST 1 (12 Jan 2026, 42 curtidas):
"Texto sobre liderança e gestão de equipes..."

POST 2 (5 Jan 2026, 18 curtidas):
"Reflexões sobre transformação digital..."`;

        const result = await promptManager.renderPrompt(
          "icebreaker_premium_generation",
          {
            lead_name: "João Silva",
            lead_company: "TechCorp",
            linkedin_posts: formattedPosts,
            tone_style: "casual",
          },
          { tenantId: "tenant-456" }
        );

        expect(result?.content).toContain("Posts: POST 1 (12 Jan 2026, 42 curtidas)");
        expect(result?.content).toContain("Texto sobre liderança");
        expect(result?.content).toContain("POST 2");
        expect(result?.content).toContain("transformação digital");
      });

      it("interpolates all lead profile variables", async () => {
        const result = await promptManager.renderPrompt(
          "icebreaker_premium_generation",
          {
            lead_name: "Maria Santos",
            lead_title: "CTO",
            lead_company: "StartupXYZ",
            lead_industry: "Technology",
            company_context: "Software company",
            linkedin_posts: "Post content here",
            tone_style: "formal",
            tone_description: "Professional tone",
          },
          { tenantId: "tenant-456" }
        );

        expect(result?.content).toContain("Icebreaker premium for Maria Santos (CTO) at StartupXYZ in Technology");
        expect(result?.content).toContain("Context: Software company");
        expect(result?.content).toContain("Tom: formal - Professional tone");
      });
    });

    describe("conditional product_name blocks (Task 4.3, AC #3)", () => {
      it("includes product context when product_name is provided", async () => {
        const result = await promptManager.renderPrompt(
          "icebreaker_premium_generation",
          {
            lead_name: "Carlos Oliveira",
            lead_company: "BigCorp",
            linkedin_posts: "Recent posts",
            tone_style: "technical",
            product_name: "Analytics Pro",
            product_description: "Data analytics platform",
          },
          { tenantId: "tenant-456" }
        );

        expect(result?.content).toContain("Product: Analytics Pro - Data analytics platform");
      });

      it("excludes product context when product_name is missing", async () => {
        const result = await promptManager.renderPrompt(
          "icebreaker_premium_generation",
          {
            lead_name: "Ana Costa",
            lead_company: "MidCorp",
            linkedin_posts: "Post data",
            tone_style: "casual",
          },
          { tenantId: "tenant-456" }
        );

        expect(result?.content).not.toContain("Product:");
        expect(result?.content).not.toContain("{{#if");
        expect(result?.content).not.toContain("{{/if}}");
      });

      it("excludes product context when product_name is empty string", async () => {
        const result = await promptManager.renderPrompt(
          "icebreaker_premium_generation",
          {
            lead_name: "Pedro Mendes",
            lead_company: "SmallCo",
            linkedin_posts: "LinkedIn content",
            tone_style: "formal",
            product_name: "",
            product_description: "Should not appear",
          },
          { tenantId: "tenant-456" }
        );

        expect(result?.content).not.toContain("Product:");
        expect(result?.content).not.toContain("Should not appear");
      });
    });

    describe("complete prompt rendering (AC #3)", () => {
      it("renders complete prompt with all variables", async () => {
        const result = await promptManager.renderPrompt(
          "icebreaker_premium_generation",
          {
            lead_name: "Ricardo Ferreira",
            lead_title: "VP Sales",
            lead_company: "InnovateTech",
            lead_industry: "SaaS",
            company_context: "AI solutions provider",
            linkedin_posts: "Post about AI trends",
            tone_style: "technical",
            tone_description: "Data-driven approach",
            product_name: "AI Suite",
            product_description: "ML automation tools",
          },
          { tenantId: "tenant-456" }
        );

        expect(result?.content).toBe(
          "Icebreaker premium for Ricardo Ferreira (VP Sales) at InnovateTech in SaaS. Context: AI solutions provider. Posts: Post about AI trends. Tom: technical - Data-driven approach. Product: AI Suite - ML automation tools"
        );
        expect(result?.source).toBe("default");
        expect(result?.modelPreference).toBe("gpt-4o-mini");
        expect(result?.metadata.temperature).toBe(0.8);
        expect(result?.metadata.maxTokens).toBe(200);
      });
    });

    describe("linkedin_posts edge cases (Code Review Fix M2)", () => {
      it("preserves {{linkedin_posts}} placeholder when undefined", async () => {
        const result = await promptManager.renderPrompt(
          "icebreaker_premium_generation",
          {
            lead_name: "Ana Lima",
            lead_company: "TechCo",
            tone_style: "casual",
          },
          { tenantId: "tenant-456" }
        );

        // When linkedin_posts is not provided, the placeholder remains
        expect(result?.content).toContain("{{linkedin_posts}}");
      });

      it("renders empty string when linkedin_posts is empty", async () => {
        const result = await promptManager.renderPrompt(
          "icebreaker_premium_generation",
          {
            lead_name: "Bruno Santos",
            lead_company: "StartupXYZ",
            linkedin_posts: "",
            tone_style: "formal",
          },
          { tenantId: "tenant-456" }
        );

        // Empty string is interpolated as empty
        expect(result?.content).toContain("Posts: .");
        expect(result?.content).not.toContain("{{linkedin_posts}}");
      });

      it("handles whitespace-only linkedin_posts", async () => {
        const result = await promptManager.renderPrompt(
          "icebreaker_premium_generation",
          {
            lead_name: "Carla Mendes",
            lead_company: "BigCorp",
            linkedin_posts: "   \n  ",
            tone_style: "technical",
          },
          { tenantId: "tenant-456" }
        );

        // Whitespace is preserved in interpolation
        expect(result?.content).toContain("Posts:");
        expect(result?.content).not.toContain("{{linkedin_posts}}");
      });
    });
  });

  describe("caching", () => {
    it("caches prompt results", async () => {
      // First call
      const result1 = await promptManager.getPrompt("email_subject_generation", {
        tenantId: "tenant-456",
      });

      // Second call (should use cache)
      const result2 = await promptManager.getPrompt("email_subject_generation", {
        tenantId: "tenant-456",
      });

      expect(result1.prompt?.promptTemplate).toBe(result2.prompt?.promptTemplate);
    });

    it("clearCache removes cached prompts", async () => {
      // First call
      await promptManager.getPrompt("email_subject_generation", {
        tenantId: "tenant-456",
      });

      // Clear cache
      promptManager.clearCache();

      // After clear, fetches again (same result since mock is static)
      const result = await promptManager.getPrompt("email_subject_generation", {
        tenantId: "tenant-456",
      });

      expect(result.prompt).not.toBeNull();
    });

    it("clearCacheForPrompt removes specific prompt", async () => {
      await promptManager.getPrompt("email_subject_generation", {
        tenantId: "tenant-456",
      });

      promptManager.clearCacheForPrompt("email_subject_generation", "tenant-456");

      const result = await promptManager.getPrompt("email_subject_generation", {
        tenantId: "tenant-456",
      });

      expect(result.prompt).not.toBeNull();
    });

    it("skipCache bypasses cache", async () => {
      // First call (will cache)
      await promptManager.getPrompt("email_subject_generation", {
        tenantId: "tenant-456",
      });

      // Second call with skipCache
      const result = await promptManager.getPrompt("email_subject_generation", {
        tenantId: "tenant-456",
        skipCache: true,
      });

      expect(result.prompt).not.toBeNull();
    });
  });
});
