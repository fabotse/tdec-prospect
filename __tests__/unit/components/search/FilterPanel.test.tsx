/**
 * FilterPanel Component Tests
 * Story: 3.3 - Traditional Filter Search
 * Story: 3.7 - Saved Filters / Favorites (integration)
 *
 * AC: #1 - Filter panel with all filter fields
 * AC: #2 - Buscar button triggers search
 * AC: #4 - Limpar Filtros clears all values
 *
 * Code Review Addition: Debounce behavior tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { FilterPanel, DEBOUNCE_DELAY_MS } from "@/components/search/FilterPanel";
import { useFilterStore } from "@/stores/use-filter-store";

// Mock fetch for SavedFiltersDropdown
const mockFetch = vi.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ data: [] }),
  })
);
global.fetch = mockFetch as unknown as typeof fetch;

// Create wrapper with QueryClientProvider (needed for Story 3.7 integration)
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

describe("FilterPanel", () => {
  const mockOnSearch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset store state
    const store = useFilterStore.getState();
    store.clearFilters();
    store.setExpanded(false);
  });

  it("renders filter panel collapsed by default", () => {
    render(<FilterPanel onSearch={mockOnSearch} isLoading={false} />, { wrapper: createWrapper() });

    // Toggle button should be visible
    expect(screen.getByTestId("filter-toggle-button")).toBeInTheDocument();

    // Panel content should not be visible
    expect(screen.queryByTestId("filter-panel")).not.toBeInTheDocument();
  });

  it("expands on toggle click", async () => {
    render(<FilterPanel onSearch={mockOnSearch} isLoading={false} />, { wrapper: createWrapper() });

    const toggleButton = screen.getByTestId("filter-toggle-button");
    await userEvent.click(toggleButton);

    expect(screen.getByTestId("filter-panel")).toBeInTheDocument();
  });

  it("displays all filter fields when expanded", async () => {
    // Expand the panel
    useFilterStore.getState().setExpanded(true);

    render(<FilterPanel onSearch={mockOnSearch} isLoading={false} />, { wrapper: createWrapper() });

    // Check for all filter labels
    expect(screen.getByText("Setor/Indústria")).toBeInTheDocument();
    expect(screen.getByText("Tamanho da Empresa")).toBeInTheDocument();
    expect(screen.getByText("Localização")).toBeInTheDocument();
    expect(screen.getByText("Cargo/Título")).toBeInTheDocument();
    expect(screen.getByText("Palavras-chave")).toBeInTheDocument();
  });

  it("calls onSearch when Buscar clicked", async () => {
    useFilterStore.getState().setExpanded(true);

    render(<FilterPanel onSearch={mockOnSearch} isLoading={false} />, { wrapper: createWrapper() });

    const searchButton = screen.getByTestId("search-button");
    await userEvent.click(searchButton);

    expect(mockOnSearch).toHaveBeenCalledTimes(1);
  });

  it("clears all filters on Limpar Filtros click", async () => {
    const store = useFilterStore.getState();
    store.setExpanded(true);
    store.setIndustries(["technology"]);
    store.setKeywords("test");

    render(<FilterPanel onSearch={mockOnSearch} isLoading={false} />, { wrapper: createWrapper() });

    const clearButton = screen.getByTestId("clear-filters-button");
    await userEvent.click(clearButton);

    const state = useFilterStore.getState();
    expect(state.filters.industries).toEqual([]);
    expect(state.filters.keywords).toBe("");
    expect(state.isDirty).toBe(false);
  });

  it("shows loading state on button during search", () => {
    useFilterStore.getState().setExpanded(true);

    render(<FilterPanel onSearch={mockOnSearch} isLoading={true} />, { wrapper: createWrapper() });

    const searchButton = screen.getByTestId("search-button");
    expect(searchButton).toBeDisabled();
    expect(screen.getByText("Buscando...")).toBeInTheDocument();
  });

  it("displays active filter count as badge", async () => {
    const store = useFilterStore.getState();
    store.setIndustries(["technology"]);
    store.setKeywords("software");

    render(<FilterPanel onSearch={mockOnSearch} isLoading={false} />, { wrapper: createWrapper() });

    // Should show "2" in badge (2 active filters)
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("disables clear button when no filters active", () => {
    useFilterStore.getState().setExpanded(true);

    render(<FilterPanel onSearch={mockOnSearch} isLoading={false} />, { wrapper: createWrapper() });

    const clearButton = screen.getByTestId("clear-filters-button");
    expect(clearButton).toBeDisabled();
  });

  it("enables clear button when filters are active", () => {
    useFilterStore.getState().setExpanded(true);
    useFilterStore.getState().setKeywords("test");

    render(<FilterPanel onSearch={mockOnSearch} isLoading={false} />, { wrapper: createWrapper() });

    const clearButton = screen.getByTestId("clear-filters-button");
    expect(clearButton).not.toBeDisabled();
  });

  it("renders toggle button with Filtros text", () => {
    render(<FilterPanel onSearch={mockOnSearch} isLoading={false} />, { wrapper: createWrapper() });

    expect(screen.getByText("Filtros")).toBeInTheDocument();
  });

  it("renders search button with Buscar text when not loading", () => {
    useFilterStore.getState().setExpanded(true);

    render(<FilterPanel onSearch={mockOnSearch} isLoading={false} />, { wrapper: createWrapper() });

    expect(screen.getByText("Buscar")).toBeInTheDocument();
  });

  it("has location input with correct placeholder", () => {
    useFilterStore.getState().setExpanded(true);

    render(<FilterPanel onSearch={mockOnSearch} isLoading={false} />, { wrapper: createWrapper() });

    const locationInput = screen.getByPlaceholderText("Ex: São Paulo, Brasil");
    expect(locationInput).toBeInTheDocument();
  });

  it("has title input with correct placeholder", () => {
    useFilterStore.getState().setExpanded(true);

    render(<FilterPanel onSearch={mockOnSearch} isLoading={false} />, { wrapper: createWrapper() });

    const titleInput = screen.getByPlaceholderText("Ex: CEO, CTO, Diretor");
    expect(titleInput).toBeInTheDocument();
  });

  it("has keywords input with correct placeholder", () => {
    useFilterStore.getState().setExpanded(true);

    render(<FilterPanel onSearch={mockOnSearch} isLoading={false} />, { wrapper: createWrapper() });

    const keywordsInput = screen.getByPlaceholderText("Termos de busca");
    expect(keywordsInput).toBeInTheDocument();
  });

  it("collapses panel when toggle clicked again", async () => {
    render(<FilterPanel onSearch={mockOnSearch} isLoading={false} />, { wrapper: createWrapper() });

    const toggleButton = screen.getByTestId("filter-toggle-button");

    // Expand
    await userEvent.click(toggleButton);
    expect(screen.getByTestId("filter-panel")).toBeInTheDocument();

    // Collapse
    await userEvent.click(toggleButton);
    expect(screen.queryByTestId("filter-panel")).not.toBeInTheDocument();
  });

  // Code Review Addition: Clear filters visual sync test
  it("clears input fields visually when clearFilters is clicked", async () => {
    useFilterStore.getState().setExpanded(true);

    render(<FilterPanel onSearch={mockOnSearch} isLoading={false} />, { wrapper: createWrapper() });

    // Type in the keywords input
    const keywordsInput = screen.getByTestId("keywords-input");
    await userEvent.type(keywordsInput, "test keywords");

    // Verify input has value
    expect(keywordsInput).toHaveValue("test keywords");

    // Wait for debounce to complete
    await waitFor(
      () => {
        expect(useFilterStore.getState().filters.keywords).toBe("test keywords");
      },
      { timeout: DEBOUNCE_DELAY_MS + 100 }
    );

    // Click clear filters
    const clearButton = screen.getByTestId("clear-filters-button");
    await userEvent.click(clearButton);

    // Input should be visually cleared
    expect(keywordsInput).toHaveValue("");
  });
});

describe("FilterPanel Debounce Behavior", () => {
  const mockOnSearch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    const store = useFilterStore.getState();
    store.clearFilters();
    store.setExpanded(true);
  });

  it("updates store after debounce delay for location input", async () => {
    render(<FilterPanel onSearch={mockOnSearch} isLoading={false} />, { wrapper: createWrapper() });

    const locationInput = screen.getByTestId("location-input");

    // Type in the input
    fireEvent.change(locationInput, { target: { value: "São Paulo" } });

    // Store should NOT be updated immediately
    expect(useFilterStore.getState().filters.locations).toEqual([]);

    // Wait for debounce to complete
    await waitFor(
      () => {
        expect(useFilterStore.getState().filters.locations).toEqual([
          "São Paulo",
        ]);
      },
      { timeout: DEBOUNCE_DELAY_MS + 200 }
    );
  });

  it("updates store after debounce delay for title input", async () => {
    render(<FilterPanel onSearch={mockOnSearch} isLoading={false} />, { wrapper: createWrapper() });

    const titleInput = screen.getByTestId("title-input");

    // Type in the input
    fireEvent.change(titleInput, { target: { value: "CEO, CTO" } });

    // Store should NOT be updated immediately
    expect(useFilterStore.getState().filters.titles).toEqual([]);

    // Wait for debounce to complete
    await waitFor(
      () => {
        expect(useFilterStore.getState().filters.titles).toEqual([
          "CEO",
          "CTO",
        ]);
      },
      { timeout: DEBOUNCE_DELAY_MS + 200 }
    );
  });

  it("updates store after debounce delay for keywords input", async () => {
    render(<FilterPanel onSearch={mockOnSearch} isLoading={false} />, { wrapper: createWrapper() });

    const keywordsInput = screen.getByTestId("keywords-input");

    // Type in the input
    fireEvent.change(keywordsInput, { target: { value: "software" } });

    // Store should NOT be updated immediately
    expect(useFilterStore.getState().filters.keywords).toBe("");

    // Wait for debounce to complete
    await waitFor(
      () => {
        expect(useFilterStore.getState().filters.keywords).toBe("software");
      },
      { timeout: DEBOUNCE_DELAY_MS + 200 }
    );
  });

  it("splits comma-separated values for location", async () => {
    render(<FilterPanel onSearch={mockOnSearch} isLoading={false} />, { wrapper: createWrapper() });

    const locationInput = screen.getByTestId("location-input");

    fireEvent.change(locationInput, {
      target: { value: "São Paulo, Rio de Janeiro" },
    });

    await waitFor(
      () => {
        expect(useFilterStore.getState().filters.locations).toEqual([
          "São Paulo",
          "Rio de Janeiro",
        ]);
      },
      { timeout: DEBOUNCE_DELAY_MS + 200 }
    );
  });

  it(`exports DEBOUNCE_DELAY_MS constant as ${DEBOUNCE_DELAY_MS}ms`, () => {
    expect(DEBOUNCE_DELAY_MS).toBe(300);
  });
});

describe("FilterPanel Accessibility", () => {
  const mockOnSearch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    const store = useFilterStore.getState();
    store.clearFilters();
    store.setExpanded(true);
  });

  it("has aria-expanded on industry multi-select trigger", () => {
    render(<FilterPanel onSearch={mockOnSearch} isLoading={false} />, { wrapper: createWrapper() });

    const industrySelect = screen.getByTestId("industry-select");
    expect(industrySelect).toHaveAttribute("aria-expanded", "false");
  });

  it("has aria-haspopup on industry multi-select trigger", () => {
    render(<FilterPanel onSearch={mockOnSearch} isLoading={false} />, { wrapper: createWrapper() });

    const industrySelect = screen.getByTestId("industry-select");
    expect(industrySelect).toHaveAttribute("aria-haspopup", "listbox");
  });
});

// ==============================================
// STORY 3.5.1: EMAIL STATUS FILTER TESTS
// ==============================================

describe("FilterPanel Email Status Filter (Story 3.5.1)", () => {
  const mockOnSearch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    const store = useFilterStore.getState();
    store.clearFilters();
    store.setExpanded(true);
  });

  it("displays Status do Email filter when panel is expanded", () => {
    render(<FilterPanel onSearch={mockOnSearch} isLoading={false} />, { wrapper: createWrapper() });

    expect(screen.getByText("Status do Email")).toBeInTheDocument();
  });

  it("renders email status multi-select with correct test id", () => {
    render(<FilterPanel onSearch={mockOnSearch} isLoading={false} />, { wrapper: createWrapper() });

    expect(screen.getByTestId("email-status-select")).toBeInTheDocument();
  });

  it("has aria-haspopup on email status multi-select", () => {
    render(<FilterPanel onSearch={mockOnSearch} isLoading={false} />, { wrapper: createWrapper() });

    const emailStatusSelect = screen.getByTestId("email-status-select");
    expect(emailStatusSelect).toHaveAttribute("aria-haspopup", "listbox");
  });

  it("opens dropdown and shows all email status options", async () => {
    render(<FilterPanel onSearch={mockOnSearch} isLoading={false} />, { wrapper: createWrapper() });

    const emailStatusSelect = screen.getByTestId("email-status-select");
    await userEvent.click(emailStatusSelect);

    // Check for all Portuguese labels
    expect(screen.getByText("Verificado")).toBeInTheDocument();
    expect(screen.getByText("Não Verificado")).toBeInTheDocument();
    expect(screen.getByText("Provável Engajamento")).toBeInTheDocument();
    expect(screen.getByText("Indisponível")).toBeInTheDocument();
  });

  it("updates store when email status is selected", async () => {
    render(<FilterPanel onSearch={mockOnSearch} isLoading={false} />, { wrapper: createWrapper() });

    const emailStatusSelect = screen.getByTestId("email-status-select");
    await userEvent.click(emailStatusSelect);

    // Select "Verificado"
    const verifiedOption = screen.getByText("Verificado");
    await userEvent.click(verifiedOption);

    expect(useFilterStore.getState().filters.contactEmailStatuses).toContain("verified");
  });

  it("allows multiple email status selections", async () => {
    render(<FilterPanel onSearch={mockOnSearch} isLoading={false} />, { wrapper: createWrapper() });

    const emailStatusSelect = screen.getByTestId("email-status-select");
    await userEvent.click(emailStatusSelect);

    // Select multiple options
    await userEvent.click(screen.getByText("Verificado"));
    await userEvent.click(screen.getByText("Provável Engajamento"));

    const statuses = useFilterStore.getState().filters.contactEmailStatuses;
    expect(statuses).toContain("verified");
    expect(statuses).toContain("likely to engage");
  });

  it("shows selected count in trigger button", async () => {
    useFilterStore.getState().setContactEmailStatuses(["verified", "unverified"]);

    render(<FilterPanel onSearch={mockOnSearch} isLoading={false} />, { wrapper: createWrapper() });

    expect(screen.getByText("2 selecionados")).toBeInTheDocument();
  });

  it("clears email status filter when clearFilters is clicked", async () => {
    useFilterStore.getState().setContactEmailStatuses(["verified"]);

    render(<FilterPanel onSearch={mockOnSearch} isLoading={false} />, { wrapper: createWrapper() });

    const clearButton = screen.getByTestId("clear-filters-button");
    await userEvent.click(clearButton);

    expect(useFilterStore.getState().filters.contactEmailStatuses).toEqual([]);
  });

  it("includes email status in active filter count", () => {
    useFilterStore.getState().setContactEmailStatuses(["verified"]);

    render(<FilterPanel onSearch={mockOnSearch} isLoading={false} />, { wrapper: createWrapper() });

    // Badge should show "1" for the email status filter
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("deselects email status when clicked again", async () => {
    render(<FilterPanel onSearch={mockOnSearch} isLoading={false} />, { wrapper: createWrapper() });

    const emailStatusSelect = screen.getByTestId("email-status-select");
    await userEvent.click(emailStatusSelect);

    // Select "Verificado"
    await userEvent.click(screen.getByText("Verificado"));
    expect(useFilterStore.getState().filters.contactEmailStatuses).toContain("verified");

    // Deselect "Verificado"
    await userEvent.click(screen.getByText("Verificado"));
    expect(useFilterStore.getState().filters.contactEmailStatuses).not.toContain("verified");
  });
});
