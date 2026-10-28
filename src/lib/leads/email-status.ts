/**
 * email-status.ts — status do e-mail do lead (Story 24.12).
 *
 * Fonte única da normalização do `email_status` do enrichment do Apollo
 * (`/v1/people/match`, já pago). Puro e seguro no cliente: nada de I/O aqui.
 * A gravação best-effort fica em `persist-email-status.ts` (só servidor).
 *
 * - `verified` → o Apollo confirmou o e-mail.
 * - `invalid` → o Apollo marcou o e-mail como inválido.
 * - `unknown` → qualquer outro valor (`unverified`, `guessed`, `likely to engage`, null…).
 * - `null` → status nunca consultado (sem e-mail no enrichment, lead antigo, CSV). Sem aviso.
 *
 * O status é só informativo: não filtra, não bloqueia e não vai para o Instantly.
 */

export type LeadEmailStatus = "verified" | "invalid" | "unknown";

const LEAD_EMAIL_STATUSES: readonly LeadEmailStatus[] = ["verified", "invalid", "unknown"];

export const UNVERIFIED_EMAIL_LABEL = "E-mail não verificado";
export const UNVERIFIED_EMAIL_HINT = "O Apollo não confirmou este e-mail. O envio não é bloqueado.";

/**
 * Normaliza o `email_status` do Apollo. Só existe status quando o enrichment devolveu
 * um e-mail não vazio; sem e-mail devolve `null` (nada a gravar).
 */
export function normalizeApolloEmailStatus(
  email: string | null | undefined,
  rawStatus: unknown
): LeadEmailStatus | null {
  if (typeof email !== "string" || email.trim() === "") return null;
  const status = typeof rawStatus === "string" ? rawStatus.trim().toLowerCase() : null;
  if (status === "verified") return "verified";
  if (status === "invalid") return "invalid";
  return "unknown";
}

/** Aceita só os 3 valores conhecidos; qualquer outra coisa (inclusive `undefined`) vira `null`. */
export function toLeadEmailStatus(value: unknown): LeadEmailStatus | null {
  return typeof value === "string" && (LEAD_EMAIL_STATUSES as readonly string[]).includes(value)
    ? (value as LeadEmailStatus)
    : null;
}

/** true quando o aviso "E-mail não verificado" deve aparecer (`invalid`/`unknown`). `null` não avisa. */
export function isUnverifiedEmailStatus(status: unknown): boolean {
  const normalized = toLeadEmailStatus(status);
  return normalized === "invalid" || normalized === "unknown";
}
