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

    // Story 3.8: API now returns pagination metadata
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        data: mockLeads,
        meta: { total: 1, page: 1, limit: 25, totalPages: 1 }
      }),
    });

    const { result } = renderHook(() => useSearchLeads(), {
      wrapper: createWrapper(),
    });

    // Story 3.8: searchAsync now returns { leads, pagination }
    await act(async () => {
      const searchResult = await result.current.searchAsync({ titles: ["CEO"] });
      expect(searchResult.leads).toEqual(mockLeads);
      expect(searchResult.pagination).toBeDefined();
    });
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

  // Story 3.8: Pagination state management tests
  describe("pagination controls", () => {
    it("provides pagination state and controls", () => {
      const { result } = renderHook(() => useSearchLeads(), {
        wrapper: createWrapper(),
      });

      expect(result.current.page).toBe(1);
      expect(result.current.perPage).toBe(25);
      expect(typeof result.current.setPage).toBe("function");
      expect(typeof result.current.setPerPage).toBe("function");
      expect(typeof result.current.resetPage).toBe("function");
    });

    it("setPage updates page state", () => {
      const { result } = renderHook(() => useSearchLeads(), {
        wrapper: createWrapper(),
      });

      act(() => {
        result.current.setPage(5);
      });

      expect(result.current.page).toBe(5);
    });

    it("setPage clamps to minimum 1", () => {
      const { result } = renderHook(() => useSearchLeads(), {
        wrapper: createWrapper(),
      });

      act(() => {
        result.current.setPage(0);
      });

      expect(result.current.page).toBe(1);

      act(() => {
        result.current.setPage(-5);
      });

      expect(result.current.page).toBe(1);
    });

    it("setPage clamps to maximum 500", () => {
      const { result } = renderHook(() => useSearchLeads(), {
        wrapper: createWrapper(),
      });

      act(() => {
        result.current.setPage(600);
      });

      expect(result.current.page).toBe(500);
    });

    it("setPerPage updates perPage state", () => {
      const { result } = renderHook(() => useSearchLeads(), {
        wrapper: createWrapper(),
      });

      act(() => {
        result.current.setPerPage(50);
      });

      expect(result.current.perPage).toBe(50);
    });

    it("setPerPage clamps to minimum 1", () => {
      const { result } = renderHook(() => useSearchLeads(), {
        wrapper: createWrapper(),
      });

      act(() => {
        result.current.setPerPage(0);
      });

      expect(result.current.perPage).toBe(1);
    });

    it("setPerPage clamps to maximum 100", () => {
      const { result } = renderHook(() => useSearchLeads(), {
        wrapper: createWrapper(),
      });

      act(() => {
        result.current.setPerPage(200);
      });

      expect(result.current.perPage).toBe(100);
    });

    it("setPerPage resets page to 1", () => {
      const { result } = renderHook(() => useSearchLeads(), {
        wrapper: createWrapper(),
      });

      // Set page to 5 first
      act(() => {
        result.current.setPage(5);
      });
      expect(result.current.page).toBe(5);

      // Change perPage should reset page to 1
      act(() => {
        result.current.setPerPage(50);
      });

      expect(result.current.page).toBe(1);
      expect(result.current.perPage).toBe(50);
    });

    it("resetPage resets page to 1", () => {
      const { result } = renderHook(() => useSearchLeads(), {
        wrapper: createWrapper(),
      });

      // Set page to 10
      act(() => {
        result.current.setPage(10);
      });
      expect(result.current.page).toBe(10);

      // Reset page
      act(() => {
        result.current.resetPage();
      });

      expect(result.current.page).toBe(1);
    });

    it("search includes page and perPage in request", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [],
            meta: { total: 0, page: 3, limit: 50, totalPages: 0 },
          }),
      });

      const { result } = renderHook(() => useSearchLeads(), {
        wrapper: createWrapper(),
      });

      // Set custom pagination
      act(() => {
        result.current.setPage(3);
        result.current.setPerPage(50);
      });

      // Reset perPage resets page, so set page again
      act(() => {
        result.current.setPage(3);
      });

      // Execute search
      await act(async () => {
        result.current.search({ titles: ["CEO"] });
      });

      // Verify fetch was called with pagination params
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/integrations/apollo",
        expect.objectContaining({
          body: expect.stringContaining('"page":3'),
        })
      );
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/integrations/apollo",
        expect.objectContaining({
          body: expect.stringContaining('"perPage":50'),
        })
      );
    });

    it("explicit page/perPage in filters override internal state", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [],
            meta: { total: 0, page: 10, limit: 100, totalPages: 0 },
          }),
      });

      const { result } = renderHook(() => useSearchLeads(), {
        wrapper: createWrapper(),
      });

      // Internal state is page=1, perPage=25
      expect(result.current.page).toBe(1);
      expect(result.current.perPage).toBe(25);

      // Execute search with explicit page/perPage override
      await act(async () => {
        result.current.search({ titles: ["CEO"], page: 10, perPage: 100 });
      });

      // Verify fetch was called with explicit pagination params, not internal state
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/integrations/apollo",
        expect.objectContaining({
          body: expect.stringContaining('"page":10'),
        })
      );
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/integrations/apollo",
        expect.objectContaining({
          body: expect.stringContaining('"perPage":100'),
        })
      );
    });
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
