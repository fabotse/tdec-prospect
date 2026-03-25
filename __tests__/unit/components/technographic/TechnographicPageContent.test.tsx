/**
 * TechnographicPageContent Integration Tests
 * Story: 15.3 - Resultados de Empresas: Tabela e Selecao
 * Story: 15.4 - Apollo Bridge: Busca de Contatos nas Empresas
 *
 * AC: #1, #2, #3 (15.3) - Integration of autocomplete, filters, and results
 * AC: #3, #4 (15.3) - Selection integration (select company updates state, new search clears selection)
 * AC: #1-#5 (15.4) - Contact search, results, error + retry, clear on new search
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { TechnographicPageContent } from "@/components/technographic/TechnographicPageContent";
import { useCompanySearch } from "@/hooks/use-company-search";
import { useContactSearch } from "@/hooks/use-contact-search";
import type { TheirStackCompany } from "@/types/theirstack";
import type { Lead } from "@/types/lead";

// Mock hooks
const mockSearch = vi.fn();
const mockSetPage = vi.fn();
const mockContactSearch = vi.fn();
const mockContactReset = vi.fn();

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

vi.mock("@/hooks/use-contact-search", () => ({
  useContactSearch: vi.fn(() => ({
    search: mockContactSearch,
    data: null,
    isLoading: false,
    error: null,
    reset: mockContactReset,
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

  // =====================
  // CONTACT SEARCH INTEGRATION (Story 15.4: AC #1-#5)
  // =====================

  const mockContactsData: Lead[] = [
    {
      id: "lead-1",
      tenantId: "tenant-1",
      apolloId: "apollo-1",
      firstName: "João",
      lastName: "Sil***a",
      email: null,
      phone: null,
      companyName: "Acme Corp",
      companySize: null,
      industry: null,
      location: null,
      title: "CTO",
      linkedinUrl: null,
      photoUrl: null,
      status: "novo",
      hasEmail: true,
      hasDirectPhone: "Yes",
      createdAt: "2026-03-25T00:00:00Z",
      updatedAt: "2026-03-25T00:00:00Z",
      icebreaker: null,
      icebreakerGeneratedAt: null,
      linkedinPostsCache: null,
      isMonitored: false,
    },
  ];

  function setupWithCompaniesAndSelection() {
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
  }

  it("shows contact search section when companies are selected", () => {
    setupWithCompaniesAndSelection();

    render(<TechnographicPageContent />, { wrapper: createWrapper() });

    // No contact section before selection
    expect(screen.queryByTestId("contact-search-section")).not.toBeInTheDocument();

    // Select a company
    fireEvent.click(screen.getByTestId("select-row-acme.com"));

    // Contact section should appear
    expect(screen.getByTestId("contact-search-section")).toBeInTheDocument();
    expect(screen.getByTestId("contact-search-trigger")).toBeInTheDocument();
  });

  it("hides contact search section when no companies are selected", () => {
    setupWithCompaniesAndSelection();

    render(<TechnographicPageContent />, { wrapper: createWrapper() });

    // Select then deselect
    fireEvent.click(screen.getByTestId("select-row-acme.com"));
    expect(screen.getByTestId("contact-search-section")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("select-row-acme.com"));
    expect(screen.queryByTestId("contact-search-section")).not.toBeInTheDocument();
  });

  it("opens dialog and calls contact search with titles", async () => {
    setupWithCompaniesAndSelection();

    render(<TechnographicPageContent />, { wrapper: createWrapper() });

    // Select a company
    fireEvent.click(screen.getByTestId("select-row-acme.com"));

    // Open contact search dialog
    fireEvent.click(screen.getByTestId("contact-search-trigger"));

    await waitFor(() => {
      expect(screen.getByTestId("contact-search-dialog")).toBeInTheDocument();
    });

    // Add a title and search
    const titleInput = screen.getByTestId("title-input");
    fireEvent.change(titleInput, { target: { value: "CTO" } });
    fireEvent.keyDown(titleInput, { key: "Enter" });
    fireEvent.click(screen.getByTestId("confirm-contact-search"));

    expect(mockContactSearch).toHaveBeenCalledWith({
      domains: ["acme.com"],
      titles: ["CTO"],
    });
  });

  it("shows contact results when data is available", () => {
    setupWithCompaniesAndSelection();
    vi.mocked(useContactSearch).mockReturnValue({
      search: mockContactSearch,
      data: { contacts: mockContactsData, total: 1, page: 1, totalPages: 1 },
      isLoading: false,
      error: null,
      reset: mockContactReset,
    });

    render(<TechnographicPageContent />, { wrapper: createWrapper() });

    // Select a company to trigger contact section
    fireEvent.click(screen.getByTestId("select-row-acme.com"));

    // Contact results should be visible
    expect(screen.getByTestId("contact-results")).toBeInTheDocument();
    expect(screen.getByText("João Sil***a")).toBeInTheDocument();
    expect(screen.getByText("CTO")).toBeInTheDocument();
  });

  it("shows contact loading state", () => {
    setupWithCompaniesAndSelection();
    vi.mocked(useContactSearch).mockReturnValue({
      search: mockContactSearch,
      data: null,
      isLoading: true,
      error: null,
      reset: mockContactReset,
    });

    render(<TechnographicPageContent />, { wrapper: createWrapper() });

    // Select a company
    fireEvent.click(screen.getByTestId("select-row-acme.com"));

    expect(screen.getByTestId("contact-table-skeleton")).toBeInTheDocument();
  });

  it("shows contact error with retry button that re-executes search (AC: #5)", async () => {
    setupWithCompaniesAndSelection();
    vi.mocked(useContactSearch).mockReturnValue({
      search: mockContactSearch,
      data: null,
      isLoading: false,
      error: new Error("Erro ao conectar com Apollo API"),
      reset: mockContactReset,
    });

    render(<TechnographicPageContent />, { wrapper: createWrapper() });

    // Select a company
    fireEvent.click(screen.getByTestId("select-row-acme.com"));

    // Open dialog, add title, and search to set lastContactParams
    fireEvent.click(screen.getByTestId("contact-search-trigger"));
    await waitFor(() => {
      expect(screen.getByTestId("title-input")).toBeInTheDocument();
    });
    const titleInput = screen.getByTestId("title-input");
    fireEvent.change(titleInput, { target: { value: "CTO" } });
    fireEvent.keyDown(titleInput, { key: "Enter" });
    fireEvent.click(screen.getByTestId("confirm-contact-search"));

    expect(screen.getByTestId("contact-search-error")).toBeInTheDocument();
    expect(screen.getByText("Erro ao conectar com Apollo API")).toBeInTheDocument();
    expect(screen.getByTestId("contact-retry-button")).toBeInTheDocument();

    // Clear previous calls to isolate retry
    mockContactSearch.mockClear();
    mockContactReset.mockClear();

    // Click retry — should reset AND re-execute the last search
    fireEvent.click(screen.getByTestId("contact-retry-button"));
    expect(mockContactReset).toHaveBeenCalled();
    expect(mockContactSearch).toHaveBeenCalledWith({
      domains: ["acme.com"],
      titles: ["CTO"],
    });
  });

  it("shows contact empty state when search returns 0 results (AC: #4)", () => {
    setupWithCompaniesAndSelection();
    vi.mocked(useContactSearch).mockReturnValue({
      search: mockContactSearch,
      data: { contacts: [], total: 0, page: 1, totalPages: 0 },
      isLoading: false,
      error: null,
      reset: mockContactReset,
    });

    render(<TechnographicPageContent />, { wrapper: createWrapper() });

    // Select a company to trigger contact section
    fireEvent.click(screen.getByTestId("select-row-acme.com"));

    // Empty state should be visible
    expect(screen.getByTestId("contact-empty-state")).toBeInTheDocument();
    expect(
      screen.getByText("Nenhum contato encontrado com os cargos selecionados")
    ).toBeInTheDocument();
  });

  it("clears contact results when new company search is performed", async () => {
    setupWithCompaniesAndSelection();
    vi.mocked(useContactSearch).mockReturnValue({
      search: mockContactSearch,
      data: { contacts: mockContactsData, total: 1, page: 1, totalPages: 1 },
      isLoading: false,
      error: null,
      reset: mockContactReset,
    });

    render(<TechnographicPageContent />, { wrapper: createWrapper() });

    // Select a company (contact results visible)
    fireEvent.click(screen.getByTestId("select-row-acme.com"));
    expect(screen.getByTestId("contact-results")).toBeInTheDocument();

    // Perform a new company search - select technology first
    const input = screen.getByTestId("technology-search-input");
    fireEvent.change(input, { target: { value: "react" } });
    fireEvent.focus(input);

    await waitFor(() => {
      expect(screen.getByTestId("technology-suggestions")).toBeInTheDocument();
    });

    const suggestions = screen.getByTestId("technology-suggestions");
    const option = suggestions.querySelector('[role="option"]')!;
    fireEvent.click(option);
    fireEvent.click(screen.getByTestId("search-button"));

    // Contact reset should have been called
    expect(mockContactReset).toHaveBeenCalled();
  });
});
