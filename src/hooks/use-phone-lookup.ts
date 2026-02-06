/**
 * Phone Lookup Hook
 * Story: 4.4 - SignalHire Integration Service
 * Story: 4.4.2 - SignalHire Callback Architecture
 * Story: 4.5 - Phone Number Lookup
 *
 * TanStack Query mutation for phone lookup via SignalHire API.
 *
 * AC 4.4.2 #4 - Polling do Resultado
 * AC 4.4.2 #6.1 - Iniciar lookup → receber lookupId
 * AC 4.4.2 #6.3 - Fazer polling até status !== 'pending' e !== 'processing'
 * AC 4.4.2 #6.4 - Timeout após 30 segundos de polling
 * AC 4.4.2 #6.5 - Atualizar lead no banco quando sucesso
 */

"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type {
  SignalHireLookupInitResponse,
  SignalHireLookupStatus,
} from "@/types/signalhire";
import type { APISuccessResponse, APIErrorResponse } from "@/types/api";
import { isAPIError } from "@/types/api";
import type { Lead } from "@/types/lead";

// ==============================================
// CONSTANTS
// ==============================================

const POLL_INTERVAL_MS = 2000; // 2 seconds between polls
const POLL_TIMEOUT_MS = 30000; // 30 seconds max polling (AC #6.4)

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

export interface PhoneLookupResult {
  /** The identifier used for lookup */
  identifier: string;
  /** Phone number found (if success) */
  phone: string | null;
  /** Lookup status */
  status: SignalHireLookupStatus["status"];
  /** Error message (if failed) */
  errorMessage?: string | null;
}

/**
 * Result of a batch phone lookup for a single lead
 * AC: #4 - Batch lookup results
 */
export interface BatchPhoneLookupResult {
  leadId: string;
  status: "found" | "not_found" | "error" | "timeout";
  phone?: string;
  error?: string;
}

// ==============================================
// API FUNCTIONS
// ==============================================

/**
 * Initiate phone lookup via SignalHire API
 * AC 4.4.2 #6.1 - Returns lookupId for polling
 */
async function initiateLookup(
  identifier: string,
  leadId?: string
): Promise<SignalHireLookupInitResponse> {
  const response = await fetch("/api/integrations/signalhire/lookup", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      identifier,
      leadId,
    }),
  });

  const result = (await response.json()) as
    | APISuccessResponse<SignalHireLookupInitResponse>
    | APIErrorResponse;

  if (isAPIError(result)) {
    throw new Error(result.error.message);
  }

  return result.data;
}

/**
 * Poll for lookup status
 * AC 4.4.2 #6.3 - Returns status until !== 'pending' && !== 'processing'
 */
async function pollLookupStatus(
  lookupId: string
): Promise<SignalHireLookupStatus> {
  const response = await fetch(
    `/api/integrations/signalhire/lookup/${lookupId}`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    }
  );

  const result = (await response.json()) as
    | APISuccessResponse<SignalHireLookupStatus>
    | APIErrorResponse;

  if (isAPIError(result)) {
    throw new Error(result.error.message);
  }

  return result.data;
}

/**
 * Full phone lookup with polling
 * AC 4.4.2 #6 - Complete lookup flow with timeout
 */
async function phoneLookupWithPolling(
  params: PhoneLookupParams,
  signal?: AbortSignal
): Promise<PhoneLookupResult> {
  // 1. Initiate lookup (AC #6.1)
  const { lookupId } = await initiateLookup(params.identifier, params.leadId);

  // 2. Poll until complete or timeout (AC #6.3, #6.4)
  const startTime = Date.now();

  while (Date.now() - startTime < POLL_TIMEOUT_MS) {
    // Check for cancellation
    if (signal?.aborted) {
      throw new Error("Busca cancelada");
    }

    // Wait before polling
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

    // Check for cancellation again after waiting
    if (signal?.aborted) {
      throw new Error("Busca cancelada");
    }

    // Poll status
    const status = await pollLookupStatus(lookupId);

    // Check if complete
    if (status.status !== "pending" && status.status !== "processing") {
      return {
        identifier: params.identifier,
        phone: status.phone,
        status: status.status,
        errorMessage: status.errorMessage,
      };
    }
  }

  // Timeout reached (AC #6.4)
  return {
    identifier: params.identifier,
    phone: null,
    status: "failed",
    errorMessage: "Tempo limite excedido aguardando resultado",
  };
}

/**
 * Save phone to lead record in database
 * AC 4.4.2 #6.5 - Atualizar lead no banco quando sucesso
 */
async function savePhoneToLead(leadId: string, phone: string): Promise<void> {
  const response = await fetch(`/api/leads/${leadId}/phone`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ phone }),
  });

  if (!response.ok) {
    const result = (await response.json()) as APIErrorResponse;
    throw new Error(result.error?.message || "Erro ao salvar telefone");
  }
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
  /** Lead ID to save phone to after successful lookup */
  leadId?: string;
  /** Whether to save phone to database (default: false) */
  saveToDatabase?: boolean;
}

