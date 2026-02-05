/**
 * useSavedFilters Hook Tests
 * Story 3.7: Saved Filters / Favorites
 *
 * AC: #1 - Create saved filter
 * AC: #2 - List saved filters
 * AC: #4 - Delete saved filter
 */

import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import {
  useSavedFilters,
  useCreateSavedFilter,
  useDeleteSavedFilter,
} from "@/hooks/use-saved-filters";

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Test data
const mockSavedFilters = [
  {
    id: "filter-1",
    tenantId: "tenant-1",
    userId: "user-1",
    name: "Tech Leads SP",
    filtersJson: {
      industries: ["technology"],
      companySizes: ["51-200"],
      locations: ["São Paulo"],
      titles: ["CEO"],
      keywords: "startup",
      contactEmailStatuses: ["verified"],
    },
    createdAt: "2026-01-30T10:00:00Z",
  },
  {
    id: "filter-2",
    tenantId: "tenant-1",
    userId: "user-1",
    name: "Finance Directors",
    filtersJson: {
      industries: ["finance"],
      companySizes: ["201-500"],
      locations: ["Rio de Janeiro"],
      titles: ["Director"],
      keywords: "",
      contactEmailStatuses: [],
    },
    createdAt: "2026-01-29T10:00:00Z",
  },
];

// Create wrapper with QueryClientProvider
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
      mutations: {
        retry: false,
      },
    },
  });

  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe("useSavedFilters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("useSavedFilters - List", () => {
    it("fetches saved filters successfully", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: mockSavedFilters }),
      });

      const { result } = renderHook(() => useSavedFilters(), {
        wrapper: createWrapper(),
      });

      expect(result.current.isLoading).toBe(true);

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toEqual(mockSavedFilters);
      expect(mockFetch).toHaveBeenCalledWith("/api/filters/saved");
    });

    it("handles fetch error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          error: { message: "Erro ao buscar filtros salvos" },
        }),
      });

      const { result } = renderHook(() => useSavedFilters(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error?.message).toBe("Erro ao buscar filtros salvos");
    });

    it("returns empty array when no filters exist", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [] }),
      });

      const { result } = renderHook(() => useSavedFilters(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toEqual([]);
    });
  });

  describe("useCreateSavedFilter - Create", () => {
    it("creates saved filter successfully", async () => {
      const newFilter = {
        name: "New Filter",
        filtersJson: {
          industries: ["technology"],
          companySizes: [],
          locations: [],
          titles: [],
          keywords: "",
          contactEmailStatuses: [],
          leadStatuses: [],
        },
      };

      const createdFilter = {
        id: "filter-new",
        tenantId: "tenant-1",
        userId: "user-1",
        ...newFilter,
        createdAt: "2026-01-31T10:00:00Z",
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: createdFilter }),
      });

      const { result } = renderHook(() => useCreateSavedFilter(), {
        wrapper: createWrapper(),
      });

      await result.current.mutateAsync(newFilter);

      expect(mockFetch).toHaveBeenCalledWith("/api/filters/saved", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newFilter),
      });
    });

    it("handles create error - duplicate name", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          error: { message: "Já existe um filtro com esse nome" },
        }),
      });

      const { result } = renderHook(() => useCreateSavedFilter(), {
        wrapper: createWrapper(),
      });

      await expect(
        result.current.mutateAsync({
          name: "Duplicate",
          filtersJson: {
            industries: [],
            companySizes: [],
            locations: [],
            titles: [],
            keywords: "",
            contactEmailStatuses: [],
            leadStatuses: [],
          },
        })
      ).rejects.toThrow("Já existe um filtro com esse nome");
    });

    it("handles create error - validation", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          error: { message: "Nome do filtro é obrigatório" },
        }),
      });

      const { result } = renderHook(() => useCreateSavedFilter(), {
        wrapper: createWrapper(),
      });

      await expect(
        result.current.mutateAsync({
          name: "",
          filtersJson: {
            industries: [],
            companySizes: [],
            locations: [],
            titles: [],
            keywords: "",
            contactEmailStatuses: [],
            leadStatuses: [],
          },
        })
      ).rejects.toThrow("Nome do filtro é obrigatório");
    });
  });

  describe("useDeleteSavedFilter - Delete", () => {
    it("deletes saved filter successfully", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      const { result } = renderHook(() => useDeleteSavedFilter(), {
        wrapper: createWrapper(),
      });

      await result.current.mutateAsync("filter-1");

      expect(mockFetch).toHaveBeenCalledWith("/api/filters/saved/filter-1", {
        method: "DELETE",
      });
    });

    it("handles delete error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          error: { message: "Erro ao remover filtro" },
        }),
      });

      const { result } = renderHook(() => useDeleteSavedFilter(), {
        wrapper: createWrapper(),
      });

      await expect(result.current.mutateAsync("filter-1")).rejects.toThrow(
        "Erro ao remover filtro"
      );
    });
  });
});
