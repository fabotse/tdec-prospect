"use client";

import { useState, useCallback, useEffect } from "react";
import type { InstantlyAccountItem } from "@/types/instantly";

interface UseSendingAccountsOptions {
  /** Whether to fetch accounts. Defaults to true. */
  enabled?: boolean;
}

/**
 * Hook to fetch sending accounts from Instantly
 * Story 7.4: AC #4 - Sending account selection
 *
 * Fetches accounts from /api/instantly/accounts when enabled.
 * Returns accounts list, loading state, error, and refetch function.
 */
export function useSendingAccounts(options: UseSendingAccountsOptions = {}) {
  const { enabled = true } = options;
  const [accounts, setAccounts] = useState<InstantlyAccountItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAccounts = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/instantly/accounts");

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Erro ao buscar contas de envio");
      }

      const data: InstantlyAccountItem[] = await response.json();
      setAccounts(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro desconhecido";
      setError(message);
      setAccounts([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (enabled) {
      fetchAccounts();
    }
  }, [enabled, fetchAccounts]);

  return { accounts, isLoading, error, refetch: fetchAccounts };
}
