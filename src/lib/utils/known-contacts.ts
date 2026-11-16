/**
 * Known contacts utilities
 * Story: 25.1 - Contatos conhecidos
 *
 * Normalização (LinkedIn, relação, contato), leitura de CSV e montagem/filtragem da busca
 * de LinkedIn. Puro e sem dependência de servidor: o cliente usa para validar e ler o
 * arquivo, e o servidor normaliza de novo tudo o que recebe.
 */

import { parseCSVData } from "@/lib/utils/csv-parser";
import { normalizeSuppressionValue } from "@/lib/utils/suppression";
import {
  KNOWN_CONTACT_ERRORS,
  KNOWN_CONTACT_RELATIONS,
  KNOWN_CONTACT_RELATION_LABELS,
  type KnownContactImportRow,
  type KnownContactRelation,
  type LinkedinCandidate,
  type NormalizedKnownContact,
} from "@/types/known-contact";

const MAX_NAME_LENGTH = 200;
const MAX_TEXT_LENGTH = 200;
const MAX_URL_LENGTH = 500;
const LINKEDIN_HOST_RE = /^([a-z0-9-]+\.)*linkedin\.com$/;
const MAX_CANDIDATES = 5;
const MAX_SNIPPET_LENGTH = 300;

/** Minúsculo, sem acento, sem espaço nas pontas. */
function fold(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

function compact(raw: string): string {
  return fold(raw).replace(/[^a-z0-9]/g, "");
}

/** Aparado, com espaços internos colapsados; vazio → null. */
function cleanText(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.replace(/\s+/g, " ").trim();
  return v ? v : null;
}

/**
 * Normaliza a URL de um perfil do LinkedIn para `https://www.linkedin.com/in/<slug>`.
 * Aceita subdomínio de país (`br.linkedin.com`), URL sem protocolo, query, hash, barra final
 * e sufixo de idioma (`/in/slug/en`). Slug decodificado e minúsculo. Fora disso → null.
 */
export function normalizeLinkedinProfileUrl(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  let v = raw.trim();
  if (!v || v.length > MAX_URL_LENGTH) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(v)) v = `https://${v}`;

  let url: URL;
  try {
    url = new URL(v);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (!LINKEDIN_HOST_RE.test(url.hostname.toLowerCase())) return null;

  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length < 2 || segments[0].toLowerCase() !== "in") return null;

  let slug: string;
  try {
    slug = decodeURIComponent(segments[1]);
  } catch {
    return null;
  }
  slug = slug.trim().toLowerCase();
  if (!slug || /[\s/?#]/.test(slug)) return null;

  return `https://www.linkedin.com/in/${slug}`;
}

const RELATION_ALIASES: Record<string, KnownContactRelation> = (() => {
  const map: Record<string, KnownContactRelation> = {};
  for (const key of KNOWN_CONTACT_RELATIONS) {
    map[compact(key)] = key;
    map[compact(KNOWN_CONTACT_RELATION_LABELS[key])] = key;
  }
  map.cliente = "cliente_atual";
  map.excliente = "ex_cliente";
  return map;
})();

/**
 * Lê uma relação (chave ou rótulo, sem acento/caixa). `cliente` → `cliente_atual`,
 * `ex cliente`/`ex-cliente` → `ex_cliente`. Vazio ou desconhecido → null.
 */
export function parseKnownContactRelation(
  raw: string | null | undefined
): KnownContactRelation | null {
  if (typeof raw !== "string") return null;
  const key = compact(raw);
  if (!key) return null;
  return RELATION_ALIASES[key] ?? null;
}

export interface KnownContactRawInput {
  fullName?: unknown;
  title?: unknown;
  companyName?: unknown;
  companyDomain?: unknown;
  linkedinUrl?: unknown;
  relationType?: unknown;
}

export type NormalizeKnownContactResult =
  | { ok: true; data: NormalizedKnownContact }
  | { ok: false; error: string };

/**
 * Normaliza um contato (cadastro manual, edição ou linha de CSV).
 * Nome aparado; domínio via `normalizeSuppressionValue` (só domínio); LinkedIn via
 * `normalizeLinkedinProfileUrl`. Exige nome, relação e empresa ou domínio.
 */
export function normalizeKnownContactInput(
  input: KnownContactRawInput
): NormalizeKnownContactResult {
  const fullName = cleanText(input.fullName);
  if (!fullName) return { ok: false, error: KNOWN_CONTACT_ERRORS.missingName };
  if (fullName.length > MAX_NAME_LENGTH) return { ok: false, error: "Nome muito longo" };

  const title = cleanText(input.title);
  const companyName = cleanText(input.companyName);
  if ((title?.length ?? 0) > MAX_TEXT_LENGTH) return { ok: false, error: "Cargo muito longo" };
  if ((companyName?.length ?? 0) > MAX_TEXT_LENGTH) {
    return { ok: false, error: "Empresa muito longa" };
  }

  const rawDomain = cleanText(input.companyDomain);
  let companyDomain: string | null = null;
  if (rawDomain) {
    const normalized = normalizeSuppressionValue(rawDomain);
    if (!normalized || normalized.type !== "domain") {
      return { ok: false, error: KNOWN_CONTACT_ERRORS.invalidDomain };
    }
    companyDomain = normalized.value;
  }
  if (!companyName && !companyDomain) {
    return { ok: false, error: KNOWN_CONTACT_ERRORS.missingCompany };
  }

  const rawLinkedin = cleanText(input.linkedinUrl);
  let linkedinUrl: string | null = null;
  if (rawLinkedin) {
    linkedinUrl = normalizeLinkedinProfileUrl(rawLinkedin);
    if (!linkedinUrl) return { ok: false, error: KNOWN_CONTACT_ERRORS.invalidLinkedin };
  }

  const relationType =
    typeof input.relationType === "string" ? parseKnownContactRelation(input.relationType) : null;
  if (!relationType) return { ok: false, error: "Relação inválida" };

  return {
    ok: true,
    data: {
      full_name: fullName,
      title,
      company_name: companyName,
      company_domain: companyDomain,
      linkedin_url: linkedinUrl,
      relation_type: relationType,
    },
  };
}

const NAME_HEADERS = ["nome", "name", "nome completo"];
const TITLE_HEADERS = ["cargo", "title"];
const COMPANY_HEADERS = ["empresa", "company"];
const DOMAIN_HEADERS = ["dominio", "domain", "site", "website"];
const LINKEDIN_HEADERS = ["linkedin", "linkedin_url", "perfil"];
const RELATION_HEADERS = ["relacao", "relation", "tipo", "tipo de relacao"];

export const KNOWN_CONTACTS_CSV_MISSING_COLUMN = "colunas obrigatórias: nome e relação";

export type ParseKnownContactsCsvResult =
  | { success: true; rows: KnownContactImportRow[] }
  | { success: false; error: string };

/**
 * Lê o CSV de contatos conhecidos (cabeçalho obrigatório; `,` `;` ou tab).
 * Colunas por nome, sem acento/caixa. Nome e relação obrigatórias; o resto opcional.
 * Não valida os valores (o servidor faz).
 */
export function parseKnownContactsCsv(text: string): ParseKnownContactsCsvResult {
  const clean = text.replace(/^﻿/, "");
  const { headers, rows } = parseCSVData(clean);
  const folded = headers.map((h) => fold(h.replace(/^"|"$/g, "")).replace(/\s+/g, " "));
  const col = (names: string[]) => folded.findIndex((h) => names.includes(h));

  const nameCol = col(NAME_HEADERS);
  const relationCol = col(RELATION_HEADERS);
  if (nameCol === -1 || relationCol === -1) {
    return { success: false, error: KNOWN_CONTACTS_CSV_MISSING_COLUMN };
  }
  const titleCol = col(TITLE_HEADERS);
  const companyCol = col(COMPANY_HEADERS);
  const domainCol = col(DOMAIN_HEADERS);
  const linkedinCol = col(LINKEDIN_HEADERS);

  // parseCSVData descarta linhas em branco: reconstrói o nº real de cada linha.
  const lineNumbers: number[] = [];
  clean
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .forEach((line, i) => {
      if (line.trim() !== "") lineNumbers.push(i + 1);
    });

  const cell = (cells: string[], index: number) =>
    index >= 0 ? (cells[index] ?? "").trim() : "";

  const result: KnownContactImportRow[] = [];
  rows.forEach((cells, i) => {
    if (cells.every((c) => c.trim() === "")) return;
    result.push({
      line: lineNumbers[i + 1] ?? i + 2,
      fullName: cell(cells, nameCol),
      title: cell(cells, titleCol),
      companyName: cell(cells, companyCol),
      companyDomain: cell(cells, domainCol),
      linkedinUrl: cell(cells, linkedinCol),
      relation: cell(cells, relationCol),
    });
  });

  return { success: true, rows: result };
}

/**
 * Query da busca de LinkedIn: `"<nome>" <empresa|domínio> site:linkedin.com/in`.
 * Só nome + empresa (ou domínio) vão para o provedor.
 */
export function buildLinkedinQuery(
  fullName: string,
  companyName?: string | null,
  companyDomain?: string | null
): string {
  const name = (fullName ?? "").replace(/"/g, "").replace(/\s+/g, " ").trim();
  const company = (companyName ?? "").replace(/"/g, "").replace(/\s+/g, " ").trim();
  const domain = (companyDomain ?? "").trim();
  const where = company || domain;
  return [`"${name}"`, where, "site:linkedin.com/in"].filter(Boolean).join(" ");
}

function shortText(raw: unknown, max: number): string {
  if (typeof raw !== "string") return "";
  const v = raw.replace(/\s+/g, " ").trim();
  return v.length > max ? `${v.slice(0, max - 1)}…` : v;
}

/**
 * Filtra os resultados da busca: só perfis `/in/`, deduplicados pela URL normalizada,
 * no máximo 5, com título e trecho.
 */
export function pickLinkedinCandidates(results: unknown): LinkedinCandidate[] {
  if (!Array.isArray(results)) return [];
  const seen = new Set<string>();
  const out: LinkedinCandidate[] = [];
  for (const item of results) {
    if (out.length >= MAX_CANDIDATES) break;
    const r = item as { url?: unknown; title?: unknown; snippet?: unknown } | null;
    if (!r || typeof r.url !== "string") continue;
    const url = normalizeLinkedinProfileUrl(r.url);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push({
      url,
      title: shortText(r.title, MAX_TEXT_LENGTH),
      snippet: shortText(r.snippet, MAX_SNIPPET_LENGTH),
    });
  }
  return out;
}
