/**
 * Posts do LinkedIn reaproveitados pelo icebreaker premium — FEL-57 (follow-up da 24.19)
 *
 * Com o toggle de LinkedIn ligado, o `research_accounts` ja busca no Apify os posts de
 * cada lead. Antes, o `create_campaign` buscava DE NOVO o mesmo perfil (custo e tempo em
 * dobro). Agora o research grava no proprio output (`agent_steps.output` desta execucao)
 * os posts BRUTOS de cada perfil buscado com sucesso, e o `create_campaign` os usa no
 * lugar da segunda chamada.
 *
 * Equivalencia com a busca de hoje (Regra nº 1, ponto 3):
 * - a busca de hoje do `create_campaign` pede ao actor `limitPerSource: 3` e o
 *   `ApifyService` descarta itens vazios (sem URL e sem texto) do dataset. Logo, o que
 *   ela usa sao os itens nao vazios entre as 3 PRIMEIRAS posicoes do dataset;
 * - o dossie guarda exatamente isso: os posts cuja posicao no dataset BRUTO
 *   (`rawIndexes` do `ApifyService`, antes do descarte) e < 3, na ordem do dataset e
 *   antes de qualquer filtro do dossie (janela, autoria, classificador). Dataset
 *   `[A, vazio, B, C]` -> `[A, B]`, igual a busca com limite 3;
 * - PREMISSA (nao verificavel offline): o input do actor `supreme_coder/linkedin-post`
 *   (`Wpp1BZ6yGWjySadk3`) e so `{ urls, limitPerSource, deepScrape, rawData }`; NAO ha
 *   parametro de ordenacao. Assume-se que o actor percorre o feed do perfil sempre na
 *   mesma ordem e para no `limitPerSource`, ou seja, o dataset com limite 3 e o prefixo
 *   de 3 itens do dataset com limite 10. Hoje a 2a busca ja acontecia minutos depois da
 *   1a, entao um post novo no meio do caminho ja mudava o resultado do mesmo jeito;
 * - sem `rawIndexes` coerentes (servico antigo, mock, formato inesperado) NADA e
 *   guardado: o `create_campaign` busca como hoje;
 * - so entra perfil cuja busca terminou com `success: true` e com ao menos um post
 *   aproveitavel. Sem chave, sem tempo ou perfil nao buscado nao gravam nada e o
 *   `create_campaign` busca como hoje;
 * - FEL-77 (uma chamada ao Apify por lead): busca vazia, falha, timeout ou sem posts
 *   equivalentes ficam em `output.icebreakerPostsAttempted`; o `create_campaign` NAO
 *   busca esse perfil de novo e usa o icebreaker padrao (ver `readIcebreakerPostsState`).
 *
 * Modulo PURO (sem I/O).
 */

import type { LinkedInPost } from "@/types/apify";

/** Limite de posts do icebreaker premium (o que o `create_campaign` pede ao Apify). */
export const ICEBREAKER_POSTS_LIMIT = 3;

/**
 * Idade maxima (ms) dos posts reaproveitados. O research roda logo antes do
 * `create_campaign`; uma reexecucao muito depois (retry horas depois) busca de novo.
 */
export const DOSSIER_POSTS_REUSE_MAX_AGE_MS = 6 * 60 * 60 * 1000;

/** Tolerancia para relogio adiantado entre as maquinas que rodam os dois steps (ms). */
const CLOCK_SKEW_MS = 5 * 60 * 1000;

export interface ReusableLinkedInPosts {
  /** Posts como o Apify devolveu, na ordem, cortados em `ICEBREAKER_POSTS_LIMIT`. */
  posts: LinkedInPost[];
  /** Instante (ISO) da busca. */
  fetchedAt: string;
  /** `limitPerSource` pedido ao actor nesta busca. */
  fetchLimit: number;
}

/** Chave = `linkedinUrl` do lead, exatamente como veio no lead. */
export type ReusablePostsByUrl = Record<string, ReusableLinkedInPosts>;

