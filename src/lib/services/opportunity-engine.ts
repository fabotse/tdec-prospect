import type {
  LeadTracking,
  OpportunityConfig,
  OpportunityLead,
  OpportunityQualifier,
} from "@/types/tracking";

export const DEFAULT_MIN_OPENS = 3;
export const DEFAULT_PERIOD_DAYS = 7;

/**
 * Story 21.6 — clique é sinal mais raro e mais forte que abertura, então
 * qualifica com apenas 1. Constante fixa (NÃO configurável em OpportunityConfig):
 * mantém intactas as 4 superfícies do threshold de aberturas (type, migration,
 * rota /opportunity-config, input do ThresholdConfig). Ver Dev Notes 21.6.
 */
export const MIN_CLICKS_FOR_OPPORTUNITY = 1;

/** Último engajamento = o mais recente entre abertura e clique (null se ambos nulos). */
function computeLastEngagementAt(
  lastOpenAt: string | null,
  lastClickAt: string | null
): string | null {
  if (!lastOpenAt) return lastClickAt;
  if (!lastClickAt) return lastOpenAt;
  return new Date(lastClickAt) > new Date(lastOpenAt) ? lastClickAt : lastOpenAt;
}

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
    .map((lead) => {
      // Aberturas: comportamento atual preservado byte-a-byte (openCount >= minOpens
      // E lastOpenAt não-nulo E dentro da janela). Sem opens → não qualifica por opens.
      const qualifiesByOpens =
        lead.openCount >= config.minOpens &&
        lead.lastOpenAt != null &&
        new Date(lead.lastOpenAt) >= cutoff;

      // Cliques (Story 21.6): ramo INDEPENDENTE do lastOpenAt — um lead só-clique
      // (clickCount>0, openCount=0) tem lastOpenAt=null e NÃO pode ser descartado
      // por isso (Trap #1 das Dev Notes). Sem timestamp de clique, ainda qualifica
      // (não há como filtrar por janela; o clique aconteceu).
      const qualifiesByClicks =
        lead.clickCount >= MIN_CLICKS_FOR_OPPORTUNITY &&
        (lead.lastClickAt == null || new Date(lead.lastClickAt) >= cutoff);

      return { lead, qualifiesByOpens, qualifiesByClicks };
    })
    .filter(({ qualifiesByOpens, qualifiesByClicks }) => qualifiesByOpens || qualifiesByClicks)
    .map(({ lead, qualifiesByOpens, qualifiesByClicks }) => {
      const qualifiedBy: OpportunityQualifier =
        qualifiesByOpens && qualifiesByClicks
          ? "both"
          : qualifiesByClicks
            ? "clicks"
            : "opens";

      return {
        ...lead,
        qualifiedAt: now.toISOString(),
        isInOpportunityWindow: true,
        qualifiedBy,
        lastEngagementAt: computeLastEngagementAt(lead.lastOpenAt, lead.lastClickAt),
      };
    });
}
