/**
 * Dossie da conta — extracao DETERMINISTICA de fatos
 * Story: 24.19 - Dossie da conta
 *
 * Funcoes puras (sem I/O). Regra de ouro: fato sem `fonte_url` http(s) nao existe, e o
 * texto do fato sai do conteudo da fonte (titulo, trecho ou nome da tecnologia). Nada e
 * inferido, nem por LLM nem por heuristica.
 */

import { normalizeDomain } from "@/lib/agent/target-accounts";

// ==============================================
// TYPES
// ==============================================

export type DossierFactKind = "site" | "news" | "job" | "technology" | "post";
export type DossierConfidence = "baixa" | "media" | "alta";
export type DossierStatus = "complete" | "partial" | "empty";

export interface DossierFact {
  kind: DossierFactKind;
  fato: string;
  fonte_url: string;
  /** YYYY-MM-DD */
  data: string;
  confianca: DossierConfidence;
  lead_apollo_id?: string | null;
  lead_email?: string | null;
}

export interface FactContext {
  companyName: string | null;
  domain: string;
  /** Instante de referencia ("hoje"). */
  now: Date;
  windowDays: number;
}

export interface TregSearchResult {
  url?: unknown;
  title?: unknown;
  snippet?: unknown;
}

export interface ExaResult {
  url?: unknown;
  title?: unknown;
  publishedDate?: unknown;
  text?: unknown;
  summary?: unknown;
}

/** Origem real das tecnologias (output do `search_companies`). */
export const THEIRSTACK_SOURCE_URL = "https://api.theirstack.com/v1/companies/search";

const NEWS_TITLE_MAX = 200;
const POST_TEXT_MAX = 280;
const SITE_MIN_USEFUL_CHARS = 200;

// ==============================================
// TEXT HELPERS
// ==============================================

/** Minusculas, sem acento, so [a-z0-9] e espacos simples. */
export function normalizeText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function collapse(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** URL absoluta http(s) ou null. */
export function httpUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!/^https?:\/\//i.test(trimmed)) return null;
  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:" ? trimmed : null;
  } catch {
    return null;
  }
}

const BRT_DATE_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Data ISO (YYYY-MM-DD) de `now` no fuso de Sao Paulo (coleta depois das 21h BRT nao vira "amanha"). */
export function isoDate(now: Date): string {
  return BRT_DATE_FORMAT.format(now);
}

/** Data de publicacao parseavel e dentro da janela [now - windowDays, now + 1 dia]. */
export function dateWithinWindow(value: unknown, now: Date, windowDays: number): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  const earliest = now.getTime() - windowDays * 86_400_000;
  const latest = now.getTime() + 86_400_000;
  if (parsed.getTime() < earliest || parsed.getTime() > latest) return null;
  // Data publicada: vale o dia escrito pela fonte (sem converter de fuso).
  const literal = value.trim().match(/^\d{4}-\d{2}-\d{2}/);
  return literal ? literal[0] : isoDate(parsed);
}

// ==============================================
// COMPANY KEYS / BRAND
// ==============================================

/** Sufixos societarios ignorados no agrupamento por empresa. */
const LEGAL_SUFFIXES = new Set([
  "sa", "s", "a", "ltda", "ltd", "me", "epp", "eireli", "inc", "llc", "corp", "co", "cia",
]);

/** Chave normalizada de empresa (agrupamento): "Banco X S.A." → "banco x". */
export function normalizeCompanyKey(name: unknown): string {
  const tokens = normalizeText(name).split(" ").filter(Boolean);
  while (tokens.length > 1 && LEGAL_SUFFIXES.has(tokens[tokens.length - 1])) tokens.pop();
  return tokens.join(" ");
}

/** Palavras genericas que nao identificam uma empresa sozinhas. */
const GENERIC_TOKENS = new Set([
  "grupo", "banco", "companhia", "empresa", "holding", "de", "do", "da", "dos", "das", "e",
  "the", "and", "of", "brasil", "brazil", "seguros", "servicos", "tecnologia", "solucoes",
  "industria", "comercio", "participacoes", "sistemas", "hospital", "rede", "instituto",
]);

