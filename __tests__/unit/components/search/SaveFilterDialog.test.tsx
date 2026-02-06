/**
 * SaveFilterDialog Component Tests
 * Story 3.7: Saved Filters / Favorites
 *
 * AC: #1 - Dialog to name and save filter configuration
 * AC: #5 - Validation for required filter name
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { SaveFilterDialog } from "@/components/search/SaveFilterDialog";
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

describe("SaveFilterDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useFilterStore.getState().clearFilters();
  });

  describe("Rendering", () => {
    it("renders trigger button with Salvar Filtro text", () => {
      render(<SaveFilterDialog />, { wrapper: createWrapper() });

      expect(screen.getByTestId("save-filter-trigger")).toBeInTheDocument();
      expect(screen.getByText("Salvar Filtro")).toBeInTheDocument();
    });

    it("opens dialog when trigger clicked", async () => {
      render(<SaveFilterDialog />, { wrapper: createWrapper() });

      await userEvent.click(screen.getByTestId("save-filter-trigger"));

      expect(screen.getByRole("dialog")).toBeInTheDocument();
      // Dialog title is "Salvar Filtro", button also has this text
      expect(screen.getAllByText("Salvar Filtro").length).toBeGreaterThanOrEqual(1);
    });

    it("shows input for filter name in dialog", async () => {
      render(<SaveFilterDialog />, { wrapper: createWrapper() });

      await userEvent.click(screen.getByTestId("save-filter-trigger"));

      expect(screen.getByTestId("filter-name-input")).toBeInTheDocument();
      expect(screen.getByLabelText("Nome do filtro")).toBeInTheDocument();
    });

    it("shows placeholder text in name input", async () => {
      render(<SaveFilterDialog />, { wrapper: createWrapper() });

      await userEvent.click(screen.getByTestId("save-filter-trigger"));

      expect(
        screen.getByPlaceholderText("Ex: Leads de tecnologia em SP")
      ).toBeInTheDocument();
    });

    it("shows Salvar and Cancelar buttons in dialog", async () => {
      render(<SaveFilterDialog />, { wrapper: createWrapper() });

      await userEvent.click(screen.getByTestId("save-filter-trigger"));

      expect(screen.getByTestId("save-filter-submit")).toBeInTheDocument();
      expect(screen.getByText("Cancelar")).toBeInTheDocument();
    });
  });

  describe("Disabled State", () => {
    it("disables trigger when disabled prop is true", () => {
      render(<SaveFilterDialog disabled />, { wrapper: createWrapper() });

      expect(screen.getByTestId("save-filter-trigger")).toBeDisabled();
    });

    it("enables trigger when disabled prop is false", () => {
      render(<SaveFilterDialog disabled={false} />, { wrapper: createWrapper() });

      expect(screen.getByTestId("save-filter-trigger")).not.toBeDisabled();
    });
  });

  describe("Validation (AC: #5)", () => {
    it("shows error when name is empty on submit", async () => {
      render(<SaveFilterDialog />, { wrapper: createWrapper() });

      await userEvent.click(screen.getByTestId("save-filter-trigger"));
      await userEvent.click(screen.getByTestId("save-filter-submit"));

      await waitFor(() => {
        expect(screen.getByTestId("filter-name-error")).toBeInTheDocument();
      });
      expect(screen.getByText("Nome do filtro é obrigatório")).toBeInTheDocument();
    });

    it("does not submit when validation fails", async () => {
      render(<SaveFilterDialog />, { wrapper: createWrapper() });

      await userEvent.click(screen.getByTestId("save-filter-trigger"));
      await userEvent.click(screen.getByTestId("save-filter-submit"));

      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe("Submission (AC: #1)", () => {
    it("calls API with filter name and current filters", async () => {
      // Set some filters
      useFilterStore.getState().setIndustries(["technology"]);
      useFilterStore.getState().setKeywords("startup");

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            id: "filter-1",
            name: "My Filter",
            filtersJson: useFilterStore.getState().filters,
          },
        }),
      });

      render(<SaveFilterDialog />, { wrapper: createWrapper() });

      await userEvent.click(screen.getByTestId("save-filter-trigger"));
      await userEvent.type(screen.getByTestId("filter-name-input"), "My Filter");
      await userEvent.click(screen.getByTestId("save-filter-submit"));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith("/api/filters/saved", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: expect.stringContaining('"name":"My Filter"'),
        });
      });
    });

    it("shows loading state during save", async () => {
      mockFetch.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  ok: true,
                  json: async () => ({ data: { id: "1", name: "Test" } }),
                }),
              100
            )
          )
      );

      render(<SaveFilterDialog />, { wrapper: createWrapper() });

      await userEvent.click(screen.getByTestId("save-filter-trigger"));
      await userEvent.type(screen.getByTestId("filter-name-input"), "Test");
      await userEvent.click(screen.getByTestId("save-filter-submit"));

      expect(screen.getByText("Salvando...")).toBeInTheDocument();
      expect(screen.getByTestId("save-filter-submit")).toBeDisabled();
    });

    it("shows success toast on save", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { id: "filter-1", name: "My Filter" },
        }),
      });

      render(<SaveFilterDialog />, { wrapper: createWrapper() });

      await userEvent.click(screen.getByTestId("save-filter-trigger"));
      await userEvent.type(screen.getByTestId("filter-name-input"), "My Filter");
      await userEvent.click(screen.getByTestId("save-filter-submit"));

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith(
          expect.stringContaining("My Filter")
        );
      });
    });

    it("closes dialog on successful save", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { id: "filter-1", name: "My Filter" },
        }),
      });

      render(<SaveFilterDialog />, { wrapper: createWrapper() });

      await userEvent.click(screen.getByTestId("save-filter-trigger"));
      await userEvent.type(screen.getByTestId("filter-name-input"), "My Filter");
      await userEvent.click(screen.getByTestId("save-filter-submit"));

      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });
    });

    it("shows error toast on save failure", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          error: { message: "Já existe um filtro com esse nome" },
        }),
      });

      render(<SaveFilterDialog />, { wrapper: createWrapper() });

      await userEvent.click(screen.getByTestId("save-filter-trigger"));
      await userEvent.type(screen.getByTestId("filter-name-input"), "Duplicate");
      await userEvent.click(screen.getByTestId("save-filter-submit"));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          "Já existe um filtro com esse nome"
        );
      });
    });
  });

  describe("Dialog Controls", () => {
    it("closes dialog on Cancelar click", async () => {
      render(<SaveFilterDialog />, { wrapper: createWrapper() });

      await userEvent.click(screen.getByTestId("save-filter-trigger"));
      expect(screen.getByRole("dialog")).toBeInTheDocument();

      await userEvent.click(screen.getByText("Cancelar"));

      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });
    });

    it("resets form when dialog reopened", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { id: "filter-1", name: "My Filter" },
        }),
      });

      render(<SaveFilterDialog />, { wrapper: createWrapper() });

      // Open, type, and save
      await userEvent.click(screen.getByTestId("save-filter-trigger"));
      await userEvent.type(screen.getByTestId("filter-name-input"), "My Filter");
      await userEvent.click(screen.getByTestId("save-filter-submit"));

      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });

      // Reopen dialog
      await userEvent.click(screen.getByTestId("save-filter-trigger"));

      // Input should be empty
      expect(screen.getByTestId("filter-name-input")).toHaveValue("");
    });
  });
});
