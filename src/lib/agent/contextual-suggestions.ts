/**
 * Contextual Suggestions (server-only)
 * Story: 22.7 - Sugestoes Contextuais via Knowledge Base (FR13, opcional)
 *
 * Orquestra a derivacao das sugestoes de cargo/setor a partir do ICP do tenant
 * (KB) com FALLBACK fail-open pros mapas estaticos da BriefingSuggestionService.
 *
 * Este modulo e SERVER-ONLY: importa `createAdminClient` (service-role) e nunca
 * pode chegar ao bundle client. A parte pura/testavel (deriveSuggestionsFromICP)
 * vive na BriefingSuggestionService, que continua client-safe e sincrona (D5/Trap #3).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  BriefingSuggestionService,
  deriveSuggestionsFromICP,
  type ICPSuggestionInput,
} from "@/lib/agent/briefing-suggestion-service";
import type { ParsedBriefing } from "@/types/agent";
import type { ICPDefinition } from "@/types/knowledge-base";

const EMPTY_ICP: ICPSuggestionInput = { jobTitles: [], industries: [] };

/** Coage um valor de jsonb para `string[]`, descartando nao-arrays e elementos nao-string. */
function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

/**
 * Le a secao `icp` de `knowledge_base` para o tenant e devolve os cargos/setores
 * curados. FAIL-OPEN: qualquer erro/ausencia -> ICP vazio (o caller cai no estatico).
 *
 * D3 / Trap #1 (licao da Story 21.5): `knowledge_base` esta atras de RLS
 * `is_admin()` (00007:41-47), e `is_admin()` e `role IN ('gestor','diretor')`
 * (00053) — um `sdr` (o dono declarado do agente) le ZERO linhas com o client de
 * sessao. Por isso a leitura usa `createAdminClient()` (service-role), envolvido
 * em try/catch: sem a service-role key, fail-open pro estatico em vez de 500.
 *
 * Trap #2: NAO usar `loadKBContext` — ela gateia em `company.business_description`
 * e retornaria `null` para um tenant com ICP preenchido mas sem descricao de
 * empresa. Lemos a secao `icp` diretamente.
 */
export async function readTenantICP(tenantId: string): Promise<ICPSuggestionInput> {
  let admin: SupabaseClient;
  try {
    admin = createAdminClient();
  } catch (error) {
    // Service-role key ausente: fail-open (nunca 500).
    console.error("[contextual-suggestions] client admin indisponivel:", error);
    return EMPTY_ICP;
  }

  try {
    const { data, error } = await admin
      .from("knowledge_base")
      .select("content")
      .eq("tenant_id", tenantId)
      .eq("section", "icp")
      .single();

    if (error || !data?.content) return EMPTY_ICP;

    const icp = data.content as Partial<ICPDefinition>;
    // `content` e jsonb nao-tipado: o form escreve string[], mas uma linha
    // legada/inserida a mao pode trazer elementos nao-string. Filtrar aqui
    // (fronteira de leitura) garante que a heuristica pura downstream
    // (`dedupeNonEmpty` faz `raw.trim()`) nunca lance -> fail-open real, nunca 500 (AC2).
    return {
      jobTitles: toStringArray(icp.job_titles),
      industries: toStringArray(icp.industries),
    };
  } catch (error) {
    console.error("[contextual-suggestions] falha ao ler ICP:", error);
    return EMPTY_ICP;
  }
}

/**
 * Resolve as sugestoes contextuais KB-first para o ponto de consumo server-side
 * (parse/route.ts). Tenta derivar do ICP; campos sem material do ICP caem no
 * estatico (`generateSuggestions`). O retorno preserva o contrato
 * `Record<string, string[]>` de `BriefingParseResponse.suggestions` (Trap #4).
 *
 * NFR2: heuristica pura, sem chamada de rede adicional alem da leitura do ICP —
 * nao ha custo de LLM nem cache (D2). A leitura do ICP e fail-open, entao o pior
 * caso e identico ao comportamento estatico atual.
 */
export async function resolveContextualSuggestions(
  briefing: ParsedBriefing,
  tenantId: string
): Promise<Record<string, string[]>> {
  const staticSuggestions = BriefingSuggestionService.generateSuggestions(briefing);
  const icp = await readTenantICP(tenantId);
  const derived = deriveSuggestionsFromICP(icp, briefing);

  // Derivado (KB) prevalece POR CAMPO; campos ausentes no derivado mantem o
  // estatico como fallback fail-open (AC2).
  return { ...staticSuggestions, ...derived };
}
