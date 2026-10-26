/**
 * reference-accounts.ts — modo contas parecidas com os melhores clientes (Story 24.18).
 *
 * Leaf module PURO e client-safe (só tipos + funções puras), no molde de `target-accounts.ts`.
 * Fonte única de:
 *   - o gate do modo (`isLookalikeMode`, `hasEnoughReferences`, `profileMatchesReferences`,
 *     `activeReferenceProfile`);
 *   - a derivação do perfil comum a partir das empresas enriquecidas (`deriveReferenceProfile`);
 *   - a frase de semelhança do Fit Score (`similarityReason`);
 *   - a exclusão dos clientes e dos domínios suprimidos do resultado (`buildLookalikeExclusion`);
 *   - a exibição no card e no resumo (`formatReferenceAccounts`, `formatReferenceProfile`).
 *
 * NAO importa `search-defaults.ts` (que importa este módulo) — sem ciclo. Por isso as faixas
 * canônicas da Apollo estão duplicadas aqui (`REFERENCE_SIZE_BUCKETS`).
 */

import type {
  ParsedBriefing,
  ReferenceCompany,
  ReferenceProfile,
  TargetAccount,
} from "@/types/agent";
import { resolveApolloIndustries } from "@/lib/agent/apollo-industries";
import {
  hasUnresolvedAccounts,
  isAccountListMode,
  resolvedAccountDomains,
} from "@/lib/agent/target-accounts";

/** Mínimo e máximo de clientes de referência. */
export const REFERENCE_MIN = 3;
export const REFERENCE_MAX = 5;

/** Faixas canônicas da Apollo em ordem crescente (cópia de `APOLLO_COMPANY_SIZE_BUCKETS`). */
export const REFERENCE_SIZE_BUCKETS = [
  "1-10",
  "11-50",
  "51-200",
  "201-500",
  "501-1000",
  "1001-5000",
  "5001-10000",
  "10001+",
] as const;

const MAX_PROFILE_INDUSTRIES = 3;
const MAX_PROFILE_TECHNOLOGIES = 5;

type LookalikeBriefing = Partial<
  Pick<
    ParsedBriefing,
    | "referenceAccounts"
    | "referenceProfile"
    | "targetAccounts"
    | "suppressedAccounts"
    | "skipSteps"
  >
>;

// ==============================================
// GATE DO MODO
// ==============================================

/**
 * Modo contas parecidas: `referenceAccounts` é um array (mesmo vazio — a pergunta pede as
 * referências), fora do fluxo de leads importados e fora do modo lista de contas.
 */
export function isLookalikeMode(briefing: LookalikeBriefing | null | undefined): boolean {
  if (!briefing) return false;
  if (!Array.isArray(briefing.referenceAccounts)) return false;
  if (briefing.skipSteps?.includes("search_leads")) return false;
  return !isAccountListMode(briefing);
}

/** Entre 3 e 5 referências resolvidas e nenhuma sem domínio. */
export function hasEnoughReferences(briefing: LookalikeBriefing | null | undefined): boolean {
  const accounts = briefing?.referenceAccounts ?? [];
  if (hasUnresolvedAccounts(accounts)) return false;
  const count = resolvedAccountDomains(accounts).length;
  return count >= REFERENCE_MIN && count <= REFERENCE_MAX;
}

/** Igualdade de conjunto entre os domínios do perfil e os das referências. */
export function profileMatchesReferences(
  profile: ReferenceProfile | null | undefined,
  accounts: TargetAccount[] | null | undefined
): boolean {
  if (!profile || !Array.isArray(profile.sourceDomains)) return false;
  const expected = new Set(resolvedAccountDomains(accounts));
  const actual = new Set(profile.sourceDomains);
  if (expected.size === 0 || expected.size !== actual.size) return false;
  for (const domain of expected) if (!actual.has(domain)) return false;
  return true;
}

