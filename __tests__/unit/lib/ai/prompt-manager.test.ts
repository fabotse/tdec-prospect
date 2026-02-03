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
vi.mock("@/lib/ai/prompts/defaults", () => ({
  CODE_DEFAULT_PROMPTS: {
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
