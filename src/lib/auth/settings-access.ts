/**
 * Settings access for non-admin roles
 * Story: 23.5 - Lista de supressão: cadastro e import
 *
 * Configurações é superfície administrativa (Story 2.1/20.5). Os caminhos abaixo são as
 * únicas exceções liberadas a papéis sem `hasAdminAccess` (SDR), em modo leitura: a escrita
 * continua barrada na server action e no RLS. Fonte única para middleware, guard, abas e sidebar.
 */

export const NON_ADMIN_SETTINGS_PATHS = ["/settings/suppression"] as const;

/** TRUE se o caminho é (ou está dentro de) um caminho de Configurações liberado ao não-admin. */
export function isNonAdminSettingsPath(
  pathname: string | null | undefined,
  paths: readonly string[] = NON_ADMIN_SETTINGS_PATHS
): boolean {
  if (!pathname) return false;
  return paths.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
