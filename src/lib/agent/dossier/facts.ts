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
/** FEL-57: meta description minima para virar o fato do site (caracteres). */
const SITE_MIN_DESCRIPTION_CHARS = 50;

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

// ----------------------------------------------
// FEL-57: boilerplate de navegacao do site
// ----------------------------------------------

/** Links de acessibilidade ("pular para o conteudo") em pt/en/es, em qualquer lugar. */
const SKIP_LINK_PATTERN =
  /(?<![\p{L}\p{N}])(?:pular|ir|saltar|skip)\s+(?:para|al|to)\s+(?:o\s+|a\s+|el\s+|la\s+)?(?:conte[uú]do|contenido|content|menu|men[uú]|navega[cç][aã]o|navegaci[oó]n|navigation|rodap[eé]|footer|busca|search)(?:\s+principal|\s+main)?(?![\p{L}\p{N}])/giu;

/** Blocos que nunca sao texto da pagina (removidos no documento INTEIRO, antes das linhas). */
const NON_TEXT_BLOCKS = /<(script|style|noscript|template|svg)\b[^>]*>[\s\S]*?<\/\1\s*>|<!--[\s\S]*?-->/gi;

/** Palavras de menu/cabecalho (normalizadas, sem acento): login, contato, CTA etc. */
const NAV_STRONG_WORDS = new Set([
  "login", "logon", "logout", "entrar", "sair", "signin", "signup", "sign", "cadastre", "cadastrese",
  "cadastrar", "cadastro", "inscrevase", "menu", "home", "inicio", "buscar", "busca", "pesquisar",
  "search", "contato", "contatos", "contact", "especialista", "especialistas", "conteudo", "pular",
  "skip", "idioma", "idiomas", "language", "blog", "carreiras", "trabalhe", "suporte", "ajuda", "faq",
  "demo", "demonstracao", "agende", "orcamento", "acessar", "acesse", "portal", "voltar", "topo",
  "fechar", "abrir", "navegacao", "navigation", "toggle",
]);

/** Codigos/nomes de idioma de um seletor ("PT EN ES", "PT-BR", "English"). */
const LANGUAGE_WORDS = new Set([
  "pt", "en", "es", "br", "ptbr", "enus", "eses", "english", "espanol", "portugues", "ingles",
]);

/** Palavras de ligacao/itens de menu genericos: so contam junto de evidencia de menu. */
const NAV_WEAK_WORDS = new Set([
  "o", "a", "os", "as", "de", "do", "da", "dos", "das", "para", "com", "um", "uma", "ao", "e",
  "no", "na", "nos", "nosso", "nossa", "nossos", "nossas", "seu", "sua", "fale", "conosco",
  "quem", "somos", "sobre", "minha", "meu", "area", "to", "in", "up", "out", "log", "main",
  "principal", "ir", "the", "us", "conta", "imprensa", "parceiros", "cases", "solucoes",
  "produtos", "servicos", "eventos", "noticias", "cliente", "clientes",
]);

type NavKind = "lang" | "strong" | "weak" | null;

function navToken(token: string): NavKind {
  const normalized = normalizeText(token).replace(/ /g, "");
  if (!normalized) return "weak"; // pontuacao/separador ("|", "/", "…")
  if (LANGUAGE_WORDS.has(normalized)) return "lang";
  if (NAV_STRONG_WORDS.has(normalized)) return "strong";
  if (NAV_WEAK_WORDS.has(normalized)) return "weak";
  return null;
}

function words(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

/** Seletor de idioma: 2+ codigos de idioma seguidos. */
function hasLanguageSelector(tokens: string[]): boolean {
  for (let i = 1; i < tokens.length; i++) {
    if (navToken(tokens[i - 1]) === "lang" && navToken(tokens[i]) === "lang") return true;
  }
  return false;
}

const MD_LINK = /!?\[[^\]]*\]\([^)]*\)/g;

