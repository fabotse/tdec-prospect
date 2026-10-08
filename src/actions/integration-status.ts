"use server";

/**
 * Integration Status Server Action
 * Hotfix SDR: status de integracoes para superficies SDR-allowed (builder/export).
 *
 * `getApiConfigs` (actions/integrations.ts) e admin-only porque devolve chaves
 * mascaradas para Settings -> Integracoes. O builder so precisa saber QUAIS servicos
 * estao configurados — esta action responde isso para qualquer papel autenticado,
 * sem expor nenhum material de chave.
 */

import { getCurrentUserProfile } from "@/lib/supabase/tenant";
import { listConfiguredServices } from "@/lib/agent/service-keys";
import { SERVICE_NAMES, type ServiceName } from "@/types/integration";

type ActionResult<T> = { success: true; data: T } | { success: false; error: string };

/**
 * Servicos com chave configurada no tenant do usuario autenticado (qualquer papel).
 */
export async function getConfiguredIntegrations(): Promise<ActionResult<ServiceName[]>> {
  const profile = await getCurrentUserProfile();

  if (!profile) {
    return { success: false, error: "Não autenticado" };
  }

  const configured = await listConfiguredServices(profile.tenant_id);
  return {
    success: true,
    data: SERVICE_NAMES.filter((service) => configured.includes(service)),
  };
}
