/**
 * TechnographicPageContent Integration Tests
 * Story: 15.2 - Busca Technografica: Autocomplete e Filtros
 *
 * AC: #1, #2, #3 - Integration of autocomplete, filters, and results
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { TechnographicPageContent } from "@/components/technographic/TechnographicPageContent";

// Mock hooks
const mockSearch = vi.fn();
const mockMutationData = { companies: [], totalResults: 0, totalCompanies: 0 };

vi.mock("@/hooks/use-company-search", () => ({
  useCompanySearch: vi.fn(() => ({
    search: mockSearch,
    searchAsync: vi.fn(),
    data: null,
    isLoading: false,
    error: null,
    reset: vi.fn(),
    page: 0,
    setPage: vi.fn(),
  })),
}));

vi.mock("@/hooks/use-technology-search", () => ({
  useTechnologySearch: vi.fn(() => ({
    data: [
      { name: "React", slug: "react", category: "Frontend", company_count: 150000 },
    ],
    isLoading: false,
  })),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe("TechnographicPageContent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders all main sections", () => {
    render(<TechnographicPageContent />, { wrapper: createWrapper() });

    // Autocomplete
    expect(screen.getByTestId("technology-search-input")).toBeInTheDocument();
    // Filter panel
    expect(screen.getByTestId("filter-panel")).toBeInTheDocument();
    // Search button
    expect(screen.getByTestId("search-button")).toBeInTheDocument();
  });

  it("disables search button when no technologies selected", () => {
    render(<TechnographicPageContent />, { wrapper: createWrapper() });

    const searchBtn = screen.getByTestId("search-button");
    expect(searchBtn).toBeDisabled();
    expect(screen.getByText(/Selecione pelo menos uma tecnologia/)).toBeInTheDocument();
  });

  it("enables search button after selecting a technology", async () => {
    render(<TechnographicPageContent />, { wrapper: createWrapper() });

    // Type to trigger suggestions
    const input = screen.getByTestId("technology-search-input");
    fireEvent.change(input, { target: { value: "react" } });
    fireEvent.focus(input);

    // Wait for suggestions
    await waitFor(() => {
      expect(screen.getByTestId("technology-suggestions")).toBeInTheDocument();
    });

    // Select a technology
    fireEvent.click(screen.getByText("React"));

    // Button should now be enabled
    expect(screen.getByTestId("search-button")).not.toBeDisabled();
  });

  it("calls search with selected technologies on search button click", async () => {
    render(<TechnographicPageContent />, { wrapper: createWrapper() });

    // Select a technology
    const input = screen.getByTestId("technology-search-input");
    fireEvent.change(input, { target: { value: "react" } });
    fireEvent.focus(input);

    await waitFor(() => {
      expect(screen.getByTestId("technology-suggestions")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("React"));

    // Click search
    fireEvent.click(screen.getByTestId("search-button"));

    expect(mockSearch).toHaveBeenCalledWith(
      expect.objectContaining({
        technologySlugs: ["react"],
        page: 0,
        limit: 2,
      })
    );
  });

  it("shows empty state with guidance when no search performed", () => {
    render(<TechnographicPageContent />, { wrapper: createWrapper() });

    expect(screen.getByTestId("empty-state")).toBeInTheDocument();
    expect(screen.getByText(/Busque empresas por tecnologia/)).toBeInTheDocument();
  });
});
