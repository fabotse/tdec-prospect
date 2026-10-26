/**
 * reference-suppression.ts — leituras da Lista de Supressão (23.5) para o modo contas
 * parecidas (Story 24.18). SERVIDOR.
 *
 * A migration 00071 (`suppression_entries`) pode não estar aplicada: toda leitura falha
 * aberta (`console.warn` + lista vazia). Nada aqui escreve na tabela.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { TargetAccount } from "@/types/agent";
import { normalizeDomain } from "@/lib/agent/target-accounts";
import { REFERENCE_MAX } from "@/lib/agent/reference-accounts";

const TABLE = "suppression_entries";
const PAGE_SIZE = 1000;
/** Teto de páginas lidas na exclusão (10 mil domínios). */
const MAX_PAGES = 10;

/**
 * Os 5 domínios mais recentes com motivo "cliente" — as referências quando o usuário pede
 * "meus clientes da lista". Fail-open: erro → [].
 */
export async function readSuppressionListClients(
  supabase: SupabaseClient,
  tenantId: string
): Promise<TargetAccount[]> {
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select("value")
      .eq("tenant_id", tenantId)
      .eq("reason", "cliente")
      .eq("entry_type", "domain")
      .order("created_at", { ascending: false })
      .limit(REFERENCE_MAX);
    if (error) {
      console.warn("[reference-suppression] leitura dos clientes falhou:", error);
      return [];
    }
    const seen = new Set<string>();
    const accounts: TargetAccount[] = [];
    for (const row of (data ?? []) as Array<{ value?: unknown }>) {
      const domain = normalizeDomain(row.value);
      if (!domain || seen.has(domain)) continue;
      seen.add(domain);
      accounts.push({ name: null, domain, confidence: "high" });
    }
    return accounts.slice(0, REFERENCE_MAX);
  } catch (error) {
    console.warn("[reference-suppression] leitura dos clientes falhou:", error);
    return [];
  }
}

/**
 * Todos os domínios da lista (`entry_type='domain'`, qualquer motivo), para tirar do
 * resultado da busca. Fail-open: erro → [] (nada suprimido).
 */
export async function readSuppressedDomains(
  supabase: SupabaseClient,
  tenantId: string
): Promise<string[]> {
  const domains = new Set<string>();
  try {
    for (let page = 0; page < MAX_PAGES; page++) {
      const from = page * PAGE_SIZE;
      const { data, error } = await supabase
        .from(TABLE)
        .select("value")
        .eq("tenant_id", tenantId)
        .eq("entry_type", "domain")
        .order("id", { ascending: true })
        .range(from, from + PAGE_SIZE - 1);
      if (error) {
        console.warn("[reference-suppression] leitura dos dominios falhou:", error);
        return [];
      }
      const rows = (data ?? []) as Array<{ value?: unknown }>;
      for (const row of rows) {
        const domain = normalizeDomain(row.value);
        if (domain) domains.add(domain);
      }
      if (rows.length < PAGE_SIZE) break;
    }
    return Array.from(domains);
  } catch (error) {
    console.warn("[reference-suppression] leitura dos dominios falhou:", error);
    return [];
  }
}
