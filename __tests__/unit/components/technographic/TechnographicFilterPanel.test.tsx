/**
 * TechnographicFilterPanel Component Tests
 * Story: 15.2 - Busca Technografica: Autocomplete e Filtros
 *
 * AC: #2 - Complementary filters: country, size, industry
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  TechnographicFilterPanel,
  type TechnographicFilters,
} from "@/components/technographic/TechnographicFilterPanel";

const emptyFilters: TechnographicFilters = {
  countryCodes: [],
  minEmployeeCount: undefined,
  maxEmployeeCount: undefined,
  industryIds: [],
};

describe("TechnographicFilterPanel", () => {
  const mockOnFiltersChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders collapsed by default", () => {
    render(
      <TechnographicFilterPanel
        filters={emptyFilters}
        onFiltersChange={mockOnFiltersChange}
      />
    );

    expect(screen.getByTestId("filter-panel")).toBeInTheDocument();
    expect(screen.getByTestId("filter-panel-toggle")).toBeInTheDocument();
    expect(screen.queryByTestId("min-employees-input")).not.toBeInTheDocument();
  });

  it("expands on toggle click", () => {
    render(
      <TechnographicFilterPanel
        filters={emptyFilters}
        onFiltersChange={mockOnFiltersChange}
      />
    );

    fireEvent.click(screen.getByTestId("filter-panel-toggle"));

    expect(screen.getByTestId("min-employees-input")).toBeInTheDocument();
    expect(screen.getByTestId("max-employees-input")).toBeInTheDocument();
    expect(screen.getByTestId("country-select")).toBeInTheDocument();
    expect(screen.getByTestId("industry-select")).toBeInTheDocument();
  });

  it("shows active filter count badge", () => {
    render(
      <TechnographicFilterPanel
        filters={{
          ...emptyFilters,
          countryCodes: ["BR", "US"],
          minEmployeeCount: 50,
        }}
        onFiltersChange={mockOnFiltersChange}
      />
    );

    // 3 active filters: BR, US, minEmployeeCount
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("updates minEmployeeCount on input", () => {
    render(
      <TechnographicFilterPanel
        filters={emptyFilters}
        onFiltersChange={mockOnFiltersChange}
      />
    );

    fireEvent.click(screen.getByTestId("filter-panel-toggle"));

    const minInput = screen.getByTestId("min-employees-input");
    fireEvent.change(minInput, { target: { value: "100" } });

    expect(mockOnFiltersChange).toHaveBeenCalledWith({
      ...emptyFilters,
      minEmployeeCount: 100,
    });
  });

  it("updates maxEmployeeCount on input", () => {
    render(
      <TechnographicFilterPanel
        filters={emptyFilters}
        onFiltersChange={mockOnFiltersChange}
      />
    );

    fireEvent.click(screen.getByTestId("filter-panel-toggle"));

    const maxInput = screen.getByTestId("max-employees-input");
    fireEvent.change(maxInput, { target: { value: "5000" } });

    expect(mockOnFiltersChange).toHaveBeenCalledWith({
      ...emptyFilters,
      maxEmployeeCount: 5000,
    });
  });

  it("clears filters on clear button click", () => {
    render(
      <TechnographicFilterPanel
        filters={{
          countryCodes: ["BR"],
          minEmployeeCount: 50,
          maxEmployeeCount: 500,
          industryIds: [1],
        }}
        onFiltersChange={mockOnFiltersChange}
      />
    );

    fireEvent.click(screen.getByTestId("filter-panel-toggle"));
    fireEvent.click(screen.getByTestId("clear-filters-button"));

    expect(mockOnFiltersChange).toHaveBeenCalledWith(emptyFilters);
  });

  it("shows country chips when countries selected", () => {
    render(
      <TechnographicFilterPanel
        filters={{ ...emptyFilters, countryCodes: ["BR"] }}
        onFiltersChange={mockOnFiltersChange}
      />
    );

    fireEvent.click(screen.getByTestId("filter-panel-toggle"));

    expect(screen.getByText("Brasil")).toBeInTheDocument();
  });

  it("removes country chip on click", () => {
    render(
      <TechnographicFilterPanel
        filters={{ ...emptyFilters, countryCodes: ["BR"] }}
        onFiltersChange={mockOnFiltersChange}
      />
    );

    fireEvent.click(screen.getByTestId("filter-panel-toggle"));
    fireEvent.click(screen.getByLabelText("Remover Brasil"));

    expect(mockOnFiltersChange).toHaveBeenCalledWith({
      ...emptyFilters,
      countryCodes: [],
    });
  });
});
