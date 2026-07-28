/**
 * Service API Keys do runtime do Agente (server-only)
 * Story: 22.9 - Chaves de Servico via Service-Role no Runtime do Agente (AC2, AC4, AC5)
 *
 * PONTO UNICO de leitura de `api_configs` no runtime do Agente TDec.
 *
 * POR QUE EXISTE (causa-raiz): a RLS de `api_configs` e admin-only
 * (`00005_api_configs_rls.sql:14-20` -> `tenant_id = get_current_tenant_id() AND is_admin()`)
 * e `is_admin()` e `role IN ('gestor','diretor')`. Lendo com o client de SESSAO, um
 * usuario `sdr` — o usuario primario declarado do agente — recebe ZERO linhas em
 * silencio (RLS filtra, nao da erro) e toda mensagem morre em `422 API_KEY_MISSING`
 * mesmo com a chave configurada e valida pelo gestor.
 *
 * O QUE MUDA: o runtime que *usa* a chave em nome do usuario le via **service-role**
 * (`createAdminClient`). O que NAO muda: a RLS admin-only continua intocada, entao
 * Settings -> Integracoes segue admin-only (ler-para-executar != ver-na-tela, AC3).
 *
 * ISOLAMENTO DE TENANT (AC4): service-role BYPASSA RLS, portanto o filtro explicito
 * `tenant_id` e a UNICA barreira de isolamento — ele e obrigatorio em toda query e o
 * caller DEVE passar o `tenant_id` do profile AUTENTICADO, nunca um valor vindo do
 * request.
 *
 * FAIL-SAFE (AC4): service-role ausente no ambiente, linha inexistente ou falha de
 * leitura viram `missing` — o mesmo erro de "nao configurada" de hoje, nunca um 500
 * novo. A chave (crua ou `encrypted_key`) NUNCA vai para log/resposta (Trap #4).
 *
 * SERVER-ONLY: importa `createAdminClient` e `decryptApiKey` — nunca pode chegar ao
 * bundle client.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptApiKey } from "@/lib/crypto/encryption";

/**
 * Resultado da leitura de uma chave de servico.
 * `missing` e `decrypt_error` sao separados de proposito: os callers precisam
 * preservar o contrato de erro atual (422 "nao configurada" x 500 "erro ao decriptar").
 */
export type ServiceKeyLookup =
  | { status: "ok"; apiKey: string }
  | { status: "missing" }
  | { status: "decrypt_error" };

const MISSING: ServiceKeyLookup = { status: "missing" };
const DECRYPT_ERROR: ServiceKeyLookup = { status: "decrypt_error" };

/** Extrai uma mensagem curta de erro sem arrastar payload/segredo para o log. */
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "erro desconhecido";
}

/**
 * Le e decripta a chave de um servico para o tenant, SEMPRE via service-role.
 *
 * @param tenantId - `tenant_id` do profile autenticado (OBRIGATORIO, AC4).
 * @param serviceName - valor de `api_configs.service_name` (ex.: "openai").
 */
export async function readServiceApiKey(
  tenantId: string,
  serviceName: string
): Promise<ServiceKeyLookup> {
  // Guarda de isolamento: sem tenant a query buscaria a chave de QUALQUER tenant
  // (service-role bypassa RLS). Trata como "nao configurada" em vez de vazar.
  if (!tenantId) {
    console.error(`[service-keys] tenantId ausente ao ler chave (service=${serviceName})`);
    return MISSING;
  }

  let admin: SupabaseClient;
  try {
    admin = createAdminClient();
  } catch (error) {
    // Service-role key ausente no ambiente: cai no mesmo erro de "nao configurada"
    // (AC4) em vez de derrubar a rota com 500.
    console.error(
      `[service-keys] client admin indisponivel (service=${serviceName}): ${errorMessage(error)}`
    );
    return MISSING;
  }

  let encryptedKey: string;
  try {
    const { data, error } = await admin
      .from("api_configs")
      .select("encrypted_key")
      .eq("tenant_id", tenantId)
      .eq("service_name", serviceName)
      .single();

    if (error || !data?.encrypted_key) return MISSING;
    encryptedKey = data.encrypted_key as string;
  } catch (error) {
    console.error(
      `[service-keys] falha ao ler api_configs (service=${serviceName}): ${errorMessage(error)}`
    );
    return MISSING;
  }

  try {
    const apiKey = decryptApiKey(encryptedKey);
    // Uma chave que decripta para string vazia e equivalente a nao ter chave: sem
    // esta guarda ela seguiria como `ok` e (a) iria para a API externa virando um 401
    // opaco, (b) no Apollo cairia no `if (this.apiKey)` como ausente e voltaria para
    // a leitura de SESSAO — exatamente o bug que este helper existe para fechar.
    if (!apiKey) return MISSING;
    return { status: "ok", apiKey };
  } catch {
    // Nunca logar `encrypted_key` nem a mensagem do decrypt junto do valor (Trap #4).
    console.error(`[service-keys] falha ao decriptar chave (service=${serviceName})`);
    return DECRYPT_ERROR;
  }
}

/**
 * Variante DEFENSIVA: devolve a chave ou `null` (ausente OU nao decriptavel).
 * Para callers fail-open que degradam sem a chave (ex.: Apify no icebreaker premium).
 */
export async function getServiceApiKeyOrNull(
  tenantId: string,
  serviceName: string
): Promise<string | null> {
  const lookup = await readServiceApiKey(tenantId, serviceName);
  return lookup.status === "ok" ? lookup.apiKey : null;
}

/**
 * Variante para services que mantem uma leitura PROPRIA de `api_configs` como
 * fallback (hoje: `ApolloService`) e recebem a chave por INJECAO no construtor.
 *
 * Devolve `undefined` quando a chave nao existe no tenant — o service cai no
 * caminho de hoje e produz a mesma mensagem de "nao configurada" (degradacao
 * consciente). Mas LANCA em `decrypt_error`: uma chave que existe e nao decripta
 * nao pode ser reportada como "nao configurada", senao o usuario vai reconfigurar
 * uma chave que ja esta la. Preserva o mesmo split 422/500 que OpenAI e TheirStack.
 *
 * @param label - nome exibido na mensagem (default: `serviceName`).
 */
export async function getInjectableServiceApiKey(
  tenantId: string,
  serviceName: string,
  label?: string
): Promise<string | undefined> {
  const lookup = await readServiceApiKey(tenantId, serviceName);
  if (lookup.status === "ok") return lookup.apiKey;
  if (lookup.status === "decrypt_error") {
    throw new Error(`Erro ao decriptar a API key do ${label ?? serviceName}`);
  }
  return undefined;
}

/**
 * Variante que LANCA quando a chave nao esta disponivel, preservando as mensagens
 * de erro ja usadas pelo pipeline ("API key do X nao configurada").
 *
 * @param label - nome exibido na mensagem (default: `serviceName`).
 */
export async function requireServiceApiKey(
  tenantId: string,
  serviceName: string,
  label?: string
): Promise<string> {
  const lookup = await readServiceApiKey(tenantId, serviceName);
  if (lookup.status === "ok") return lookup.apiKey;

  const name = label ?? serviceName;
  if (lookup.status === "decrypt_error") {
    throw new Error(`Erro ao decriptar a API key do ${name}`);
  }
  throw new Error(`API key do ${name} nao configurada`);
}