/**
 * Perfil que vale para a busca: modo ativo, referências suficientes, perfil das MESMAS
 * referências e confiante (re-derivado das empresas — nunca confia no que veio pronto).
 */
export function activeReferenceProfile(
  briefing: LookalikeBriefing | null | undefined
): ReferenceProfile | null {
  if (!briefing || !isLookalikeMode(briefing) || !hasEnoughReferences(briefing)) return null;
  const profile = briefing.referenceProfile;
  if (!profile || !profileMatchesReferences(profile, briefing.referenceAccounts)) return null;
  // Setores, faixas e regiao sempre re-derivados das empresas (nunca os enviados prontos).
  const derived = deriveReferenceProfile(profile.companies ?? [], profile.creditsUsed ?? 0);
  if (!derived.confident || !profileMatchesReferences(derived.profile, briefing.referenceAccounts)) {
    return null;
  }
  return derived.profile;
}

// ==============================================
// PERFIL COMUM
// ==============================================

/** Faixa canônica da Apollo para um número de funcionários (null/inválido → null). */
export function sizeBucketFor(employees: number | null | undefined): string | null {
  if (employees == null || !Number.isFinite(employees) || employees < 0) return null;
  if (employees <= 10) return "1-10";
  if (employees <= 50) return "11-50";
  if (employees <= 200) return "51-200";
  if (employees <= 500) return "201-500";
  if (employees <= 1000) return "501-1000";
  if (employees <= 5000) return "1001-5000";
  if (employees <= 10000) return "5001-10000";
  return "10001+";
}

function hasData(company: ReferenceCompany): boolean {
  return Boolean(company.industry) || company.employees != null;
}

function companyLabel(company: { name: string | null; domain: string }): string {
  return company.name?.trim() || company.domain;
}

/** Valores presentes em >= 2 empresas (contados uma vez por empresa), mais frequentes primeiro. */
function sharedValues(perCompany: string[][], max: number): string[] {
  const counts = new Map<string, number>();
  for (const values of perCompany) {
    for (const value of new Set(values)) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([value]) => value);
}

function deriveLocations(companies: ReferenceCompany[]): string[] {
  const located = companies.filter((c) => c.state || c.country);
  // Uma empresa so nao define a regiao da busca inteira.
  if (located.length < 2) return [];
  const firstState = located[0].state;
  if (firstState && located.every((c) => c.state === firstState)) {
    const country = located.find((c) => c.country)?.country;
    return [country ? `${firstState}, ${country}` : firstState];
  }
  const counts = new Map<string, number>();
  for (const c of located) if (c.country) counts.set(c.country, (counts.get(c.country) ?? 0) + 1);
  for (const [country, count] of counts) {
    if (count > located.length / 2) return [country];
  }
  return [];
}

export interface DerivedReferenceProfile {
  profile: ReferenceProfile;
  confident: boolean;
  /** Motivo quando não é confiante (null quando é). */
  reason: string | null;
}

/**
 * Deriva o perfil comum das empresas enriquecidas. Determinístico: setor, porte e região só
 * vêm do enrichment, nunca do LLM.
 */
