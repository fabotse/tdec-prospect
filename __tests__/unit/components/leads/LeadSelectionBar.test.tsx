/**
 * LeadSelectionBar Component Tests
 * Story: 3.6 - Lead Selection (Individual & Batch)
 *
 * AC: #1 - Selection bar appears when leads selected
 * AC: #3 - Action buttons: "Criar Campanha", dropdown menu
 * AC: #5 - Clear selection functionality
 * AC: #6 - Bar not visible when no selection
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import * as matchers from "vitest-axe/matchers";
import { LeadSelectionBar } from "@/components/leads/LeadSelectionBar";
import { useSelectionStore } from "@/stores/use-selection-store";

// Extend Vitest matchers with axe
expect.extend(matchers);

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

// ==============================================
// SETUP
// ==============================================

describe("LeadSelectionBar", () => {
  beforeEach(() => {
    // Reset store before each test
    useSelectionStore.setState({ selectedIds: [] });
    mockPush.mockClear();
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

      render(<LeadSelectionBar visibleSelectedCount={1} />);

      expect(screen.getByText("1 lead selecionado")).toBeInTheDocument();
    });

    it("does not render when visibleSelectedCount is 0", () => {
      useSelectionStore.setState({ selectedIds: ["lead-1"] });

      render(<LeadSelectionBar visibleSelectedCount={0} />);

      expect(screen.queryByText(/lead.*selecionado/)).not.toBeInTheDocument();
    });

    it("does not render when no leads selected in store", () => {
      useSelectionStore.setState({ selectedIds: [] });

      render(<LeadSelectionBar />);

      expect(screen.queryByText(/lead.*selecionado/)).not.toBeInTheDocument();
    });

    it("uses store selectedIds count when visibleSelectedCount not provided", () => {
      useSelectionStore.setState({ selectedIds: ["lead-1", "lead-2", "lead-3"] });

      render(<LeadSelectionBar />);

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
      render(<LeadSelectionBar visibleSelectedCount={1} />);

      expect(screen.getByText("1 lead selecionado")).toBeInTheDocument();
    });

    it("displays correct plural text for multiple leads", () => {
      useSelectionStore.setState({
        selectedIds: ["lead-1", "lead-2", "lead-3"],
      });

      render(<LeadSelectionBar visibleSelectedCount={3} />);

      expect(screen.getByText("3 leads selecionados")).toBeInTheDocument();
    });

    it("shows 'Criar Campanha' button", () => {
      render(<LeadSelectionBar visibleSelectedCount={1} />);

      expect(
        screen.getByRole("button", { name: "Criar Campanha" })
      ).toBeInTheDocument();
    });

    it("shows 'Limpar' button", () => {
      render(<LeadSelectionBar visibleSelectedCount={1} />);

      expect(
        screen.getByRole("button", { name: "Limpar" })
      ).toBeInTheDocument();
    });

    it("shows dropdown menu trigger button", () => {
      render(<LeadSelectionBar visibleSelectedCount={1} />);

      expect(
        screen.getByRole("button", { name: "Mais opções" })
      ).toBeInTheDocument();
    });

    it("shows close (X) button", () => {
      render(<LeadSelectionBar visibleSelectedCount={1} />);

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

      render(<LeadSelectionBar visibleSelectedCount={2} />);

      await user.click(screen.getByRole("button", { name: "Limpar" }));

      expect(useSelectionStore.getState().selectedIds).toEqual([]);
    });

    it("calls clearSelection when X button clicked", async () => {
      const user = userEvent.setup();

      render(<LeadSelectionBar visibleSelectedCount={2} />);

      await user.click(
        screen.getByRole("button", { name: "Fechar barra de seleção" })
      );

      expect(useSelectionStore.getState().selectedIds).toEqual([]);
    });

    it("navigates to campaigns/new with selected lead IDs when 'Criar Campanha' clicked", async () => {
      const user = userEvent.setup();

      render(<LeadSelectionBar visibleSelectedCount={2} />);

      await user.click(screen.getByRole("button", { name: "Criar Campanha" }));

      expect(mockPush).toHaveBeenCalledWith(
        "/campaigns/new?leadIds=lead-1%2Clead-2"
      );
    });

    it("opens dropdown menu when trigger clicked", async () => {
      const user = userEvent.setup();

      render(<LeadSelectionBar visibleSelectedCount={2} />);

      await user.click(screen.getByRole("button", { name: "Mais opções" }));

      // Dropdown menu items should be visible
      await waitFor(() => {
        expect(
          screen.getByText("Adicionar ao Segmento (em breve)")
        ).toBeInTheDocument();
        expect(screen.getByText("Exportar CSV (em breve)")).toBeInTheDocument();
      });
    });

    it("dropdown menu items are disabled (future features)", async () => {
      const user = userEvent.setup();

      render(<LeadSelectionBar visibleSelectedCount={2} />);

      await user.click(screen.getByRole("button", { name: "Mais opções" }));

      await waitFor(() => {
        const segmentItem = screen.getByText("Adicionar ao Segmento (em breve)");
        expect(segmentItem.closest("[role='menuitem']")).toHaveAttribute(
          "data-disabled"
        );
      });
    });
  });

  // ==============================================
  // ACCESSIBILITY TESTS
  // ==============================================

  describe("Accessibility", () => {
    it("has no accessibility violations when visible", async () => {
      useSelectionStore.setState({ selectedIds: ["lead-1", "lead-2"] });

      const { container } = render(<LeadSelectionBar visibleSelectedCount={2} />);

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it("has no accessibility violations when hidden", async () => {
      useSelectionStore.setState({ selectedIds: [] });

      const { container } = render(<LeadSelectionBar visibleSelectedCount={0} />);

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it("buttons have accessible labels", () => {
      useSelectionStore.setState({ selectedIds: ["lead-1"] });

      render(<LeadSelectionBar visibleSelectedCount={1} />);

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

      render(<LeadSelectionBar visibleSelectedCount={2} />);

      // Should show 2 (visible count), not 5 (total selected)
      expect(screen.getByText("2 leads selecionados")).toBeInTheDocument();
    });

    it("preserves selection in store even when visibleSelectedCount is 0", () => {
      // User has selections, but after filter change none are visible
      useSelectionStore.setState({
        selectedIds: ["lead-1", "lead-2", "lead-3"],
      });

      render(<LeadSelectionBar visibleSelectedCount={0} />);

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
      const { rerender } = render(<LeadSelectionBar visibleSelectedCount={0} />);
      expect(screen.queryByText(/lead.*selecionado/)).not.toBeInTheDocument();

      // Filter changes reveal some selected leads
      rerender(<LeadSelectionBar visibleSelectedCount={2} />);
      expect(screen.getByText("2 leads selecionados")).toBeInTheDocument();
    });

    it("maintains total selection count in store across filter changes", () => {
      useSelectionStore.setState({
        selectedIds: ["lead-1", "lead-2", "lead-3", "lead-4"],
      });

      const { rerender } = render(<LeadSelectionBar visibleSelectedCount={4} />);
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

      render(<LeadSelectionBar visibleSelectedCount={100} />);

      expect(screen.getByText("100 leads selecionados")).toBeInTheDocument();
    });

    it("updates display when selection changes", async () => {
      useSelectionStore.setState({ selectedIds: ["lead-1"] });

      const { rerender } = render(<LeadSelectionBar visibleSelectedCount={1} />);

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
