/**
 * lead-screening.ts — triagem dos resultados da busca de leads do agente (Story 24.15).
 *
 * - Órgão público: pelo nome da organização (o `api_search` da Apollo não devolve indústria).
 *   Só marca — a revisão oculta e permite incluir.
 * - Suprimido / já contatado: regra existente até a lista de supressão da 23.5 —
 *   `nao_interessado` = pediu para sair (suprimido); `em_campanha`/`interessado`/`oportunidade`
 *   = já abordado; oportunidade em negociação (`SUPPRESSING_OPPORTUNITY_STATUSES`) = suprimido.
 *
 * Fail-open: erro de leitura → `console.warn` e mapa vazio (nada removido, nada sinalizado).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { LeadScreeningSummary, SearchLeadResult } from "@/types/agent";
import { SUPPRESSING_OPPORTUNITY_STATUSES } from "@/lib/agent/account-suppression";

export type LeadContactStatus = "suppressed" | "already_contacted";

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Termos (normalizados) de órgão público no nome da organização. */
const PUBLIC_SECTOR_TERMS = [
  "prefeitura",
  "camara municipal",
  "camara dos deputados",
  "assembleia legislativa",
  "governo do ",
  "governo de ",
  "governo da ",
  "secretaria municipal",
  "secretaria estadual",
  "secretaria de estado",
  "ministerio",
  "autarquia",
  "tribunal",
  "poder judiciario",
  "ministerio publico",
  "defensoria publica",
  "senado federal",
  "municipio de",
  "universidade federal",
  "universidade estadual",
  "instituto federal",
  "policia militar",
  "policia civil",
  "policia federal",
  "receita federal",
  "banco central do brasil",
  "exercito brasileiro",
  "marinha do brasil",
  "forca aerea brasileira",
];

/** Termos que só valem como palavra inteira (evita casar dentro de outra palavra). */
const PUBLIC_SECTOR_WORDS = ["detran"];

/** true quando o nome da organização indica órgão público. */
export function isPublicSectorOrganization(companyName: string | null | undefined): boolean {
  if (!companyName) return false;
  const name = normalize(companyName);
  if (!name) return false;
  if (PUBLIC_SECTOR_TERMS.some((term) => name.includes(term))) return true;
  return PUBLIC_SECTOR_WORDS.some((word) => new RegExp(`(^|[^a-z0-9])${word}([^a-z0-9]|$)`).test(name));
}

const SUPPRESSED_LEAD_STATUSES = new Set(["nao_interessado"]);
const CONTACTED_LEAD_STATUSES = new Set(["em_campanha", "interessado", "oportunidade"]);

/**
 * Status de contato por `apollo_id` dos leads já existentes no tenant. Leads novos não entram
 * no mapa. Nunca lança.
 */
export async function findContactedLeads(
  supabase: SupabaseClient,
  tenantId: string,
  apolloIds: Array<string | null | undefined>
): Promise<Map<string, LeadContactStatus>> {
  const result = new Map<string, LeadContactStatus>();
  const ids = Array.from(new Set(apolloIds.filter((id): id is string => Boolean(id))));
  if (ids.length === 0) return result;

  try {
    const { data: leads, error } = await supabase
      .from("leads")
      .select("id, apollo_id, status")
      .eq("tenant_id", tenantId)
      .in("apollo_id", ids);

    if (error) {
      console.warn("[lead-screening] leitura de leads falhou:", error);
      return new Map();
    }

    const rows = (leads ?? []) as Array<{ id?: string; apollo_id?: string | null; status?: string }>;
    const apolloIdByLeadId = new Map<string, string>();
    for (const row of rows) {
      if (!row.apollo_id) continue;
      if (row.id) apolloIdByLeadId.set(row.id, row.apollo_id);
      if (row.status && SUPPRESSED_LEAD_STATUSES.has(row.status)) {
        result.set(row.apollo_id, "suppressed");
      } else if (
        row.status &&
        CONTACTED_LEAD_STATUSES.has(row.status) &&
        result.get(row.apollo_id) !== "suppressed"
      ) {
        result.set(row.apollo_id, "already_contacted");
      }
    }

    const leadIds = Array.from(apolloIdByLeadId.keys());
    if (leadIds.length > 0) {
      const { data: opportunities, error: oppError } = await supabase
        .from("opportunities")
        .select("lead_id, status")
        .eq("tenant_id", tenantId)
        .in("lead_id", leadIds)
        .in("status", [...SUPPRESSING_OPPORTUNITY_STATUSES]);

      if (oppError) {
        // Fail-open parcial: mantem os status ja lidos dos leads.
        console.warn("[lead-screening] leitura de oportunidades falhou:", oppError);
        return result;
      }

      for (const opp of (opportunities ?? []) as Array<{ lead_id?: string | null }>) {
        const apolloId = opp.lead_id ? apolloIdByLeadId.get(opp.lead_id) : undefined;
        if (apolloId) result.set(apolloId, "suppressed");
      }
    }

    return result;
  } catch (error) {
    console.warn("[lead-screening] leitura de leads falhou:", error);
    return new Map();
  }
}

