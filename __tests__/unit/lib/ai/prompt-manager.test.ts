/**
 * PromptManager Unit Tests
 * Story: 6.1 - AI Provider Service Layer & Prompt Management System
 * AC: #2 - Prompt fallback logic and caching
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
vi.mock("@/lib/ai/prompts/defaults", () => ({
  CODE_DEFAULT_PROMPTS: {
    email_subject_generation: {
      template: "Default subject prompt for {{lead_name}}{{#if successful_examples}}\n\nExamples:\n{{successful_examples}}{{/if}}",
      modelPreference: "gpt-4o-mini",
      metadata: { temperature: 0.7 },
    },
    email_body_generation: {
      // Story 6.5: Template with {{else}} for product context fallback
      template: "Email for {{lead_name}}. {{#if product_name}}Product: {{product_name}} - {{product_description}}{{else}}Services: {{products_services}}{{/if}}",
      modelPreference: "gpt-4o-mini",
      metadata: { temperature: 0.7, maxTokens: 500 },
    },
    icebreaker_generation: {
      template: "Default icebreaker prompt",
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
      expect(result.prompt?.promptTemplate).toContain(
        "Default subject prompt for {{lead_name}}"
      );
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
        "email_subject_generation",
        { lead_name: "João Silva" },
        { tenantId: "tenant-456" }
      );

      expect(result).not.toBeNull();
      expect(result?.content).toBe("Default subject prompt for João Silva");
    });

    it("interpolates multiple variables", async () => {
      const result = await promptManager.renderPrompt(
        "email_body_generation",
        {
          lead_name: "Maria",
          product_name: "Acme Product",
          product_description: "Best product ever",
        },
        { tenantId: "tenant-456" }
      );

      expect(result?.content).toBe(
        "Email for Maria. Product: Acme Product - Best product ever"
      );
    });

    it("preserves unmatched variables", async () => {
      const result = await promptManager.renderPrompt(
        "email_subject_generation",
        { other_var: "value" },
        { tenantId: "tenant-456" }
      );

      expect(result?.content).toBe("Default subject prompt for {{lead_name}}");
    });

    it("returns metadata from prompt", async () => {
      const result = await promptManager.renderPrompt(
        "email_subject_generation",
        { lead_name: "João" },
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
          successful_examples: "Subject 1: Test\nSubject 2: Demo",
        },
        { tenantId: "tenant-456" }
      );

      expect(result?.content).toContain("Default subject prompt for João");
      expect(result?.content).toContain("Examples:");
      expect(result?.content).toContain("Subject 1: Test");
    });

    it("removes conditional block when variable is empty string", async () => {
      const result = await promptManager.renderPrompt(
        "email_subject_generation",
        {
          lead_name: "João",
          successful_examples: "",
        },
        { tenantId: "tenant-456" }
      );

      expect(result?.content).toBe("Default subject prompt for João");
      expect(result?.content).not.toContain("Examples:");
      expect(result?.content).not.toContain("{{#if");
      expect(result?.content).not.toContain("{{/if}}");
    });

    it("removes conditional block when variable is missing", async () => {
      const result = await promptManager.renderPrompt(
        "email_subject_generation",
        { lead_name: "João" },
        { tenantId: "tenant-456" }
      );

      expect(result?.content).toBe("Default subject prompt for João");
      expect(result?.content).not.toContain("Examples:");
      expect(result?.content).not.toContain("{{#if");
    });

    it("removes conditional block when variable is whitespace only", async () => {
      const result = await promptManager.renderPrompt(
        "email_subject_generation",
        {
          lead_name: "João",
          successful_examples: "   \n  ",
        },
        { tenantId: "tenant-456" }
      );

      expect(result?.content).toBe("Default subject prompt for João");
      expect(result?.content).not.toContain("Examples:");
    });
  });

  describe("renderPrompt - {{else}} fallback support (Story 6.5)", () => {
    it("uses if-content when variable has value", async () => {
      const result = await promptManager.renderPrompt(
        "email_body_generation",
        {
          lead_name: "João",
          product_name: "AWS Server",
          product_description: "Cloud hosting solution",
          products_services: "General tech services",
        },
        { tenantId: "tenant-456" }
      );

      expect(result?.content).toBe(
        "Email for João. Product: AWS Server - Cloud hosting solution"
      );
      expect(result?.content).not.toContain("Services:");
      expect(result?.content).not.toContain("General tech services");
    });

    it("uses else-content when variable is missing", async () => {
      const result = await promptManager.renderPrompt(
        "email_body_generation",
        {
          lead_name: "Maria",
          products_services: "Consulting and development",
        },
        { tenantId: "tenant-456" }
      );

      expect(result?.content).toBe(
        "Email for Maria. Services: Consulting and development"
      );
      expect(result?.content).not.toContain("Product:");
    });

    it("uses else-content when variable is empty string", async () => {
      const result = await promptManager.renderPrompt(
        "email_body_generation",
        {
          lead_name: "Carlos",
          product_name: "",
          product_description: "",
          products_services: "B2B Solutions",
        },
        { tenantId: "tenant-456" }
      );

      expect(result?.content).toBe("Email for Carlos. Services: B2B Solutions");
    });

    it("uses else-content when variable is whitespace only", async () => {
      const result = await promptManager.renderPrompt(
        "email_body_generation",
        {
          lead_name: "Ana",
          product_name: "   ",
          products_services: "Enterprise software",
        },
        { tenantId: "tenant-456" }
      );

      expect(result?.content).toBe("Email for Ana. Services: Enterprise software");
    });

    it("handles nested variables inside if-content", async () => {
      const result = await promptManager.renderPrompt(
        "email_body_generation",
        {
          lead_name: "Pedro",
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
          products_services: "Full stack development",
        },
        { tenantId: "tenant-456" }
      );

      expect(result?.content).toContain("Full stack development");
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
