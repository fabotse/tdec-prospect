/**
 * Knowledge Base Proofs Loader (server-side)
 * Story 24.7: Seção de Provas na Knowledge Base
 *
 * Carrega as provas do tenant para montar o KnowledgeBaseContext.
 * Nunca lança: se a consulta falhar (ex.: tabela ainda não criada, 42P01),
 * loga e devolve [] para o contexto, o agente e o editor seguirem como antes.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { KnowledgeBaseProof } from "@/types/knowledge-base";

export async function fetchKnowledgeBaseProofs(
  supabase: SupabaseClient,
  tenantId: string,
  logPrefix = "[KB Proofs]"
): Promise<KnowledgeBaseProof[]> {
  try {
    const { data, error } = await supabase
      .from("knowledge_base_proofs")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error(`${logPrefix} Error fetching proofs:`, error);
      return [];
    }

    return Array.isArray(data) ? (data as KnowledgeBaseProof[]) : [];
  } catch (error) {
    console.error(`${logPrefix} Error fetching proofs:`, error);
    return [];
  }
}
