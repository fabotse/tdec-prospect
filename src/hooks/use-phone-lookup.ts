/**
 * Phone Lookup Hook
 * Story: 4.4 - SignalHire Integration Service
 *
 * TanStack Query mutation for phone lookup via SignalHire API.
 *
 * AC: #7 - Hook for phone lookup with toast feedback
 */

"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { SignalHireLookupResult } from "@/types/signalhire";
import type { APISuccessResponse, APIErrorResponse } from "@/types/api";
import { isAPIError } from "@/types/api";

// ==============================================
// QUERY KEYS
// ==============================================

const LEADS_QUERY_KEY = ["leads"];
const MY_LEADS_QUERY_KEY = ["myLeads"];
const PHONE_LOOKUP_QUERY_KEY = ["phoneLookup"];

// ==============================================
// TYPES
// ==============================================

export interface PhoneLookupParams {
  /** LinkedIn URL, email, or phone number (E164) */
  identifier: string;
  /** Optional: Lead ID to update after successful lookup */
  leadId?: string;
}

export interface PhoneLookupResult extends SignalHireLookupResult {
  /** The identifier used for lookup */
  identifier: string;
}

// ==============================================
// API FUNCTIONS
// ==============================================

/**
 * Lookup phone via SignalHire API
 */
async function phoneLookupApi(
  params: PhoneLookupParams
): Promise<PhoneLookupResult> {
  const response = await fetch("/api/integrations/signalhire/lookup", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      identifier: params.identifier,
    }),
  });

  const result = (await response.json()) as
    | APISuccessResponse<SignalHireLookupResult>
    | APIErrorResponse;

  if (isAPIError(result)) {
    throw new Error(result.error.message);
  }

  return {
    ...result.data,
    identifier: params.identifier,
  };
}

// ==============================================
// HOOKS
// ==============================================

export interface UsePhoneLookupOptions {
  /** Show toast on success (default: true) */
  showSuccessToast?: boolean;
  /** Show toast on error (default: true) */
  showErrorToast?: boolean;
  /** Invalidate leads queries on success (default: false) */
  invalidateLeads?: boolean;
}

/**
 * Hook for looking up phone numbers via SignalHire
 * AC: #7 - TanStack Query mutation with toast feedback
 *
 * @example
 * ```tsx
 * const { lookupPhone, isLoading } = usePhoneLookup();
 *
 * // Lookup by LinkedIn URL
 * lookupPhone({ identifier: "https://linkedin.com/in/john-doe" });
 *
 * // Lookup by email
 * lookupPhone({ identifier: "john@company.com" });
 * ```
 */
export function usePhoneLookup(options: UsePhoneLookupOptions = {}) {
  const {
    showSuccessToast = true,
    showErrorToast = true,
    invalidateLeads = false,
  } = options;

  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: phoneLookupApi,
    onSuccess: (data) => {
      // Cache lookup result
      queryClient.setQueryData(
        [...PHONE_LOOKUP_QUERY_KEY, data.identifier],
        data
      );

      // Optionally invalidate leads cache
      if (invalidateLeads) {
        queryClient.invalidateQueries({ queryKey: LEADS_QUERY_KEY });
        queryClient.invalidateQueries({ queryKey: MY_LEADS_QUERY_KEY });
      }

      // Show success toast
      if (showSuccessToast) {
        const creditsInfo = data.creditsRemaining !== null
          ? ` (${data.creditsRemaining} créditos restantes)`
          : "";

        toast.success("Telefone encontrado!", {
          description: `${data.phone}${creditsInfo}`,
        });
      }
    },
    onError: (error) => {
      // Show error toast
      if (showErrorToast) {
        const message =
          error instanceof Error ? error.message : "Erro ao buscar telefone";
        toast.error("Falha na busca", {
          description: message,
        });
      }
    },
  });

  return {
    /** Trigger phone lookup */
    lookupPhone: mutation.mutate,
    /** Trigger phone lookup and return promise */
    lookupPhoneAsync: mutation.mutateAsync,
    /** Lookup result data */
    data: mutation.data,
    /** Whether lookup is in progress */
    isLoading: mutation.isPending,
    /** Whether lookup was successful */
    isSuccess: mutation.isSuccess,
    /** Error message if lookup failed */
    error: mutation.error instanceof Error ? mutation.error.message : null,
    /** Reset mutation state */
    reset: mutation.reset,
  };
}

/**
 * Get cached phone lookup result
 */
export function useCachedPhoneLookup(identifier: string) {
  const queryClient = useQueryClient();
  return queryClient.getQueryData<PhoneLookupResult>([
    ...PHONE_LOOKUP_QUERY_KEY,
    identifier,
  ]);
}
