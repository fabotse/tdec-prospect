/**
 * Shared utilities for pipeline steps
 */

import { requireServiceApiKey } from "@/lib/agent/service-keys";

/**
 * Fetch and decrypt API key from api_configs table.
 * Throws if not found.
 *
 * Story 22.9: a leitura acontece SEMPRE via service-role (helper `service-keys`),
 * nunca com o client de sessao do caller. Antes, a assinatura recebia um
 * `SupabaseClient` de fora e os callers passavam o client de SESSAO — sob a RLS
 * admin-only de `api_configs` (00005:14-20) isso devolvia zero linhas para um
 * papel `sdr` e todo o pipeline (Instantly/Apollo/OpenAI/...) morria com
 * "chave nao configurada". O parametro do client foi REMOVIDO de proposito: passar
 * um client aqui de novo reintroduziria o bug (AC5). O client de sessao continua
 * valendo para o resto das queries do pipeline (Trap #1).
 */
/**
 * Rotulo exibido na mensagem de erro ("API key do <rotulo> nao configurada").
 * Existe para PRESERVAR as mensagens que o pipeline ja produzia — sem o mapa, a
 * mensagem do Instantly regrediria para "API key do instantly nao configurada".
 * Servico sem entrada aqui cai no proprio `service_name` (comportamento de hoje).
 */
const SERVICE_LABELS: Record<string, string> = {
  instantly: "Instantly",
};

export async function getServiceApiKey(
  tenantId: string,
  serviceName: string
): Promise<string> {
  return requireServiceApiKey(tenantId, serviceName, SERVICE_LABELS[serviceName]);
}
