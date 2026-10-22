/**
 * target-accounts.ts — modo lista de contas / ABM (Story 24.17).
 *
 * Leaf module PURO e client-safe (só tipos + funções puras), no molde de `icp-briefing.ts`.
 * Fonte única de:
 *   - normalização de domínio (`normalizeDomain`);
 *   - saneamento das contas extraídas pelo LLM do parse (`sanitizeTargetAccounts`);
 *   - o gate do modo lista (`isAccountListMode`, `hasUnresolvedAccounts`, `resolvedAccountDomains`);
 *   - exibição e edição das contas no card (`formatTargetAccounts`, `formatTargetAccountsInput`,
 *     `parseTargetAccountsInput`).
 *
 * NAO importa `search-defaults.ts` (que importa este módulo) — sem ciclo.
 */

import type { ParsedBriefing, SuppressedAccount, TargetAccount } from "@/types/agent";

/** Teto de contas no briefing (mesmo teto do schema do PATCH). */
export const TARGET_ACCOUNTS_MAX = 50;

/** Teto do nome de uma conta. */
export const TARGET_ACCOUNT_NAME_MAX = 120;

/** Formato de um domínio já normalizado (`bancox.com.br`). */
export const DOMAIN_REGEX = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;

/**
 * Normaliza um domínio digitado/colado: minúsculas, trim, sem protocolo, `www.`, porta,
 * caminho, query ou `@`-prefixo de e-mail. Inválido → `null`.
 *   "https://www.BancoX.com.br/contato?x=1" → "bancox.com.br"
 *   "joao@empresay.com" → "empresay.com"
 */
