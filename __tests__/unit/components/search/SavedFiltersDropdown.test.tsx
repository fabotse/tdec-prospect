/**
 * SavedFiltersDropdown Component Tests
 * Story 3.7: Saved Filters / Favorites
 *
 * AC: #2 - List saved filters in dropdown
 * AC: #3 - Apply saved filter to FilterPanel
 * AC: #4 - Delete saved filter
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { SavedFiltersDropdown } from "@/components/search/SavedFiltersDropdown";
import { useFilterStore } from "@/stores/use-filter-store";

// Mock sonner toast
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

import { toast } from "sonner";

// Test data
const mockSavedFilters = [
  {
    id: "filter-1",
    tenantId: "tenant-1",
    userId: "user-1",
    name: "Tech Leads SP",
    filtersJson: {
      industries: ["technology"],
      companySizes: ["51-200"],
      locations: ["São Paulo"],
      titles: ["CEO"],
      keywords: "startup",
      contactEmailStatuses: ["verified"],
    },
    createdAt: "2026-01-30T10:00:00Z",
  },
  {
    id: "filter-2",
    tenantId: "tenant-1",
    userId: "user-1",
    name: "Finance Directors",
    filtersJson: {
      industries: ["finance"],
      companySizes: ["201-500"],
      locations: ["Rio de Janeiro"],
      titles: ["Director"],
      keywords: "",
      contactEmailStatuses: [],
    },
    createdAt: "2026-01-29T10:00:00Z",
  },
];

// Create wrapper with QueryClientProvider
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

describe("SavedFiltersDropdown", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useFilterStore.getState().clearFilters();
    useFilterStore.getState().setExpanded(false);
  });

  describe("Rendering", () => {
    it("renders trigger button with Filtros Salvos text", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [] }),
      });

      render(<SavedFiltersDropdown />, { wrapper: createWrapper() });

      expect(screen.getByTestId("saved-filters-trigger")).toBeInTheDocument();
      expect(screen.getByText("Filtros Salvos")).toBeInTheDocument();
    });

    it("shows count badge when filters exist", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: mockSavedFilters }),
      });

      render(<SavedFiltersDropdown />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText("2")).toBeInTheDocument();
      });
    });

    it("does not show count badge when no filters", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [] }),
      });

      render(<SavedFiltersDropdown />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.queryByText("0")).not.toBeInTheDocument();
      });
    });
  });

  describe("Dropdown Content", () => {
    it("shows loading state while fetching", async () => {
      mockFetch.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  ok: true,
                  json: async () => ({ data: mockSavedFilters }),
                }),
              100
            )
          )
      );

      render(<SavedFiltersDropdown />, { wrapper: createWrapper() });

      await userEvent.click(screen.getByTestId("saved-filters-trigger"));

      expect(screen.getByTestId("saved-filters-loading")).toBeInTheDocument();
    });

    it("shows empty state when no saved filters (AC: #2)", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [] }),
      });

      render(<SavedFiltersDropdown />, { wrapper: createWrapper() });

      // Wait for query to complete loading
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });

      // Open dropdown after data is loaded
      await userEvent.click(screen.getByTestId("saved-filters-trigger"));

      // Verify empty state is shown
      await waitFor(() => {
        expect(screen.getByTestId("saved-filters-empty")).toBeInTheDocument();
      });
      // Text is broken by <br/>, so just verify the testid element exists
      expect(screen.getByTestId("saved-filters-empty").textContent).toContain(
        "Nenhum filtro salvo ainda."
      );
    });

    it("lists saved filters with names (AC: #2)", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: mockSavedFilters }),
      });

      render(<SavedFiltersDropdown />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });

      await userEvent.click(screen.getByTestId("saved-filters-trigger"));

      await waitFor(() => {
        expect(screen.getByText("Tech Leads SP")).toBeInTheDocument();
        expect(screen.getByText("Finance Directors")).toBeInTheDocument();
      });
    });

    it("shows delete button for each filter (AC: #4)", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: mockSavedFilters }),
      });

      render(<SavedFiltersDropdown />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });

      await userEvent.click(screen.getByTestId("saved-filters-trigger"));

      await waitFor(() => {
        expect(screen.getByTestId("delete-filter-filter-1")).toBeInTheDocument();
        expect(screen.getByTestId("delete-filter-filter-2")).toBeInTheDocument();
      });
    });
  });

  describe("Apply Filter (AC: #3)", () => {
    it("applies filter when clicked", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: mockSavedFilters }),
      });

      render(<SavedFiltersDropdown />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });

      await userEvent.click(screen.getByTestId("saved-filters-trigger"));

      await waitFor(() => {
        expect(screen.getByText("Tech Leads SP")).toBeInTheDocument();
      });

      await userEvent.click(screen.getByTestId("saved-filter-item-filter-1"));

      const state = useFilterStore.getState();
      expect(state.filters.industries).toEqual(["technology"]);
      expect(state.filters.companySizes).toEqual(["51-200"]);
      expect(state.filters.locations).toEqual(["São Paulo"]);
      expect(state.filters.titles).toEqual(["CEO"]);
      expect(state.filters.keywords).toBe("startup");
      expect(state.filters.contactEmailStatuses).toEqual(["verified"]);
    });

    it("expands filter panel when filter applied (AC: #3)", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: mockSavedFilters }),
      });

      render(<SavedFiltersDropdown />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });

      expect(useFilterStore.getState().isExpanded).toBe(false);

      await userEvent.click(screen.getByTestId("saved-filters-trigger"));

      await waitFor(() => {
        expect(screen.getByText("Tech Leads SP")).toBeInTheDocument();
      });

      await userEvent.click(screen.getByTestId("saved-filter-item-filter-1"));

      expect(useFilterStore.getState().isExpanded).toBe(true);
    });

    it("shows success toast when filter applied", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: mockSavedFilters }),
      });

      render(<SavedFiltersDropdown />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });

      await userEvent.click(screen.getByTestId("saved-filters-trigger"));

      await waitFor(() => {
        expect(screen.getByText("Tech Leads SP")).toBeInTheDocument();
      });

      await userEvent.click(screen.getByTestId("saved-filter-item-filter-1"));

      expect(toast.success).toHaveBeenCalledWith(
        expect.stringContaining("Tech Leads SP")
      );
    });
  });

  describe("Delete Filter (AC: #4)", () => {
    it("calls delete API when delete button clicked", async () => {
      // First call for initial fetch
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: mockSavedFilters }),
      });
      // Second call for delete
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      render(<SavedFiltersDropdown />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });

      await userEvent.click(screen.getByTestId("saved-filters-trigger"));

      await waitFor(() => {
        expect(screen.getByTestId("delete-filter-filter-1")).toBeInTheDocument();
      });

      await userEvent.click(screen.getByTestId("delete-filter-filter-1"));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith("/api/filters/saved/filter-1", {
          method: "DELETE",
        });
      });
    });

    it("shows success toast with undo action when filter deleted (AC: #4)", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: mockSavedFilters }),
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      render(<SavedFiltersDropdown />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });

      await userEvent.click(screen.getByTestId("saved-filters-trigger"));

      await waitFor(() => {
        expect(screen.getByTestId("delete-filter-filter-1")).toBeInTheDocument();
      });

      await userEvent.click(screen.getByTestId("delete-filter-filter-1"));

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith("Filtro removido", {
          action: expect.objectContaining({
            label: "Desfazer",
            onClick: expect.any(Function),
          }),
        });
      });
    });

    it("shows error toast when delete fails", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: mockSavedFilters }),
      });
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          error: { message: "Erro ao remover filtro" },
        }),
      });

      render(<SavedFiltersDropdown />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });

      await userEvent.click(screen.getByTestId("saved-filters-trigger"));

      await waitFor(() => {
        expect(screen.getByTestId("delete-filter-filter-1")).toBeInTheDocument();
      });

      await userEvent.click(screen.getByTestId("delete-filter-filter-1"));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith("Erro ao remover filtro");
      });
    });
  });
});
