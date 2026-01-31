/**
 * LeadSelectionBar Component Tests
 * Story: 3.6 - Lead Selection (Individual & Batch)
 * Story: 4.1 - Lead Segments/Lists (SegmentDropdown integration)
 * Story: 4.2.1 - Lead Import Mechanism
 *
 * AC: #1 - Selection bar appears when leads selected
 * AC: #3 - Action buttons: "Criar Campanha", dropdown menu
 * AC: #5 - Clear selection functionality
 * AC: #6 - Bar not visible when no selection
 * Story 4.1: AC #2 - "Adicionar ao Segmento" button
 * Story 4.2.1: AC #1 - "Importar Leads" button
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import * as matchers from "vitest-axe/matchers";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { LeadSelectionBar } from "@/components/leads/LeadSelectionBar";
import { useSelectionStore } from "@/stores/use-selection-store";

// Extend Vitest matchers with axe
expect.extend(matchers);

// Mock sonner toast (used by SegmentDropdown)
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock fetch for SegmentDropdown's useSegments hook
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock framer-motion to avoid animation issues in tests
vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  motion: {
    div: ({
      children,
      initial: _initial,
      animate: _animate,
      exit: _exit,
      transition: _transition,
      ...props
    }: React.HTMLAttributes<HTMLDivElement> & {
      initial?: unknown;
      animate?: unknown;
      exit?: unknown;
      transition?: unknown;
    }) => <div {...props}>{children}</div>,
  },
}));

// Mock next/navigation
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

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

// ==============================================
// SETUP
// ==============================================

describe("LeadSelectionBar", () => {
  beforeEach(() => {
    // Reset store before each test
    useSelectionStore.setState({ selectedIds: [] });
    mockPush.mockClear();
    // Mock fetch to return empty segments by default
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: [] }),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ==============================================
  // VISIBILITY TESTS (AC #1, #6)
  // ==============================================

  describe("Visibility", () => {
    it("renders when visibleSelectedCount > 0", () => {
      useSelectionStore.setState({ selectedIds: ["lead-1"] });

      render(<LeadSelectionBar visibleSelectedCount={1} />, { wrapper: createWrapper() });

      expect(screen.getByText("1 lead selecionado")).toBeInTheDocument();
    });

    it("does not render when visibleSelectedCount is 0", () => {
      useSelectionStore.setState({ selectedIds: ["lead-1"] });

      render(<LeadSelectionBar visibleSelectedCount={0} />, { wrapper: createWrapper() });

      expect(screen.queryByText(/lead.*selecionado/)).not.toBeInTheDocument();
    });

    it("does not render when no leads selected in store", () => {
      useSelectionStore.setState({ selectedIds: [] });

      render(<LeadSelectionBar />, { wrapper: createWrapper() });

      expect(screen.queryByText(/lead.*selecionado/)).not.toBeInTheDocument();
    });

    it("uses store selectedIds count when visibleSelectedCount not provided", () => {
      useSelectionStore.setState({ selectedIds: ["lead-1", "lead-2", "lead-3"] });

      render(<LeadSelectionBar />, { wrapper: createWrapper() });

      expect(screen.getByText("3 leads selecionados")).toBeInTheDocument();
    });
  });

  // ==============================================
  // CONTENT TESTS (AC #1, #3)
  // ==============================================

  describe("Content", () => {
    beforeEach(() => {
      useSelectionStore.setState({ selectedIds: ["lead-1"] });
    });

    it("displays correct singular text for 1 lead", () => {
      render(<LeadSelectionBar visibleSelectedCount={1} />, { wrapper: createWrapper() });

      expect(screen.getByText("1 lead selecionado")).toBeInTheDocument();
    });

    it("displays correct plural text for multiple leads", () => {
      useSelectionStore.setState({
        selectedIds: ["lead-1", "lead-2", "lead-3"],
      });

      render(<LeadSelectionBar visibleSelectedCount={3} />, { wrapper: createWrapper() });

      expect(screen.getByText("3 leads selecionados")).toBeInTheDocument();
    });

    it("shows 'Criar Campanha' button", () => {
      render(<LeadSelectionBar visibleSelectedCount={1} />, { wrapper: createWrapper() });

      expect(
        screen.getByRole("button", { name: "Criar Campanha" })
      ).toBeInTheDocument();
    });

    it("shows 'Limpar' button", () => {
      render(<LeadSelectionBar visibleSelectedCount={1} />, { wrapper: createWrapper() });

      expect(
        screen.getByRole("button", { name: "Limpar" })
      ).toBeInTheDocument();
    });

    it("shows dropdown menu trigger button", () => {
      render(<LeadSelectionBar visibleSelectedCount={1} />, { wrapper: createWrapper() });

      expect(
        screen.getByRole("button", { name: "Mais opções" })
      ).toBeInTheDocument();
    });

    it("shows close (X) button", () => {
      render(<LeadSelectionBar visibleSelectedCount={1} />, { wrapper: createWrapper() });

      expect(
        screen.getByRole("button", { name: "Fechar barra de seleção" })
      ).toBeInTheDocument();
    });
  });

  // ==============================================
  // INTERACTION TESTS (AC #3, #5)
  // ==============================================

  describe("Interactions", () => {
    beforeEach(() => {
      useSelectionStore.setState({
        selectedIds: ["lead-1", "lead-2"],
      });
    });

    it("calls clearSelection when 'Limpar' clicked", async () => {
      const user = userEvent.setup();

      render(<LeadSelectionBar visibleSelectedCount={2} />, { wrapper: createWrapper() });

      await user.click(screen.getByRole("button", { name: "Limpar" }));

      expect(useSelectionStore.getState().selectedIds).toEqual([]);
    });

    it("calls clearSelection when X button clicked", async () => {
      const user = userEvent.setup();

      render(<LeadSelectionBar visibleSelectedCount={2} />, { wrapper: createWrapper() });

      await user.click(
        screen.getByRole("button", { name: "Fechar barra de seleção" })
      );

      expect(useSelectionStore.getState().selectedIds).toEqual([]);
    });

    it("navigates to campaigns/new with selected lead IDs when 'Criar Campanha' clicked", async () => {
      const user = userEvent.setup();

      render(<LeadSelectionBar visibleSelectedCount={2} />, { wrapper: createWrapper() });

      await user.click(screen.getByRole("button", { name: "Criar Campanha" }));

      expect(mockPush).toHaveBeenCalledWith(
        "/campaigns/new?leadIds=lead-1%2Clead-2"
      );
    });

    it("opens dropdown menu when trigger clicked", async () => {
      const user = userEvent.setup();

      render(<LeadSelectionBar visibleSelectedCount={2} />, { wrapper: createWrapper() });

      await user.click(screen.getByRole("button", { name: "Mais opções" }));

      // Dropdown menu items should be visible
      await waitFor(() => {
        expect(screen.getByText("Exportar CSV (em breve)")).toBeInTheDocument();
      });
    });

    it("dropdown menu items are disabled (future features)", async () => {
      const user = userEvent.setup();

      render(<LeadSelectionBar visibleSelectedCount={2} />, { wrapper: createWrapper() });

      await user.click(screen.getByRole("button", { name: "Mais opções" }));

      await waitFor(() => {
        const csvItem = screen.getByText("Exportar CSV (em breve)");
        expect(csvItem.closest("[role='menuitem']")).toHaveAttribute(
          "data-disabled"
        );
      });
    });

    it("shows 'Adicionar ao Segmento' button (Story 4.1)", async () => {
      render(<LeadSelectionBar visibleSelectedCount={2} />, { wrapper: createWrapper() });

      expect(screen.getByTestId("segment-dropdown-trigger")).toBeInTheDocument();
      expect(screen.getByText("Adicionar ao Segmento")).toBeInTheDocument();
    });

    it("shows 'Importar Leads' button (Story 4.2.1: AC #1)", () => {
      render(<LeadSelectionBar visibleSelectedCount={2} />, { wrapper: createWrapper() });

      expect(
        screen.getByRole("button", { name: /Importar Leads/i })
      ).toBeInTheDocument();
    });
  });

  // ==============================================
  // IMPORT LEADS TESTS (Story 4.2.1: AC #1, #4)
  // ==============================================

  describe("Import Leads (Story 4.2.1)", () => {
    const sampleLeads = [
      {
        id: "lead-1",
        tenantId: "tenant-1",
        apolloId: "apollo-123",
        firstName: "João",
        lastName: "Silva",
        email: "joao@example.com",
        phone: "+5511999999999",
        companyName: "Empresa ABC",
        companySize: "51-200",
        industry: "Technology",
        location: "São Paulo, BR",
        title: "CEO",
        linkedinUrl: "https://linkedin.com/in/joaosilva",
        hasEmail: true,
        hasDirectPhone: "Yes",
        status: "novo" as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: "lead-2",
        tenantId: "tenant-1",
        apolloId: "apollo-456",
        firstName: "Maria",
        lastName: "Santos",
        email: "maria@example.com",
        phone: null,
        companyName: "Empresa XYZ",
        companySize: "11-50",
        industry: "Finance",
        location: "Rio de Janeiro, BR",
        title: "CTO",
        linkedinUrl: null,
        hasEmail: true,
        hasDirectPhone: "No",
        status: "novo" as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    beforeEach(() => {
      useSelectionStore.setState({ selectedIds: ["lead-1", "lead-2"] });
    });

    it("calls import API when 'Importar Leads' clicked", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [] }),
      }).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { imported: 2, existing: 0 },
          message: "2 leads importados",
        }),
      });

      const user = userEvent.setup();

      render(
        <LeadSelectionBar visibleSelectedCount={2} leads={sampleLeads} />,
        { wrapper: createWrapper() }
      );

      await user.click(screen.getByRole("button", { name: /Importar Leads/i }));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          "/api/leads/import",
          expect.objectContaining({
            method: "POST",
            headers: { "Content-Type": "application/json" },
          })
        );
      });
    });

    it("shows loading state during import", async () => {
      let resolveImport: (value: unknown) => void;
      const importPromise = new Promise((resolve) => {
        resolveImport = resolve;
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [] }),
      }).mockReturnValueOnce(importPromise);

      const user = userEvent.setup();

      render(
        <LeadSelectionBar visibleSelectedCount={2} leads={sampleLeads} />,
        { wrapper: createWrapper() }
      );

      await user.click(screen.getByRole("button", { name: /Importar Leads/i }));

      await waitFor(() => {
        const button = screen.getByRole("button", { name: /Importar Leads/i });
        expect(button).toBeDisabled();
      });

      resolveImport!({
        ok: true,
        json: async () => ({
          data: { imported: 2, existing: 0 },
          message: "2 leads importados",
        }),
      });
    });

    it("does NOT clear selection after successful import (Story 4.2.1: AC #1 note)", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [] }),
      }).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { imported: 2, existing: 0 },
          message: "2 leads importados",
        }),
      });

      const user = userEvent.setup();

      render(
        <LeadSelectionBar visibleSelectedCount={2} leads={sampleLeads} />,
        { wrapper: createWrapper() }
      );

      await user.click(screen.getByRole("button", { name: /Importar Leads/i }));

      await waitFor(() => {
        // Selection should NOT be cleared - user may want to continue actions
        expect(useSelectionStore.getState().selectedIds).toHaveLength(2);
      });
    });
  });

  // ==============================================
  // ACCESSIBILITY TESTS
  // ==============================================

  describe("Accessibility", () => {
    it("has no accessibility violations when visible", async () => {
      useSelectionStore.setState({ selectedIds: ["lead-1", "lead-2"] });

      const { container } = render(<LeadSelectionBar visibleSelectedCount={2} />, { wrapper: createWrapper() });

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it("has no accessibility violations when hidden", async () => {
      useSelectionStore.setState({ selectedIds: [] });

      const { container } = render(<LeadSelectionBar visibleSelectedCount={0} />, { wrapper: createWrapper() });

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it("buttons have accessible labels", () => {
      useSelectionStore.setState({ selectedIds: ["lead-1"] });

      render(<LeadSelectionBar visibleSelectedCount={1} />, { wrapper: createWrapper() });

      // Check all buttons have accessible names
      expect(
        screen.getByRole("button", { name: "Criar Campanha" })
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Limpar" })
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Mais opções" })
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Fechar barra de seleção" })
      ).toBeInTheDocument();
    });
  });

  // ==============================================
  // FILTER PERSISTENCE TESTS (AC #4)
  // ==============================================

  describe("Filter Persistence", () => {
    it("shows only visible selected count when some selected leads are not in current results", () => {
      // User selected 5 leads, but after filter change only 2 are visible
      useSelectionStore.setState({
        selectedIds: ["lead-1", "lead-2", "lead-3", "lead-4", "lead-5"],
      });

      render(<LeadSelectionBar visibleSelectedCount={2} />, { wrapper: createWrapper() });

      // Should show 2 (visible count), not 5 (total selected)
      expect(screen.getByText("2 leads selecionados")).toBeInTheDocument();
    });

    it("preserves selection in store even when visibleSelectedCount is 0", () => {
      // User has selections, but after filter change none are visible
      useSelectionStore.setState({
        selectedIds: ["lead-1", "lead-2", "lead-3"],
      });

      render(<LeadSelectionBar visibleSelectedCount={0} />, { wrapper: createWrapper() });

      // Bar should be hidden
      expect(screen.queryByText(/lead.*selecionado/)).not.toBeInTheDocument();

      // But store should still have selections
      expect(useSelectionStore.getState().selectedIds).toHaveLength(3);
    });

    it("shows bar again when filter reveals previously selected leads", () => {
      useSelectionStore.setState({
        selectedIds: ["lead-1", "lead-2", "lead-3"],
      });

      // First render with no visible selections
      const { rerender } = render(<LeadSelectionBar visibleSelectedCount={0} />, { wrapper: createWrapper() });
      expect(screen.queryByText(/lead.*selecionado/)).not.toBeInTheDocument();

      // Filter changes reveal some selected leads
      rerender(<LeadSelectionBar visibleSelectedCount={2} />);
      expect(screen.getByText("2 leads selecionados")).toBeInTheDocument();
    });

    it("maintains total selection count in store across filter changes", () => {
      useSelectionStore.setState({
        selectedIds: ["lead-1", "lead-2", "lead-3", "lead-4"],
      });

      const { rerender } = render(<LeadSelectionBar visibleSelectedCount={4} />, { wrapper: createWrapper() });
      expect(screen.getByText("4 leads selecionados")).toBeInTheDocument();

      // Filter change - only 1 visible
      rerender(<LeadSelectionBar visibleSelectedCount={1} />);
      expect(screen.getByText("1 lead selecionado")).toBeInTheDocument();

      // Store still has all 4 selections
      expect(useSelectionStore.getState().selectedIds).toHaveLength(4);

      // Filter change - 3 visible
      rerender(<LeadSelectionBar visibleSelectedCount={3} />);
      expect(screen.getByText("3 leads selecionados")).toBeInTheDocument();

      // Store still has all 4 selections
      expect(useSelectionStore.getState().selectedIds).toHaveLength(4);
    });
  });

  // ==============================================
  // EDGE CASES
  // ==============================================

  describe("Edge Cases", () => {
    it("handles large selection counts correctly", () => {
      const manyIds = Array.from({ length: 100 }, (_, i) => `lead-${i}`);
      useSelectionStore.setState({ selectedIds: manyIds });

      render(<LeadSelectionBar visibleSelectedCount={100} />, { wrapper: createWrapper() });

      expect(screen.getByText("100 leads selecionados")).toBeInTheDocument();
    });

    it("updates display when selection changes", async () => {
      useSelectionStore.setState({ selectedIds: ["lead-1"] });

      const { rerender } = render(<LeadSelectionBar visibleSelectedCount={1} />, { wrapper: createWrapper() });

      expect(screen.getByText("1 lead selecionado")).toBeInTheDocument();

      await act(async () => {
        useSelectionStore.setState({
          selectedIds: ["lead-1", "lead-2", "lead-3"],
        });
      });

      rerender(<LeadSelectionBar visibleSelectedCount={3} />);

      expect(screen.getByText("3 leads selecionados")).toBeInTheDocument();
    });
  });
});