export function normalizeDomain(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let value = raw.trim().toLowerCase();
  if (!value) return null;
  value = value.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  value = value.replace(/^\/\//, "");
  // Corta caminho, query e fragmento.
  value = value.split(/[/?#]/)[0] ?? "";
  // E-mail ou credencial (`user@dominio`) → fica o que vem depois do último `@`.
  if (value.includes("@")) value = value.slice(value.lastIndexOf("@") + 1);
  // Porta.
  value = value.replace(/:\d*$/, "");
  value = value.replace(/^www\./, "");
  value = value.replace(/\.$/, "");
  return DOMAIN_REGEX.test(value) ? value : null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * O domínio aparece no texto como domínio INTEIRO (não como sufixo de outro):
 * "x.com" não casa em "bancox.com" nem em "a.x.com.br". Antes dele: início ou caractere
 * fora de [a-z0-9.-] (inclui "@", "/", espaço; "." não é fronteira), com um `www.` opcional
 * (o mesmo prefixo que `normalizeDomain` tira). Depois: fim, caractere
 * fora de [a-z0-9.-], ou um "." de pontuação que não continua o domínio.
 */
function textMentionsDomain(haystack: string, domain: string): boolean {
  return new RegExp(
    `(?:^|[^a-z0-9.-])(?:www\\.)?${escapeRegExp(domain)}(?:\\.(?![a-z0-9-])|[^a-z0-9.-]|$)`
  ).test(haystack);
}

/** Nome normalizado para dedupe (minúsculas, sem acento, espaços colapsados). */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.trim().slice(0, TARGET_ACCOUNT_NAME_MAX).trim();
  return name || null;
}

/** Dedupe por domínio (senão por nome normalizado), preservando a 1ª ocorrência; teto de 50. */
function dedupeAccounts(accounts: TargetAccount[]): TargetAccount[] {
  const seen = new Set<string>();
  const result: TargetAccount[] = [];
  for (const account of accounts) {
    const key = account.domain
      ? `d:${account.domain}`
      : `n:${normalizeName(account.name ?? "")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(account);
    if (result.length >= TARGET_ACCOUNTS_MAX) break;
  }
  return result;
}

/**
 * Saneia as contas devolvidas pelo LLM. Coerção item a item (um item ruim não derruba os
 * outros). Item sem nome e sem domínio é descartado. Domínio citado literalmente pelo usuário
 * → confiança `"high"`; senão vale a do LLM (default `"low"`). Dedupe + teto de 50.
 */
export function sanitizeTargetAccounts(raw: unknown, userText: string): TargetAccount[] {
  if (!Array.isArray(raw)) return [];
  const haystack = (userText ?? "").toLowerCase();
  const accounts: TargetAccount[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const name = cleanName(record.name);
    const domain = normalizeDomain(record.domain);
    if (!name && !domain) continue;
    const confidence: TargetAccount["confidence"] =
      domain && textMentionsDomain(haystack, domain)
        ? "high"
        : record.confidence === "high"
          ? "high"
          : "low";
    accounts.push({ name, domain, confidence });
  }
  return dedupeAccounts(accounts);
}

/**
 * Modo lista de contas: há contas (restantes ou suprimidas) e o fluxo NAO é o de leads
 * importados (`skipSteps` com `search_leads`).
 */
export function isAccountListMode(
  briefing:
    | Partial<Pick<ParsedBriefing, "targetAccounts" | "suppressedAccounts" | "skipSteps">>
    | null
    | undefined
): boolean {
  if (!briefing) return false;
  if (briefing.skipSteps?.includes("search_leads")) return false;
  return (
    (briefing.targetAccounts?.length ?? 0) > 0 ||
    (briefing.suppressedAccounts?.length ?? 0) > 0
  );
}

/** true quando alguma conta ainda não tem domínio (o agente precisa perguntar o site). */
export function hasUnresolvedAccounts(accounts: TargetAccount[] | null | undefined): boolean {
  return (accounts ?? []).some((a) => !a.domain);
}

/** Domínios das contas resolvidas (sem duplicatas, na ordem). */
export function resolvedAccountDomains(accounts: TargetAccount[] | null | undefined): string[] {
  return Array.from(
    new Set((accounts ?? []).map((a) => a.domain).filter((d): d is string => Boolean(d)))
  );
}

/** Contas sem domínio, pelo nome (para a pergunta "Qual o site de: X?"). */
export function unresolvedAccountNames(accounts: TargetAccount[] | null | undefined): string[] {
  return (accounts ?? [])
    .filter((a) => !a.domain)
    .map((a) => a.name)
    .filter((n): n is string => Boolean(n));
}

/**
 * Exibição das contas (resumo e chip):
 *   `Banco X (bancox.com.br)`, `empresay.com`, `Banco Z (bancoz.com.br — confirme)`,
 *   `Empresa W (dominio?)`.
 */
export function formatTargetAccounts(accounts: TargetAccount[] | null | undefined): string {
  return (accounts ?? [])
    .map((a) => {
      if (!a.domain) return `${a.name ?? "Conta"} (dominio?)`;
      const domain = a.confidence === "low" ? `${a.domain} — confirme` : a.domain;
      return a.name ? `${a.name} (${domain})` : domain;
    })
    .join(", ");
}

/**
 * Valor inicial do editor do chip: como `formatTargetAccounts`, mas sem o "(dominio?)" das
 * contas sem domínio. Mantém o "— confirme" das contas `"low"` — salvar sem mexer nelas não
 * as promove a `"high"` (`parseTargetAccountsInput` lê a marca de volta).
 */
export function formatTargetAccountsInput(accounts: TargetAccount[] | null | undefined): string {
  return (accounts ?? [])
    .map((a) => {
      if (!a.domain) return a.name ?? "";
      if (!a.name) return a.confidence === "low" ? `${a.domain} — confirme` : a.domain;
      const domain = a.confidence === "low" ? `${a.domain} — confirme` : a.domain;
      return `${a.name} (${domain})`;
    })
    .filter(Boolean)
    .join(", ");
}

/** Marca " — confirme" no fim de um domínio deduzido (aceita "-" no lugar do travessão). */
const CONFIRM_MARK = /\s*[—-]\s*confirme\s*$/i;

export type TargetAccountsParseResult =
  | { ok: true; accounts: TargetAccount[] }
  | { ok: false; error: string };

/**
 * Lê o texto do chip Contas: itens separados por vírgula, cada um `dominio` ou
 * `Nome (dominio)`. Item sem domínio válido → erro `Informe o dominio de: X (...)`.
 * Vazio → erro. Confiança `"high"`, salvo quando a marca "— confirme" continua no item
 * (o usuário não confirmou o domínio deduzido) → `"low"`.
 */
export function parseTargetAccountsInput(raw: string): TargetAccountsParseResult {
  const items = (raw ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (items.length === 0) {
    return { ok: false, error: "Informe ao menos uma conta (ex.: Banco X (bancox.com.br))." };
  }

  const accounts: TargetAccount[] = [];
  const missing: string[] = [];
  for (const item of items) {
    const match = item.match(/^(.*?)\s*\(([^()]*)\)\s*$/);
    if (match) {
      const name = cleanName(match[1]);
      const marked = CONFIRM_MARK.test(match[2]);
      const domain = normalizeDomain(match[2].replace(CONFIRM_MARK, ""));
      if (!domain) {
        missing.push(name ?? item);
        continue;
      }
      accounts.push({ name, domain, confidence: marked ? "low" : "high" });
      continue;
    }
    const marked = CONFIRM_MARK.test(item);
    const domain = normalizeDomain(item.replace(CONFIRM_MARK, ""));
    if (!domain) {
      missing.push(item);
      continue;
    }
    accounts.push({ name: null, domain, confidence: marked ? "low" : "high" });
  }

  if (missing.length > 0) {
    const first = missing[0];
    return {
      ok: false,
      error: `Informe o dominio de: ${missing.join(", ")} (ex.: ${first} (empresa.com.br))`,
    };
  }
  return { ok: true, accounts: dedupeAccounts(accounts) };
}

/** Suprimidas para o resumo: `Banco X (bancox.com.br) — motivo`, juntadas com "; ". */
export function formatSuppressedAccounts(
  suppressed: SuppressedAccount[] | null | undefined
): string {
  return (suppressed ?? [])
    .map((s) => `${s.name ? `${s.name} (${s.domain})` : s.domain} — ${s.reason}`)
    .join("; ");
}

/** Suprimidas para o aviso curto: `Banco X (motivo)`, juntadas com ", ". */
export function formatSuppressedAccountsShort(
  suppressed: SuppressedAccount[] | null | undefined
): string {
  return (suppressed ?? []).map((s) => `${s.name ?? s.domain} (${s.reason})`).join(", ");
}