/** Sufixos publicos ignorados para achar a "marca" do dominio. */
const PUBLIC_SUFFIX_LABELS = new Set([
  "com", "br", "net", "org", "gov", "edu", "io", "co", "app", "ai", "dev", "tech", "info",
  "biz", "us", "uk", "pt", "ar", "mx", "cl", "global", "site", "online",
]);

/** Marca do dominio: "ri.bradescoseguros.com.br" → "bradescoseguros". */
export function domainBrand(domain: unknown): string {
  const normalized = normalizeDomain(domain);
  if (!normalized) return "";
  const labels = normalized.split(".");
  let end = labels.length;
  while (end > 1 && PUBLIC_SUFFIX_LABELS.has(labels[end - 1])) end--;
  return (labels[end - 1] ?? "").replace(/-/g, "");
}

/** Dominio registravel: "ri.bradesco.com.br" → "bradesco.com.br". */
export function registrableDomain(domain: unknown): string | null {
  const normalized = normalizeDomain(domain);
  if (!normalized) return null;
  const labels = normalized.split(".");
  let end = labels.length;
  while (end > 1 && PUBLIC_SUFFIX_LABELS.has(labels[end - 1])) end--;
  return labels.slice(Math.max(0, end - 1)).join(".");
}

/**
 * Como a empresa e identificada num texto:
 * - `name`: TODAS as palavras significativas do nome, como palavras inteiras ("Porto
 *   Seguro" nao casa com "Porto Alegre");
 * - `brand`: a marca do dominio sozinha, como palavra ou colada ("bradesco seguros").
 */
export type MentionToken = { kind: "name"; words: string[] } | { kind: "brand"; value: string };

/** Tokens que identificam a empresa num texto (nome e marca do dominio). */
export function companyMentionTokens(companyName: string | null, domain: string): MentionToken[] {
  const tokens: MentionToken[] = [];
  const nameTokens = normalizeCompanyKey(companyName).split(" ").filter(Boolean);
  const significant = nameTokens.filter((t) => t.length >= 3 && !GENERIC_TOKENS.has(t));
  // Nome so de palavras genericas ("Banco do Brasil"): exige o nome completo.
  const words = significant.length > 0 ? significant : nameTokens;
  if (words.length > 0) tokens.push({ kind: "name", words });
  const brand = domainBrand(domain);
  if (brand.length >= 3) tokens.push({ kind: "brand", value: brand });
  return tokens;
}

/** O texto cita a empresa? */
export function mentionsCompany(text: unknown, tokens: MentionToken[]): boolean {
  const normalized = normalizeText(text);
  if (!normalized || tokens.length === 0) return false;
  const padded = ` ${normalized} `;
  const compact = normalized.replace(/ /g, "");
  return tokens.some((token) => {
    if (token.kind === "name") return token.words.every((word) => padded.includes(` ${word} `));
    if (padded.includes(` ${token.value} `)) return true;
    // Marca do dominio colada ("bradescoseguros") contra o texto sem espacos.
    return token.value.length >= 5 && compact.includes(token.value);
  });
}

// ==============================================
// URL FILTERS
// ==============================================

/** Redes sociais, portais de vaga e agregadores: nunca sao o site da empresa. */
const NON_COMPANY_HOSTS = [
  "facebook.com", "instagram.com", "linkedin.com", "twitter.com", "x.com", "youtube.com",
  "tiktok.com", "threads.net", "wikipedia.org", "glassdoor.com", "glassdoor.com.br",
  "indeed.com", "indeed.com.br", "gupy.io", "vagas.com.br", "catho.com.br", "infojobs.com.br",
  "reclameaqui.com.br", "jusbrasil.com.br", "google.com", "apple.com", "bing.com",
  "econodata.com.br", "cnpj.biz", "casadosdados.com.br", "crunchbase.com", "zoominfo.com",
];

