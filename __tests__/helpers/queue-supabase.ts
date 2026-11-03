/**
 * Fake Supabase com respostas em FILA por tabela (Story 24.19).
 *
 * Cada `from(tabela)` consome a proxima resposta da fila daquela tabela (ou a resposta
 * padrao `{ data: null, error: null }`). Toda chamada fica registrada em `calls`, com os
 * metodos encadeados e argumentos — para afirmar filtros e payloads de insert.
 */

import { vi } from "vitest";
import { createChainBuilder, type ChainBuilder } from "./mock-supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

export type FakeResponse = { data?: unknown; error?: unknown } | Error;

export interface RecordedCall {
  table: string;
  chain: ChainBuilder;
}

export function createQueueSupabase(queues: Record<string, FakeResponse[]> = {}) {
  const calls: RecordedCall[] = [];
  const pending: Record<string, FakeResponse[]> = Object.fromEntries(
    Object.entries(queues).map(([k, v]) => [k, [...v]])
  );

  const from = vi.fn((table: string) => {
    const next = pending[table]?.shift();
    let chain: ChainBuilder;
    if (next instanceof Error) {
      chain = createChainBuilder();
      chain.then = (_resolve, reject) => Promise.reject(next).then(undefined, reject);
    } else {
      chain = createChainBuilder({ data: next?.data ?? null, error: next?.error ?? null });
    }
    calls.push({ table, chain });
    return chain;
  });

  return {
    client: { from } as unknown as SupabaseClient,
    from,
    calls,
    push(table: string, response: FakeResponse) {
      (pending[table] ??= []).push(response);
    },
    callsTo(table: string) {
      return calls.filter((c) => c.table === table);
    },
  };
}