/** Linha so de links markdown (lista/barra de menu). */
function isLinkOnlyLine(rawLine: string): boolean {
  if (!/\[[^\]]*\]\([^)]*\)/.test(rawLine)) return false;
  return rawLine.replace(MD_LINK, "").replace(/[\s*+\-|/·•>#]+/g, "") === "";
}

/** "Home | Sobre | Contato": 2+ itens CURTOS separados por | / · •. */
function isSeparatedMenuLine(rawLine: string, cleaned: string): boolean {
  const parts = rawLine
    .replace(MD_LINK, (link) => link.replace(/^!?\[([^\]]*)\].*$/, "$1"))
    .split(/\s[|/·•]\s|[|·•]/)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length >= 2 && parts.every((part) => words(part).length <= 3) && words(cleaned).length <= 12;
}

/**
 * Linha de navegacao, SO com evidencia de menu: link de pular conteudo (ja trocado),
 * linha so de links curta, itens curtos separados por | / · •, seletor de idioma, ou uma
 * palavra de menu sozinha ("Menu", "Login"). Frase comercial com essas palavras fica.
 */
function isNavigationLine(rawLine: string, cleaned: string): boolean {
  const tokens = words(cleaned);
  if (tokens.length === 0) return true;
  if (tokens.length === 1 && navToken(tokens[0]) !== null && navToken(tokens[0]) !== "weak") return true;
  if (tokens.every((token) => navToken(token) === "lang") && tokens.length >= 2) return true;
  if (isLinkOnlyLine(rawLine) && tokens.length <= 6) return true;
  return isSeparatedMenuLine(rawLine, cleaned);
}

/**
 * Tira o menu colado no INICIO de UMA linha original (pagina sem quebra de linha), so com
 * evidencia NA PROPRIA LINHA: ela comecava com "pular para o conteudo" ou a sequencia
 * inicial de palavras de menu tem um seletor de idioma. Corta ate o ultimo item de
 * menu/idioma ("Fale com um especialista Login PT EN ES Somos..." -> "Somos..."). A
 * evidencia de uma linha nunca corta outra: uma linha de conteudo depois de um skip link
 * ("Suporte ao cliente e especialistas para empresas...") fica intacta.
 */
function stripLeadingNavigation(text: string, startedWithSkipLink: boolean): string {
  const tokens = text.split(" ");
  let cut = 0;
  let end = 0;
  for (let i = 0; i < tokens.length; i++) {
    const kind = navToken(tokens[i]);
    if (kind === null) break;
    end = i + 1;
    if (kind === "strong" || kind === "lang") cut = i + 1;
  }
  const evidence = startedWithSkipLink || hasLanguageSelector(tokens.slice(0, end));
  if (!evidence || cut === 0) return text;
  return tokens.slice(cut).join(" ").replace(/^[\s|/·•…,.:;–—-]+/u, "");
}

/**
 * Texto util do site, sem o boilerplate de navegacao (script/style, links de "pular para
 * o conteudo", linhas de menu, seletor de idioma, login, CTA).
 */
export function cleanSiteText(raw: string): string {
  // Documento inteiro primeiro: blocos multilinha nao podem vazar para as linhas.
  const document = raw.replace(NON_TEXT_BLOCKS, "\n");
  const lines = document
    .split(/\r?\n/)
    .map((line) => {
      // Skip link no COMECO desta linha (o texto dela, sem imagens) = evidencia so dela.
      const head = cleanMarkdown(line.replace(/!\[[^\]]*\]\([^)]*\)/g, " "));
      SKIP_LINK_PATTERN.lastIndex = 0;
      const skip = SKIP_LINK_PATTERN.exec(head);
      SKIP_LINK_PATTERN.lastIndex = 0;
      const rawLine = line.replace(SKIP_LINK_PATTERN, " ");
      return { rawLine, cleaned: cleanMarkdown(rawLine), startedWithSkipLink: skip !== null && skip.index === 0 };
    })
    .filter(({ rawLine, cleaned }) => cleaned && !isNavigationLine(rawLine, cleaned))
    .map(({ cleaned, startedWithSkipLink }) => stripLeadingNavigation(cleaned, startedWithSkipLink))
    .filter(Boolean);
  return collapse(lines.join(" "));
}

