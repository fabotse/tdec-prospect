/**
 * AI Search Hook
 * Story: 3.4 - AI Conversational Search
 *
 * AC: #1 - AI converts natural language to Apollo API parameters
 * AC: #2 - Shows phase-specific loading messages
 * AC: #3 - Returns extracted filters for transparency
 */

"use client";

import { useState, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Lead } from "@/types/lead";
import type { ApolloSearchFilters } from "@/types/apollo";
import type {
  SearchPhase,
  AISearchResult,
} from "@/types/ai-search";
import { isAPIError } from "@/types/api";

// ==============================================
// TYPES
// ==============================================

interface AISearchAPIResponse {
  leads: Lead[];
  aiResult: {
    extractedFilters: ApolloSearchFilters;
    confidence: number;
    explanation?: string;
    originalQuery: string;
  };
}

interface UseAISearchReturn {
  search: (query: string) => void;
  searchAsync: (query: string) => Promise<AISearchAPIResponse>;
  data: Lead[];
  extractedFilters: ApolloSearchFilters | null;
  confidence: number | null;
  explanation: string | null;
  originalQuery: string | null;
  isLoading: boolean;
  error: string | null;
  searchPhase: SearchPhase;
  reset: () => void;
}

// ==============================================
// API FUNCTION
// ==============================================

async function performAISearch(query: string): Promise<AISearchAPIResponse> {
  const response = await fetch("/api/ai/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });

  const result = await response.json();

  if (isAPIError(result)) {
    throw new Error(result.error.message);
  }

  return result.data;
}

// ==============================================
// HOOK
// ==============================================

/**
 * Hook for AI-powered conversational search
 * Converts natural language queries to Apollo filters and searches leads
 */
export function useAISearch(): UseAISearchReturn {
  const queryClient = useQueryClient();
  const [searchPhase, setSearchPhase] = useState<SearchPhase>("idle");

  const mutation = useMutation({
    mutationFn: async (query: string) => {
      // AC #2: Phase 1 - AI is translating natural language to filters
      setSearchPhase("translating");

      try {
        // Start the API call (does both AI extraction + Apollo search atomically)
        const searchPromise = performAISearch(query);

        // Prevent "unhandled promise rejection" warning during the timeout delay.
        // By calling .then() with both handlers, we mark any rejection as "observed"
        // without swallowing it - the original promise will still reject when awaited.
        searchPromise.then(
          () => {}, // Success: no-op
          () => {}  // Error: mark as observed (not swallowed)
        );

        // AC #2: Phase 2 - After brief delay, switch to "searching" phase
        // This ensures both phases are visible to the user
        await new Promise((resolve) => setTimeout(resolve, 800));
        setSearchPhase("searching");

        const result = await searchPromise;
        setSearchPhase("done");
        return result;
      } catch (error) {
        setSearchPhase("error");
        throw error;
      }
    },
    onSuccess: (data) => {
      // Cache the AI search results
      queryClient.setQueryData(["leads", "ai-search"], data.leads);
    },
    onError: () => {
      setSearchPhase("error");
    },
  });

  const reset = useCallback(() => {
    mutation.reset();
    setSearchPhase("idle");
  }, [mutation]);

  const search = useCallback(
    (query: string) => {
      mutation.mutate(query);
    },
    [mutation]
  );

  const searchAsync = useCallback(
    async (query: string) => {
      return mutation.mutateAsync(query);
    },
    [mutation]
  );

  return {
    search,
    searchAsync,
    data: mutation.data?.leads ?? [],
    extractedFilters: mutation.data?.aiResult?.extractedFilters ?? null,
    confidence: mutation.data?.aiResult?.confidence ?? null,
    explanation: mutation.data?.aiResult?.explanation ?? null,
    originalQuery: mutation.data?.aiResult?.originalQuery ?? null,
    isLoading: mutation.isPending,
    error: mutation.error instanceof Error ? mutation.error.message : null,
    searchPhase,
    reset,
  };
}
