/**
 * Leitura preguicosa do dossie da conta para o painel
 * Story: 24.22 - Dossie visivel na revisao e na oportunidade (D9)
 *
 * So busca com o painel aberto (`enabled`). Sem refetchInterval e sem Realtime: nada
 * entra no carregamento das telas nem no polling do agente.
 */

"use client";

import { useQuery } from "@tanstack/react-query";
import type { AccountDossierLookupParams, AccountDossierView } from "@/types/account-dossier";

export const ACCOUNT_DOSSIER_STALE_TIME = 5 * 60_000;

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

  const response = await fetch(`/api/account-dossiers/lookup?${params.toString()}`, { signal });
  if (!response.ok) {
    throw new Error(`Falha ao carregar o dossie (${response.status})`);
  }
  const json = (await response.json()) as { data?: AccountDossierView };
  if (!json?.data || (json.data.status !== "found" && json.data.status !== "none")) {
    throw new Error("Resposta do dossie fora do formato");
  }
  return json.data;
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
    retry: 1,
    refetchOnWindowFocus: false,
  });
}