/** Meta description / og:description da pagina, quando o extract traz. */
function pageDescription(page: Record<string, unknown>): string {
  const metadata = (page.metadata && typeof page.metadata === "object" ? page.metadata : {}) as Record<string, unknown>;
  const candidates = [
    page.description,
    page.metaDescription,
    page.ogDescription,
    metadata.description,
    metadata["og:description"],
    metadata.ogDescription,
  ];
  for (const candidate of candidates) {
    const text = collapse(cleanMarkdown(str(candidate)));
    if (text.length >= SITE_MIN_DESCRIPTION_CHARS) return text;
  }
  return "";
}

/**
 * Site: extract de `https://<dominio>`. Fato = titulo + trecho inicial (ate `maxChars`),
 * SEM o menu da pagina (FEL-57). Com menos de 200 caracteres uteis depois da limpeza, usa
 * a meta description (>= 50); sem ela, nao ha fato. Data = hoje; confianca alta.
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
    | Record<string, unknown>
    | undefined;
  if (!page || typeof page !== "object") return null;
  const raw = str(page.markdown) || str(page.content) || str(page.text);
  let body = cleanSiteText(raw);
  if (body.length < SITE_MIN_USEFUL_CHARS) body = pageDescription(page);
  if (!body) return null;
  const title = collapse(cleanMarkdown(str(page.title)));
  const fato = truncate(title && !body.startsWith(title) ? `${title} — ${body}` : body, maxChars);
  return { kind: "site", fato, fonte_url: url, data: isoDate(now), confianca: "alta" };
}

// ----------------------------------------------
// FEL-57: noticia/vaga fora do Brasil
// ----------------------------------------------

/** Monta um teste de "frase inteira" sobre texto normalizado (palavras separadas por 1 espaco). */
function phraseMatcher(phrases: string[]): RegExp {
  return new RegExp(`(?:^| )(?:${phrases.join("|")})(?: |$)`);
}

/**
 * Brasil, brasileiro(a) e localidades brasileiras: todos os estados, todas as capitais,
 * cidades grandes e os portos (normalizados, sem acento). Palavras comuns que tambem sao
 * lugar ("natal", "santos", "vitoria") contam: o erro so mantem a noticia. "Para" (o
 * estado) fica de fora: e a preposicao mais comum em pt e es.
 */
const BRAZIL_MENTION = phraseMatcher([
  "brasil", "brazil", "brasileir\\w*", "brasilen\\w*", "brazilian\\w*",
  // estados
  "acre", "alagoas", "amapa", "amazonas", "bahia", "ceara", "distrito federal", "espirito santo",
  "goias", "maranhao", "mato grosso", "mato grosso do sul", "minas gerais", "paraiba",
  "parana", "pernambuco", "piaui", "rio de janeiro", "rio grande do norte", "rio grande do sul",
  "rondonia", "roraima", "santa catarina", "sao paulo", "sergipe", "tocantins",
  // capitais
  "rio branco", "maceio", "macapa", "manaus", "salvador", "fortaleza", "brasilia", "vitoria",
  "goiania", "sao luis", "cuiaba", "campo grande", "belo horizonte", "belem", "joao pessoa",
  "curitiba", "recife", "teresina", "natal", "porto alegre", "porto velho", "boa vista",
  "florianopolis", "aracaju", "palmas",
  // portos
  "santos", "paranagua", "itajai", "suape", "pecem", "rio grande", "itaguai", "sepetiba",
  "sao francisco do sul", "navegantes", "itapoa", "imbituba", "sao sebastiao", "vila do conde",
  "itaqui", "mucuripe", "aratu", "ilheus", "tubarao", "praia mole", "barcarena", "antonina",
  "porto de santos", "complexo do pecem",
  // cidades grandes
  "campinas", "guarulhos", "osasco", "santo andre", "sao bernardo do campo", "sao jose dos campos",
  "sorocaba", "ribeirao preto", "jundiai", "piracicaba", "cubatao", "joinville", "blumenau",
  "londrina", "maringa", "foz do iguacu", "uberlandia", "contagem", "juiz de fora", "betim",
  "niteroi", "duque de caxias", "nova iguacu", "macae", "caxias do sul", "pelotas",
  "feira de santana", "camacari", "campina grande", "caruaru", "petrolina", "anapolis",
]);

