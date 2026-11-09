/**
 * Conversa depois da execucao — "mais leads" (Story 24.24)
 *
 * Modulo PURO. Monta o briefing da conversa nova: os mesmos criterios da execucao, com
 * `leadCount = N`. O clique so abre a conversa nova com o card do briefing; a busca so
 * roda depois do Confirmar e do plano com custo, como hoje. O dedupe do Epic 23 ja vale
 * no pipeline.
 */

import type { ParsedBriefing } from "@/types/agent";

/** A execucao tem criterio de busca para repetir? (leads importados nao tem). */
export function hasRepeatableSearch(briefing: ParsedBriefing | null | undefined): boolean {
  if (!briefing) return false;
  if (briefing.importedLeads && briefing.importedLeads.length > 0) return false;
  if (Array.isArray(briefing.skipSteps) && briefing.skipSteps.includes("search_leads")) return false;
  return (
    Boolean(briefing.technology) ||
    (Array.isArray(briefing.jobTitles) && briefing.jobTitles.length > 0) ||
    (Array.isArray(briefing.targetAccounts) && briefing.targetAccounts.length > 0)
  );
}

/**
 * Briefing da nova busca. null com leads importados ou sem criterio de busca. Copia o
 * briefing (sem mutar o original), troca `leadCount` e remove `importedLeads`.
 */
export function buildMoreLeadsBriefing(
  briefing: ParsedBriefing | null | undefined,
  count: number
): ParsedBriefing | null {
  if (!hasRepeatableSearch(briefing) || !briefing) return null;
  const copy: ParsedBriefing = structuredClone(briefing);
  delete copy.importedLeads;
  // Briefing gravado sem `jobTitles` (tecnologia / lista de contas): o card e o seed exigem array.
  if (!Array.isArray(copy.jobTitles)) copy.jobTitles = [];
  copy.leadCount = count;
  return copy;
}
