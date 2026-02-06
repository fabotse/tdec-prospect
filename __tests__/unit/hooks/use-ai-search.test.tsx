/**
 * AI Search Hook Tests
 * Story: 3.4 - AI Conversational Search
 * AC: #1 - AI converts natural language to Apollo API parameters
 * AC: #2 - Shows phase-specific loading messages
 * AC: #3 - Returns extracted filters for transparency
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAISearch } from "@/hooks/use-ai-search";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Create a wrapper with QueryClientProvider
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe("useAISearch", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("provides search mutation functions", () => {
    const { result } = renderHook(() => useAISearch(), {
      wrapper: createWrapper(),
    });

    expect(typeof result.current.search).toBe("function");
    expect(typeof result.current.searchAsync).toBe("function");
    expect(typeof result.current.reset).toBe("function");
    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toEqual([]);
    expect(result.current.error).toBeNull();
    expect(result.current.searchPhase).toBe("idle");
  });

  it("executes AI search and returns results with extracted filters", async () => {
    const mockResponse = {
      leads: [{ id: "1", firstName: "João", status: "novo" }],
      aiResult: {
        extractedFilters: {
          industries: ["technology"],
          locations: ["São Paulo, Brazil"],
        },
        confidence: 0.9,
        explanation: "Busca por tecnologia em SP",
        originalQuery: "leads de tecnologia em SP",
      },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: mockResponse }),
    });

    const { result } = renderHook(() => useAISearch(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.search("leads de tecnologia em SP");
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toEqual(mockResponse.leads);
    expect(result.current.extractedFilters).toEqual(
      mockResponse.aiResult.extractedFilters
    );
    expect(result.current.confidence).toBe(0.9);
    expect(result.current.explanation).toBe("Busca por tecnologia em SP");
    expect(result.current.originalQuery).toBe("leads de tecnologia em SP");
    expect(result.current.searchPhase).toBe("done");
  });

  it("handles API error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () =>
        Promise.resolve({
          error: {
            code: "AI_EXTRACTION_ERROR",
            message: "Não consegui entender sua busca",
          },
        }),
    });

    const { result } = renderHook(() => useAISearch(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.search("some query");
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBe("Não consegui entender sua busca");
    expect(result.current.searchPhase).toBe("error");
  });

  it("resets state on reset()", async () => {
    const mockResponse = {
      leads: [{ id: "1", firstName: "João", status: "novo" }],
      aiResult: {
        extractedFilters: { industries: ["technology"] },
        confidence: 0.9,
        explanation: "Test",
        originalQuery: "test",
      },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: mockResponse }),
    });

    const { result } = renderHook(() => useAISearch(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.search("test");
    });

    await waitFor(() => {
      expect(result.current.data.length).toBeGreaterThan(0);
    });

    act(() => {
      result.current.reset();
    });

    expect(result.current.data).toEqual([]);
    expect(result.current.extractedFilters).toBeNull();
    expect(result.current.searchPhase).toBe("idle");
  });

  it("tracks search phases correctly", async () => {
    let resolvePromise: (value: unknown) => void;
    const promise = new Promise((resolve) => {
      resolvePromise = resolve;
    });

    mockFetch.mockImplementationOnce(() => promise);

    const { result } = renderHook(() => useAISearch(), {
      wrapper: createWrapper(),
    });

    expect(result.current.searchPhase).toBe("idle");

    act(() => {
      result.current.search("test query");
    });

    // Should be translating during search
    await waitFor(() => {
      expect(result.current.searchPhase).toBe("translating");
    });

    // Resolve the promise
    await act(async () => {
      resolvePromise!({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              leads: [],
              aiResult: {
                extractedFilters: {},
                confidence: 0.9,
                explanation: "",
                originalQuery: "test query",
              },
            },
          }),
      });
    });

    await waitFor(() => {
      expect(result.current.searchPhase).toBe("done");
    });
  });

  it("sends correct request to API", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: {
            leads: [],
            aiResult: {
              extractedFilters: {},
              confidence: 0.9,
              explanation: "",
              originalQuery: "CTOs em São Paulo",
            },
          },
        }),
    });

    const { result } = renderHook(() => useAISearch(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.searchAsync("CTOs em São Paulo");
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/ai/search",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "CTOs em São Paulo" }),
      })
    );
  });
});