/**
 * Hook for looking up phone numbers via SignalHire
 *
 * AC 4.4.2 #6 - Uses new callback architecture with polling
 *
 * @example
 * ```tsx
 * const { lookupPhone, isLoading } = usePhoneLookup({
 *   leadId: lead.id,
 *   saveToDatabase: true,
 * });
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
    leadId,
    saveToDatabase = false,
  } = options;

  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (params: PhoneLookupParams) => {
      // Use leadId from params if provided, otherwise from options
      const targetLeadId = params.leadId || leadId;

      // Perform lookup with polling
      const result = await phoneLookupWithPolling({
        identifier: params.identifier,
        leadId: targetLeadId,
      });

      // Check if lookup was successful
      if (result.status !== "success" || !result.phone) {
        throw new Error(
          result.errorMessage || "Telefone não encontrado"
        );
      }

      // Save to database if enabled (AC #6.5)
      if (saveToDatabase && targetLeadId && result.phone) {
        await savePhoneToLead(targetLeadId, result.phone);
      }

      return result;
    },
    onSuccess: (data, variables) => {
      const targetLeadId = variables.leadId || leadId;

      // Cache lookup result
      queryClient.setQueryData(
        [...PHONE_LOOKUP_QUERY_KEY, data.identifier],
        data
      );

      // Invalidate leads cache
      if (invalidateLeads || saveToDatabase) {
        queryClient.invalidateQueries({ queryKey: LEADS_QUERY_KEY });
        queryClient.invalidateQueries({ queryKey: MY_LEADS_QUERY_KEY });

        // Invalidate specific lead query if available
        if (targetLeadId) {
          queryClient.invalidateQueries({ queryKey: ["lead", targetLeadId] });
        }
      }

      // Show success toast
      if (showSuccessToast && data.phone) {
        toast.success("Telefone encontrado e salvo", {
          description: data.phone,
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

// ==============================================
// BATCH LOOKUP (AC 4.5 #4)
// ==============================================

/**
 * Get the best identifier for phone lookup from a lead
 * AC 4.5 #6 - Identifier priority: LinkedIn URL > email
 *
 * @param lead - Lead to extract identifier from
 * @returns The best identifier for lookup, or null if none available
 */
export function getLeadIdentifier(lead: Lead): string | null {
  // Priority: LinkedIn URL > email
  if (lead.linkedinUrl) {
    return lead.linkedinUrl;
  }
  if (lead.email) {
    return lead.email;
  }
  return null;
}

/**
 * Batch phone lookup for multiple leads
 * AC 4.5 #4 - Sequential lookup with progress callback
 * AC 4.5 #6 - Identifier priority (LinkedIn > email)
 *
 * Updated for callback architecture (4.4.2)
 *
 * @param leads - Leads to lookup phone numbers for
 * @param onProgress - Callback for progress updates
 * @param signal - AbortSignal for cancellation
 * @returns Array of results for each lead
 *
 * @example
 * ```tsx
 * const results = await batchPhoneLookup(
 *   selectedLeads,
 *   (current, total, result) => {
 *     console.log(`Processing ${current} of ${total}`);
 *   }
 * );
 * ```
 */
export async function batchPhoneLookup(
  leads: Lead[],
  onProgress?: (
    current: number,
    total: number,
    result: BatchPhoneLookupResult
  ) => void,
  signal?: AbortSignal
): Promise<BatchPhoneLookupResult[]> {
  const results: BatchPhoneLookupResult[] = [];

  for (let i = 0; i < leads.length; i++) {
    // Check for cancellation
    if (signal?.aborted) {
      break;
    }

    const lead = leads[i];
    const identifier = getLeadIdentifier(lead);

    // Skip leads without identifier
    if (!identifier) {
      const result: BatchPhoneLookupResult = {
        leadId: lead.id,
        status: "error",
        error: "Lead sem email ou LinkedIn",
      };
      results.push(result);
      onProgress?.(i + 1, leads.length, result);
      continue;
    }

    try {
      // Perform lookup with polling
      const lookupResult = await phoneLookupWithPolling(
        { identifier, leadId: lead.id },
        signal
      );

      if (lookupResult.status === "success" && lookupResult.phone) {
        // Save phone to database
        await savePhoneToLead(lead.id, lookupResult.phone);

        const result: BatchPhoneLookupResult = {
          leadId: lead.id,
          status: "found",
          phone: lookupResult.phone,
        };
        results.push(result);
        onProgress?.(i + 1, leads.length, result);
      } else if (lookupResult.status === "not_found") {
        const result: BatchPhoneLookupResult = {
          leadId: lead.id,
          status: "not_found",
        };
        results.push(result);
        onProgress?.(i + 1, leads.length, result);
      } else if (
        lookupResult.errorMessage?.includes("Tempo limite") ||
        lookupResult.status === "failed"
      ) {
        const result: BatchPhoneLookupResult = {
          leadId: lead.id,
          status:
            lookupResult.errorMessage?.includes("Tempo limite")
              ? "timeout"
              : "error",
          error: lookupResult.errorMessage || "Erro desconhecido",
        };
        results.push(result);
        onProgress?.(i + 1, leads.length, result);
      } else {
        const result: BatchPhoneLookupResult = {
          leadId: lead.id,
          status: "error",
          error: lookupResult.errorMessage || "Status desconhecido",
        };
        results.push(result);
        onProgress?.(i + 1, leads.length, result);
      }
    } catch (error) {
      // Don't report error if it was an abort
      if (error instanceof Error && error.name === "AbortError") {
        break;
      }

      const result: BatchPhoneLookupResult = {
        leadId: lead.id,
        status: "error",
        error: error instanceof Error ? error.message : "Erro desconhecido",
      };
      results.push(result);
      onProgress?.(i + 1, leads.length, result);
    }

    // Rate limiting delay (1 second between requests)
    if (i < leads.length - 1 && !signal?.aborted) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  return results;
}
