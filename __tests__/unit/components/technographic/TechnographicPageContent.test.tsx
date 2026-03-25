/**
 * TechnographicPageContent Integration Tests
 * Story: 15.3 - Resultados de Empresas: Tabela e Selecao
 *
 * AC: #1, #2, #3 - Integration of autocomplete, filters, and results
 * AC: #3, #4 - Selection integration (select company updates state, new search clears selection)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { TechnographicPageContent } from "@/components/technographic/TechnographicPageContent";
import { useCompanySearch } from "@/hooks/use-company-search";
import type { TheirStackCompany } from "@/types/theirstack";

// Mock hooks
const mockSearch = vi.fn();
const mockSetPage = vi.fn();

vi.mock("@/hooks/use-company-search", () => ({
  useCompanySearch: vi.fn(() => ({
    search: mockSearch,
    searchAsync: vi.fn(),
    data: null,
    isLoading: false,
    error: null,
    reset: vi.fn(),
    page: 0,
    setPage: mockSetPage,
  })),
}));

const mockCompaniesData: TheirStackCompany[] = [
  {
    name: "Acme Corp",
    domain: "acme.com",
    url: "https://acme.com",
    country: "Brazil",
    country_code: "BR",
    city: "São Paulo",
    industry: "Software",
    employee_count_range: "100-500",
    apollo_id: null,
    annual_revenue_usd: null,
    founded_year: null,
    linkedin_url: null,
    technologies_found: [
      { technology: { name: "React", slug: "react" }, confidence: "high", theirstack_score: 0.95 },
    ],
    has_blurred_data: false,
  },
  {
    name: "Beta Ltd",
    domain: "beta.io",
    url: null,
    country: null,
    country_code: null,
    city: null,
    industry: null,
    employee_count_range: null,
    apollo_id: null,
    annual_revenue_usd: null,
    founded_year: null,
    linkedin_url: null,
    technologies_found: [
      { technology: { name: "Vue.js", slug: "vuejs" }, confidence: "medium", theirstack_score: 0.72 },
    ],
    has_blurred_data: false,
  },
];

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

  // =====================
  // SELECTION INTEGRATION (AC #3, #4)
  // =====================

  it("renders checkboxes when companies are displayed", () => {
    vi.mocked(useCompanySearch).mockReturnValue({
      search: mockSearch,
      searchAsync: vi.fn(),
      data: { companies: mockCompaniesData, totalResults: 2, totalCompanies: 2 },
      isLoading: false,
      error: null,
      reset: vi.fn(),
      page: 0,
      setPage: mockSetPage,
    } as ReturnType<typeof useCompanySearch>);

    render(<TechnographicPageContent />, { wrapper: createWrapper() });

    expect(screen.getByTestId("select-row-acme.com")).toBeInTheDocument();
    expect(screen.getByTestId("select-row-beta.io")).toBeInTheDocument();
    expect(screen.getByTestId("select-all-checkbox")).toBeInTheDocument();
  });

  it("selecting a company updates selection state", () => {
    vi.mocked(useCompanySearch).mockReturnValue({
      search: mockSearch,
      searchAsync: vi.fn(),
      data: { companies: mockCompaniesData, totalResults: 2, totalCompanies: 2 },
      isLoading: false,
      error: null,
      reset: vi.fn(),
      page: 0,
      setPage: mockSetPage,
    } as ReturnType<typeof useCompanySearch>);

    render(<TechnographicPageContent />, { wrapper: createWrapper() });

    // Select Acme Corp
    fireEvent.click(screen.getByTestId("select-row-acme.com"));

    // Counter should appear
    expect(screen.getByTestId("selection-counter")).toHaveTextContent("1 empresa selecionada");
  });

  it("page change clears selection", () => {
    vi.mocked(useCompanySearch).mockReturnValue({
      search: mockSearch,
      searchAsync: vi.fn(),
      data: { companies: mockCompaniesData, totalResults: 20, totalCompanies: 20 },
      isLoading: false,
      error: null,
      reset: vi.fn(),
      page: 0,
      setPage: mockSetPage,
    } as ReturnType<typeof useCompanySearch>);

    render(<TechnographicPageContent />, { wrapper: createWrapper() });

    // Select a company
    fireEvent.click(screen.getByTestId("select-row-acme.com"));
    expect(screen.getByTestId("selection-counter")).toBeInTheDocument();

    // Click next page
    fireEvent.click(screen.getByTestId("next-page"));

    // Selection should be cleared
    expect(screen.queryByTestId("selection-counter")).not.toBeInTheDocument();
  });

  it("new search clears selection", async () => {
    vi.mocked(useCompanySearch).mockReturnValue({
      search: mockSearch,
      searchAsync: vi.fn(),
      data: { companies: mockCompaniesData, totalResults: 2, totalCompanies: 2 },
      isLoading: false,
      error: null,
      reset: vi.fn(),
      page: 0,
      setPage: mockSetPage,
    } as ReturnType<typeof useCompanySearch>);

    render(<TechnographicPageContent />, { wrapper: createWrapper() });

    // Select a company
    fireEvent.click(screen.getByTestId("select-row-acme.com"));
    expect(screen.getByTestId("selection-counter")).toBeInTheDocument();

    // Select a technology and search again
    const input = screen.getByTestId("technology-search-input");
    fireEvent.change(input, { target: { value: "react" } });
    fireEvent.focus(input);

    await waitFor(() => {
      expect(screen.getByTestId("technology-suggestions")).toBeInTheDocument();
    });

    // Click the suggestion inside the suggestions dropdown
    const suggestions = screen.getByTestId("technology-suggestions");
    const option = suggestions.querySelector('[role="option"]')!;
    fireEvent.click(option);
    fireEvent.click(screen.getByTestId("search-button"));

    // Selection should be cleared
    expect(screen.queryByTestId("selection-counter")).not.toBeInTheDocument();
  });
});