/** Copia so os campos do `LinkedInPost` (sem `undefined`, para o JSON ser fiel). */
function copyPost(post: LinkedInPost): LinkedInPost {
  const copy: LinkedInPost = {
    postUrl: post.postUrl,
    text: post.text,
    publishedAt: post.publishedAt,
    likesCount: post.likesCount,
    commentsCount: post.commentsCount,
  };
  if (post.repostsCount !== undefined) copy.repostsCount = post.repostsCount;
  if (post.authorName !== undefined) copy.authorName = post.authorName;
  if (post.authorHeadline !== undefined) copy.authorHeadline = post.authorHeadline;
  return copy;
}

/** Posicoes validas: inteiros >= 0, estritamente crescentes, uma por post. */
function validRawIndexes(rawIndexes: unknown, count: number): rawIndexes is number[] {
  if (!Array.isArray(rawIndexes) || rawIndexes.length !== count) return false;
  let previous = -1;
  for (const index of rawIndexes) {
    if (typeof index !== "number" || !Number.isInteger(index) || index <= previous) return false;
    previous = index;
  }
  return true;
}

/**
 * Entrada reaproveitavel a partir de uma busca BEM-SUCEDIDA: os posts das posicoes
 * brutas < `ICEBREAKER_POSTS_LIMIT` (o que a busca com limite 3 produziria).
 * `null` quando nao da para garantir a equivalencia (limite menor que 3, data invalida,
 * posicoes ausentes/incoerentes) ou quando nao sobra post (o `create_campaign` busca).
 */
export function buildReusableEntry(
  posts: LinkedInPost[] | null | undefined,
  rawIndexes: number[] | null | undefined,
  fetchedAt: string,
  fetchLimit: number
): ReusableLinkedInPosts | null {
  if (!Number.isFinite(fetchLimit) || fetchLimit < ICEBREAKER_POSTS_LIMIT) return null;
  if (Number.isNaN(Date.parse(fetchedAt))) return null;
  if (!Array.isArray(posts) || !validRawIndexes(rawIndexes, posts.length)) return null;
  const selected = posts.filter((_, i) => rawIndexes[i] < ICEBREAKER_POSTS_LIMIT).map(copyPost);
  if (selected.length === 0) return null;
  return { posts: selected, fetchedAt, fetchLimit };
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Post lido do JSONB: valida TODOS os campos que o prompt usa; senao `null`. */
function parsePost(value: unknown): LinkedInPost | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (!isString(raw.postUrl) || !isString(raw.text) || !isString(raw.publishedAt)) return null;
  if (!isNumber(raw.likesCount) || !isNumber(raw.commentsCount)) return null;
  if (raw.repostsCount !== undefined && !isNumber(raw.repostsCount)) return null;
  if (raw.authorName !== undefined && !isString(raw.authorName)) return null;
  if (raw.authorHeadline !== undefined && !isString(raw.authorHeadline)) return null;
  return copyPost(raw as unknown as LinkedInPost);
}

/**
 * Le os posts reaproveitaveis do output do `research_accounts`. Qualquer duvida sobre uma
 * entrada (formato, limite, idade) a descarta: o lead cai na busca de hoje. Nunca lanca.
 *
 * @param output - `agent_steps.output` da linha `research_accounts` desta execucao.
 * @param nowMs - relogio de quem le (ms).
 * @returns `linkedinUrl` -> posts prontos para o prompt (nunca lista vazia).
 */
export function readReusablePosts(output: unknown, nowMs: number): Map<string, LinkedInPost[]> {
  const result = new Map<string, LinkedInPost[]>();
  try {
    const byUrl = (output as { icebreakerPosts?: unknown } | null | undefined)?.icebreakerPosts;
    if (!byUrl || typeof byUrl !== "object" || Array.isArray(byUrl)) return result;
    for (const [url, entry] of Object.entries(byUrl as Record<string, unknown>)) {
      if (!url || !entry || typeof entry !== "object") continue;
      const { posts, fetchedAt, fetchLimit } = entry as Record<string, unknown>;
      if (!isNumber(fetchLimit) || fetchLimit < ICEBREAKER_POSTS_LIMIT) continue;
      if (!isString(fetchedAt)) continue;
      const fetchedMs = Date.parse(fetchedAt);
      if (Number.isNaN(fetchedMs)) continue;
      const age = nowMs - fetchedMs;
      if (age > DOSSIER_POSTS_REUSE_MAX_AGE_MS || age < -CLOCK_SKEW_MS) continue;
      // Lista vazia nao e "reaproveitavel": o `create_campaign` busca como hoje.
      if (!Array.isArray(posts) || posts.length === 0 || posts.length > ICEBREAKER_POSTS_LIMIT) continue;
      const parsed = posts.map(parsePost);
      if (parsed.some((post) => post === null)) continue;
      result.set(url, parsed as LinkedInPost[]);
    }
  } catch {
    return new Map();
  }
  return result;
}

