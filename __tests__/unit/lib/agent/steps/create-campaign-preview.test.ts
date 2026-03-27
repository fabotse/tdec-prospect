/**
 * Unit Tests for CreateCampaignStep.buildPreviewData()
 * Story 17.6 - Task 6: Override buildPreviewData to send complete campaign data
 */

import { describe, it, expect, vi } from "vitest";

// Mock all dependencies before importing
vi.mock("@/lib/services/knowledge-base-context", () => ({
  buildAIVariables: vi.fn(),
}));
vi.mock("@/lib/ai", () => ({
  createAIProvider: vi.fn(),
  promptManager: { renderPrompt: vi.fn() },
}));
vi.mock("@/lib/services/base-service", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...(actual as Record<string, unknown>),
    ExternalServiceError: class extends Error {
      serviceName: string;
      statusCode: number;
      userMessage: string;
      constructor(s: string, c: number, m: string) {
        super(m);
        this.serviceName = s;
        this.statusCode = c;
        this.userMessage = m;
      }
    },
  };
});
vi.mock("@/lib/services/apollo", () => ({
  ApolloService: class { enrichPerson = vi.fn(); },
}));
vi.mock("@/lib/crypto/encryption", () => ({ decryptApiKey: vi.fn() }));
vi.mock("@/types/product", () => ({ transformProductRow: vi.fn() }));
vi.mock("@/types/ai-prompt", () => ({
  ICEBREAKER_CATEGORY_INSTRUCTIONS: { lead: "" },
}));

import { CreateCampaignStep } from "@/lib/agent/steps/create-campaign-step";
import type { StepOutput } from "@/types/agent";

// ==============================================
// HELPERS
// ==============================================

function createMockResult(): StepOutput {
  return {
    success: true,
    data: {
      campaignName: "Campanha React",
      structure: {
        totalEmails: 3,
        totalDays: 5,
        items: [
          { position: 0, type: "email", emailMode: "initial" },
          { position: 1, type: "delay", days: 2 },
          { position: 2, type: "email", emailMode: "follow-up" },
        ],
      },
      emailBlocks: [
        { position: 0, subject: "Assunto 1", body: "Corpo 1", emailMode: "initial" },
        { position: 2, subject: "Follow-up", body: "Corpo 2", emailMode: "follow-up" },
      ],
      delayBlocks: [{ position: 1, delayDays: 2 }],
      leadsWithIcebreakers: [
        { name: "Ana", companyName: "Acme", icebreaker: "Vi que voce usa React" },
      ],
      icebreakerStats: { generated: 1, failed: 0, skipped: 0 },
      totalLeads: 1,
    } as unknown as Record<string, unknown>,
  };
}

// ==============================================
// TESTS
// ==============================================

describe("CreateCampaignStep.buildPreviewData() (Story 17.6 Task 6)", () => {
  it("returns complete campaign data for preview", () => {
    const mockSupabase = {} as never;
    const step = new CreateCampaignStep(3, mockSupabase, "tenant-1");

    // Access protected method via type assertion
    const preview = (step as unknown as { buildPreviewData(r: StepOutput): unknown })
      .buildPreviewData(createMockResult());

    const data = preview as Record<string, unknown>;
    expect(data.campaignName).toBe("Campanha React");
    expect(data.emailBlocks).toHaveLength(2);
    expect(data.leadsWithIcebreakers).toHaveLength(1);
    expect(data.icebreakerStats).toEqual({ generated: 1, failed: 0, skipped: 0 });
    expect(data.totalLeads).toBe(1);
  });

  it("includes structure with totalEmails and totalDays", () => {
    const mockSupabase = {} as never;
    const step = new CreateCampaignStep(3, mockSupabase, "tenant-1");

    const preview = (step as unknown as { buildPreviewData(r: StepOutput): unknown })
      .buildPreviewData(createMockResult());

    const data = preview as Record<string, unknown>;
    const structure = data.structure as { totalEmails: number; totalDays: number };
    expect(structure.totalEmails).toBe(3);
    expect(structure.totalDays).toBe(5);
  });
});
