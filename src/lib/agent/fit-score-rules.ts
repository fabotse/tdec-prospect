/**
 * Fit Score — regras deterministicas (Story 24.16)
 *
 * Modulo PURO e client-safe (sem I/O): da a cada lead da busca uma nota A/B/C com uma
 * justificativa de 1 linha, a partir do cargo e da disponibilidade de e-mail da Apollo.
 * O LLM (`fit-scorer.ts`, so servidor) pode substituir a nota por lead; quando ele falha,
 * estas regras sao o resultado final.
 *
 * Porte e local nao entram: a `api_search` nao devolve esses dados e eles ja sao filtros
 * da busca. Strings sem acento (convencao das strings do agente).
 */

import type { FitGrade } from "@/types/agent";

export type { FitGrade } from "@/types/agent";

export const FIT_GRADES: readonly FitGrade[] = ["A", "B", "C"];

/** Teto da justificativa (1 linha). */
export const FIT_REASON_MAX_LENGTH = 120;

export interface FitScoreResult {
  fitScore: FitGrade;
  fitReason: string;
}

/**
 * Palavras de senioridade (ja normalizadas). Casadas por PALAVRA inteira, nunca por
 * substring: "coo" nao pode casar com "coordenador".
 */
const SENIORITY_WORDS = [
  "ceo",
  "cto",
  "cio",
  "ciso",
  "cfo",
  "coo",
  "chief",
  "head",
  "diretor",
  "diretora",
  "director",
  "vp",
  "vice",
  "gerente",
  "manager",
  "socio",
  "socia",
  "partner",
  "founder",
  "owner",
  "presidente",
  "presidenta",
  "superintendente",
  "lider",
] as const;

const SENIORITY_ACRONYMS = new Set(["ceo", "cto", "cio", "ciso", "cfo", "coo", "vp"]);

/** Sem acento, minusculas e sem espacos nas pontas. */
export function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** Texto normalizado reduzido a palavras separadas por 1 espaco. */
function toWords(value: string): string {
  return normalizeText(value)
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Corta a justificativa no teto, sem deixar espaco solto no fim. */
export function truncateFitReason(reason: string): string {
  const trimmed = reason.trim();
  if (trimmed.length <= FIT_REASON_MAX_LENGTH) return trimmed;
  return trimmed.slice(0, FIT_REASON_MAX_LENGTH).trimEnd();
}

/** Rotulo curto para citar dentro da justificativa. */
function shortLabel(value: string, max = 40): string {
  const trimmed = value.trim();
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max).trimEnd()}...`;
}

function seniorityLabel(word: string): string {
  if (SENIORITY_ACRONYMS.has(word)) return word.toUpperCase();
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/**
 * Primeiro cargo pedido contido no titulo. O match e por substring do termo normalizado,
 * alinhado em fronteira de palavra ("ciso" casa com "ciso latam", "cto" nao casa com
 * "director"). Termo vazio nunca casa.
 */
function findRequestedTitle(titleWords: string, requestedTitles: string[]): string | null {
  const haystack = ` ${titleWords} `;
  for (const requested of requestedTitles) {
    if (typeof requested !== "string") continue;
    const term = toWords(requested);
    if (!term) continue;
    if (haystack.includes(` ${term} `)) return requested.trim();
  }
  return null;
}

function findSeniorityWord(titleWords: string): string | null {
  const words = new Set(titleWords.split(" ").filter(Boolean));
  for (const word of SENIORITY_WORDS) {
    if (words.has(word)) return word;
  }
  return null;
}

/**
 * Nota por regras.
 * - Cargo contem um cargo pedido -> forte; senao palavra de senioridade -> medio; senao fraco.
 * - Forte + e-mail -> A. Forte sem e-mail ou medio -> B. Fraco -> C.
 */
export function scoreLeadByRules(
  lead: { title: string | null | undefined; hasEmail: boolean | null | undefined },
  requestedTitles: string[]
): FitScoreResult {
  const title = typeof lead.title === "string" ? lead.title : "";
  const titleWords = toWords(title);

  if (!titleWords) {
    return { fitScore: "C", fitReason: "Cargo nao informado" };
  }

  const requested = findRequestedTitle(titleWords, requestedTitles);
  if (requested) {
    const label = shortLabel(requested);
    return lead.hasEmail === true
      ? {
          fitScore: "A",
          fitReason: truncateFitReason(`Cargo bate com o pedido (${label}) e tem e-mail disponivel`),
        }
      : {
          fitScore: "B",
          fitReason: truncateFitReason(`Cargo bate com o pedido (${label}), mas sem e-mail disponivel`),
        };
  }

  const seniority = findSeniorityWord(titleWords);
  if (seniority) {
    return {
      fitScore: "B",
      fitReason: truncateFitReason(`Cargo senior (${seniorityLabel(seniority)}), fora da lista pedida`),
    };
  }

  return { fitScore: "C", fitReason: "Cargo fora do perfil pedido" };
}

/** Cargos pedidos = briefing ∪ ICP (dedupe por texto normalizado, ordem preservada). */
export function mergeRequestedTitles(...lists: Array<string[] | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const list of lists) {
    for (const raw of list ?? []) {
      if (typeof raw !== "string") continue;
      const key = toWords(raw);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      result.push(raw.trim());
    }
  }
  return result;
}

function gradeRank(grade: FitGrade | null | undefined): number {
  if (grade === "A") return 0;
  if (grade === "B") return 1;
  if (grade === "C") return 2;
  return 3;
}

/** Ordena A -> B -> C -> sem nota, de forma ESTAVEL. Nao muta a entrada. */
export function sortByFitGrade<T extends { fitScore?: FitGrade | null }>(items: T[]): T[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => gradeRank(a.item.fitScore) - gradeRank(b.item.fitScore) || a.index - b.index)
    .map(({ item }) => item);
}

/** Contagem por nota (leads sem nota nao contam). */
export function countFitGrades(
  items: Array<{ fitScore?: FitGrade | null }>
): Record<FitGrade, number> {
  const counts: Record<FitGrade, number> = { A: 0, B: 0, C: 0 };
  for (const item of items) {
    if (item.fitScore === "A" || item.fitScore === "B" || item.fitScore === "C") {
      counts[item.fitScore]++;
    }
  }
  return counts;
}

export function isFitGrade(value: unknown): value is FitGrade {
  return value === "A" || value === "B" || value === "C";
}
