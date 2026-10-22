/**
 * account-suppression.ts — supressão de contas do modo lista (Story 24.17). SERVIDOR.
 *
 * Regra PROVISÓRIA até a lista de supressão da 23.5: uma conta está suprimida quando o tenant
 * tem uma oportunidade em `contacted` (vendedor já falando) ou `meeting_booked` (reunião
 * marcada) com um lead cujo e-mail é do domínio da conta (`leads` não guarda o domínio da
 * empresa). Domínios de e-mail pessoal nunca casam. "Cliente" entra quando a 23.5 criar a
 * tabela, atrás desta mesma função.
 *
 * Fail-open: erro de leitura → `console.warn` e nada suprimido (a busca nunca trava por isto).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { SuppressedAccount, TargetAccount } from "@/types/agent";
import type { OpportunityStatus } from "@/types/opportunity";

/** Status de oportunidade que suprimem a conta (negociação em andamento). */
export const SUPPRESSING_OPPORTUNITY_STATUSES: readonly OpportunityStatus[] = [
  "contacted",
  "meeting_booked",
];

/**
 * Domínios de e-mail pessoal (exatos) — o e-mail de um lead nesses domínios nunca identifica
 * uma conta. Vale só para o domínio do e-mail do lead: uma conta-alvo como `uol.com.br`
 * continua podendo ser suprimida por leads com e-mail corporativo dela.
 */
const PERSONAL_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "hotmail.com",
  "hotmail.com.br",
  "outlook.com",
  "outlook.com.br",
  "live.com",
  "msn.com",
  "yahoo.com",
  "yahoo.com.br",
  "icloud.com",
  "me.com",
  "aol.com",
  "protonmail.com",
  "bol.com.br",
  "uol.com.br",
  "terra.com.br",
  "ig.com.br",
]);

const REASON_BY_STATUS: Record<string, string> = {
  meeting_booked: "negociacao em andamento (oportunidade com reuniao marcada)",
  contacted: "negociacao em andamento (oportunidade em contato)",
};

/** Mensagem do step quando todas as contas da lista estão suprimidas. */
export const ALL_ACCOUNTS_SUPPRESSED_MESSAGE =
  "Todas as contas da sua lista estao com negociacao em andamento, entao nao busquei ninguem. Ajuste a lista de contas para seguir.";

function isPersonalEmailDomain(domain: string): boolean {
  return PERSONAL_EMAIL_DOMAINS.has(domain);
}

function emailDomain(email: unknown): string | null {
  if (typeof email !== "string") return null;
  const at = email.lastIndexOf("@");
  if (at < 0) return null;
  const domain = email.slice(at + 1).trim().toLowerCase();
  return domain || null;
}

/** O domínio do e-mail é o da conta ou um subdomínio dela. */
function matchesAccount(emailDom: string, accountDomain: string): boolean {
  return emailDom === accountDomain || emailDom.endsWith(`.${accountDomain}`);
}

/**
 * Contas (por domínio) com negociação em andamento no tenant. `name` volta `null` — quem
 * chama completa com o nome da conta (`withAccountNames`).
 */
export async function findSuppressedAccounts(
  supabase: SupabaseClient,
  tenantId: string,
  domains: string[]
): Promise<SuppressedAccount[]> {
  const candidates = Array.from(new Set(domains.filter(Boolean)));
  if (candidates.length === 0) return [];

  try {
    const { data, error } = await supabase
      .from("opportunities")
      .select("status, lead:leads ( email )")
      .eq("tenant_id", tenantId)
      .in("status", [...SUPPRESSING_OPPORTUNITY_STATUSES]);

    if (error) {
      console.warn("[account-suppression] leitura de oportunidades falhou:", error);
      return [];
    }

    // Status por domínio da conta; `meeting_booked` prevalece sobre `contacted`.
    const statusByDomain = new Map<string, string>();
    for (const row of (data ?? []) as Array<{ status?: string; lead?: unknown }>) {
      const lead = Array.isArray(row.lead) ? row.lead[0] : row.lead;
      const dom = emailDomain((lead as { email?: unknown } | null | undefined)?.email);
      if (!dom || isPersonalEmailDomain(dom) || !row.status) continue;
      for (const candidate of candidates) {
        if (!matchesAccount(dom, candidate)) continue;
        const current = statusByDomain.get(candidate);
        if (current !== "meeting_booked") statusByDomain.set(candidate, row.status);
      }
    }

    return candidates
      .filter((d) => statusByDomain.has(d))
      .map((domain) => ({
        name: null,
        domain,
        reason: REASON_BY_STATUS[statusByDomain.get(domain) ?? ""] ?? REASON_BY_STATUS.contacted,
      }));
  } catch (error) {
    console.warn("[account-suppression] leitura de oportunidades falhou:", error);
    return [];
  }
}

/** Completa o nome das suprimidas a partir das contas da lista. */
export function withAccountNames(
  suppressed: SuppressedAccount[],
  accounts: TargetAccount[] | null | undefined
): SuppressedAccount[] {
  return suppressed.map((s) => ({
    ...s,
    name: s.name ?? (accounts ?? []).find((a) => a.domain === s.domain)?.name ?? null,
  }));
}
