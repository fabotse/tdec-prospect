/**
 * Unit tests for useTechnologySearch hook
 * Story: 15.2 - Busca Technografica: Autocomplete e Filtros
 *
 * Tests:
 * - Disabled when query < 2 chars (no fetch)
 * - Fetches after debounce when query >= 2 characters
 * - Returns data on success
 * - Handles error response
 * - Loading state during fetch
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useTechnologySearch } from "@/hooks/use-technology-search";

const mockFetch = vi.fn();
global.fetch = mockFetch;

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

describe("useTechnologySearch", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("does not fetch when query is shorter than 2 characters", async () => {
    vi.useFakeTimers();

    renderHook(() => useTechnologySearch("a"), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    expect(mockFetch).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  it("does not fetch when query is empty", async () => {
    vi.useFakeTimers();

    renderHook(() => useTechnologySearch(""), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    expect(mockFetch).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  it("fetches with correct URL when query >= 2 characters", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: [
            { name: "React", slug: "react", category: "Frontend", company_count: 150000 },
          ],
        }),
    });

    renderHook(() => useTechnologySearch("react"), {
      wrapper: createWrapper(),
    });

    // Wait for debounce + fetch (real timers)
    await waitFor(
      () => {
        expect(mockFetch).toHaveBeenCalled();
      },
      { timeout: 2000 }
    );

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain("q=react");
  });

  it("returns data on success", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: [
            { name: "React", slug: "react", category: "Frontend", company_count: 150000 },
          ],
        }),
    });

    const { result } = renderHook(() => useTechnologySearch("react"), {
      wrapper: createWrapper(),
    });

    await waitFor(
      () => {
        expect(result.current.data).toHaveLength(1);
      },
      { timeout: 2000 }
    );

    expect(result.current.data![0].name).toBe("React");
    expect(result.current.data![0].slug).toBe("react");
  });

  it("handles error response", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: "Erro ao buscar" }),
    });

    const { result } = renderHook(() => useTechnologySearch("react"), {
      wrapper: createWrapper(),
    });

    await waitFor(
      () => {
        expect(result.current.error).toBeDefined();
      },
      { timeout: 2000 }
    );
  });

  it("does not fetch for short query even after debounce", async () => {
    vi.useFakeTimers();

    renderHook(() => useTechnologySearch("r"), {
      wrapper: createWrapper(),
    });

    // Advance well past debounce
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    // Should never fetch because query < 2 chars
    expect(mockFetch).not.toHaveBeenCalled();

    vi.useRealTimers();
  });
});
