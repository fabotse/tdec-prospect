/**
 * Tests: useAIFullCampaignGeneration - Icebreaker Variable Validation
 * Story 9.4: Variável {{ice_breaker}} na Geração de Campanha AI
 *
 * AC #1: Full campaign generation does NOT pass icebreaker in variables
 * AC #1: Follow-up emails also do NOT pass icebreaker
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAIFullCampaignGeneration } from "@/hooks/use-ai-full-campaign-generation";
import type { BuilderBlock } from "@/stores/use-builder-store";

// Track all fetch calls to inspect variables
const fetchCalls: { promptKey: string; variables: Record<string, string> }[] = [];

// Mock fetch to capture API calls
global.fetch = vi.fn().mockImplementation(async (_url: string, options: RequestInit) => {
  const body = JSON.parse(options.body as string);
  fetchCalls.push({ promptKey: body.promptKey, variables: body.variables });

  return {
    ok: true,
    json: async () => ({
      success: true,
      data: { text: body.promptKey.includes("subject") ? "Test Subject" : "Test Body" },
    }),
  };
}) as unknown as typeof fetch;

function createEmailBlock(id: string, position: number, emailMode: "initial" | "follow-up" = "initial"): BuilderBlock {
  return {
    id,
    type: "email",
    position,
    data: {
      subject: "",
      body: "",
      emailMode,
      strategicContext: `Email ${position + 1} context`,
    },
  };
}

describe("useAIFullCampaignGeneration - Icebreaker Variable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchCalls.length = 0;
  });

  it("should NOT include icebreaker in baseVariables for initial emails", async () => {
    const { result } = renderHook(() => useAIFullCampaignGeneration());

    const blocks = [
      createEmailBlock("email-1", 0, "initial"),
    ];

    await act(async () => {
      await result.current.generate({
        blocks,
        campaignId: "campaign-1",
        productId: null,
        productName: null,
        objective: "cold_outreach",
        tone: "formal",
      });
    });

    // Should have made 2 fetch calls (subject + body)
    expect(fetchCalls.length).toBe(2);

    // Subject call - icebreaker should be empty (triggers {{else}} in prompt)
    expect(fetchCalls[0].promptKey).toBe("email_subject_generation");
    expect(fetchCalls[0].variables.icebreaker ?? "").toBe("");

    // Body call - icebreaker should be empty (triggers {{else}} in prompt)
    expect(fetchCalls[1].promptKey).toBe("email_body_generation");
    expect(fetchCalls[1].variables.icebreaker ?? "").toBe("");
  });

  it("should NOT include icebreaker in baseVariables for follow-up emails", async () => {
    const { result } = renderHook(() => useAIFullCampaignGeneration());

    const blocks = [
      createEmailBlock("email-1", 0, "initial"),
      { id: "delay-1", type: "delay" as const, position: 1, data: { days: 3 } },
      createEmailBlock("email-2", 2, "follow-up"),
    ];

    await act(async () => {
      await result.current.generate({
        blocks,
        campaignId: "campaign-1",
        productId: null,
        productName: null,
        objective: "cold_outreach",
        tone: "formal",
      });
    });

    // Should have 4 fetch calls (2 per email: subject + body)
    expect(fetchCalls.length).toBe(4);

    // All calls should have icebreaker empty (not personalized)
    for (const call of fetchCalls) {
      expect(call.variables.icebreaker ?? "").toBe("");
    }
  });
});