/**
 * Evidencia POSITIVA de que o fato e de fora: outro pais ou cidade/porto estrangeiro
 * citado (pt/es/en, normalizados). Lugares que colidem com o Brasil ("Lima", "Porto",
 * "Santiago" sozinho, "Rosario") e palavras comuns ("usa", verbo) ficam de fora.
 */
const FOREIGN_MENTION = phraseMatcher([
  // paises
  "argentina", "mexico", "chile", "colombia", "peru", "uruguai", "uruguay", "paraguai", "paraguay",
  "bolivia", "equador", "ecuador", "venezuela", "panama", "costa rica", "guatemala", "honduras",
  "nicaragua", "cuba", "republica dominicana", "porto rico", "puerto rico", "el salvador",
  "espanha", "espana", "spain", "portugal", "estados unidos", "eeuu", "ee uu", "eua",
  "united states", "canada", "china", "india", "japao", "japon", "japan", "alemanha", "alemania",
  "germany", "franca", "francia", "france", "italia", "italy", "reino unido", "united kingdom",
  "angola", "mocambique",
  // cidades e portos estrangeiros
  "buenos aires", "bahia blanca", "cordoba", "mendoza", "montevideo", "montevideu",
  "santiago de chile", "valparaiso", "san antonio", "antofagasta", "bogota", "medellin",
  "cartagena", "barranquilla", "buenaventura", "callao", "quito", "guayaquil", "caracas",
  "asuncion", "assuncao", "la paz", "ciudad de mexico", "cidade do mexico", "monterrey",
  "guadalajara", "veracruz", "manzanillo", "lazaro cardenas", "madrid", "barcelona", "valencia",
  "sevilla", "bilbao", "algeciras", "lisboa", "sines", "leixoes", "miami", "nova york",
  "new york", "nueva york", "houston",
]);

/** ccTLDs de paises hispanicos e de Portugal (`.co` sozinho e generico, fica de fora). */
const FOREIGN_CCTLDS = new Set([
  "es", "ar", "mx", "cl", "pe", "uy", "py", "bo", "ec", "ve", "cr", "pa", "gt", "hn", "sv",
  "ni", "do", "cu", "pr", "pt",
]);

/** Site publicado fora do Brasil (ccTLD hispanico/portugues; "algo.com.co" conta). */
export function isForeignHost(url: string): boolean {
  const host = hostOf(url);
  if (!host) return false;
  const labels = host.split(".");
  const tld = labels[labels.length - 1];
  if (tld === "br") return false;
  if (FOREIGN_CCTLDS.has(tld)) return true;
  return tld === "co" && labels.length >= 3 && ["com", "org", "net", "gov", "edu"].includes(labels[labels.length - 2]);
}

/** Palavras que so existem em espanhol (normalizadas), comuns em titulo/lead de noticia. */
const SPANISH_WORDS = new Set([
  "el", "los", "las", "del", "al", "y", "una", "con", "su", "sus", "muy", "tambien", "pero",
  "nuevo", "nueva", "nuevos", "nuevas", "puerto", "puertos", "segun", "hasta", "hay", "fue",
  "sin", "cuando", "donde", "millones", "es", "la", "lo", "le", "les", "ya", "han", "estan",
]);