// ==============================================
// FEL-77: "ja tentado" no research (uma chamada ao Apify por lead)
// ==============================================

/**
 * Por que o research tentou o Apify para o perfil e NAO deixou posts reaproveitaveis:
 * - `empty`: busca ok sem nenhum post;
 * - `failed`: `success: false` ou excecao;
 * - `timeout`: a chamada comecou e o prazo do step acabou antes da resposta;
 * - `unusable`: busca ok, mas sem posts equivalentes aos da busca com limite 3;
 * - `not_saved`: havia posts, mas o checkpoint so gravou o output minimo (sem eles).
 */
export type IcebreakerAttemptOutcome = "empty" | "failed" | "timeout" | "unusable" | "not_saved";

const ATTEMPT_OUTCOMES: ReadonlySet<string> = new Set<IcebreakerAttemptOutcome>([
  "empty",
  "failed",
  "timeout",
  "unusable",
  "not_saved",
]);

export interface IcebreakerPostsAttempt {
  /** Instante (ISO) da tentativa. */
  attemptedAt: string;
  outcome: IcebreakerAttemptOutcome;
}

/** Chave = `linkedinUrl` do lead, exatamente como veio no lead. */
export type IcebreakerAttemptsByUrl = Record<string, IcebreakerPostsAttempt>;

/** O que o `create_campaign` le do research: posts para reusar e perfis ja tentados. */
export interface IcebreakerPostsState {
  /** `linkedinUrl` -> posts prontos para o prompt (nunca lista vazia). */
  posts: Map<string, LinkedInPost[]>;
  /** Perfis que o research ja tentou no Apify SEM posts reaproveitaveis: nao buscar de novo. */
  attempted: Set<string>;
}

export function emptyIcebreakerPostsState(): IcebreakerPostsState {
  return { posts: new Map(), attempted: new Set() };
}

/**
 * Estado completo lido do output do `research_accounts`. Posts: `readReusablePosts`
 * (inalterado). Tentativas: so entradas validas (motivo conhecido, data parseavel, ate 6 h)
 * em `output.icebreakerPostsAttempted`; output antigo sem a chave = nenhuma tentativa
 * (o `create_campaign` busca como hoje). Nunca lanca.
 */
export function readIcebreakerPostsState(output: unknown, nowMs: number): IcebreakerPostsState {
  const posts = readReusablePosts(output, nowMs);
  const attempted = new Set<string>();
  try {
    const byUrl = (output as { icebreakerPostsAttempted?: unknown } | null | undefined)?.icebreakerPostsAttempted;
    if (byUrl && typeof byUrl === "object" && !Array.isArray(byUrl)) {
      for (const [url, entry] of Object.entries(byUrl as Record<string, unknown>)) {
        if (!url || posts.has(url) || !entry || typeof entry !== "object") continue;
        const { attemptedAt, outcome } = entry as Record<string, unknown>;
        if (!isString(outcome) || !ATTEMPT_OUTCOMES.has(outcome)) continue;
        if (!isString(attemptedAt)) continue;
        const attemptedMs = Date.parse(attemptedAt);
        if (Number.isNaN(attemptedMs)) continue;
        const age = nowMs - attemptedMs;
        if (age > DOSSIER_POSTS_REUSE_MAX_AGE_MS || age < -CLOCK_SKEW_MS) continue;
        attempted.add(url);
      }
    }
  } catch {
    return { posts, attempted: new Set() };
  }
  return { posts, attempted };
}