export function deriveReferenceProfile(
  companies: ReferenceCompany[],
  creditsUsed: number
): DerivedReferenceProfile {
  const withData = companies.filter(hasData);

  const industries = sharedValues(
    companies.map((c) => (c.industry ? [c.industry.trim().toLowerCase()] : [])),
    MAX_PROFILE_INDUSTRIES
  );

  const bucketIndexes = companies
    .map((c) => (c.employees != null ? sizeBucketFor(c.employees) : null))
    .filter((b): b is string => Boolean(b))
    .map((b) => (REFERENCE_SIZE_BUCKETS as readonly string[]).indexOf(b))
    .filter((i) => i >= 0);
  const companySizes =
    bucketIndexes.length > 0
      ? REFERENCE_SIZE_BUCKETS.slice(Math.min(...bucketIndexes), Math.max(...bucketIndexes) + 1)
      : [];

  const technologies = sharedValues(
    companies.map((c) => c.technologies ?? []),
    MAX_PROFILE_TECHNOLOGIES
  );

  const profile: ReferenceProfile = {
    sourceDomains: companies.map((c) => c.domain),
    companies,
    industries,
    companySizes: [...companySizes],
    locations: deriveLocations(companies),
    technologies,
    creditsUsed,
  };

  const confident =
    withData.length >= REFERENCE_MIN && industries.length > 0 && companySizes.length > 0;

  let reason: string | null = null;
  if (!confident) {
    const withoutData = companies.filter((c) => !hasData(c)).map(companyLabel);
    if (withData.length < REFERENCE_MIN) {
      reason =
        withoutData.length > 0
          ? `Nao encontrei dados na Apollo de: ${withoutData.join(", ")}. Preciso de pelo menos ${REFERENCE_MIN} clientes com dados para montar o perfil comum.`
          : `Preciso de pelo menos ${REFERENCE_MIN} clientes com dados na Apollo para montar o perfil comum.`;
    } else if (industries.length === 0) {
      const sectors = Array.from(
        new Set(
          companies
            .map((c) => c.industry?.trim().toLowerCase())
            .filter((i): i is string => Boolean(i))
        )
      );
      reason = `Os setores dos seus clientes nao se repetem${
        sectors.length > 0 ? ` (${sectors.join(", ")})` : ""
      }, entao nao consigo definir um perfil comum.`;
    } else {
      reason = "Nao encontrei o porte dos seus clientes na Apollo, entao nao consigo definir um perfil comum.";
    }
  }

  return { profile, confident, reason };
}

// ==============================================
// SEMELHANCA (FIT SCORE)
// ==============================================

/** Setores efetivos da busca: os do usuário (mapeados) ou os do perfil. Minúsculas. */
function effectiveIndustries(
  briefing: Pick<ParsedBriefing, "industry">,
  profile: ReferenceProfile
): string[] {
  const userIndustry = briefing.industry?.trim().toLowerCase();
  if (!userIndustry) return profile.industries;
  if (profile.industries.includes(userIndustry)) return [userIndustry];
  return (resolveApolloIndustries(briefing.industry) ?? [userIndustry]).map((i) => i.toLowerCase());
}

/**
 * Frase de semelhança da justificativa do Fit Score. Reflete os filtros EFETIVOS (um chip
 * editado tira o atributo da frase).
 */
export function similarityReason(
  briefing: Pick<ParsedBriefing, "industry" | "companySize"> & LookalikeBriefing
): string {
  const fallback = "perfil parecido com seus clientes";
  const profile = activeReferenceProfile(briefing);
  if (!profile) return fallback;
  const industries = effectiveIndustries(briefing, profile);
  const sizes = briefing.companySize ? [briefing.companySize] : profile.companySizes;
  const companies = profile.companies ?? [];

  const industryMatch = (c: ReferenceCompany) =>
    Boolean(c.industry) && industries.includes((c.industry ?? "").trim().toLowerCase());
  const sizeMatch = (c: ReferenceCompany) => Boolean(c.sizeBucket) && sizes.includes(c.sizeBucket ?? "");

  const both = companies.find((c) => industryMatch(c) && sizeMatch(c));
  if (both) return `mesmo setor e porte de ${companyLabel(both)}`;
  const industryOnly = companies.find(industryMatch);
  if (industryOnly) return `mesmo setor de ${companyLabel(industryOnly)}`;
  const sizeOnly = companies.find(sizeMatch);
  if (sizeOnly) return `mesmo porte de ${companyLabel(sizeOnly)}`;
  return fallback;
}

// ==============================================
// EXCLUSAO DOS CLIENTES E SUPRIMIDOS
// ==============================================

