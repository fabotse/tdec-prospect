/**
 * useAIFullCampaignGeneration Hook Tests
 * Story 6.12.1: AI Full Campaign Generation
 *
 * AC #2 - Full generation with progress indicator
 * AC #3 - Sequential generation with context passing
 * AC #6 - Partial generation handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useAIFullCampaignGeneration } from "@/hooks/use-ai-full-campaign-generation";
import type { BuilderBlock } from "@/stores/use-builder-store";

// Mock fetch
global.fetch = vi.fn();

describe("useAIFullCampaignGeneration", () => {
  const mockBlocks: BuilderBlock[] = [
    {
      id: "email-1",
      type: "email",
      position: 0,
      data: { subject: "", body: "", emailMode: "initial", strategicContext: "Introducao" },
    },
    {
      id: "delay-1",
      type: "delay",
      position: 1,
      data: { delayValue: 3, delayUnit: "days" },
    },
    {
      id: "email-2",
      type: "email",
      position: 2,
      data: { subject: "", body: "", emailMode: "follow-up", strategicContext: "Proposta" },
    },
    {
      id: "delay-2",
      type: "delay",
      position: 3,
      data: { delayValue: 3, delayUnit: "days" },
    },
    {
      id: "email-3",
      type: "email",
      position: 4,
      data: { subject: "", body: "", emailMode: "follow-up", strategicContext: "Fechamento" },
    },
  ];

  const defaultParams = {
    blocks: mockBlocks,
    campaignId: "campaign-123",
    productId: "product-456",
    productName: "Produto Teste",
    objective: "cold_outreach" as const,
    tone: "formal",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("Initial State", () => {
    it("starts with initial state", () => {
      const { result } = renderHook(() => useAIFullCampaignGeneration());

      expect(result.current.isGenerating).toBe(false);
      expect(result.current.progress).toBeNull();
      expect(result.current.error).toBeNull();
    });
  });

  describe("Sequential Generation (AC #2, #3)", () => {
    it("generates emails sequentially", async () => {
      // Mock successful API responses
      const mockFetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ success: true, data: { text: "Subject 1" } }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ success: true, data: { text: "Body 1" } }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ success: true, data: { text: "RE: Subject 2" } }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ success: true, data: { text: "Body 2" } }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ success: true, data: { text: "RE: Subject 3" } }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ success: true, data: { text: "Body 3" } }),
        });

      global.fetch = mockFetch;

      const { result } = renderHook(() => useAIFullCampaignGeneration());

      let generatedBlocks: BuilderBlock[] | undefined;

      await act(async () => {
        generatedBlocks = await result.current.generate(defaultParams);
      });

      // Should have called fetch 6 times (2 per email)
      expect(mockFetch).toHaveBeenCalledTimes(6);

      // Check blocks were updated
      expect(generatedBlocks).toBeDefined();
      const emailBlocks = generatedBlocks!.filter((b) => b.type === "email");
      expect(emailBlocks[0].data.subject).toBe("Subject 1");
      expect(emailBlocks[0].data.body).toBe("Body 1");
      expect(emailBlocks[1].data.subject).toBe("RE: Subject 2");
      expect(emailBlocks[1].data.body).toBe("Body 2");
      expect(emailBlocks[2].data.subject).toBe("RE: Subject 3");
      expect(emailBlocks[2].data.body).toBe("Body 3");
    });

    it("updates progress during generation", async () => {
      const mockFetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ success: true, data: { text: "Subject 1" } }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ success: true, data: { text: "Body 1" } }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ success: true, data: { text: "Subject 2" } }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ success: true, data: { text: "Body 2" } }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ success: true, data: { text: "Subject 3" } }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ success: true, data: { text: "Body 3" } }),
        });

      global.fetch = mockFetch;

      const { result } = renderHook(() => useAIFullCampaignGeneration());

      act(() => {
        result.current.generate(defaultParams);
      });

      // Initially should have progress
      await waitFor(() => {
        expect(result.current.isGenerating).toBe(true);
      });

      await waitFor(() => {
        expect(result.current.progress).not.toBeNull();
      });

      // Wait for completion
      await waitFor(() => {
        expect(result.current.isGenerating).toBe(false);
      });
    });

    it("uses prompts based on emailMode, not objective (emailMode is authoritative)", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true, data: { text: "Generated" } }),
      });

      global.fetch = mockFetch;

      const { result } = renderHook(() => useAIFullCampaignGeneration());

      await act(async () => {
        await result.current.generate(defaultParams);
      });

      // First email (emailMode: "initial") should use initial prompts
      expect(mockFetch.mock.calls[0][1].body).toContain("email_subject_generation");
      expect(mockFetch.mock.calls[1][1].body).toContain("email_body_generation");

      // Second email (emailMode: "follow-up") should use follow-up prompts
      // regardless of objective being "cold_outreach"
      expect(mockFetch.mock.calls[2][1].body).toContain("follow_up_subject_generation");
      expect(mockFetch.mock.calls[3][1].body).toContain("follow_up_email_generation");

      // Third email (emailMode: "follow-up") should also use follow-up prompts
      expect(mockFetch.mock.calls[4][1].body).toContain("follow_up_subject_generation");
      expect(mockFetch.mock.calls[5][1].body).toContain("follow_up_email_generation");
    });

    it("uses initial prompts for all-initial emailMode blocks", async () => {
      const allInitialBlocks: BuilderBlock[] = [
        {
          id: "email-1",
          type: "email",
          position: 0,
          data: { subject: "", body: "", emailMode: "initial", strategicContext: "Intro" },
        },
        {
          id: "email-2",
          type: "email",
          position: 1,
          data: { subject: "", body: "", emailMode: "initial", strategicContext: "Value" },
        },
      ];

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true, data: { text: "Generated" } }),
      });

      global.fetch = mockFetch;

      const { result } = renderHook(() => useAIFullCampaignGeneration());

      await act(async () => {
        await result.current.generate({ ...defaultParams, blocks: allInitialBlocks });
      });

      // Both emails should use initial prompts since emailMode is "initial"
      expect(mockFetch.mock.calls[0][1].body).toContain("email_subject_generation");
      expect(mockFetch.mock.calls[1][1].body).toContain("email_body_generation");
      expect(mockFetch.mock.calls[2][1].body).toContain("email_subject_generation");
      expect(mockFetch.mock.calls[3][1].body).toContain("email_body_generation");
    });

    it("passes previous email context to follow-up generations", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true, data: { text: "Generated" } }),
      });

      global.fetch = mockFetch;

      const { result } = renderHook(() => useAIFullCampaignGeneration());

      // Use defaultParams - mockBlocks has follow-up emailMode for 2nd and 3rd emails
      await act(async () => {
        await result.current.generate(defaultParams);
      });

      // Third call (second email subject, which has emailMode: "follow-up")
      // should contain previous email context
      const thirdCall = mockFetch.mock.calls[2];
      const body = JSON.parse(thirdCall[1].body);
      expect(body.variables.previous_email_subject).toBe("Generated");
    });
  });

  describe("Template Mode - Personalization Variables (Story 7.1)", () => {
    it("never passes lead variables (always template mode)", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true, data: { text: "Generated" } }),
      });

      global.fetch = mockFetch;

      const { result } = renderHook(() => useAIFullCampaignGeneration());

      await act(async () => {
        await result.current.generate(defaultParams);
      });

      // Lead variables should be empty strings to force MODO TEMPLATE in prompts
      // ({{#if lead_name}} evaluates to false when lead_name is "")
      const firstCallBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(firstCallBody.variables.lead_name).toBe("");
      expect(firstCallBody.variables.lead_company).toBe("");
      expect(firstCallBody.variables.lead_title).toBe("");
      expect(firstCallBody.variables.icebreaker).toBe("");
    });

    it("always passes tone_style and email_objective", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true, data: { text: "Generated" } }),
      });

      global.fetch = mockFetch;

      const { result } = renderHook(() => useAIFullCampaignGeneration());

      await act(async () => {
        await result.current.generate(defaultParams);
      });

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.variables.tone_style).toBe("formal");
      expect(callBody.variables.email_objective).toBeDefined();
    });
  });

  describe("Error Handling (AC #6)", () => {
    it("returns partial results on API error", async () => {
      const mockFetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ success: true, data: { text: "Subject 1" } }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ success: true, data: { text: "Body 1" } }),
        })
        .mockRejectedValueOnce(new Error("Network error"));

      global.fetch = mockFetch;

      const { result } = renderHook(() => useAIFullCampaignGeneration());

      let generatedBlocks: BuilderBlock[] | undefined;

      await act(async () => {
        generatedBlocks = await result.current.generate(defaultParams);
      });

      // Should have error
      expect(result.current.error).toBe("Network error");

      // First email should still have content
      const emailBlocks = generatedBlocks!.filter((b) => b.type === "email");
      expect(emailBlocks[0].data.subject).toBe("Subject 1");
      expect(emailBlocks[0].data.body).toBe("Body 1");
    });

    it("sets error state on API failure", async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: { message: "API Error" } }),
      });

      global.fetch = mockFetch;

      const { result } = renderHook(() => useAIFullCampaignGeneration());

      await act(async () => {
        await result.current.generate(defaultParams);
      });

      expect(result.current.error).toBe("API Error");
    });
  });

  describe("Cancellation", () => {
    it("stops generation when cancel is called", async () => {
      let resolveFirst: () => void;
      const firstPromise = new Promise<void>((resolve) => {
        resolveFirst = resolve;
      });

      const mockFetch = vi.fn().mockImplementation(() => {
        return firstPromise.then(() => ({
          ok: true,
          json: () => Promise.resolve({ success: true, data: { text: "Generated" } }),
        }));
      });

      global.fetch = mockFetch;

      const { result } = renderHook(() => useAIFullCampaignGeneration());

      // Start generation
      act(() => {
        result.current.generate(defaultParams);
      });

      // Cancel immediately
      act(() => {
        result.current.cancel();
      });

      // Resolve the pending request
      resolveFirst!();

      await waitFor(() => {
        expect(result.current.isGenerating).toBe(false);
      });
    });
  });

  describe("Reset", () => {
    it("resets hook state", async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: { message: "Error" } }),
      });

      global.fetch = mockFetch;

      const { result } = renderHook(() => useAIFullCampaignGeneration());

      await act(async () => {
        await result.current.generate(defaultParams);
      });

      expect(result.current.error).not.toBeNull();

      act(() => {
        result.current.reset();
      });

      expect(result.current.error).toBeNull();
      expect(result.current.progress).toBeNull();
      expect(result.current.isGenerating).toBe(false);
    });
  });
});
