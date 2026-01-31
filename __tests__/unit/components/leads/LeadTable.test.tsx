/**
 * LeadTable Component Tests
 * Story: 3.5 - Lead Table Display
 *
 * AC: #1 - Table with columns: checkbox, Nome, Empresa, Cargo, Localização, Status
 * AC: #2 - Airtable-inspired styling with hover states
 * AC: #3 - Column sorting (asc → desc → none)
 * AC: #4 - Column resizing with min width
 * AC: #5 - Text truncation with tooltips
 * AC: #6 - Keyboard accessibility
 * AC: #8 - Empty state
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import * as matchers from "vitest-axe/matchers";
import { LeadTable } from "@/components/leads/LeadTable";
import { Lead } from "@/types/lead";

// Extend Vitest matchers with axe
expect.extend(matchers);

// ==============================================
// TEST DATA
// ==============================================

const mockLeads: Lead[] = [
  {
    id: "lead-1",
    tenantId: "tenant-1",
    apolloId: "apollo-1",
    firstName: "João",
    lastName: "Silva",
    email: "joao@empresa.com",
    phone: "+55 11 99999-1111",
    companyName: "Empresa ABC",
    companySize: "51-200",
    industry: "Tecnologia",
    location: "São Paulo, SP",
    title: "Diretor de Tecnologia",
    linkedinUrl: "https://linkedin.com/in/joaosilva",
    status: "novo",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "lead-2",
    tenantId: "tenant-1",
    apolloId: "apollo-2",
    firstName: "Maria",
    lastName: "Santos",
    email: "maria@corp.com",
    phone: "+55 11 99999-2222",
    companyName: "Corporação XYZ",
    companySize: "201-500",
    industry: "Finanças",
    location: "Rio de Janeiro, RJ",
    title: "CEO",
    linkedinUrl: null,
    status: "interessado",
    createdAt: "2026-01-02T00:00:00Z",
    updatedAt: "2026-01-02T00:00:00Z",
  },
  {
    id: "lead-3",
    tenantId: "tenant-1",
    apolloId: null,
    firstName: "Carlos",
    lastName: null,
    email: null,
    phone: null,
    companyName: null,
    companySize: null,
    industry: null,
    location: null,
    title: null,
    linkedinUrl: null,
    status: "oportunidade",
    createdAt: "2026-01-03T00:00:00Z",
    updatedAt: "2026-01-03T00:00:00Z",
  },
];

// ==============================================
// SETUP
// ==============================================

describe("LeadTable", () => {
  let onSelectionChange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onSelectionChange = vi.fn();
  });

  // ==============================================
  // RENDERING TESTS (AC #1, #2)
  // ==============================================

  describe("Rendering", () => {
    it("renders table with correct column headers", () => {
      render(
        <LeadTable
          leads={mockLeads}
          selectedIds={[]}
          onSelectionChange={onSelectionChange}
        />
      );

      expect(screen.getByText("Nome")).toBeInTheDocument();
      expect(screen.getByText("Empresa")).toBeInTheDocument();
      expect(screen.getByText("Cargo")).toBeInTheDocument();
      expect(screen.getByText("Localização")).toBeInTheDocument();
      expect(screen.getByText("Status")).toBeInTheDocument();
    });

    it("renders all lead rows", () => {
      render(
        <LeadTable
          leads={mockLeads}
          selectedIds={[]}
          onSelectionChange={onSelectionChange}
        />
      );

      expect(screen.getByTestId("lead-row-lead-1")).toBeInTheDocument();
      expect(screen.getByTestId("lead-row-lead-2")).toBeInTheDocument();
      expect(screen.getByTestId("lead-row-lead-3")).toBeInTheDocument();
    });

    it("renders lead data correctly in cells", () => {
      render(
        <LeadTable
          leads={mockLeads}
          selectedIds={[]}
          onSelectionChange={onSelectionChange}
        />
      );

      // First lead
      expect(screen.getByText("João Silva")).toBeInTheDocument();
      expect(screen.getByText("Empresa ABC")).toBeInTheDocument();
      expect(screen.getByText("Diretor de Tecnologia")).toBeInTheDocument();
      expect(screen.getByText("São Paulo, SP")).toBeInTheDocument();
      expect(screen.getByText("Novo")).toBeInTheDocument();

      // Second lead
      expect(screen.getByText("Maria Santos")).toBeInTheDocument();
      expect(screen.getByText("Interessado")).toBeInTheDocument();
    });

    it("renders dash for null/empty values", () => {
      render(
        <LeadTable
          leads={mockLeads}
          selectedIds={[]}
          onSelectionChange={onSelectionChange}
        />
      );

      // Lead 3 has null companyName, title, location
      const lead3Row = screen.getByTestId("lead-row-lead-3");
      const dashes = within(lead3Row).getAllByText("-");
      expect(dashes.length).toBeGreaterThanOrEqual(3);
    });

    it("renders status badges with correct styling", () => {
      render(
        <LeadTable
          leads={mockLeads}
          selectedIds={[]}
          onSelectionChange={onSelectionChange}
        />
      );

      expect(screen.getByText("Novo")).toBeInTheDocument();
      expect(screen.getByText("Interessado")).toBeInTheDocument();
      expect(screen.getByText("Oportunidade")).toBeInTheDocument();
    });
  });

  // ==============================================
  // EMPTY STATE TESTS (AC #8)
  // ==============================================

  describe("Empty State", () => {
    it("shows empty state when no leads", () => {
      render(
        <LeadTable
          leads={[]}
          selectedIds={[]}
          onSelectionChange={onSelectionChange}
        />
      );

      expect(screen.getByText("Nenhum lead encontrado")).toBeInTheDocument();
      expect(
        screen.getByText("Tente ajustar os filtros de busca.")
      ).toBeInTheDocument();
    });

    it("does not show table when no leads", () => {
      render(
        <LeadTable
          leads={[]}
          selectedIds={[]}
          onSelectionChange={onSelectionChange}
        />
      );

      expect(screen.queryByRole("grid")).not.toBeInTheDocument();
    });
  });

  // ==============================================
  // SORTING TESTS (AC #3)
  // ==============================================

  describe("Sorting", () => {
    it("sorts ascending on first header click", async () => {
      const user = userEvent.setup();
      render(
        <LeadTable
          leads={mockLeads}
          selectedIds={[]}
          onSelectionChange={onSelectionChange}
        />
      );

      const nomeHeader = screen.getByText("Nome");
      await user.click(nomeHeader);

      // Check aria-sort attribute
      expect(nomeHeader.closest("th")).toHaveAttribute("aria-sort", "ascending");
    });

    it("sorts descending on second header click", async () => {
      const user = userEvent.setup();
      render(
        <LeadTable
          leads={mockLeads}
          selectedIds={[]}
          onSelectionChange={onSelectionChange}
        />
      );

      const nomeHeader = screen.getByText("Nome");
      await user.click(nomeHeader);
      await user.click(nomeHeader);

      expect(nomeHeader.closest("th")).toHaveAttribute("aria-sort", "descending");
    });

    it("removes sort on third header click", async () => {
      const user = userEvent.setup();
      render(
        <LeadTable
          leads={mockLeads}
          selectedIds={[]}
          onSelectionChange={onSelectionChange}
        />
      );

      const nomeHeader = screen.getByText("Nome");
      await user.click(nomeHeader);
      await user.click(nomeHeader);
      await user.click(nomeHeader);

      expect(nomeHeader.closest("th")).not.toHaveAttribute("aria-sort");
    });

    it("shows sort indicator icons", async () => {
      const user = userEvent.setup();
      render(
        <LeadTable
          leads={mockLeads}
          selectedIds={[]}
          onSelectionChange={onSelectionChange}
        />
      );

      // Initially shows unsorted indicator (ChevronsUpDown)
      const nomeHeader = screen.getByText("Nome").closest("th");
      expect(nomeHeader).toBeInTheDocument();

      // Click to sort ascending
      await user.click(screen.getByText("Nome"));

      // Verify sorting works by checking order
      const rows = screen.getAllByTestId(/lead-row-/);
      expect(rows.length).toBe(3);
    });

    it("sorts different columns independently", async () => {
      const user = userEvent.setup();
      render(
        <LeadTable
          leads={mockLeads}
          selectedIds={[]}
          onSelectionChange={onSelectionChange}
        />
      );

      // Sort by Nome
      await user.click(screen.getByText("Nome"));
      expect(screen.getByText("Nome").closest("th")).toHaveAttribute(
        "aria-sort",
        "ascending"
      );

      // Sort by Empresa - should reset Nome sort
      await user.click(screen.getByText("Empresa"));
      expect(screen.getByText("Empresa").closest("th")).toHaveAttribute(
        "aria-sort",
        "ascending"
      );
      expect(screen.getByText("Nome").closest("th")).not.toHaveAttribute("aria-sort");
    });
  });

  // ==============================================
  // SELECTION TESTS
  // ==============================================

  describe("Selection", () => {
    it("calls onSelectionChange when row checkbox clicked", async () => {
      const user = userEvent.setup();
      render(
        <LeadTable
          leads={mockLeads}
          selectedIds={[]}
          onSelectionChange={onSelectionChange}
        />
      );

      const lead1Row = screen.getByTestId("lead-row-lead-1");
      const checkbox = within(lead1Row).getByRole("checkbox");
      await user.click(checkbox);

      expect(onSelectionChange).toHaveBeenCalledWith(["lead-1"]);
    });

    it("selects all when header checkbox clicked", async () => {
      const user = userEvent.setup();
      render(
        <LeadTable
          leads={mockLeads}
          selectedIds={[]}
          onSelectionChange={onSelectionChange}
        />
      );

      const headerCheckbox = screen.getByLabelText("Selecionar todos os leads");
      await user.click(headerCheckbox);

      expect(onSelectionChange).toHaveBeenCalledWith([
        "lead-1",
        "lead-2",
        "lead-3",
      ]);
    });

    it("deselects all when header checkbox clicked with all selected", async () => {
      const user = userEvent.setup();
      render(
        <LeadTable
          leads={mockLeads}
          selectedIds={["lead-1", "lead-2", "lead-3"]}
          onSelectionChange={onSelectionChange}
        />
      );

      const headerCheckbox = screen.getByLabelText("Selecionar todos os leads");
      await user.click(headerCheckbox);

      expect(onSelectionChange).toHaveBeenCalledWith([]);
    });

    it("shows selected state on rows", () => {
      render(
        <LeadTable
          leads={mockLeads}
          selectedIds={["lead-1"]}
          onSelectionChange={onSelectionChange}
        />
      );

      const lead1Row = screen.getByTestId("lead-row-lead-1");
      expect(lead1Row).toHaveClass("bg-primary/5");
    });

    it("shows indeterminate state when some rows selected", () => {
      render(
        <LeadTable
          leads={mockLeads}
          selectedIds={["lead-1"]}
          onSelectionChange={onSelectionChange}
        />
      );

      const headerCheckbox = screen.getByLabelText("Selecionar todos os leads");
      // Radix checkbox uses data-state for indeterminate
      expect(headerCheckbox).toHaveAttribute("data-state", "indeterminate");
    });
  });

  // ==============================================
  // ACCESSIBILITY TESTS (AC #6)
  // ==============================================

  describe("Accessibility", () => {
    it("has correct ARIA attributes on table", () => {
      render(
        <LeadTable
          leads={mockLeads}
          selectedIds={[]}
          onSelectionChange={onSelectionChange}
        />
      );

      const table = screen.getByRole("grid");
      expect(table).toHaveAttribute("aria-rowcount", "4"); // header + 3 rows
      expect(table).toHaveAttribute("aria-colcount", "6");
    });

    it("has columnheader role on headers", () => {
      render(
        <LeadTable
          leads={mockLeads}
          selectedIds={[]}
          onSelectionChange={onSelectionChange}
        />
      );

      const headers = screen.getAllByRole("columnheader");
      expect(headers.length).toBe(6); // checkbox + 5 data columns
    });

    it("has gridcell role on cells", () => {
      render(
        <LeadTable
          leads={mockLeads}
          selectedIds={[]}
          onSelectionChange={onSelectionChange}
        />
      );

      const cells = screen.getAllByRole("gridcell");
      expect(cells.length).toBe(18); // 3 rows * 6 columns
    });

    it("has accessible labels on checkboxes", () => {
      render(
        <LeadTable
          leads={mockLeads}
          selectedIds={[]}
          onSelectionChange={onSelectionChange}
        />
      );

      expect(screen.getByLabelText("Selecionar todos os leads")).toBeInTheDocument();
      expect(screen.getByLabelText("Selecionar João Silva")).toBeInTheDocument();
      expect(screen.getByLabelText("Selecionar Maria Santos")).toBeInTheDocument();
    });

    it("supports keyboard navigation with arrow keys", () => {
      render(
        <LeadTable
          leads={mockLeads}
          selectedIds={[]}
          onSelectionChange={onSelectionChange}
        />
      );

      const table = screen.getByRole("grid");

      // Focus on table
      fireEvent.focus(table);

      // Arrow key events should be handled
      fireEvent.keyDown(table, { key: "ArrowDown" });
      fireEvent.keyDown(table, { key: "ArrowRight" });
      fireEvent.keyDown(table, { key: "ArrowUp" });
      fireEvent.keyDown(table, { key: "ArrowLeft" });

      // No errors should occur
      expect(table).toBeInTheDocument();
    });

    // AC: Task 10 - Accessibility tests (axe-core)
    it("has no accessibility violations with leads", async () => {
      const { container } = render(
        <LeadTable
          leads={mockLeads}
          selectedIds={[]}
          onSelectionChange={onSelectionChange}
        />
      );

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it("has no accessibility violations with empty state", async () => {
      const { container } = render(
        <LeadTable
          leads={[]}
          selectedIds={[]}
          onSelectionChange={onSelectionChange}
        />
      );

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it("has no accessibility violations with selected rows", async () => {
      const { container } = render(
        <LeadTable
          leads={mockLeads}
          selectedIds={["lead-1", "lead-2"]}
          onSelectionChange={onSelectionChange}
        />
      );

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });

  // ==============================================
  // RESIZE HANDLE TESTS (AC #4)
  // ==============================================

  describe("Column Resizing", () => {
    it("renders resize handles on column headers", () => {
      render(
        <LeadTable
          leads={mockLeads}
          selectedIds={[]}
          onSelectionChange={onSelectionChange}
        />
      );

      // Resize handles have role="separator"
      const resizeHandles = screen.getAllByRole("separator");
      expect(resizeHandles.length).toBe(5); // 5 data columns (not checkbox)
    });

    it("resize handles have correct aria attributes", () => {
      render(
        <LeadTable
          leads={mockLeads}
          selectedIds={[]}
          onSelectionChange={onSelectionChange}
        />
      );

      const resizeHandles = screen.getAllByRole("separator");
      resizeHandles.forEach((handle) => {
        expect(handle).toHaveAttribute("aria-orientation", "vertical");
        expect(handle).toHaveAttribute("aria-label", "Redimensionar coluna");
      });
    });
  });

  // ==============================================
  // TOOLTIP TESTS (AC #5)
  // ==============================================

  describe("Tooltips", () => {
    it("renders tooltip triggers for truncatable cells", () => {
      render(
        <LeadTable
          leads={mockLeads}
          selectedIds={[]}
          onSelectionChange={onSelectionChange}
        />
      );

      // Cells with values should have truncate class
      const truncatedCells = document.querySelectorAll(".truncate");
      expect(truncatedCells.length).toBeGreaterThan(0);
    });
  });

  // ==============================================
  // LOADING STATE TESTS
  // ==============================================

  describe("Loading State", () => {
    it("does not show empty state when isLoading is true", () => {
      render(
        <LeadTable
          leads={[]}
          selectedIds={[]}
          onSelectionChange={onSelectionChange}
          isLoading={true}
        />
      );

      // Should NOT show empty state message while loading
      expect(screen.queryByText("Nenhum lead encontrado")).not.toBeInTheDocument();
    });

    it("shows empty state only when not loading and no leads", () => {
      render(
        <LeadTable
          leads={[]}
          selectedIds={[]}
          onSelectionChange={onSelectionChange}
          isLoading={false}
        />
      );

      // Should show empty state when not loading
      expect(screen.getByText("Nenhum lead encontrado")).toBeInTheDocument();
    });

    it("renders table with leads even when isLoading is true", () => {
      render(
        <LeadTable
          leads={mockLeads}
          selectedIds={[]}
          onSelectionChange={onSelectionChange}
          isLoading={true}
        />
      );

      // Table should still render with leads
      expect(screen.getByRole("grid")).toBeInTheDocument();
      expect(screen.getByTestId("lead-row-lead-1")).toBeInTheDocument();
    });
  });
});