/** Sufixos societarios no fim do nome ("Banco X S.A.", "Empresa Y Ltda"). */
const LEGAL_SUFFIX_REGEX =
  /(?:[\s,.-]+(?:s\.?\s?a\.?|s\/a|ltda\.?|eireli|me|epp|inc\.?|llc|ltd\.?|corp\.?))+[\s.,]*$/;

function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(LEGAL_SUFFIX_REGEX, "")
    .trim();
}

function compactName(name: string): string {
  return normalizeCompanyName(name).replace(/[^a-z0-9]/g, "");
}

function domainLabel(domain: string): string {
  return (domain.split(".")[0] ?? "").replace(/[^a-z0-9]/g, "");
}

/**
 * Casador de exclusão: nome normalizado igual ao de uma referência, ou nome compacto (sem
 * espaço e sem pontuação) igual ao primeiro rótulo do domínio de uma referência ou de um
 * domínio suprimido. Heurística (a `api_search` não devolve o domínio da empresa do lead).
 */
export function buildLookalikeExclusion(
  references: TargetAccount[] | null | undefined,
  suppressedDomains: string[]
): (companyName: string | null | undefined) => boolean {
  const names = new Set(
    (references ?? [])
      .map((r) => (r.name ? normalizeCompanyName(r.name) : ""))
      .filter(Boolean)
  );
  const labels = new Set(
    [...resolvedAccountDomains(references), ...suppressedDomains]
      .map(domainLabel)
      .filter(Boolean)
  );
  return (companyName) => {
    if (!companyName) return false;
    const normalized = normalizeCompanyName(companyName);
    if (!normalized) return false;
    if (names.has(normalized)) return true;
    const compact = compactName(companyName);
    return compact.length > 0 && labels.has(compact);
  };
}

// ==============================================
// EXIBICAO
// ==============================================

/** Referências para o card e o resumo: `Banco X (bancox.com.br)`, `segz.com.br`. */
export function formatReferenceAccounts(accounts: TargetAccount[] | null | undefined): string {
  return (accounts ?? [])
    .map((a) => {
      if (!a.domain) return `${a.name ?? "Cliente"} (dominio?)`;
      const domain = a.confidence === "low" ? `${a.domain} — confirme` : a.domain;
      return a.name ? `${a.name} (${domain})` : domain;
    })
    .join(", ");
}

function bucketLow(bucket: string): string {
  return bucket.endsWith("+") ? bucket.slice(0, -1) : bucket.split("-")[0];
}

function bucketHigh(bucket: string): string | null {
  if (bucket.endsWith("+")) return null;
  const parts = bucket.split("-");
  return parts[1] ?? parts[0];
}

/** Rótulo de um intervalo contíguo de faixas (`201-500`+`501-1000` → `201–1000`). */
export function formatReferenceSizes(sizes: string[]): string {
  if (sizes.length === 0) return "";
  const first = sizes[0];
  const last = sizes[sizes.length - 1];
  const hi = bucketHigh(last);
  return hi === null ? `${bucketLow(first)}+` : `${bucketLow(first)}–${hi}`;
}

/**
 * Perfil para o resumo: `setor banking, porte 201–1000, regiao Sao Paulo, Brazil;
 * tecnologias em comum: aws, salesforce`.
 */
export function formatReferenceProfile(profile: ReferenceProfile | null | undefined): string {
  if (!profile) return "";
  const parts = [
    profile.industries.length > 0 ? `setor ${profile.industries.join(", ")}` : null,
    profile.companySizes.length > 0
      ? `porte ${formatReferenceSizes(profile.companySizes)} funcionarios`
      : null,
    profile.locations.length > 0 ? `regiao ${profile.locations.join(", ")}` : null,
  ].filter(Boolean);
  const technologies =
    profile.technologies.length > 0
      ? `; tecnologias em comum: ${profile.technologies.join(", ")}`
      : "";
  return `${parts.join(", ")}${technologies}`;
}
