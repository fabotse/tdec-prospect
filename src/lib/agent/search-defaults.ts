/**
 * search-defaults.ts — defaults de qualidade da BUSCA ABERTA (Story 22.6, FR12).
 *
 * Leaf module puro (só tipos + constantes + função pura, zero import de runtime
 * pesado), no molde de `lt-interest.ts` (21.3) e `ACTIVE_OPPORTUNITY_STATUSES`
 * (types/opportunity.ts). É a SINGLE SOURCE OF TRUTH do piso de tamanho de empresa
 * aplicado quando o usuário faz uma busca direta (sem tech) e NÃO especifica tamanho.
 *
 * Três consumidores chamam `resolveDirectSearchCompanySizes`:
 *   1. SearchLeadsStep (execução) — monta `filters.companySizes` no ramo isDirectEntry
 *   2. PlanGeneratorService (plano) — exibe o tamanho efetivo antes da confirmação
 *   3. generateBriefingSummary (resumo) — nota amigável "11+ padrão de qualidade"
 * → nunca há drift entre "o que o plano diz" e "o que o Apollo recebe".
 */

import type { ParsedBriefing } from "@/types/agent";

/**
 * Faixas de qualidade aplicadas por padrão na busca direta quando o usuário não
 * informou tamanho. São os buckets canônicos do app (filter-extraction.ts:14 —
 * fonte de verdade dos filtros de busca) MENOS "1-10", que é o "raso" que queima
 * crédito Apollo (AC1). Mantém o alcance máximo cortando só as micro-empresas.
 * O Apollo converte cada faixa "11-50" → "11,50" em organization_num_employees_ranges.
 */
export const QUALITY_MIN_COMPANY_SIZES = [
  "11-50",
  "51-200",
  "201-500",
  "501-1000",
  "1001-5000",
  "5001-10000",
  "10001+",
] as const;

/** Rótulo amigável do piso de qualidade, para o plano e o resumo do briefing. */
export const QUALITY_MIN_COMPANY_SIZE_LABEL = "11+";

export interface EffectiveCompanySizes {
  companySizes: string[];
  /** true quando o piso de qualidade foi aplicado (usuário não informou tamanho). */
  defaultsApplied: boolean;
}

/**
 * Resolve as faixas de tamanho efetivas de uma busca direta.
 *
 * - Usuário informou `companySize` → override TOTAL: `[briefing.companySize]`,
 *   defaults NÃO são mesclados (AC2 é sagrado).
 * - Não informou (`companySize` null) → aplica o piso de qualidade.
 */
export function resolveDirectSearchCompanySizes(
  briefing: Pick<ParsedBriefing, "companySize">
): EffectiveCompanySizes {
  if (briefing.companySize) {
    return { companySizes: [briefing.companySize], defaultsApplied: false };
  }
  return { companySizes: [...QUALITY_MIN_COMPANY_SIZES], defaultsApplied: true };
}
