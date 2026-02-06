/**
 * useKnowledgeBaseContext Hook
 * Story 6.3: Knowledge Base Integration for Context
 * Story 6.10: Use of Successful Examples
 *
 * AC 6.3: #1 - Knowledge Base Context in AI Prompts
 * AC 6.3: #5 - Graceful Degradation when KB empty
 * AC 6.10: #7 - User Guidance When Examples Missing
 *
 * Fetches and caches KB context for AI generation.
 * Uses TanStack Query with 5 minute stale time.
 */

"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  type KnowledgeBaseContext,
  type AIContextVariables,
  buildAIVariables,
  getDefaultAIVariables,
} from "@/lib/services/knowledge-base-context";

// ==============================================
// CONSTANTS
// ==============================================

/**
 * Query key for KB context
 */
const QUERY_KEY = ["knowledge-base", "context"];

/**
 * Stale time for KB context cache (5 minutes)
 * Balances freshness with performance
 */
const STALE_TIME_MS = 5 * 60 * 1000;

// ==============================================
// API FETCHER
// ==============================================

/**
 * Fetch KB context from API
 * AC: #1 - Any authenticated user can fetch
 */
async function fetchKnowledgeBaseContext(): Promise<KnowledgeBaseContext> {
  const response = await fetch("/api/knowledge-base/context");

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || "Erro ao buscar contexto");
  }

  const data = await response.json();

  if (!data.success) {
    throw new Error(data.error?.message || "Erro ao buscar contexto");
  }

  return data.data;
}

// ==============================================
// HOOK
// ==============================================

/**
 * Hook return type
 */
export interface UseKnowledgeBaseContextReturn {
  /** Raw KB context data */
  context: KnowledgeBaseContext | null;
  /** Compiled AI variables (ready for prompt interpolation) */
  variables: AIContextVariables;
  /** Loading state */
  isLoading: boolean;
  /** Error message if fetch failed */
  error: string | null;
  /** Refetch function */
  refetch: () => void;
  /** Whether the KB has email examples configured (AC 6.10 #7) */
  hasExamples: boolean;
}

/**
 * Hook for fetching and caching KB context for AI generation
 *
 * @example
 * ```tsx
 * const { variables, isLoading, error } = useKnowledgeBaseContext();
 *
 * // Use variables in AI generation
 * await generate({
 *   promptKey: "email_subject_generation",
 *   variables, // KB context compiled into AI variables
 * });
 * ```
 */
export function useKnowledgeBaseContext(): UseKnowledgeBaseContextReturn {
  const {
    data: context,
    isLoading,
    error: queryError,
    refetch,
  } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchKnowledgeBaseContext,
    staleTime: STALE_TIME_MS,
    retry: 1,
  });

  // Compile KB context into AI variables (AC: #1)
  // Memoized to avoid recomputation on every render
  const variables = useMemo(() => {
    if (context) {
      return buildAIVariables(context);
    }
    // Use defaults when context not available (AC: #5)
    return getDefaultAIVariables();
  }, [context]);

  // Check if KB has email examples configured (AC 6.10 #7)
  const hasExamples = useMemo(() => {
    return (context?.examples?.length ?? 0) > 0;
  }, [context]);

  return {
    context: context ?? null,
    variables,
    isLoading,
    error: queryError?.message ?? null,
    refetch: () => {
      refetch();
    },
    hasExamples,
  };
}

// ==============================================
// RE-EXPORTS
// ==============================================

// Re-export types and utilities for convenience
export {
  type KnowledgeBaseContext,
  type AIContextVariables,
  buildAIVariables,
  getDefaultAIVariables,
} from "@/lib/services/knowledge-base-context";
