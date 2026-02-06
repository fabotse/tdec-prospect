/**
 * useCampaignExport Hook Tests
 * Story 7.4: Export Dialog UI com Preview de Variáveis
 * AC: #1 - Platform options, #2 - Lead summary, #3 - Lead selection, #5 - Previous export
 *
 * Tests: platform options, lead summary, previous export detection
 */

import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useCampaignExport } from "@/hooks/use-campaign-export";
import type { Campaign } from "@/types/campaign";
import type { IntegrationConfigState } from "@/types/integration";

// ==============================================
// TEST HELPERS
// ==============================================

interface TestLeadInfo {
  email: string | null;
  icebreaker?: string | null;
}

function createLead(overrides: Partial<TestLeadInfo> = {}): TestLeadInfo {
  return {
    email: "joao@test.com",
    icebreaker: "Vi seu post sobre IA...",
    ...overrides,
  };
}

function createCampaign(overrides: Partial<Campaign> = {}): Campaign {
  return {
    id: "c-1",
    tenantId: "t-1",
    name: "Campanha Teste",
    status: "draft",
    productId: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    externalCampaignId: null,
    exportPlatform: null,
    exportedAt: null,
    exportStatus: null,
    ...overrides,
  };
}

function createIntegrationConfig(
  overrides: Partial<IntegrationConfigState> = {}
): IntegrationConfigState {
  return {
    serviceName: "instantly" as IntegrationConfigState["serviceName"],
    status: "not_configured",
    maskedKey: null,
    updatedAt: null,
    error: null,
    connectionStatus: "untested",
    lastTestResult: null,
    ...overrides,
  };
}

describe("useCampaignExport", () => {
  // ==============================================
  // PLATFORM OPTIONS (AC: #1)
  // ==============================================

  describe("platformOptions", () => {
    it("returns 4 platform options", () => {
      const { result } = renderHook(() =>
        useCampaignExport({
          leads: [],
          campaign: createCampaign(),
          integrationConfigs: {},
        })
      );

      expect(result.current.platformOptions).toHaveLength(4);
      expect(result.current.platformOptions.map((p) => p.platform)).toEqual([
        "instantly",
        "snovio",
        "csv",
        "clipboard",
      ]);
    });

    it("marks CSV and clipboard as always configured/connected", () => {
      const { result } = renderHook(() =>
        useCampaignExport({
          leads: [],
          campaign: createCampaign(),
          integrationConfigs: {},
        })
      );

      const csv = result.current.platformOptions.find((p) => p.platform === "csv")!;
      const clipboard = result.current.platformOptions.find((p) => p.platform === "clipboard")!;

      expect(csv.configured).toBe(true);
      expect(csv.connectionStatus).toBe("connected");
      expect(clipboard.configured).toBe(true);
      expect(clipboard.connectionStatus).toBe("connected");
    });

    it("marks Instantly as not_configured when no config exists", () => {
      const { result } = renderHook(() =>
        useCampaignExport({
          leads: [],
          campaign: createCampaign(),
          integrationConfigs: {},
        })
      );

      const instantly = result.current.platformOptions.find((p) => p.platform === "instantly")!;
      expect(instantly.configured).toBe(false);
      expect(instantly.connectionStatus).toBe("not_configured");
    });

    it("marks Instantly as connected when integration is connected", () => {
      const configs: Record<string, IntegrationConfigState> = {
        instantly: createIntegrationConfig({
          serviceName: "instantly" as IntegrationConfigState["serviceName"],
          status: "configured",
          connectionStatus: "connected",
        }),
      };

      const { result } = renderHook(() =>
        useCampaignExport({
          leads: [],
          campaign: createCampaign(),
          integrationConfigs: configs,
        })
      );

      const instantly = result.current.platformOptions.find((p) => p.platform === "instantly")!;
      expect(instantly.configured).toBe(true);
      expect(instantly.connectionStatus).toBe("connected");
    });

    it("includes export record for matching platform", () => {
      const campaign = createCampaign({
        exportPlatform: "instantly",
        externalCampaignId: "ext-123",
        exportedAt: "2026-02-06T10:00:00Z",
        exportStatus: "success",
      });

      const { result } = renderHook(() =>
        useCampaignExport({
          leads: [],
          campaign,
          integrationConfigs: {},
        })
      );

      const instantly = result.current.platformOptions.find((p) => p.platform === "instantly")!;
      expect(instantly.exportRecord).not.toBeNull();
      expect(instantly.exportRecord!.exportPlatform).toBe("instantly");

      const snovio = result.current.platformOptions.find((p) => p.platform === "snovio")!;
      expect(snovio.exportRecord).toBeNull();
    });
  });

  // ==============================================
  // LEAD SUMMARY (AC: #2, #3)
  // ==============================================

  describe("leadSummary", () => {
    it("calculates correct summary for mixed leads", () => {
      const leads = [
        createLead({ email: "a@b.com", icebreaker: "Oi" }),
        createLead({ email: "c@d.com", icebreaker: null }),
        createLead({ email: null, icebreaker: "Hello" }),
      ];

      const { result } = renderHook(() =>
        useCampaignExport({
          leads,
          campaign: createCampaign(),
          integrationConfigs: {},
        })
      );

      expect(result.current.leadSummary.totalLeads).toBe(3);
      expect(result.current.leadSummary.leadsWithEmail).toBe(2);
      expect(result.current.leadSummary.leadsWithoutEmail).toBe(1);
      expect(result.current.leadSummary.leadsWithoutIcebreaker).toBe(1);
    });

    it("returns zeros for empty leads", () => {
      const { result } = renderHook(() =>
        useCampaignExport({
          leads: [],
          campaign: createCampaign(),
          integrationConfigs: {},
        })
      );

      expect(result.current.leadSummary.totalLeads).toBe(0);
      expect(result.current.leadSummary.leadsWithEmail).toBe(0);
      expect(result.current.leadSummary.leadsWithoutEmail).toBe(0);
      expect(result.current.leadSummary.leadsWithoutIcebreaker).toBe(0);
    });
  });

  // ==============================================
  // PREVIOUS EXPORT (AC: #5)
  // ==============================================

  describe("previousExport", () => {
    it("returns null when campaign has no export record", () => {
      const { result } = renderHook(() =>
        useCampaignExport({
          leads: [],
          campaign: createCampaign(),
          integrationConfigs: {},
        })
      );

      expect(result.current.previousExport).toBeNull();
    });

    it("returns export record when campaign was previously exported", () => {
      const campaign = createCampaign({
        exportPlatform: "snovio",
        externalCampaignId: "snovio-123",
        exportedAt: "2026-02-06T10:00:00Z",
        exportStatus: "success",
      });

      const { result } = renderHook(() =>
        useCampaignExport({
          leads: [],
          campaign,
          integrationConfigs: {},
        })
      );

      expect(result.current.previousExport).not.toBeNull();
      expect(result.current.previousExport!.exportPlatform).toBe("snovio");
      expect(result.current.previousExport!.exportedAt).toBe("2026-02-06T10:00:00Z");
    });

    it("returns null when campaign is null", () => {
      const { result } = renderHook(() =>
        useCampaignExport({
          leads: [],
          campaign: null,
          integrationConfigs: {},
        })
      );

      expect(result.current.previousExport).toBeNull();
    });
  });
});
