/**
 * Filter Search Flow Integration Tests
 * Story: 3.3 - Traditional Filter Search
 *
 * AC: #2 - Search with filters
 * AC: #3 - Result count display
 * AC: #5 - Empty state when no results
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LeadsPageContent } from "@/components/leads/LeadsPageContent";
import { useFilterStore } from "@/stores/use-filter-store";

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Wrapper with React Query
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

describe("Filter Search Flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
    // Reset store state
    const store = useFilterStore.getState();
    store.clearFilters();
    store.setExpanded(false);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("searches with selected filters", async () => {
    const mockLeads = [
      {
        id: "1",
        tenant_id: "t1",
        first_name: "João",
        last_name: "Silva",
        email: "joao@test.com",
        status: "novo",
      },
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: mockLeads, meta: { total: 1 } }),
    });

    render(<LeadsPageContent />, { wrapper: createWrapper() });

    // Expand filter panel
    const toggleButton = screen.getByTestId("filter-toggle-button");
    await userEvent.click(toggleButton);

    // Set some filters via the store
    useFilterStore.getState().setTitles(["CEO"]);
    useFilterStore.getState().setKeywords("technology");

    // Click search
    const searchButton = screen.getByTestId("search-button");
    await userEvent.click(searchButton);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/integrations/apollo",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
        })
      );
    });

    // Verify filters were sent
    const callArgs = mockFetch.mock.calls[0];
    const requestBody = JSON.parse(callArgs[1].body);
    expect(requestBody.titles).toEqual(["CEO"]);
    expect(requestBody.keywords).toBe("technology");
  });

  it("displays result count after search", async () => {
    const mockLeads = [
      { id: "1", first_name: "João", status: "novo" },
      { id: "2", first_name: "Maria", status: "novo" },
      { id: "3", first_name: "Pedro", status: "novo" },
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: mockLeads, meta: { total: 3 } }),
    });

    render(<LeadsPageContent />, { wrapper: createWrapper() });

    // Expand and search
    await userEvent.click(screen.getByTestId("filter-toggle-button"));
    await userEvent.click(screen.getByTestId("search-button"));

    await waitFor(() => {
      expect(screen.getByTestId("result-count")).toHaveTextContent(
        "3 leads encontrados"
      );
    });
  });

  it("shows singular form for single result", async () => {
    const mockLeads = [{ id: "1", first_name: "João", status: "novo" }];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: mockLeads, meta: { total: 1 } }),
    });

    render(<LeadsPageContent />, { wrapper: createWrapper() });

    // Expand and search
    await userEvent.click(screen.getByTestId("filter-toggle-button"));
    await userEvent.click(screen.getByTestId("search-button"));

    await waitFor(() => {
      expect(screen.getByTestId("result-count")).toHaveTextContent(
        "1 lead encontrado"
      );
    });
  });

  it("shows empty state when no results", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: [], meta: { total: 0 } }),
    });

    render(<LeadsPageContent />, { wrapper: createWrapper() });

    // Expand and search
    await userEvent.click(screen.getByTestId("filter-toggle-button"));
    await userEvent.click(screen.getByTestId("search-button"));

    await waitFor(() => {
      expect(screen.getByTestId("search-empty-state")).toBeInTheDocument();
    });

    // Should show suggestion to adjust filters
    expect(
      screen.getByText(/Tente ajustar os filtros para encontrar leads/)
    ).toBeInTheDocument();
  });

  it("handles API errors gracefully", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () =>
        Promise.resolve({
          error: {
            code: "APOLLO_ERROR",
            message: "Erro ao conectar com Apollo API",
          },
        }),
    });

    render(<LeadsPageContent />, { wrapper: createWrapper() });

    // Expand and search
    await userEvent.click(screen.getByTestId("filter-toggle-button"));
    await userEvent.click(screen.getByTestId("search-button"));

    await waitFor(() => {
      expect(
        screen.getByText(/Erro ao buscar leads: Erro ao conectar com Apollo API/)
      ).toBeInTheDocument();
    });
  });

  it("shows initial empty state before any search", () => {
    render(<LeadsPageContent />, { wrapper: createWrapper() });

    // Should show the initial empty state
    expect(screen.getByText("Nenhum lead encontrado")).toBeInTheDocument();
    expect(
      screen.getByText(/Comece buscando leads usando a busca conversacional/)
    ).toBeInTheDocument();
  });

  it("shows loading skeleton during search", async () => {
    // Use a promise that we can control
    let resolvePromise: (value: unknown) => void;
    const pendingPromise = new Promise((resolve) => {
      resolvePromise = resolve;
    });

    mockFetch.mockImplementationOnce(() => pendingPromise);

    render(<LeadsPageContent />, { wrapper: createWrapper() });

    // Expand and search
    await userEvent.click(screen.getByTestId("filter-toggle-button"));
    await userEvent.click(screen.getByTestId("search-button"));

    // Should show loading state - check for skeleton or loading text
    await waitFor(() => {
      expect(screen.getByText("Buscando...")).toBeInTheDocument();
    });

    // Resolve the promise to clean up
    resolvePromise!({
      ok: true,
      json: () => Promise.resolve({ data: [], meta: { total: 0 } }),
    });
  });

  it("clears filters and maintains empty state display", async () => {
    // First perform a search
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: [{ id: "1", first_name: "João", status: "novo" }],
          meta: { total: 1 },
        }),
    });

    render(<LeadsPageContent />, { wrapper: createWrapper() });

    // Set filters, expand and search
    useFilterStore.getState().setKeywords("test");
    await userEvent.click(screen.getByTestId("filter-toggle-button"));
    await userEvent.click(screen.getByTestId("search-button"));

    await waitFor(() => {
      expect(screen.getByTestId("result-count")).toBeInTheDocument();
    });

    // Clear filters
    await userEvent.click(screen.getByTestId("clear-filters-button"));

    // Filters should be cleared
    const state = useFilterStore.getState();
    expect(state.filters.keywords).toBe("");
    expect(state.isDirty).toBe(false);
  });
});
