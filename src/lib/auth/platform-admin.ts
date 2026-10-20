/**
 * Platform admin
 * Story 23.3: Saúde dos jobs e registro de erros com a infraestrutura atual
 *
 * Operador da plataforma (tabela `platform_admins`, migration 00068) — hoje só o Fabossi.
 * Diferente de `hasAdminAccess` (gestor/diretor do tenant): Configurações → Erros e os
 * alertas de job são só para quem opera a plataforma, nunca para os gestores do cliente.
 *
 * Fail-closed: erro na RPC (ex.: migration ainda não aplicada) = não é platform admin.
 */

interface RpcClient {
  rpc: (fn: string) => PromiseLike<{ data: unknown; error: unknown }>;
}

export async function isPlatformAdmin(supabase: RpcClient): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc("is_platform_admin");
    return !error && data === true;
  } catch {
    return false;
  }
}
