import type {
  LeadTracking,
  OpportunityConfig,
  OpportunityLead,
} from "@/types/tracking";

export const DEFAULT_MIN_OPENS = 3;
export const DEFAULT_PERIOD_DAYS = 7;

export function getDefaultConfig(campaignId: string): OpportunityConfig {
  return {
    id: "",
    tenantId: "",
    campaignId,
    minOpens: DEFAULT_MIN_OPENS,
    periodDays: DEFAULT_PERIOD_DAYS,
    isActive: true,
    createdAt: "",
    updatedAt: "",
  };
}

export function evaluateOpportunityWindow(
  leads: LeadTracking[],
  config: OpportunityConfig
): OpportunityLead[] {
  const now = new Date();
  const cutoff = new Date(
    now.getTime() - config.periodDays * 24 * 60 * 60 * 1000
  );

  return leads
    .filter((lead) => {
      if (lead.openCount < config.minOpens) return false;
      if (!lead.lastOpenAt) return false;
      const lastOpen = new Date(lead.lastOpenAt);
      return lastOpen >= cutoff;
    })
    .map((lead) => ({
      ...lead,
      qualifiedAt: now.toISOString(),
      isInOpportunityWindow: true,
    }));
}
