/**
 * Cron Trigger Auth — Pure Logic
 * Story: 23.1 (follow-up) - Edge Functions de cron só aceitam o pg_cron
 *
 * As Edge Functions `reply-sweep` e `monitor-leads` são chamadas pelo pg_cron
 * com `Authorization: Bearer <service_role_key>` (vault, migrations 00056/00069).
 * O gateway com verify_jwt só confere a assinatura, então a anon key (pública,
 * presente no bundle do site) também passava. Aqui a função exige o papel
 * `service_role`.
 *
 * Aceita:
 *   1. o token igual a SUPABASE_SERVICE_ROLE_KEY (comparação em tempo constante); ou
 *   2. um JWT cujo payload tem `role: "service_role"`.
 * O caso 2 só é seguro porque as duas funções são publicadas COM verify_jwt
 * (o gateway já validou a assinatura). Nunca publicar com --no-verify-jwt.
 *
 * SYNC-NOTICE: supabase/functions/reply-sweep/index.ts e
 * supabase/functions/monitor-leads/index.ts mantêm uma cópia inline desta
 * lógica porque o runtime Deno não resolve imports de src/. Ao alterar aqui,
 * atualizar as duas funções também.
 */

/** Extrai o token de `Authorization: Bearer <token>`; null se ausente. */
export function extractBearerToken(authorization: string | null): string | null {
  if (!authorization) return null;
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim();
  return token ? token : null;
}

/** Comparação em tempo constante (não vaza o tamanho do prefixo em comum). */
export function safeEqual(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

/** Lê o claim `role` do payload de um JWT, sem validar assinatura. */
export function readJwtRole(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const payload = JSON.parse(atob(padded));
    return typeof payload?.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}

/** true se a chamada vem com a credencial de service role (o pg_cron). */
export function isServiceRoleCaller(
  authorization: string | null,
  serviceRoleKey: string | undefined
): boolean {
  const token = extractBearerToken(authorization);
  if (!token) return false;
  const expected = serviceRoleKey?.trim();
  if (expected && safeEqual(token, expected)) return true;
  return readJwtRole(token) === "service_role";
}
