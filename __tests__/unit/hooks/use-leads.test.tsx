/**
 * Leads Hook Tests
 * Story: 3.1 - Leads Page & Data Model
 * Story: 3.2 - Apollo API Integration Service
 * AC: #6 - TanStack Query hook for leads with Apollo API integration
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  useLeads,
  useLeadCount,
  useSearchLeads,
} from "@/hooks/use-leads";
import type { ApolloSearchFilters } from "@/types/apollo";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Create a wrapper with QueryClientProvider
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe("useLeads", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty array on successful empty response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: [], meta: { total: 0 } }),
    });

    const { result } = renderHook(() => useLeads(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toEqual([]);
  });

  it("handles loading state", () => {
    mockFetch.mockImplementation(
      () => new Promise(() => {}) // Never resolves
    );

    const { result } = renderHook(() => useLeads(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);
  });

  it("fetches leads with filters", async () => {
    const mockLeads = [
      {
        id: "1",
        firstName: "João",
        lastName: "Silva",
        email: "joao@test.com",
        status: "novo",
      },
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: mockLeads, meta: { total: 1 } }),
    });

    const filters: ApolloSearchFilters = {
      titles: ["CEO"],
      locations: ["Brazil"],
    };

    const { result } = renderHook(() => useLeads(filters), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/integrations/apollo",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(filters),
      })
    );
    expect(result.current.data).toEqual(mockLeads);
  });

  it("handles API error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () =>
        Promise.resolve({
          error: { code: "APOLLO_ERROR", message: "Erro na API" },
        }),
    });

    const { result } = renderHook(() => useLeads(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBe("Erro na API");
    expect(result.current.data).toEqual([]);
  });

  it("returns null error when no error occurs", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: [], meta: { total: 0 } }),
    });

    const { result } = renderHook(() => useLeads(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBeNull();
  });

  it("provides refetch function", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [], meta: { total: 0 } }),
    });

    const { result } = renderHook(() => useLeads(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(typeof result.current.refetch).toBe("function");
  });

  it("provides isFetching state", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: [], meta: { total: 0 } }),
    });

    const { result } = renderHook(() => useLeads(), {
      wrapper: createWrapper(),
    });

    // Initially, isFetching should be true
    expect(result.current.isFetching).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isFetching).toBe(false);
  });

  it("can be disabled with options", async () => {
    const { result } = renderHook(() => useLeads(undefined, { enabled: false }), {
      wrapper: createWrapper(),
    });

    // Should not be loading because query is disabled
    expect(result.current.isLoading).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe("useSearchLeads", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("provides search mutation functions", () => {
    const { result } = renderHook(() => useSearchLeads(), {
      wrapper: createWrapper(),
    });

    expect(typeof result.current.search).toBe("function");
    expect(typeof result.current.searchAsync).toBe("function");
    expect(typeof result.current.reset).toBe("function");
    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it("executes search and returns results", async () => {
    const mockLeads = [
      { id: "1", firstName: "João", status: "novo" },
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: mockLeads, meta: { total: 1 } }),
    });

    const { result } = renderHook(() => useSearchLeads(), {
      wrapper: createWrapper(),
    });

    let searchResult: typeof mockLeads | undefined;
    await act(async () => {
      searchResult = await result.current.searchAsync({ titles: ["CEO"] });
    });

    // Check the returned value from searchAsync
    expect(searchResult).toEqual(mockLeads);
  });

  it("handles search error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () =>
        Promise.resolve({
          error: { code: "APOLLO_ERROR", message: "Erro na busca" },
        }),
    });

    const { result } = renderHook(() => useSearchLeads(), {
      wrapper: createWrapper(),
    });

    let caughtError: Error | undefined;
    await act(async () => {
      try {
        await result.current.searchAsync({});
      } catch (e) {
        caughtError = e as Error;
      }
    });

    // The error should be thrown and caught
    expect(caughtError?.message).toBe("Erro na busca");
  });

  it("provides reset function", () => {
    const { result } = renderHook(() => useSearchLeads(), {
      wrapper: createWrapper(),
    });

    // Reset should be a function
    expect(typeof result.current.reset).toBe("function");

    // Can call reset without error
    act(() => {
      result.current.reset();
    });

    // After reset, data should be empty array
    expect(result.current.data).toEqual([]);
  });
});

describe("useLeadCount", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("returns 0 initially", () => {
    const { result } = renderHook(() => useLeadCount(), {
      wrapper: createWrapper(),
    });

    expect(result.current.count).toBe(0);
  });

  it("returns count based on data length", () => {
    // useLeadCount uses useLeads internally with enabled: false
    // so it just returns 0 until data is fetched via other means
    const { result } = renderHook(() => useLeadCount(), {
      wrapper: createWrapper(),
    });

    expect(result.current.count).toBe(0);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });
});
