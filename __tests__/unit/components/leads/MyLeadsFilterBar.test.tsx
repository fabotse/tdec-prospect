/**
 * Tests for MyLeadsFilterBar Component
 * Story 4.2.2: My Leads Page
 *
 * AC: #3 - Filter by status, segment, search
 */

import { useState } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MyLeadsFilterBar } from "@/components/leads/MyLeadsFilterBar";
import type { MyLeadsFilters } from "@/hooks/use-my-leads";

// Mock useSegments hook
vi.mock("@/hooks/use-segments", () => ({
  useSegments: vi.fn(() => ({
    data: [
      { id: "seg-1", name: "Hot Leads", leadCount: 10 },
      { id: "seg-2", name: "Cold Leads", leadCount: 5 },
    ],
    isLoading: false,
  })),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

/**
 * Controlled wrapper for testing search input
 * The search input is fully controlled, so we need to actually update the filters
 * when onFiltersChange is called for typing to accumulate correctly
 */
function ControlledFilterBar({
  onFiltersChangeSpy,
  initialFilters = {},
}: {
  onFiltersChangeSpy: ReturnType<typeof vi.fn>;
  initialFilters?: MyLeadsFilters;
}) {
  const [filters, setFilters] = useState<MyLeadsFilters>(initialFilters);

  const handleFiltersChange = (newFilters: Partial<MyLeadsFilters>) => {
    setFilters((prev) => ({ ...prev, ...newFilters }));
    onFiltersChangeSpy(newFilters);
  };

  return (
    <MyLeadsFilterBar
      filters={filters}
      onFiltersChange={handleFiltersChange}
      onClearFilters={() => setFilters({})}
    />
  );
}

describe("MyLeadsFilterBar", () => {
  const mockOnFiltersChange = vi.fn();
  const mockOnClearFilters = vi.fn();

  const defaultProps = {
    filters: {},
    onFiltersChange: mockOnFiltersChange,
    onClearFilters: mockOnClearFilters,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should render search input", () => {
    render(<MyLeadsFilterBar {...defaultProps} />, {
      wrapper: createWrapper(),
    });

    expect(
      screen.getByPlaceholderText(/Buscar por nome ou empresa/i)
    ).toBeInTheDocument();
  });

  it("should render status filter button", () => {
    render(<MyLeadsFilterBar {...defaultProps} />, {
      wrapper: createWrapper(),
    });

    expect(screen.getByTestId("status-filter-trigger")).toBeInTheDocument();
  });

  it("should render segment filter dropdown", () => {
    render(<MyLeadsFilterBar {...defaultProps} />, {
      wrapper: createWrapper(),
    });

    expect(screen.getByTestId("segment-filter-trigger")).toBeInTheDocument();
  });

  it("should call onFiltersChange when search input changes", async () => {
    const user = userEvent.setup();
    const onFiltersChangeSpy = vi.fn();

    // Use controlled wrapper so typing accumulates correctly
    render(<ControlledFilterBar onFiltersChangeSpy={onFiltersChangeSpy} />, {
      wrapper: createWrapper(),
    });

    const searchInput = screen.getByPlaceholderText(
      /Buscar por nome ou empresa/i
    );
    await user.type(searchInput, "john");

    await waitFor(() => {
      // Check that onFiltersChange was called with the final accumulated value
      expect(onFiltersChangeSpy).toHaveBeenLastCalledWith({ search: "john" });
    });
  });

  it("should show clear filters button when filters are active", () => {
    render(
      <MyLeadsFilterBar
        {...defaultProps}
        filters={{ statuses: ["novo"], search: "test" }}
      />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByTestId("clear-filters-button")).toBeInTheDocument();
  });

  it("should not show clear filters button when no filters active", () => {
    render(<MyLeadsFilterBar {...defaultProps} />, {
      wrapper: createWrapper(),
    });

    expect(
      screen.queryByTestId("clear-filters-button")
    ).not.toBeInTheDocument();
  });

  it("should call onClearFilters when clear button is clicked", async () => {
    const user = userEvent.setup();
    render(
      <MyLeadsFilterBar
        {...defaultProps}
        filters={{ statuses: ["novo"] }}
      />,
      { wrapper: createWrapper() }
    );

    const clearButton = screen.getByTestId("clear-filters-button");
    await user.click(clearButton);

    expect(mockOnClearFilters).toHaveBeenCalled();
  });

  it("should show badge with count when statuses are selected", () => {
    render(
      <MyLeadsFilterBar
        {...defaultProps}
        filters={{ statuses: ["novo", "interessado"] }}
      />,
      { wrapper: createWrapper() }
    );

    // Badge should show "2" for 2 selected statuses
    expect(screen.getByText("2")).toBeInTheDocument();
  });
});
