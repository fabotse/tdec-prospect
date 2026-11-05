/**
 * Leitura preguicosa do dossie da conta para o painel
 * Story: 24.22 - Dossie visivel na revisao e na oportunidade (D9)
 *
 * So busca com o painel aberto (`enabled`). Sem refetchInterval e sem Realtime: nada
 * entra no carregamento das telas nem no polling do agente.
 *
 * A resposta e validada estruturalmente (zod) antes de chegar ao painel e a leitura tem
 * prazo limite (ACCOUNT_DOSSIER_TIMEOUT_MS): resposta fora do formato ou pendurada vira
 * estado de erro local com "Tentar de novo".
 */

"use client";

import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import type { AccountDossierLookupParams, AccountDossierView } from "@/types/account-dossier";

export const ACCOUNT_DOSSIER_STALE_TIME = 5 * 60_000;
export const ACCOUNT_DOSSIER_TIMEOUT_MS = 10_000;

export class AccountDossierTimeoutError extends Error {
  constructor() {
    super("Tempo esgotado ao carregar o dossie");
    this.name = "AccountDossierTimeoutError";
  }
}

const factSchema = z.object({
  kind: z.enum(["site", "news", "job", "technology", "post"]),
  fato: z.string(),
  fonteUrl: z.string().nullable(),
  data: z.string(),
  confianca: z.enum(["baixa", "media", "alta"]),
  isTriggerSource: z.boolean(),
});

const whyNowSchema = z.object({
  status: z.enum(["trigger", "no_trigger"]),
  reason: z.string().nullable(),
  gatilho: z.string().nullable(),
  hipoteseDor: z.string().nullable(),
  confianca: z.enum(["media", "alta"]).nullable(),
  fonteUrl: z.string().nullable(),
  data: z.string().nullable(),
});

const viewSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("none") }),
  z.object({
    status: z.literal("found"),
    dossier: z.object({
      id: z.string(),
      companyName: z.string().nullable(),
      companyDomain: z.string(),
      dossierStatus: z.enum(["complete", "partial", "empty"]),
      failedSources: z.array(z.string()),
      researchedAt: z.string(),
      expired: z.boolean(),
    }),
    facts: z.array(factSchema),
    totalFacts: z.number(),
    whyNow: whyNowSchema.nullable(),
  }),
]);

/** Valida o DTO do `GET /api/account-dossiers/lookup`; fora do formato -> null. */
export function parseAccountDossierView(value: unknown): AccountDossierView | null {
  const parsed = viewSchema.safeParse(value);
  return parsed.success ? (parsed.data as AccountDossierView) : null;
}

export function accountDossierQueryKey(target: AccountDossierLookupParams | null) {
  return [
    "account-dossier",
    target?.executionId ?? null,
    target?.leadId ?? null,
    target?.apolloId ?? null,
    target?.email ? target.email.trim().toLowerCase() : null,
  ] as const;
}

async function fetchAccountDossier(
  target: AccountDossierLookupParams,
  signal: AbortSignal
): Promise<AccountDossierView> {
  const params = new URLSearchParams();
  if (target.executionId) params.set("executionId", target.executionId);
  if (target.leadId) params.set("leadId", target.leadId);
  if (target.apolloId) params.set("apolloId", target.apolloId);
  if (target.email) params.set("email", target.email.trim().toLowerCase());

  // Prazo limite combinado com o cancelamento do React Query. O `Promise.race` garante o
  // erro mesmo que o fetch ignore o abort.
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (signal.aborted) controller.abort();
  else signal.addEventListener("abort", onAbort, { once: true });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new AccountDossierTimeoutError());
    }, ACCOUNT_DOSSIER_TIMEOUT_MS);
  });

  try {
    const load = async () => {
      const response = await fetch(`/api/account-dossiers/lookup?${params.toString()}`, {
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`Falha ao carregar o dossie (${response.status})`);
      }
      const json = (await response.json()) as { data?: unknown } | null;
      const view = parseAccountDossierView(json?.data);
      if (!view) throw new Error("Resposta do dossie fora do formato");
      return view;
    };
    return await Promise.race([load(), timeout]);
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", onAbort);
  }
}

export function useAccountDossier(
  target: AccountDossierLookupParams | null,
  options: { enabled: boolean }
) {
  return useQuery({
    queryKey: accountDossierQueryKey(target),
    queryFn: ({ signal }) => fetchAccountDossier(target as AccountDossierLookupParams, signal),
    enabled: options.enabled && Boolean(target),
    staleTime: ACCOUNT_DOSSIER_STALE_TIME,
    // Timeout ja esperou o prazo inteiro: vira erro direto (o usuario decide tentar de novo).
    retry: (failureCount, error) => failureCount < 1 && !(error instanceof AccountDossierTimeoutError),
    refetchOnWindowFocus: false,
  });
}
