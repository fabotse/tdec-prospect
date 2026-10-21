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

/**
 * Story 24.14: faixas canonicas da Apollo, em ordem crescente. `"1-10"` + as do piso.
 * Usadas para ordenar os defaults do ICP e montar o rotulo amigavel.
 */
export const APOLLO_COMPANY_SIZE_BUCKETS = ["1-10", ...QUALITY_MIN_COMPANY_SIZES] as const;

/** De onde veio o porte efetivo da busca direta. */
export type CompanySizeSource = "user" | "icp" | "quality";

export interface EffectiveCompanySizes {
  companySizes: string[];
  /** true quando o piso de qualidade foi aplicado (sem tamanho do usuario e sem ICP). */
  defaultsApplied: boolean;
  /** Story 24.14: origem das faixas — usuario, ICP do tenant ou piso de qualidade. */
  source: CompanySizeSource;
}

/**
 * Resolve as faixas de tamanho efetivas de uma busca direta.
 *
 * - Usuário informou `companySize` → override TOTAL: `[briefing.companySize]`,
 *   defaults NÃO são mesclados (AC2 é sagrado).
 * - Story 24.14: senão, as faixas do ICP (`icpDefaults.companySizes`) quando houver.
 * - Senão → aplica o piso de qualidade.
 */
export function resolveDirectSearchCompanySizes(
  briefing: Pick<ParsedBriefing, "companySize" | "icpDefaults">
): EffectiveCompanySizes {
  if (briefing.companySize) {
    return { companySizes: [briefing.companySize], defaultsApplied: false, source: "user" };
  }
  const icpSizes = briefing.icpDefaults?.companySizes ?? [];
  if (icpSizes.length > 0) {
    return { companySizes: [...icpSizes], defaultsApplied: false, source: "icp" };
  }
  return {
    companySizes: [...QUALITY_MIN_COMPANY_SIZES],
    defaultsApplied: true,
    source: "quality",
  };
}

// ==============================================
// Story 24.14 — localizacao efetiva (usuario > ICP)
// ==============================================

export interface EffectiveSearchLocations {
  locations: string[];
  /** true quando os locais vieram do ICP (o usuario nao informou localizacao). */
  fromIcp: boolean;
}

/**
 * Localizacao efetiva da busca de leads: o `location` do usuario vence; senao, os locais
 * do ICP; senao, nenhum.
 */
export function resolveSearchLocations(
  briefing: Pick<ParsedBriefing, "location" | "icpDefaults">
): EffectiveSearchLocations {
  if (briefing.location) {
    return { locations: [briefing.location], fromIcp: false };
  }
  const icpLocations = briefing.icpDefaults?.locations ?? [];
  if (icpLocations.length > 0) {
    return { locations: [...icpLocations], fromIcp: true };
  }
  return { locations: [], fromIcp: false };
}

/** true quando a busca tem alguma localizacao efetiva (do usuario ou do ICP). */
export function hasSearchLocation(
  briefing: Pick<ParsedBriefing, "location" | "icpDefaults">
): boolean {
  return resolveSearchLocations(briefing).locations.length > 0;
}

/** Inicio/fim numerico de uma faixa canonica ("201-500" -> 201/500, "10001+" -> 10001/null). */
function bucketBounds(bucket: string): { lo: string; hi: string | null } {
  if (bucket.endsWith("+")) return { lo: bucket.slice(0, -1), hi: null };
  const [lo, hi] = bucket.split("-");
  return { lo, hi: hi ?? lo };
}

/**
 * Rotulo amigavel de um conjunto de faixas canonicas.
 * - Faixas contiguas viram um intervalo com travessao ("201-500"+"501-1000" -> "201–1000").
 * - Faixa aberta no fim -> "501+".
 * - Grupos nao contiguos sao juntados com ", " ("11–50, 501–1000").
 * Faixas fora do canonico entram verbatim no fim.
 */
export function formatCompanySizesLabel(buckets: string[]): string {
  const canonical: readonly string[] = APOLLO_COMPANY_SIZE_BUCKETS;
  const indexes = Array.from(
    new Set(buckets.map((b) => canonical.indexOf(b)).filter((i) => i >= 0))
  ).sort((a, b) => a - b);
  const unknown = Array.from(new Set(buckets.filter((b) => !canonical.includes(b))));

  const parts: string[] = [];
  let runStart = -1;
  for (let k = 0; k < indexes.length; k++) {
    if (runStart < 0) runStart = indexes[k];
    const next = indexes[k + 1];
    if (next === indexes[k] + 1) continue;
    const { lo } = bucketBounds(canonical[runStart]);
    const { hi } = bucketBounds(canonical[indexes[k]]);
    parts.push(hi === null ? `${lo}+` : `${lo}–${hi}`);
    runStart = -1;
  }
  return [...parts, ...unknown].join(", ");
}

// ==============================================
// Story 22.14 — filtros da busca direta (SSOT)
// ==============================================

/**
 * `type` e não `interface` de propósito: só um type alias de object literal ganha index
 * signature implícita em TS, e estes filtros precisam fluir para consumidores tipados como
 * `Record<string, unknown>` (o `searchFilters` que vai para o JSONB do step e para o
 * diagnóstico da 22.14) sem cast.
 */
export type DirectSearchFilters = {
  titles: string[];
  perPage: number;
  page: number;
  companySizes: string[];
  locations?: string[];
  industries?: string[];
};

/**
 * Monta os filtros da BUSCA DIRETA na Apollo a partir do briefing.
 *
 * Story 22.14: extraído de `SearchLeadsStep` para ser a fonte única de DOIS consumidores —
 * a busca real (`perPage: 25`) e a contagem de viabilidade pré-execução (`perPage: 1`, AC7).
 * Se os dois montassem os filtros por conta própria, o "estimativa: N resultados" mostrado
 * antes do "Iniciar Execução" poderia divergir do que a busca de fato faz — uma estimativa
 * que mente é pior do que estimativa nenhuma.
 */
export function buildDirectSearchFilters(
  briefing: Pick<
    ParsedBriefing,
    "jobTitles" | "location" | "industry" | "companySize" | "icpDefaults"
  >,
  perPage: number
): DirectSearchFilters {
  const { companySizes } = resolveDirectSearchCompanySizes(briefing);
  // Story 24.14: local do usuario, senao os do ICP.
  const { locations } = resolveSearchLocations(briefing);

  return {
    titles: briefing.jobTitles,
    perPage,
    page: 1,
    companySizes,
    ...(locations.length > 0 ? { locations } : {}),
    ...(briefing.industry ? { industries: [briefing.industry] } : {}),
  };
}
