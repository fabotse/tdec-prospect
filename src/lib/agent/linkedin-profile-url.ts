/**
 * FEL-77: URL de perfil do LinkedIn vinda do enrichment do Apollo.
 *
 * Funcao PURA. Devolve a URL com trim quando ela e http(s), o host e `linkedin.com` (ou
 * um subdominio, ex.: `www.`, `br.`) e o caminho nao e a raiz. Qualquer outra coisa
 * (nulo, nao-string, vazio, outro host, URL invalida) devolve `null`: o lead segue sem
 * `linkedinUrl`, como antes.
 */
export function linkedInProfileUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || !/^https?:\/\//i.test(trimmed)) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  const host = url.hostname.toLowerCase();
  if (host !== "linkedin.com" && !host.endsWith(".linkedin.com")) return null;
  if (url.pathname.replace(/\/+/g, "/") === "/") return null;
  return trimmed;
}
