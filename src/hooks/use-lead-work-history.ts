/**
 * Histórico resumido dos leads e contas da revisão
 * Story: 24.25 - Memória entre execuções
 *
 * Lê `POST /api/agent/lead-history` uma vez por conjunto de leads (staleTime de 5 min,
 * retry 1, prazo de 10 s, resposta validada com zod). Qualquer falha vira `undefined`:
 * a revisão segue sem a linha de histórico e sem erro visível.
 *
 * Sem `QueryClientProvider` acima (telas antigas e testes que montam a revisão solta),
 * a leitura fica desligada em vez de quebrar a revisão.
 */

"use client";

import { useContext, useMemo } from "react";
import { QueryClient, QueryClientContext, useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { LEAD_WORK_RESULTS, type LeadWorkHistoryResponse } from "@/types/execution-memory";

export const LEAD_WORK_HISTORY_STALE_TIME = 5 * 60_000;
export const LEAD_WORK_HISTORY_TIMEOUT_MS = 10_000;
const MAX_ITEMS = 500;
const MAX_ITEM_LENGTH = 200;

const resultSchema = z.enum(LEAD_WORK_RESULTS);

const responseSchema = z.object({
  leads: z.record(
    z.string(),
    z.array(z.object({ campaignName: z.string(), date: z.string(), result: resultSchema }))
  ),
  accounts: z.record(
    z.string(),
    z.object({
      contacts: z.number(),
      lastCampaignName: z.string(),
      lastDate: z.string(),
      result: resultSchema,
    })
  ),
});

/** Valida o DTO da rota; fora do formato -> null. */
export function parseLeadWorkHistory(value: unknown): LeadWorkHistoryResponse | null {
  const parsed = responseSchema.safeParse(value);
  return parsed.success ? (parsed.data as LeadWorkHistoryResponse) : null;
}

/** Cliente inerte para quando não há provider: a query fica desligada e nunca busca. */
let inertClient: QueryClient | null = null;
function getInertClient(): QueryClient {
  inertClient ??= new QueryClient();
  return inertClient;
}

/**
 * Valores ORIGINAIS (sem `trim`): a conta casa pelo `company_name` exato, então "Acme " e
 * "Acme" são chaves diferentes. O `trim` só serve para descartar valores vazios.
 */
function normalizeList(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(
      values.filter(
        (value): value is string =>
          typeof value === "string" && value.trim().length > 0 && value.length <= MAX_ITEM_LENGTH
      )
    )
  )
    .sort()
    .slice(0, MAX_ITEMS);
}

async function fetchLeadWorkHistory(
  apolloIds: string[],
  companyNames: string[],
  signal: AbortSignal
): Promise<LeadWorkHistoryResponse> {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (signal.aborted) controller.abort();
  else signal.addEventListener("abort", onAbort, { once: true });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error("Tempo esgotado ao carregar o historico"));
    }, LEAD_WORK_HISTORY_TIMEOUT_MS);
  });

  try {
    const load = async () => {
      const response = await fetch("/api/agent/lead-history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apolloIds, companyNames }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Falha ao carregar o historico (${response.status})`);
      const json = (await response.json()) as { data?: unknown } | null;
      const history = parseLeadWorkHistory(json?.data);
      if (!history) throw new Error("Resposta do historico fora do formato");
      return history;
    };
    return await Promise.race([load(), timeout]);
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", onAbort);
  }
}

/** Histórico dos leads e contas, ou `undefined` (carregando, sem leads ou com erro). */
export function useLeadWorkHistory(
  apolloIds: Array<string | null | undefined>,
  companyNames: Array<string | null | undefined>
): LeadWorkHistoryResponse | undefined {
  const contextClient = useContext(QueryClientContext);
  const ids = useMemo(() => normalizeList(apolloIds), [apolloIds]);
  const names = useMemo(() => normalizeList(companyNames), [companyNames]);
  const hasLeads = ids.length > 0 || names.length > 0;

  const query = useQuery(
    {
      queryKey: ["lead-work-history", ids, names] as const,
      queryFn: ({ signal }) => fetchLeadWorkHistory(ids, names, signal),
      enabled: hasLeads && Boolean(contextClient),
      staleTime: LEAD_WORK_HISTORY_STALE_TIME,
      retry: 1,
      refetchOnWindowFocus: false,
    },
    contextClient ?? getInertClient()
  );

  return query.isError ? undefined : query.data;
}
