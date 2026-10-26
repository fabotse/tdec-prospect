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
import { resolveApolloIndustries } from "@/lib/agent/apollo-industries";
import {
  hasUnresolvedAccounts,
  isAccountListMode,
  resolvedAccountDomains,
} from "@/lib/agent/target-accounts";
import { activeReferenceProfile, isLookalikeMode } from "@/lib/agent/reference-accounts";

/** Story 24.18: campos do modo contas parecidas lidos pelos resolvedores abaixo. */
type LookalikeFields = Partial<
  Pick<
    ParsedBriefing,
    | "referenceAccounts"
    | "referenceProfile"
    | "targetAccounts"
    | "suppressedAccounts"
    | "skipSteps"
  >
>;

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
export type CompanySizeSource = "user" | "reference" | "icp" | "quality";

export interface EffectiveCompanySizes {
  companySizes: string[];
  /** true quando o piso de qualidade foi aplicado (sem tamanho do usuario e sem ICP). */
  defaultsApplied: boolean;
  /**
   * Story 24.14: origem das faixas — usuario, ICP do tenant ou piso de qualidade.
   * Story 24.18: `"reference"` = perfil dos clientes de referencia (modo contas parecidas).
   */
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
  briefing: Pick<ParsedBriefing, "companySize" | "icpDefaults"> & LookalikeFields
): EffectiveCompanySizes {
  if (briefing.companySize) {
    return { companySizes: [briefing.companySize], defaultsApplied: false, source: "user" };
  }
  // Story 24.18: no modo contas parecidas com perfil, as faixas dos clientes de referencia.
  const referenceSizes = activeReferenceProfile(briefing)?.companySizes ?? [];
  if (referenceSizes.length > 0) {
    return { companySizes: [...referenceSizes], defaultsApplied: false, source: "reference" };
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
  /** Story 24.18: true quando os locais vieram do perfil dos clientes de referencia. */
  fromReference?: boolean;
}

/**
 * Localizacao efetiva da busca de leads: o `location` do usuario vence; senao, os locais
 * do ICP; senao, nenhum.
 * Story 24.17: no modo lista de contas, so o `location` do usuario (o ICP nao se aplica).
 */
export function resolveSearchLocations(
  briefing: Pick<ParsedBriefing, "location" | "icpDefaults"> & LookalikeFields
): EffectiveSearchLocations {
  if (briefing.location) {
    return { locations: [briefing.location], fromIcp: false };
  }
  if (isAccountListMode(briefing)) {
    return { locations: [], fromIcp: false };
  }
  // Story 24.18: no modo contas parecidas com perfil, a regiao dos clientes de referencia.
  const referenceLocations = activeReferenceProfile(briefing)?.locations ?? [];
  if (referenceLocations.length > 0) {
    return { locations: [...referenceLocations], fromIcp: false, fromReference: true };
  }
  const icpLocations = briefing.icpDefaults?.locations ?? [];
  if (icpLocations.length > 0) {
    return { locations: [...icpLocations], fromIcp: true };
  }
  return { locations: [], fromIcp: false };
}

/**
 * Story 24.15: escopo do local na busca de leads do agente. Padrao = sede da empresa
 * (`organization_locations`); `"person"` so quando o usuario pediu onde a pessoa esta.
 */
export function resolveLocationScope(
  briefing: Partial<Pick<ParsedBriefing, "locationScope">> | null | undefined
): "company" | "person" {
  return briefing?.locationScope === "person" ? "person" : "company";
}

/**
 * Story 24.15: o local no campo certo da Apollo conforme o escopo — `organizationLocations`
 * (sede, padrao) ou `locations` (pessoa). Lista vazia → nada.
 */
export function locationFiltersForScope(
  locations: string[],
  scope: "company" | "person"
): { locations?: string[]; organizationLocations?: string[] } {
  if (locations.length === 0) return {};
  return scope === "person" ? { locations } : { organizationLocations: locations };
}

/** true quando a busca tem alguma localizacao efetiva (do usuario ou do ICP). */
export function hasSearchLocation(
  briefing: Pick<ParsedBriefing, "location" | "icpDefaults"> & LookalikeFields
): boolean {
  return resolveSearchLocations(briefing).locations.length > 0;
}

/**
 * Story 24.17: regra UNICA de avanco da busca (o `canProceed` do `/parse`, o `canConfirm` do
 * card e os `canProceed` reconciliados do hook).
 * - Modo lista de contas: cargos >= 1, >= 1 conta restante e nenhuma conta sem dominio
 *   (localizacao nao e exigida).
 * - Fora dele: cargos + localizacao efetiva (do usuario ou do ICP).
 * - Story 24.18: modo contas parecidas: cargos >= 1, 3-5 referencias resolvidas e perfil
 *   confiante das mesmas referencias (localizacao nao e exigida).
 * O fluxo de leads importados e tratado por cada consumidor, como antes.
 */
export function canProceedWithSearch(
  briefing: Pick<ParsedBriefing, "jobTitles" | "location" | "icpDefaults"> & LookalikeFields
): boolean {
  const hasJobTitles = (briefing.jobTitles?.length ?? 0) > 0;
  if (isAccountListMode(briefing)) {
    return (
      hasJobTitles &&
      (briefing.targetAccounts?.length ?? 0) > 0 &&
      !hasUnresolvedAccounts(briefing.targetAccounts)
    );
  }
  if (isLookalikeMode(briefing)) {
    // `activeReferenceProfile` ja exige referencias suficientes e perfil confiante que casa.
    return hasJobTitles && activeReferenceProfile(briefing) !== null;
  }
  return hasJobTitles && hasSearchLocation(briefing);
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
  // Story 24.15
  organizationLocations?: string[];
  organizationIndustries?: string[];
  includeSimilarTitles: boolean;
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
  > &
    Partial<Pick<ParsedBriefing, "locationScope">> &
    LookalikeFields,
  perPage: number
): DirectSearchFilters {
  const { companySizes } = resolveDirectSearchCompanySizes(briefing);
  // Story 24.14: local do usuario, senao os do ICP.
  const { locations } = resolveSearchLocations(briefing);
  // Story 24.15: sede da empresa por padrao; industria mapeada vai em organization_industries.
  const scope = resolveLocationScope(briefing);
  // Story 24.18: no modo contas parecidas, os setores do perfil (sem setor do usuario), ou o
  // setor do usuario direto quando ele e um dos setores do perfil.
  const referenceIndustries = activeReferenceProfile(briefing)?.industries ?? [];
  const userIndustry = briefing.industry?.trim().toLowerCase() ?? "";
  const apolloIndustries =
    referenceIndustries.length > 0 && !userIndustry
      ? [...referenceIndustries]
      : userIndustry && referenceIndustries.includes(userIndustry)
        ? [userIndustry]
        : resolveApolloIndustries(briefing.industry);

  return {
    titles: briefing.jobTitles,
    perPage,
    page: 1,
    companySizes,
    includeSimilarTitles: false,
    ...locationFiltersForScope(locations, scope),
    ...(apolloIndustries
      ? { organizationIndustries: apolloIndustries }
      : briefing.industry
        ? { industries: [briefing.industry] }
        : {}),
  };
}

// ==============================================
// Story 24.17 — filtros do modo lista de contas (SSOT)
// ==============================================

/** Filtros da busca por dominio do modo lista (mesma forma do ramo por dominios do step). */
export type AccountSearchFilters = {
  domains: string[];
  titles: string[];
  perPage: number;
  page: number;
  locations?: string[];
  includeSimilarTitles: boolean; // Story 24.15
};

/**
 * Monta os filtros da busca do modo lista: dominios das contas resolvidas + cargos. Porte e
 * industria nao entram (como no ramo por dominios de hoje), e o local so quando o usuario
 * informou um (o ICP nao se aplica). Fonte unica da busca real e da viabilidade do `/plan`.
 */
export function buildAccountSearchFilters(
  briefing: Pick<ParsedBriefing, "jobTitles" | "location" | "targetAccounts">,
  perPage: number
): AccountSearchFilters {
  const location = briefing.location?.trim();
  return {
    domains: resolvedAccountDomains(briefing.targetAccounts),
    titles: briefing.jobTitles,
    perPage,
    page: 1,
    includeSimilarTitles: false,
    ...(location ? { locations: [location] } : {}),
  };
}