/** Palavras que so existem em portugues (normalizadas). */
const PORTUGUESE_WORDS = new Set([
  "os", "do", "da", "dos", "das", "na", "nas", "em", "um", "uma", "com", "nao", "sao", "mais",
  "pelo", "pela", "ao", "aos", "e", "tambem", "ate", "sem", "onde", "milhoes", "novo", "nova",
  "novos", "novas", "seu", "sua", "anuncia",
]);

/**
 * Texto em espanhol? Marca forte (ñ ¿ ¡ sem ã õ ç) ou mais palavras so-espanholas que
 * so-portuguesas (minimo 2). Na duvida, NAO e espanhol.
 */
export function looksSpanish(text: string): boolean {
  const lower = text.toLowerCase();
  const ptMark = /[ãõç]/.test(lower);
  if (/[ñ¿¡]/.test(lower) && !ptMark) return true;
  let es = 0;
  let pt = ptMark ? 2 : 0;
  for (const word of normalizeText(lower).split(" ")) {
    if (!word) continue;
    if (SPANISH_WORDS.has(word)) es++;
    else if (PORTUGUESE_WORDS.has(word)) pt++;
  }
  return es >= 2 && es > pt;
}

/** Texto normalizado sem o nome da empresa nem a marca do dominio. */
function textWithoutCompany(text: string, companyName: string | null, domain: string): string {
  let normalized = ` ${normalizeText(text)} `;
  const company = normalizeCompanyKey(companyName);
  if (company) normalized = normalized.split(` ${company} `).join(" ");
  const brand = domainBrand(domain);
  if (brand.length >= 3) normalized = normalized.split(` ${brand} `).join(" ");
  return normalized;
}

/**
 * O texto fala do Brasil? O nome da empresa e a marca do dominio sao tirados antes
 * ("Santos Brasil" nao conta como mencao ao Brasil); lugares estrangeiros que contem
 * nome brasileiro ("El Salvador", "Bahia Blanca") tambem.
 */
export function mentionsBrazil(text: string, companyName: string | null, domain: string): boolean {
  const normalized = textWithoutCompany(text, companyName, domain)
    .split(" el salvador ").join(" ")
    .split(" bahia blanca ").join(" ");
  return BRAZIL_MENTION.test(normalized.trim());
}

/** O texto cita outro pais ou cidade/porto estrangeiro (fora o nome da empresa)? */
export function mentionsForeignPlace(text: string, companyName: string | null, domain: string): boolean {
  return FOREIGN_MENTION.test(textWithoutCompany(text, companyName, domain).trim());
}

/**
 * FEL-57: noticia/vaga de fora do Brasil. So descarta com EVIDENCIA POSITIVA dupla:
 * 1. o FATO e de fora: o titulo/trecho cita outro pais ou lugar estrangeiro e NAO cita o
 *    Brasil nem localidade brasileira; E
 * 2. a PUBLICACAO e de fora: texto em espanhol ou site de ccTLD hispanico/portugues.
 * Sozinho, nenhum sinal derruba: veiculo brasileiro em portugues falando de contrato na
 * Argentina fica; veiculo estrangeiro falando de Santos/Vitoria fica; espanhol sem lugar
 * nenhum fica. Na duvida a noticia FICA. `.br` nunca cai.
 */
export function isOutsideBrazil(
  url: string,
  result: ExaResult,
  ctx: Pick<FactContext, "companyName" | "domain">
): boolean {
  const host = hostOf(url);
  if (host && host.endsWith(".br")) return false;
  const sample = `${str(result.title)} ${str(result.summary).slice(0, 400)} ${str(result.text).slice(0, 400)}`;
  if (!mentionsForeignPlace(sample, ctx.companyName, ctx.domain)) return false;
  if (mentionsBrazil(sample, ctx.companyName, ctx.domain)) return false;
  return isForeignHost(url) || looksSpanish(sample);
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
    if (!url || seen.has(url) || isSocialUrl(url) || isOutsideBrazil(url, result, ctx)) continue;
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
    if (!url || seen.has(url) || isThirdPartyLinkedInUrl(url) || isOutsideBrazil(url, result, ctx)) continue;
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
