/**
 * AI Prompt Types Unit Tests
 * Story: 6.5.3 - Icebreaker Prompt Configuration
 * AC: #1 - PromptKey includes 'icebreaker_premium_generation'
 * AC: #6 - TypeScript type and Zod schema validation
 */

import { describe, it, expect } from "vitest";
import {
  PROMPT_KEYS,
  promptKeySchema,
  type PromptKey,
} from "@/types/ai-prompt";

describe("AI Prompt Types (Story 6.5.3)", () => {
  describe("PROMPT_KEYS array (Task 4.4, AC #1)", () => {
    it("includes icebreaker_premium_generation key", () => {
      expect(PROMPT_KEYS).toContain("icebreaker_premium_generation");
    });

    it("includes all expected prompt keys", () => {
      const expectedKeys: PromptKey[] = [
        "search_translation",
        "email_subject_generation",
        "email_body_generation",
        "icebreaker_generation",
        "icebreaker_premium_generation",
        "tone_application",
        "follow_up_email_generation",
        "follow_up_subject_generation",
        "campaign_structure_generation",
      ];

      expectedKeys.forEach((key) => {
        expect(PROMPT_KEYS).toContain(key);
      });
    });

    it("has correct length after adding icebreaker_premium_generation", () => {
      // 9 total keys: search_translation, email_subject_generation, email_body_generation,
      // icebreaker_generation, icebreaker_premium_generation, tone_application,
      // follow_up_email_generation, follow_up_subject_generation, campaign_structure_generation
      expect(PROMPT_KEYS.length).toBe(9);
    });
  });

  describe("promptKeySchema Zod validation (Task 4.5, AC #6)", () => {
    it("validates icebreaker_premium_generation as valid key", () => {
      const result = promptKeySchema.safeParse("icebreaker_premium_generation");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe("icebreaker_premium_generation");
      }
    });

    it("validates all PROMPT_KEYS entries", () => {
      PROMPT_KEYS.forEach((key) => {
        const result = promptKeySchema.safeParse(key);
        expect(result.success).toBe(true);
      });
    });

    it("rejects invalid prompt key", () => {
      const result = promptKeySchema.safeParse("invalid_key");
      expect(result.success).toBe(false);
    });

    it("rejects empty string", () => {
      const result = promptKeySchema.safeParse("");
      expect(result.success).toBe(false);
    });

    it("rejects null value", () => {
      const result = promptKeySchema.safeParse(null);
      expect(result.success).toBe(false);
    });
  });

  describe("PromptKey type inference", () => {
    it("allows assignment of icebreaker_premium_generation", () => {
      // TypeScript compile-time check - if this compiles, the type is correct
      const key: PromptKey = "icebreaker_premium_generation";
      expect(key).toBe("icebreaker_premium_generation");
    });

    it("allows assignment of all valid keys", () => {
      const keys: PromptKey[] = [
        "search_translation",
        "email_subject_generation",
        "email_body_generation",
        "icebreaker_generation",
        "icebreaker_premium_generation",
        "tone_application",
        "follow_up_email_generation",
        "follow_up_subject_generation",
        "campaign_structure_generation",
      ];
      expect(keys.length).toBe(9);
    });
  });
});
