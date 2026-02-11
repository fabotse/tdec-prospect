"use client";

import { useMemo } from "react";
import type { Campaign } from "@/types/campaign";
import type {
  ExportPlatform,
  ExportDialogPlatformOption,
  LeadExportSummary,
  ExportRecord,
  PlatformConnectionStatus,
} from "@/types/export";
import type { IntegrationStatus, ConnectionStatus } from "@/types/integration";

/**
 * Minimal integration config shape needed by this hook.
 * Compatible with both the hook's internal state and the exported type.
 */
interface MinimalIntegrationConfig {
  status: IntegrationStatus;
  connectionStatus: ConnectionStatus;
}

/**
 * Platform display names (PT-BR)
 */
const PLATFORM_DISPLAY_NAMES: Record<ExportPlatform, string> = {
  instantly: "Instantly",
  snovio: "Snov.io",
  csv: "CSV",
  clipboard: "Clipboard",
};

/**
 * Map integration config status + connection status to PlatformConnectionStatus
 */
function toPlatformConnectionStatus(
  config: MinimalIntegrationConfig | undefined
): PlatformConnectionStatus {
  if (!config || config.status === "not_configured") return "not_configured";
  if (config.connectionStatus === "connected") return "connected";
  if (config.connectionStatus === "error") return "error";
  return "configured";
}

/**
 * Minimal lead shape for export summary calculation.
 * Accepts both Lead and CampaignLeadWithLead.lead shapes.
 */
interface ExportLeadInfo {
  email: string | null;
  icebreaker?: string | null;
}

interface UseCampaignExportParams {
  leads: ExportLeadInfo[];
  campaign: Campaign | null;
  integrationConfigs: Record<string, MinimalIntegrationConfig>;
}

/**
 * Hook to compute export dialog state
 * Story 7.4: AC #1, #2, #3, #5
 *
 * Computes platform options, lead summary, and previous export info
 * from existing data (no additional API calls).
 */
export function useCampaignExport({
  leads,
  campaign,
  integrationConfigs,
}: UseCampaignExportParams) {
  // M4 fix: Single ExportRecord computation shared by platformOptions and previousExport
  const previousExport = useMemo<ExportRecord | null>(() => {
    if (!campaign || !campaign.exportPlatform) return null;
    return {
      campaignId: campaign.id,
      externalCampaignId: campaign.externalCampaignId,
      exportPlatform: campaign.exportPlatform,
      exportedAt: campaign.exportedAt,
      exportStatus: campaign.exportStatus,
    };
  }, [campaign]);

  const platformOptions = useMemo<ExportDialogPlatformOption[]>(() => {
    const platforms: ExportPlatform[] = [
      "instantly",
      "snovio",
      "csv",
      "clipboard",
    ];

    return platforms.map((platform) => {
      const isRemote = platform === "instantly" || platform === "snovio";
      const config = integrationConfigs[platform];

      return {
        platform,
        displayName: PLATFORM_DISPLAY_NAMES[platform],
        configured: isRemote ? toPlatformConnectionStatus(config) !== "not_configured" : true,
        connectionStatus: isRemote ? toPlatformConnectionStatus(config) : "connected",
        exportRecord:
          previousExport && previousExport.exportPlatform === platform
            ? previousExport
            : null,
      };
    });
  }, [previousExport, integrationConfigs]);

  const leadSummary = useMemo<LeadExportSummary>(() => {
    const totalLeads = leads.length;
    const leadsWithEmail = leads.filter((l) => l.email).length;
    const leadsWithoutEmail = totalLeads - leadsWithEmail;
    const leadsWithoutIcebreaker = leads.filter((l) => !l.icebreaker).length;

    return {
      totalLeads,
      leadsWithEmail,
      leadsWithoutEmail,
      leadsWithoutIcebreaker,
    };
  }, [leads]);

  return {
    platformOptions,
    leadSummary,
    previousExport,
    isLoading: false,
  };
}
