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

/**
 * Story 23.8 — sentinelas que o mapeamento de ESG produz sem haver gateway real:
 * "Not Found" (código 0 na API) e "Unknown(0)". Hoje, sem gateway, a API omite
 * `esg_code` (→ undefined), mas os sentinelas continuam tratados como "sem ESG".
 */
const NO_GATEWAY_SENTINELS = new Set(["Not Found", "Unknown(0)"]);

/**
 * Story 23.8 — um lead "tem ESG" (security gateway: Proofpoint, Mimecast,
 * Barracuda, Cisco...) quando `esgCode` é string não vazia e não é sentinela.
 * Regra única usada pelo motor e pela rota GET /api/opportunities.
 */
export function hasSecurityGateway(esgCode: string | null | undefined): boolean {
  if (typeof esgCode !== "string") return false;
  const trimmed = esgCode.trim();
  return trimmed.length > 0 && !NO_GATEWAY_SENTINELS.has(trimmed);
}

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
      // Story 23.8: gateway de segurança abre e clica para escanear — esses
      // sinais não são interesse humano. Lead com ESG nunca qualifica por
      // engajamento (respostas seguem por outro pipeline e não passam aqui).
      if (hasSecurityGateway(lead.esgCode)) {
        return { lead, qualifiesByOpens: false, qualifiesByClicks: false };
      }

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
