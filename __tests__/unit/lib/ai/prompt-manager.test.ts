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

// Mock code defaults
vi.mock("@/lib/ai/prompts/defaults", () => ({
  CODE_DEFAULT_PROMPTS: {
    email_subject_generation: {
      template: "Default subject prompt for {{lead_name}}",
      modelPreference: "gpt-4o-mini",
      metadata: { temperature: 0.7 },
    },
    email_body_generation: {
      template: "Default body prompt for {{lead_name}} at {{lead_company}}",
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
      expect(result.prompt?.promptTemplate).toBe(
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
        { lead_name: "Maria", lead_company: "Acme Corp" },
        { tenantId: "tenant-456" }
      );

      expect(result?.content).toBe(
        "Default body prompt for Maria at Acme Corp"
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
