/**
 * Unit Tests for ExportStep.buildPreviewData()
 * Story 17.6 - Task 7: Override buildPreviewData to send summary data
 */

import { describe, it, expect, vi } from "vitest";

// Mock dependencies before importing
vi.mock("@/lib/services/instantly", () => ({
  InstantlyService: vi.fn(),
  textToEmailHtml: vi.fn((t: string) => t),
}));
vi.mock("@/lib/services/base-service", () => ({
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
}));

import { ExportStep } from "@/lib/agent/steps/export-step";
import type { StepOutput } from "@/types/agent";

// ==============================================
// HELPERS
// ==============================================

function createMockResult(): StepOutput {
  return {
    success: true,
    data: {
      externalCampaignId: "camp-ext-001",
      campaignName: "Campanha React - 25/03/2026",
      totalEmails: 3,
      leadsUploaded: 42,
      duplicatedLeads: 2,
      invalidEmails: 1,
      accountsAdded: 3,
      platform: "instantly",
    } as unknown as Record<string, unknown>,
  };
}

// ==============================================
// TESTS
// ==============================================

describe("ExportStep.buildPreviewData() (Story 17.6 Task 7)", () => {
  it("returns summary data for activation gate", () => {
    const mockSupabase = {} as never;
    const step = new ExportStep(4, mockSupabase, "tenant-1");

    const preview = (step as unknown as { buildPreviewData(r: StepOutput): unknown })
      .buildPreviewData(createMockResult());

    const data = preview as Record<string, unknown>;
    expect(data.externalCampaignId).toBe("camp-ext-001");
    expect(data.campaignName).toBe("Campanha React - 25/03/2026");
    expect(data.totalEmails).toBe(3);
    expect(data.leadsUploaded).toBe(42);
    expect(data.accountsAdded).toBe(3);
    expect(data.platform).toBe("instantly");
  });

  it("does not include duplicatedLeads or invalidEmails in preview", () => {
    const mockSupabase = {} as never;
    const step = new ExportStep(4, mockSupabase, "tenant-1");

    const preview = (step as unknown as { buildPreviewData(r: StepOutput): unknown })
      .buildPreviewData(createMockResult());

    const data = preview as Record<string, unknown>;
    expect(data).not.toHaveProperty("duplicatedLeads");
    expect(data).not.toHaveProperty("invalidEmails");
  });
});