/** Redes sociais (noticia/vaga vinda delas e descartada). */
const SOCIAL_HOSTS = [
  "facebook.com", "instagram.com", "linkedin.com", "twitter.com", "x.com", "youtube.com",
  "tiktok.com", "threads.net",
];

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function hostMatches(host: string, list: string[]): boolean {
  return list.some((entry) => host === entry || host.endsWith(`.${entry}`));
}

/** Post/perfil de terceiro no LinkedIn (dado pessoal): sempre descartado da busca. */
export function isThirdPartyLinkedInUrl(url: string): boolean {
  const host = hostOf(url);
  if (!host || !hostMatches(host, ["linkedin.com"])) return false;
  try {
    const path = new URL(url).pathname.toLowerCase();
    return path.startsWith("/posts") || path.startsWith("/in/") || path === "/in";
  } catch {
    return false;
  }
}

function isSocialUrl(url: string): boolean {
  const host = hostOf(url);
  return host ? hostMatches(host, SOCIAL_HOSTS) : false;
}

// ==============================================
// DOMAIN PICK
// ==============================================

/** Dominio de e-mail pessoal (nunca identifica a conta). */
const WEBMAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "hotmail.com", "hotmail.com.br", "outlook.com",
  "outlook.com.br", "live.com", "msn.com", "yahoo.com", "yahoo.com.br", "icloud.com",
  "me.com", "aol.com", "protonmail.com", "proton.me", "bol.com.br", "uol.com.br",
  "terra.com.br", "ig.com.br",
]);

/** Dominio corporativo do e-mail (sem webmail) ou null. */
export function corporateEmailDomain(email: unknown): string | null {
  if (typeof email !== "string" || !email.includes("@")) return null;
  const domain = normalizeDomain(email.slice(email.lastIndexOf("@") + 1));
  if (!domain || WEBMAIL_DOMAINS.has(domain)) return null;
  return domain;
}

/**
 * Escolhe o site oficial nos resultados de "<empresa> site oficial".
 * Ignora redes sociais e portais de vaga. Prefere o host com a MESMA marca do dominio do
 * e-mail; sem e-mail corporativo, aceita so um host cuja marca cite o nome da empresa
 * (homonimos e sites errados do spike: Sequoia, Ache).
 */
export function pickSiteDomain(
  results: TregSearchResult[] | unknown,
  emailDomain: string | null,
  companyName?: string | null
): string | null {
  if (!Array.isArray(results)) return null;
  const candidates: string[] = [];
  for (const result of results as TregSearchResult[]) {
    const url = httpUrl(result?.url);
    if (!url) continue;
    const host = hostOf(url);
    if (!host || hostMatches(host, NON_COMPANY_HOSTS)) continue;
    const domain = registrableDomain(host);
    if (domain && !candidates.includes(domain)) candidates.push(domain);
  }
  if (candidates.length === 0) return null;

  const emailBrand = emailDomain ? domainBrand(emailDomain) : "";
  if (emailBrand) {
    const sameBrand = candidates.find((d) => domainBrand(d) === emailBrand);
    if (sameBrand) return sameBrand;
  }

  const tokens = normalizeCompanyKey(companyName)
    .split(" ")
    .filter((t) => t.length >= 3 && !GENERIC_TOKENS.has(t));
  if (tokens.length > 0) {
    const byName = candidates.find((d) => {
      const brand = domainBrand(d);
      return brand.length >= 3 && tokens.some((t) => brand.includes(t) || t.includes(brand));
    });
    if (byName) return byName;
  }
  return null;
}

// ==============================================
// FACTS
// ==============================================

