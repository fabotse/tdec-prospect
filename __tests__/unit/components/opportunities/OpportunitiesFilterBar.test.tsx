/**
 * Tests for OpportunitiesFilterBar Component
 * Story 21.4: Central de Oportunidades — AC #4
 *
 * Espelha o approach do MyLeadsFilterBar.test.tsx (controlled wrapper p/ busca).
 */

import { useState } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  OpportunitiesFilterBar,
  DEFAULT_OPPORTUNITIES_FILTERS,
  type OpportunitiesFilterState,
} from "@/components/opportunities/OpportunitiesFilterBar";

// Mock useCampaigns (Select de campanha)
vi.mock("@/hooks/use-campaigns", () => ({
  useCampaigns: vi.fn(() => ({
    data: [
      { id: "camp-1", name: "Campanha Q3" },
      { id: "camp-2", name: "Campanha Q4" },
    ],
    isLoading: false,
  })),
}));

function ControlledFilterBar({
  onFiltersChangeSpy,
  initialFilters = DEFAULT_OPPORTUNITIES_FILTERS,
}: {
  onFiltersChangeSpy: (filters: Partial<OpportunitiesFilterState>) => void;
  initialFilters?: OpportunitiesFilterState;
}) {
  const [filters, setFilters] = useState<OpportunitiesFilterState>(initialFilters);

  const handleFiltersChange = (partial: Partial<OpportunitiesFilterState>) => {
    setFilters((prev) => ({ ...prev, ...partial }));
    onFiltersChangeSpy(partial);
  };

  return (
    <OpportunitiesFilterBar
      filters={filters}
      onFiltersChange={handleFiltersChange}
      onClearFilters={() => setFilters(DEFAULT_OPPORTUNITIES_FILTERS)}
    />
  );
}

describe("OpportunitiesFilterBar", () => {
  const mockOnFiltersChange = vi.fn();
  const mockOnClearFilters = vi.fn();

  const defaultProps = {
    filters: DEFAULT_OPPORTUNITIES_FILTERS,
    onFiltersChange: mockOnFiltersChange,
    onClearFilters: mockOnClearFilters,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should render search, intent, status, campaign and period triggers", () => {
    render(<OpportunitiesFilterBar {...defaultProps} />);

    expect(
      screen.getByPlaceholderText(/Buscar por nome, e-mail ou empresa/i)
    ).toBeInTheDocument();
    expect(screen.getByTestId("intent-filter-trigger")).toBeInTheDocument();
    expect(screen.getByTestId("status-filter-trigger")).toBeInTheDocument();
    expect(screen.getByTestId("campaign-filter-trigger")).toBeInTheDocument();
    expect(screen.getByTestId("period-filter-trigger")).toBeInTheDocument();
  });

  it("should call onFiltersChange when search input changes", async () => {
    const user = userEvent.setup();
    const onFiltersChangeSpy = vi.fn();

    render(<ControlledFilterBar onFiltersChangeSpy={onFiltersChangeSpy} />);

    const searchInput = screen.getByPlaceholderText(
      /Buscar por nome, e-mail ou empresa/i
    );
    await user.type(searchInput, "john");

    await waitFor(() => {
      expect(onFiltersChangeSpy).toHaveBeenLastCalledWith({ search: "john" });
    });
  });

  it("should clear search via the clear button", async () => {
    const user = userEvent.setup();
    const onFiltersChangeSpy = vi.fn();

    render(
      <ControlledFilterBar
        onFiltersChangeSpy={onFiltersChangeSpy}
        initialFilters={{ ...DEFAULT_OPPORTUNITIES_FILTERS, search: "john" }}
      />
    );

    await user.click(screen.getByRole("button", { name: /limpar busca/i }));

    await waitFor(() => {
      expect(onFiltersChangeSpy).toHaveBeenLastCalledWith({ search: "" });
    });
  });

  it("should toggle intent via multi-select dropdown", async () => {
    const user = userEvent.setup();
    const onFiltersChangeSpy = vi.fn();

    render(<ControlledFilterBar onFiltersChangeSpy={onFiltersChangeSpy} />);

    await user.click(screen.getByTestId("intent-filter-trigger"));
    await user.click(await screen.findByTestId("intent-option-interessado"));

    await waitFor(() => {
      expect(onFiltersChangeSpy).toHaveBeenCalledWith({ intents: ["interessado"] });
    });
  });

  it("should toggle status via multi-select dropdown", async () => {
    const user = userEvent.setup();
    const onFiltersChangeSpy = vi.fn();

    render(<ControlledFilterBar onFiltersChangeSpy={onFiltersChangeSpy} />);

    await user.click(screen.getByTestId("status-filter-trigger"));
    await user.click(await screen.findByTestId("status-option-new"));

    await waitFor(() => {
      expect(onFiltersChangeSpy).toHaveBeenCalledWith({ statuses: ["new"] });
    });
  });

  it("should uncheck an already-selected intent", async () => {
    const user = userEvent.setup();
    const onFiltersChangeSpy = vi.fn();

    render(
      <ControlledFilterBar
        onFiltersChangeSpy={onFiltersChangeSpy}
        initialFilters={{
          ...DEFAULT_OPPORTUNITIES_FILTERS,
          intents: ["interessado", "objecao"],
        }}
      />
    );

    await user.click(screen.getByTestId("intent-filter-trigger"));
    await user.click(await screen.findByTestId("intent-option-interessado"));

    await waitFor(() => {
      expect(onFiltersChangeSpy).toHaveBeenCalledWith({ intents: ["objecao"] });
    });
  });

  it("should show count badges on triggers when filters selected", () => {
    render(
      <OpportunitiesFilterBar
        {...defaultProps}
        filters={{
          ...DEFAULT_OPPORTUNITIES_FILTERS,
          intents: ["interessado", "objecao"],
          statuses: ["new"],
        }}
      />
    );

    expect(screen.getByTestId("intent-filter-trigger")).toHaveTextContent("2");
    expect(screen.getByTestId("status-filter-trigger")).toHaveTextContent("1");
  });

  it("should not show clear filters button when no filters active", () => {
    render(<OpportunitiesFilterBar {...defaultProps} />);

    expect(screen.queryByTestId("clear-filters-button")).not.toBeInTheDocument();
  });

  const activeFilterCases: [string, Partial<OpportunitiesFilterState>][] = [
    ["intents", { intents: ["interessado"] }],
    ["statuses", { statuses: ["new"] }],
    ["campaignId", { campaignId: "camp-1" }],
    ["period", { period: "7d" }],
    ["search", { search: "acme" }],
  ];

  it.each(activeFilterCases)(
    "should show clear filters button when %s filter is active",
    (_label, partial) => {
      render(
        <OpportunitiesFilterBar
          {...defaultProps}
          filters={{ ...DEFAULT_OPPORTUNITIES_FILTERS, ...partial }}
        />
      );

      expect(screen.getByTestId("clear-filters-button")).toBeInTheDocument();
    }
  );

  it("should call onClearFilters when clear button clicked", async () => {
    const user = userEvent.setup();
    render(
      <OpportunitiesFilterBar
        {...defaultProps}
        filters={{ ...DEFAULT_OPPORTUNITIES_FILTERS, intents: ["interessado"] }}
      />
    );

    await user.click(screen.getByTestId("clear-filters-button"));

    expect(mockOnClearFilters).toHaveBeenCalled();
  });
});
