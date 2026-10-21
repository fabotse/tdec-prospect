/**
 * icp-briefing.ts — briefing a partir do ICP do tenant (Story 24.14).
 *
 * Leaf module PURO e client-safe (só tipos + funções puras). A leitura do ICP na
 * `knowledge_base` vive no server-only `contextual-suggestions.ts` (`readTenantICP`);
 * aqui só se transforma o ICP já lido em:
 *   - `icpDefaults` (faixas canônicas da Apollo + locais) gravados no briefing;
 *   - a proposta de briefing que abre a conversa nova ("Pelo seu ICP: ... Ajusto algo?").
 *
 * Nenhuma chamada de LLM ou serviço pago: a proposta é determinística.
 */

import type { IcpSearchDefaults, ParsedBriefing } from "@/types/agent";
import {
  APOLLO_COMPANY_SIZE_BUCKETS,
  formatCompanySizesLabel,
} from "@/lib/agent/search-defaults";

/** ICP do tenant já lido e coagido (camelCase), como devolvido por `readTenantICP`. */
export interface TenantICP {
  jobTitles: string[];
  industries: string[];
  companySizes: string[];
  geographicFocus: string[];
  /** Story 24.16: dores do ICP (texto livre; `""` quando ausente). Usado pelo Fit Score. */
  painPoints: string;
}

export const EMPTY_TENANT_ICP: TenantICP = {
  jobTitles: [],
  industries: [],
  companySizes: [],
  geographicFocus: [],
  painPoints: "",
};

/**
 * Faixa do ICP (form da KB) → faixas canônicas da Apollo. As do ICP são iguais às da
 * Apollo até "501-1000"; "1000+" abre nas três faixas acima de 1000.
 */
export const ICP_SIZE_TO_SEARCH_SIZES: Record<string, readonly string[]> = {
  "1-10": ["1-10"],
  "11-50": ["11-50"],
  "51-200": ["51-200"],
  "201-500": ["201-500"],
  "501-1000": ["501-1000"],
  "1000+": ["1001-5000", "5001-10000", "10001+"],
};

/** Teto de itens em cada lista de `icpDefaults` (mesmo teto do schema do PATCH). */
export const ICP_DEFAULTS_MAX_ITEMS = 10;

/** Teto de cargos na proposta. */
export const ICP_PROPOSAL_MAX_TITLES = 6;

/** Trim + descarta vazios + dedup (exato, preservando a 1a ocorrencia). */
function dedupeNonEmpty(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of values) {
    const value = typeof raw === "string" ? raw.trim() : "";
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

/**
 * Monta os defaults de busca a partir do ICP: portes em faixas canônicas da Apollo
 * (dedupe, ordem canônica) e locais (trim, sem vazios, dedupe), cada lista com teto de 10.
 * As duas listas vazias → `null` (sem ICP utilizável para a busca).
 */
export function buildIcpSearchDefaults(
  icp: Pick<TenantICP, "companySizes" | "geographicFocus">
): IcpSearchDefaults | null {
  const mapped = new Set<string>();
  for (const size of icp.companySizes ?? []) {
    for (const bucket of ICP_SIZE_TO_SEARCH_SIZES[size] ?? []) mapped.add(bucket);
  }
  const companySizes = APOLLO_COMPANY_SIZE_BUCKETS.filter((b) => mapped.has(b)).slice(
    0,
    ICP_DEFAULTS_MAX_ITEMS
  );
  const locations = dedupeNonEmpty(icp.geographicFocus ?? []).slice(0, ICP_DEFAULTS_MAX_ITEMS);

  if (companySizes.length === 0 && locations.length === 0) return null;
  return { companySizes, locations };
}

/**
 * Proposta de briefing a partir do ICP. Sem cargos no ICP → `null` (sem proposta; a UI
 * mostra a dica de preencher o ICP). Com cargos: busca direta guiada por cargo, com os
 * defaults do ICP gravados no briefing.
 */
export function buildIcpProposal(icp: TenantICP): ParsedBriefing | null {
  const jobTitles = dedupeNonEmpty(icp.jobTitles ?? []).slice(0, ICP_PROPOSAL_MAX_TITLES);
  if (jobTitles.length === 0) return null;

  return {
    technology: null,
    jobTitles,
    location: null,
    companySize: null,
    industry: null,
    productSlug: null,
    mode: "guided",
    skipSteps: ["search_companies"],
    icpDefaults: buildIcpSearchDefaults(icp),
  };
}

/**
 * Mensagem da proposta: `Pelo seu ICP: {cargos}, {locais}, {porte} funcionarios. Ajusto algo?`
 * As partes vazias são omitidas.
 */
export function buildIcpProposalMessage(
  briefing: Pick<ParsedBriefing, "jobTitles" | "icpDefaults">
): string {
  const parts: string[] = [];
  if (briefing.jobTitles.length > 0) parts.push(briefing.jobTitles.join("/"));
  const locations = briefing.icpDefaults?.locations ?? [];
  if (locations.length > 0) parts.push(locations.join(", "));
  const sizes = briefing.icpDefaults?.companySizes ?? [];
  if (sizes.length > 0) parts.push(`${formatCompanySizesLabel(sizes)} funcionarios`);
  return `Pelo seu ICP: ${parts.join(", ")}. Ajusto algo?`;
}
