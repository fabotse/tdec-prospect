/**
 * Technology Search Hook
 * Story: 15.2 - Busca Technografica: Autocomplete e Filtros
 *
 * useQuery for autocomplete technology search.
 * AC: #1 - Debounce integrated, enabled when query >= 2 chars
 */

"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { KeywordAggregated } from "@/types/theirstack";

const TECHNOLOGY_SEARCH_KEY = "theirstack-technologies";
const DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 2;

interface TechnologySearchResponse {
  data: KeywordAggregated[];
}

async function fetchTechnologies(query: string): Promise<KeywordAggregated[]> {
  const params = new URLSearchParams({ q: query });
  const response = await fetch(
    `/api/integrations/theirstack/search/technologies?${params}`
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      (error as { error?: string }).error || "Erro ao buscar tecnologias"
    );
  }

  const result: TechnologySearchResponse = await response.json();
  return result.data;
}

export function useTechnologySearch(query: string) {
  const [debouncedQuery, setDebouncedQuery] = useState(query);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query]);

  const enabled = debouncedQuery.length >= MIN_QUERY_LENGTH;

  return useQuery({
    queryKey: [TECHNOLOGY_SEARCH_KEY, debouncedQuery],
    queryFn: () => fetchTechnologies(debouncedQuery),
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}
