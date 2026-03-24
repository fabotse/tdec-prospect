/**
 * Unit tests for useCompanySearch hook
 * Story: 15.2 - Busca Technografica: Autocomplete e Filtros
 *
 * Tests:
 * - Mutation: search triggers fetch
 * - Loading state
 * - Error handling
 * - Pagination state
 * - Returns data on success
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useCompanySearch } from "@/hooks/use-company-search";

const mockFetch = vi.fn();
global.fetch = mockFetch;

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  });

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe("useCompanySearch", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("starts with no data and not loading", () => {
    const { result } = renderHook(() => useCompanySearch(), {
      wrapper: createWrapper(),
    });

    expect(result.current.data).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.page).toBe(0);
  });

  it("returns data on successful search", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: [
            {
              name: "Acme",
              domain: "acme.com",
              technologies_found: [],
            },
          ],
          meta: { total_results: 1, total_companies: 1 },
        }),
    });

    const { result } = renderHook(() => useCompanySearch(), {
      wrapper: createWrapper(),
    });

    act(() => {
      result.current.search({ technologySlugs: ["react"] });
    });

    await waitFor(() => {
      expect(result.current.data).not.toBeNull();
    });

    expect(result.current.data!.companies).toHaveLength(1);
    expect(result.current.data!.companies[0].name).toBe("Acme");
    expect(result.current.data!.totalResults).toBe(1);
  });

  it("shows loading state during search", async () => {
    mockFetch.mockImplementation(
      () => new Promise(() => {}) // Never resolves
    );

    const { result } = renderHook(() => useCompanySearch(), {
      wrapper: createWrapper(),
    });

    act(() => {
      result.current.search({ technologySlugs: ["react"] });
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(true);
    });
  });

  it("handles error response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ error: "Limite atingido" }),
    });

    const { result } = renderHook(() => useCompanySearch(), {
      wrapper: createWrapper(),
    });

    act(() => {
      result.current.search({ technologySlugs: ["react"] });
    });

    await waitFor(() => {
      expect(result.current.error).not.toBeNull();
    });

    expect(result.current.error!.message).toContain("Limite atingido");
  });

  it("manages page state", async () => {
    const { result } = renderHook(() => useCompanySearch(), {
      wrapper: createWrapper(),
    });

    expect(result.current.page).toBe(0);

    act(() => {
      result.current.setPage(2);
    });

    expect(result.current.page).toBe(2);
  });

  it("sends POST request with correct body", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: [],
          meta: { total_results: 0, total_companies: 0 },
        }),
    });

    const { result } = renderHook(() => useCompanySearch(), {
      wrapper: createWrapper(),
    });

    act(() => {
      result.current.search({
        technologySlugs: ["react", "nextjs"],
        countryCodes: ["BR"],
        minEmployeeCount: 50,
      });
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain("/api/integrations/theirstack/search/companies");
    expect(options.method).toBe("POST");

    const body = JSON.parse(options.body);
    expect(body.technologySlugs).toEqual(["react", "nextjs"]);
    expect(body.countryCodes).toEqual(["BR"]);
    expect(body.minEmployeeCount).toBe(50);
  });

  it("resets mutation state", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: [{ name: "Test", domain: "test.com", technologies_found: [] }],
          meta: { total_results: 1, total_companies: 1 },
        }),
    });

    const { result } = renderHook(() => useCompanySearch(), {
      wrapper: createWrapper(),
    });

    act(() => {
      result.current.search({ technologySlugs: ["react"] });
    });

    await waitFor(() => {
      expect(result.current.data).not.toBeNull();
    });

    act(() => {
      result.current.reset();
    });

    await waitFor(() => {
      expect(result.current.data).toBeNull();
    });

    expect(result.current.error).toBeNull();
  });
});