export interface ScreenLeadsResult<T extends SearchLeadResult> {
  /** Leads restantes, na ordem original, anotados com `publicSector`/`contactStatus`. */
  leads: T[];
  suppressedCount: number;
  /** Índice original de cada lead restante (para casar com a lista de origem). */
  keptIndexes: number[];
}

/** Remove os suprimidos e anota os restantes (órgão público, já contatado). */
export function screenLeads<T extends SearchLeadResult>(
  leads: T[],
  contactMap: Map<string, LeadContactStatus>
): ScreenLeadsResult<T> {
  const kept: T[] = [];
  const keptIndexes: number[] = [];
  let suppressedCount = 0;

  leads.forEach((lead, index) => {
    const status = lead.apolloId ? contactMap.get(lead.apolloId) : undefined;
    if (status === "suppressed") {
      suppressedCount++;
      return;
    }
    const annotated: T = { ...lead };
    if (isPublicSectorOrganization(lead.companyName)) annotated.publicSector = true;
    if (status === "already_contacted") annotated.contactStatus = "already_contacted";
    kept.push(annotated);
    keptIndexes.push(index);
  });

  return { leads: kept, suppressedCount, keptIndexes };
}

/** Lead que pode entrar na pré-seleção (nem órgão público, nem já contatado). */
export function isReviewEligible(lead: Pick<SearchLeadResult, "publicSector" | "contactStatus">): boolean {
  return !lead.publicSector && !lead.contactStatus;
}

/** Contagens da triagem sobre a lista já triada. */
export function summarizeScreening(
  leads: Array<Pick<SearchLeadResult, "publicSector" | "contactStatus">>,
  suppressed: number
): LeadScreeningSummary {
  return {
    suppressed,
    publicSector: leads.filter((l) => l.publicSector).length,
    alreadyContacted: leads.filter((l) => l.contactStatus === "already_contacted").length,
  };
}

/**
 * Ordem da revisão: elegíveis primeiro, depois já contatados, depois órgãos públicos. Estável:
 * dentro de cada grupo mantém a ordem recebida (ex.: Fit Score A→B→C).
 */
export function orderByScreening<T extends Pick<SearchLeadResult, "publicSector" | "contactStatus">>(
  leads: T[]
): T[] {
  const rank = (l: T) => (l.publicSector ? 2 : l.contactStatus ? 1 : 0);
  return leads
    .map((lead, i) => ({ lead, i }))
    .sort((a, b) => rank(a.lead) - rank(b.lead) || a.i - b.i)
    .map((x) => x.lead);
}

/** Mensagem do step quando a triagem removeu suprimidos. */
export function suppressedLeadsMessage(count: number): string {
  return `Removi ${count} lead(s) suprimido(s) (pediram para sair ou estao em negociacao).`;
}