/** Limpa markdown/HTML para texto corrido. */
export function cleanMarkdown(value: string): string {
  return collapse(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/https?:\/\/\S+/g, " ")
      .replace(/^\s{0,3}#{1,6}\s*/gm, "")
      .replace(/^\s*[-*+>]\s+/gm, "")
      .replace(/[*_`~|]+/g, " ")
      .replace(/&nbsp;/gi, " ")
  );
}

/**
 * Site: extract de `https://<dominio>`. Exige >= 200 caracteres uteis. Fato = titulo +
 * trecho inicial (ate `maxChars`). Data = hoje; confianca alta.
 */
export function siteFact(
  extractJson: unknown,
  sourceUrl: string,
  now: Date,
  maxChars: number
): DossierFact | null {
  const url = httpUrl(sourceUrl);
  if (!url) return null;
  const page = (extractJson as { output?: { pages?: unknown[] } } | null)?.output?.pages?.[0] as
    | { markdown?: unknown; content?: unknown; text?: unknown; title?: unknown }
    | undefined;
  if (!page) return null;
  const raw = str(page.markdown) || str(page.content) || str(page.text);
  const body = cleanMarkdown(raw);
  if (body.length < SITE_MIN_USEFUL_CHARS) return null;
  const title = collapse(cleanMarkdown(str(page.title)));
  const fato = truncate(title && !body.startsWith(title) ? `${title} — ${body}` : body, maxChars);
  return { kind: "site", fato, fonte_url: url, data: isoDate(now), confianca: "alta" };
}

function exaResults(json: unknown): ExaResult[] {
  const results = (json as { results?: unknown } | null)?.results;
  return Array.isArray(results) ? (results as ExaResult[]) : [];
}

/**
 * Noticias: resultados Exa com url e `publishedDate` na janela, fora de redes sociais, que
 * citam a empresa no titulo (alta) ou so no texto (media). Fato = titulo (<= 200).
 */
export function newsFacts(exaJson: unknown, ctx: FactContext, max: number): DossierFact[] {
  const tokens = companyMentionTokens(ctx.companyName, ctx.domain);
  const facts: DossierFact[] = [];
  const seen = new Set<string>();
  for (const result of exaResults(exaJson)) {
    if (facts.length >= max) break;
    const url = httpUrl(result.url);
    if (!url || seen.has(url) || isSocialUrl(url)) continue;
    const data = dateWithinWindow(result.publishedDate, ctx.now, ctx.windowDays);
    if (!data) continue;
    const title = collapse(str(result.title));
    if (!title) continue;
    const inTitle = mentionsCompany(title, tokens);
    const inText = !inTitle && mentionsCompany(`${str(result.text)} ${str(result.summary)}`, tokens);
    if (!inTitle && !inText) continue;
    seen.add(url);
    facts.push({
      kind: "news",
      fato: truncate(title, NEWS_TITLE_MAX),
      fonte_url: url,
      data,
      confianca: inTitle ? "alta" : "media",
    });
  }
  return facts;
}

const JOB_TERM = /\b(vagas?|jobs?|oportunidades?|contrata\w*|hiring)\b/;
// "redes" de infraestrutura, nunca "redes sociais"/"rede social".
const AREA_TERM = /\b(seguranca|security|ciber\w*|cyber\w*|infra\w*|cloud|redes?(?! soci(?:al|ais)\b)|soc|devsecops)\b/;

/**
 * Vagas: titulo com termo de vaga E termo de area (seguranca/infra/cloud...), data na
 * janela, fora de posts/perfis do LinkedIn, citando a empresa (titulo ou texto).
 * Confianca media.
 */
export function jobFacts(exaJson: unknown, ctx: FactContext, max: number): DossierFact[] {
  const tokens = companyMentionTokens(ctx.companyName, ctx.domain);
  const facts: DossierFact[] = [];
  const seen = new Set<string>();
  for (const result of exaResults(exaJson)) {
    if (facts.length >= max) break;
    const url = httpUrl(result.url);
    if (!url || seen.has(url) || isThirdPartyLinkedInUrl(url)) continue;
    const data = dateWithinWindow(result.publishedDate, ctx.now, ctx.windowDays);
    if (!data) continue;
    const title = collapse(str(result.title));
    const normalizedTitle = normalizeText(title);
    if (!JOB_TERM.test(normalizedTitle) || !AREA_TERM.test(normalizedTitle)) continue;
    if (!mentionsCompany(`${title} ${str(result.text)} ${str(result.summary)}`, tokens)) continue;
    seen.add(url);
    facts.push({
      kind: "job",
      fato: truncate(title, NEWS_TITLE_MAX),
      fonte_url: url,
      data,
      confianca: "media",
    });
  }
  return facts;
}

interface TechnologyLike {
  technology?: { name?: unknown } | null;
  confidence?: unknown;
}

/**
 * Tecnologias do `search_companies` (TheirStack) com confianca high/medium.
 * `fonte_url` = endpoint do TheirStack (origem real); data = conclusao do step.
 */
export function technologyFacts(
  technologies: unknown,
  dateIso: string,
  max: number
): DossierFact[] {
  if (!Array.isArray(technologies)) return [];
  const facts: DossierFact[] = [];
  const seen = new Set<string>();
  for (const item of technologies as TechnologyLike[]) {
    if (facts.length >= max) break;
    const confidence = item?.confidence;
    if (confidence !== "high" && confidence !== "medium") continue;
    const name = collapse(str(item?.technology?.name));
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    facts.push({
      kind: "technology",
      fato: name,
      fonte_url: THEIRSTACK_SOURCE_URL,
      data: dateIso,
      confianca: confidence === "high" ? "alta" : "media",
    });
  }
  return facts;
}

export interface PostLike {
  postUrl?: unknown;
  text?: unknown;
  publishedAt?: unknown;
}

/** Posts do proprio lead com url http(s), texto e data na janela. */
export function recentPosts<T extends PostLike>(posts: T[] | unknown, now: Date, windowDays: number, max: number): T[] {
  if (!Array.isArray(posts)) return [];
  const out: T[] = [];
  for (const post of posts as T[]) {
    if (out.length >= max) break;
    if (!httpUrl(post?.postUrl)) continue;
    if (!collapse(str(post?.text))) continue;
    if (!dateWithinWindow(post?.publishedAt, now, windowDays)) continue;
    out.push(post);
  }
  return out;
}

/**
 * Post do proprio lead? Sem `authorName`, assume que sim (o Apify consultou o perfil do
 * lead). Com autor, exige o primeiro e o ultimo nome do lead como palavras do autor:
 * repost/post de terceiro e descartado.
 */
export function isOwnPost(post: { authorName?: unknown }, leadName: string | null | undefined): boolean {
  const author = normalizeText(post.authorName);
  if (!author) return true;
  const words = normalizeText(leadName).split(" ").filter(Boolean);
  if (words.length === 0) return false;
  const padded = ` ${author} `;
  const required = words.length === 1 ? [words[0]] : [words[0], words[words.length - 1]];
  return required.every((word) => padded.includes(` ${word} `));
}

/**
 * Posts (ja filtrados pelo `relevance-classifier`) da pessoa do lead. Fato = ate 280
 * caracteres do texto; data = publicacao; confianca alta; leva o identificador do lead.
 */
export function postFacts(
  posts: PostLike[],
  lead: { apolloId: string | null; email: string | null },
  now: Date,
  windowDays: number
): DossierFact[] {
  const facts: DossierFact[] = [];
  for (const post of posts) {
    const url = httpUrl(post.postUrl);
    const data = dateWithinWindow(post.publishedAt, now, windowDays);
    const text = collapse(str(post.text));
    if (!url || !data || !text) continue;
    facts.push({
      kind: "post",
      fato: truncate(text, POST_TEXT_MAX),
      fonte_url: url,
      data,
      confianca: "alta",
      lead_apollo_id: lead.apolloId ?? null,
      lead_email: lead.email ?? null,
    });
  }
  return facts;
}

/** `empty` sem fatos; `partial` com fatos e fonte falha; senao `complete`. */
export function dossierStatus(facts: DossierFact[], failedSources: string[]): DossierStatus {
  if (facts.length === 0) return "empty";
  return failedSources.length > 0 ? "partial" : "complete";
}

/** Garantia final: so fatos com fonte http(s), texto e data. */
export function isValidFact(fact: DossierFact): boolean {
  return (
    Boolean(httpUrl(fact.fonte_url)) &&
    typeof fact.fato === "string" &&
    fact.fato.trim().length > 0 &&
    /^\d{4}-\d{2}-\d{2}$/.test(fact.data)
  );
}
