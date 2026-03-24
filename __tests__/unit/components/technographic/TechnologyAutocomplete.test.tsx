/**
 * TechnologyAutocomplete Component Tests
 * Story: 15.2 - Busca Technografica: Autocomplete e Filtros
 *
 * AC: #1 - Autocomplete with debounce, suggestions, multi-select, keyboard nav
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { TechnologyAutocomplete } from "@/components/technographic/TechnologyAutocomplete";

// Mock useTechnologySearch
const mockData = [
  { name: "React", slug: "react", category: "Frontend", company_count: 150000 },
  { name: "React Native", slug: "react-native", category: "Mobile", company_count: 30000 },
];

vi.mock("@/hooks/use-technology-search", () => ({
  useTechnologySearch: vi.fn(() => ({
    data: mockData,
    isLoading: false,
  })),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe("TechnologyAutocomplete", () => {
  const mockOnSelect = vi.fn();
  const mockOnRemove = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders search input", () => {
    render(
      <TechnologyAutocomplete
        selectedTechnologies={[]}
        onSelect={mockOnSelect}
        onRemove={mockOnRemove}
      />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByTestId("technology-search-input")).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Buscar tecnologia/)).toBeInTheDocument();
  });

  it("shows suggestions dropdown when typing >= 2 chars", async () => {
    render(
      <TechnologyAutocomplete
        selectedTechnologies={[]}
        onSelect={mockOnSelect}
        onRemove={mockOnRemove}
      />,
      { wrapper: createWrapper() }
    );

    const input = screen.getByTestId("technology-search-input");
    fireEvent.change(input, { target: { value: "re" } });
    fireEvent.focus(input);

    await waitFor(() => {
      expect(screen.getByTestId("technology-suggestions")).toBeInTheDocument();
    });

    expect(screen.getByText("React")).toBeInTheDocument();
    expect(screen.getByText("React Native")).toBeInTheDocument();
  });

  it("displays category and company count in suggestions", async () => {
    render(
      <TechnologyAutocomplete
        selectedTechnologies={[]}
        onSelect={mockOnSelect}
        onRemove={mockOnRemove}
      />,
      { wrapper: createWrapper() }
    );

    const input = screen.getByTestId("technology-search-input");
    fireEvent.change(input, { target: { value: "react" } });
    fireEvent.focus(input);

    await waitFor(() => {
      expect(screen.getByText("Frontend")).toBeInTheDocument();
    });

    expect(screen.getByText("150.000 empresas")).toBeInTheDocument();
  });

  it("calls onSelect when clicking a suggestion", async () => {
    render(
      <TechnologyAutocomplete
        selectedTechnologies={[]}
        onSelect={mockOnSelect}
        onRemove={mockOnRemove}
      />,
      { wrapper: createWrapper() }
    );

    const input = screen.getByTestId("technology-search-input");
    fireEvent.change(input, { target: { value: "react" } });
    fireEvent.focus(input);

    await waitFor(() => {
      expect(screen.getByText("React")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("React"));

    expect(mockOnSelect).toHaveBeenCalledWith({
      name: "React",
      slug: "react",
      category: "Frontend",
    });
  });

  it("renders selected technologies as chips", () => {
    render(
      <TechnologyAutocomplete
        selectedTechnologies={[
          { name: "React", slug: "react", category: "Frontend" },
          { name: "Vue.js", slug: "vuejs", category: "Frontend" },
        ]}
        onSelect={mockOnSelect}
        onRemove={mockOnRemove}
      />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByTestId("selected-technologies")).toBeInTheDocument();
    expect(screen.getByText("React")).toBeInTheDocument();
    expect(screen.getByText("Vue.js")).toBeInTheDocument();
  });

  it("calls onRemove when clicking chip remove button", () => {
    render(
      <TechnologyAutocomplete
        selectedTechnologies={[
          { name: "React", slug: "react", category: "Frontend" },
        ]}
        onSelect={mockOnSelect}
        onRemove={mockOnRemove}
      />,
      { wrapper: createWrapper() }
    );

    fireEvent.click(screen.getByLabelText("Remover React"));

    expect(mockOnRemove).toHaveBeenCalledWith("react");
  });

  it("filters out already selected technologies from suggestions", async () => {
    render(
      <TechnologyAutocomplete
        selectedTechnologies={[
          { name: "React", slug: "react", category: "Frontend" },
        ]}
        onSelect={mockOnSelect}
        onRemove={mockOnRemove}
      />,
      { wrapper: createWrapper() }
    );

    const input = screen.getByTestId("technology-search-input");
    fireEvent.change(input, { target: { value: "react" } });
    fireEvent.focus(input);

    await waitFor(() => {
      expect(screen.getByTestId("technology-suggestions")).toBeInTheDocument();
    });

    // Only React Native should be visible (React already selected)
    const suggestions = screen.getByTestId("technology-suggestions");
    expect(suggestions).toHaveTextContent("React Native");
    // React should not appear as a standalone suggestion option
    const buttons = suggestions.querySelectorAll("button");
    expect(buttons).toHaveLength(1);
  });

  it("supports keyboard navigation (ArrowDown/ArrowUp/Enter/Escape)", async () => {
    render(
      <TechnologyAutocomplete
        selectedTechnologies={[]}
        onSelect={mockOnSelect}
        onRemove={mockOnRemove}
      />,
      { wrapper: createWrapper() }
    );

    const input = screen.getByTestId("technology-search-input");
    fireEvent.change(input, { target: { value: "react" } });
    fireEvent.focus(input);

    await waitFor(() => {
      expect(screen.getByTestId("technology-suggestions")).toBeInTheDocument();
    });

    // ArrowDown to highlight first
    fireEvent.keyDown(input, { key: "ArrowDown" });
    // ArrowDown to highlight second
    fireEvent.keyDown(input, { key: "ArrowDown" });
    // ArrowUp back to first
    fireEvent.keyDown(input, { key: "ArrowUp" });
    // Enter to select
    fireEvent.keyDown(input, { key: "Enter" });

    expect(mockOnSelect).toHaveBeenCalledWith({
      name: "React",
      slug: "react",
      category: "Frontend",
    });
  });

  it("closes dropdown on Escape", async () => {
    render(
      <TechnologyAutocomplete
        selectedTechnologies={[]}
        onSelect={mockOnSelect}
        onRemove={mockOnRemove}
      />,
      { wrapper: createWrapper() }
    );

    const input = screen.getByTestId("technology-search-input");
    fireEvent.change(input, { target: { value: "react" } });
    fireEvent.focus(input);

    await waitFor(() => {
      expect(screen.getByTestId("technology-suggestions")).toBeInTheDocument();
    });

    fireEvent.keyDown(input, { key: "Escape" });

    expect(screen.queryByTestId("technology-suggestions")).not.toBeInTheDocument();
  });
});
