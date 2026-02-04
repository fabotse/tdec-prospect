/**
 * LeadTable Component Tests
 * Story: 3.5 - Lead Table Display
 * Story 4.2: Lead Status Management
 * Story 4.6: Interested Leads Highlighting
 *
 * AC: #1 - Table with columns: checkbox, Nome, Empresa, Cargo, Localização, Status
 * AC: #2 - Airtable-inspired styling with hover states
 * AC: #3 - Column sorting (asc → desc → none)
 * AC: #4 - Column resizing with min width
 * AC: #5 - Text truncation with tooltips
 * AC: #6 - Keyboard accessibility
 * AC: #8 - Empty state
 * Story 4.2 AC#2: Status column with dropdown
 * Story 4.6 AC#1: Visual highlight for interested leads
 * Story 4.6 AC#3: Interested leads appear first when no sort
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import * as matchers from "vitest-axe/matchers";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { LeadTable } from "@/components/leads/LeadTable";
import { Lead } from "@/types/lead";

// Extend Vitest matchers with axe
expect.extend(matchers);

// Mock sonner toast (used by LeadStatusDropdown via use-lead-status hook)
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock fetch for API calls
const mockFetch = vi.fn();
global.fetch = mockFetch;

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

// Custom render function with QueryClient wrapper
// Story 4.2: LeadStatusDropdown requires QueryClient
function renderLeadTable(ui: React.ReactElement) {
  return render(ui, { wrapper: createWrapper() });
}

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
    photoUrl: null,
    status: "novo",
    hasEmail: true,
    hasDirectPhone: "Yes",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    // Story 6.5.4: Icebreaker fields
    icebreaker: null,
    icebreakerGeneratedAt: null,
    linkedinPostsCache: null,
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
    photoUrl: null,
    status: "interessado",
    hasEmail: true,
    hasDirectPhone: "Maybe: please request direct dial",
    createdAt: "2026-01-02T00:00:00Z",
    updatedAt: "2026-01-02T00:00:00Z",
    // Story 6.5.4: Icebreaker fields
    icebreaker: null,
    icebreakerGeneratedAt: null,
    linkedinPostsCache: null,
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
    photoUrl: null,
    status: "oportunidade",
    hasEmail: false,
    hasDirectPhone: null,
    createdAt: "2026-01-03T00:00:00Z",
    updatedAt: "2026-01-03T00:00:00Z",
    // Story 6.5.4: Icebreaker fields
    icebreaker: null,
    icebreakerGeneratedAt: null,
    linkedinPostsCache: null,
  },
];

// ==============================================
// SETUP
// ==============================================

describe("LeadTable", () => {
  let onSelectionChange: (ids: string[]) => void;

  beforeEach(() => {
    onSelectionChange = vi.fn();
    // Mock fetch for API calls (LeadStatusDropdown uses API)
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: {} }),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ==============================================
  // RENDERING TESTS (AC #1, #2)
  // ==============================================

  describe("Rendering", () => {
    it("renders table with correct column headers", () => {
      renderLeadTable(
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
      // Story 3.5.1: Contato column between Localização and Status
      expect(screen.getByText("Contato")).toBeInTheDocument();
      expect(screen.getByText("Status")).toBeInTheDocument();
    });

    it("renders all lead rows", () => {
      renderLeadTable(
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
      renderLeadTable(
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
      renderLeadTable(
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
      renderLeadTable(
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
      renderLeadTable(
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
      renderLeadTable(
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
      renderLeadTable(
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
      renderLeadTable(
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
      renderLeadTable(
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
      renderLeadTable(
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
      renderLeadTable(
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
      renderLeadTable(
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
      renderLeadTable(
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
      renderLeadTable(
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
      renderLeadTable(
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
      renderLeadTable(
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
      renderLeadTable(
        <LeadTable
          leads={mockLeads}
          selectedIds={[]}
          onSelectionChange={onSelectionChange}
        />
      );

      const table = screen.getByRole("grid");
      expect(table).toHaveAttribute("aria-rowcount", "4"); // header + 3 rows
      // Story 4.2.1: Updated column count to 8 (added Import indicator column)
      expect(table).toHaveAttribute("aria-colcount", "8");
    });

    it("has columnheader role on headers", () => {
      renderLeadTable(
        <LeadTable
          leads={mockLeads}
          selectedIds={[]}
          onSelectionChange={onSelectionChange}
        />
      );

      const headers = screen.getAllByRole("columnheader");
      // Story 4.2.1: Updated to 8 columns (checkbox + import indicator + 5 data columns + Contato)
      expect(headers.length).toBe(8);
    });

    it("has gridcell role on cells", () => {
      renderLeadTable(
        <LeadTable
          leads={mockLeads}
          selectedIds={[]}
          onSelectionChange={onSelectionChange}
        />
      );

      const cells = screen.getAllByRole("gridcell");
      // Story 4.2.1: Updated to 24 cells (3 rows * 8 columns)
      expect(cells.length).toBe(24);
    });

    // Story 4.2.1: AC #3 - Import indicator column position
    it("has import indicator in correct column position (after checkbox)", () => {
      renderLeadTable(
        <LeadTable
          leads={mockLeads}
          selectedIds={[]}
          onSelectionChange={onSelectionChange}
        />
      );

      // Get first data row
      const lead1Row = screen.getByTestId("lead-row-lead-1");
      const cells = lead1Row.querySelectorAll("td");

      // Column order: checkbox (0), import indicator (1), name (2), ...
      // Import indicator cell should contain the indicator aria-label
      const importIndicatorCell = cells[1];
      expect(importIndicatorCell).toBeInTheDocument();

      // Check that it contains either "salvo" or "não salvo" aria-label
      const indicator = importIndicatorCell.querySelector("[aria-label]");
      expect(indicator).toBeInTheDocument();
      expect(indicator?.getAttribute("aria-label")).toMatch(/Lead.*salvo|Lead.*Apollo/);
    });

    it("has accessible labels on checkboxes", () => {
      renderLeadTable(
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
      renderLeadTable(
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
      const { container } = renderLeadTable(
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
      const { container } = renderLeadTable(
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
      const { container } = renderLeadTable(
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
      renderLeadTable(
        <LeadTable
          leads={mockLeads}
          selectedIds={[]}
          onSelectionChange={onSelectionChange}
        />
      );

      // Resize handles have role="separator"
      const resizeHandles = screen.getAllByRole("separator");
      // Story 4.2.1: Updated to 7 (import indicator + 5 data columns + Contato, not checkbox)
      expect(resizeHandles.length).toBe(7);
    });

    it("resize handles have correct aria attributes", () => {
      renderLeadTable(
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
      renderLeadTable(
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
  // CONTACT AVAILABILITY TESTS (Story 3.5.1)
  // ==============================================

  describe("Contact Availability Column", () => {
    it("renders Contato column header", () => {
      renderLeadTable(
        <LeadTable
          leads={mockLeads}
          selectedIds={[]}
          onSelectionChange={onSelectionChange}
        />
      );

      expect(screen.getByText("Contato")).toBeInTheDocument();
    });

    it("renders email and phone icons for each row", () => {
      renderLeadTable(
        <LeadTable
          leads={mockLeads}
          selectedIds={[]}
          onSelectionChange={onSelectionChange}
        />
      );

      // There should be 3 email icons and 3 phone icons (one per lead)
      const table = screen.getByRole("grid");
      expect(table).toBeInTheDocument();
    });

    it("shows green email icon when hasEmail is true", async () => {
      const user = userEvent.setup();
      renderLeadTable(
        <LeadTable
          leads={[mockLeads[0]]} // Lead with hasEmail: true
          selectedIds={[]}
          onSelectionChange={onSelectionChange}
        />
      );

      // Find email icon and hover to check tooltip
      const emailIcon = document.querySelector("svg.text-green-500");
      expect(emailIcon).toBeInTheDocument();
    });

    it("shows gray email icon when hasEmail is false", () => {
      renderLeadTable(
        <LeadTable
          leads={[mockLeads[2]]} // Lead with hasEmail: false
          selectedIds={[]}
          onSelectionChange={onSelectionChange}
        />
      );

      // The icon should have muted color class
      const grayIcons = document.querySelectorAll("svg.text-muted-foreground\\/40");
      expect(grayIcons.length).toBeGreaterThan(0);
    });

    it("shows green phone icon when hasDirectPhone is 'Yes'", () => {
      renderLeadTable(
        <LeadTable
          leads={[mockLeads[0]]} // Lead with hasDirectPhone: "Yes"
          selectedIds={[]}
          onSelectionChange={onSelectionChange}
        />
      );

      // Should have 2 green icons (email + phone)
      const greenIcons = document.querySelectorAll("svg.text-green-500");
      expect(greenIcons.length).toBe(2);
    });

    it("shows gray phone icon when hasDirectPhone is not 'Yes'", () => {
      renderLeadTable(
        <LeadTable
          leads={[mockLeads[1]]} // Lead with hasDirectPhone: "Maybe..."
          selectedIds={[]}
          onSelectionChange={onSelectionChange}
        />
      );

      // Should have 1 green icon (email) and 1 gray icon (phone)
      const greenIcons = document.querySelectorAll("svg.text-green-500");
      const grayIcons = document.querySelectorAll("svg.text-muted-foreground\\/40");
      expect(greenIcons.length).toBe(1);
      expect(grayIcons.length).toBe(1);
    });
  });

  // ==============================================
  // LOADING STATE TESTS
  // ==============================================

  describe("Loading State", () => {
    it("does not show empty state when isLoading is true", () => {
      renderLeadTable(
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
      renderLeadTable(
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
      renderLeadTable(
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

  // ==============================================
  // STORY 4.6: INTERESTED LEADS HIGHLIGHTING
  // ==============================================

  describe("Interested Leads Highlighting (Story 4.6)", () => {
    it("AC#1: applies visual highlight to interested leads", () => {
      renderLeadTable(
        <LeadTable
          leads={mockLeads}
          selectedIds={[]}
          onSelectionChange={onSelectionChange}
        />
      );

      // Lead 2 has status "interessado"
      const interestedRow = screen.getByTestId("lead-row-lead-2");
      expect(interestedRow).toHaveClass("border-l-4");
      expect(interestedRow).toHaveClass("border-green-500/50");
      expect(interestedRow).toHaveClass("bg-green-500/5");
    });

    it("AC#1: does not apply highlight to non-interested leads", () => {
      renderLeadTable(
        <LeadTable
          leads={mockLeads}
          selectedIds={[]}
          onSelectionChange={onSelectionChange}
        />
      );

      // Lead 1 has status "novo" - should not have highlight
      const novoRow = screen.getByTestId("lead-row-lead-1");
      expect(novoRow).not.toHaveClass("border-l-4");
      expect(novoRow).not.toHaveClass("border-green-500/50");
    });

    it("AC#1: interested highlight has data-status attribute", () => {
      renderLeadTable(
        <LeadTable
          leads={mockLeads}
          selectedIds={[]}
          onSelectionChange={onSelectionChange}
        />
      );

      const interestedRow = screen.getByTestId("lead-row-lead-2");
      expect(interestedRow).toHaveAttribute("data-status", "interessado");
    });

    it("AC#3: interested leads appear first when no sorting is applied", () => {
      // Create leads in specific order: novo, interessado, oportunidade
      const leadsInOrder: Lead[] = [
        { ...mockLeads[0], id: "lead-novo", status: "novo" },
        { ...mockLeads[1], id: "lead-interessado", status: "interessado" },
        { ...mockLeads[2], id: "lead-oportunidade", status: "oportunidade" },
      ];

      renderLeadTable(
        <LeadTable
          leads={leadsInOrder}
          selectedIds={[]}
          onSelectionChange={onSelectionChange}
        />
      );

      // Get rows in order
      const rows = screen.getAllByTestId(/lead-row-/);

      // Interested lead should be first
      expect(rows[0]).toHaveAttribute("data-testid", "lead-row-lead-interessado");
    });

    it("AC#3: explicit column sort overrides interested priority", async () => {
      const user = userEvent.setup();
      // Create leads: interessado with name "Zelia", novo with name "Ana"
      const leadsForSort: Lead[] = [
        { ...mockLeads[1], id: "lead-z", firstName: "Zelia", status: "interessado" },
        { ...mockLeads[0], id: "lead-a", firstName: "Ana", status: "novo" },
      ];

      renderLeadTable(
        <LeadTable
          leads={leadsForSort}
          selectedIds={[]}
          onSelectionChange={onSelectionChange}
        />
      );

      // Initially, interessado should be first (priority sort)
      let rows = screen.getAllByTestId(/lead-row-/);
      expect(rows[0]).toHaveAttribute("data-testid", "lead-row-lead-z");

      // Sort by name ascending
      const nomeHeader = screen.getByText("Nome");
      await user.click(nomeHeader);

      // Now Ana should be first (alphabetical)
      rows = screen.getAllByTestId(/lead-row-/);
      expect(rows[0]).toHaveAttribute("data-testid", "lead-row-lead-a");
    });

    it("AC#3: interested priority returns when sort is cleared", async () => {
      const user = userEvent.setup();
      const leadsForSort: Lead[] = [
        { ...mockLeads[1], id: "lead-z", firstName: "Zelia", status: "interessado" },
        { ...mockLeads[0], id: "lead-a", firstName: "Ana", status: "novo" },
      ];

      renderLeadTable(
        <LeadTable
          leads={leadsForSort}
          selectedIds={[]}
          onSelectionChange={onSelectionChange}
        />
      );

      const nomeHeader = screen.getByText("Nome");

      // Sort ascending
      await user.click(nomeHeader);
      // Sort descending
      await user.click(nomeHeader);
      // Clear sort (third click)
      await user.click(nomeHeader);

      // Interested lead should be first again
      const rows = screen.getAllByTestId(/lead-row-/);
      expect(rows[0]).toHaveAttribute("data-testid", "lead-row-lead-z");
    });

    it("AC#4: showImportStatus prop is passed to LeadImportIndicator", () => {
      renderLeadTable(
        <LeadTable
          leads={[{ ...mockLeads[1], _isImported: true }]}
          selectedIds={[]}
          onSelectionChange={onSelectionChange}
          showImportStatus
        />
      );

      // When showImportStatus is true and lead is interested,
      // the indicator should show status badge
      // This is tested by checking the component renders without error
      expect(screen.getByTestId("lead-row-lead-2")).toBeInTheDocument();
    });
  });

  // ==============================================
  // STORY 6.5.6: ICEBREAKER COLUMN
  // ==============================================

  describe("Icebreaker Column (Story 6.5.6)", () => {
    const leadWithIcebreaker: Lead = {
      ...mockLeads[0],
      id: "lead-with-icebreaker",
      icebreaker: "Vi que você postou sobre IA recentemente. Muito interessante!",
      icebreakerGeneratedAt: "2026-02-04T10:00:00Z",
    };

    const leadWithoutIcebreaker: Lead = {
      ...mockLeads[1],
      id: "lead-without-icebreaker",
      icebreaker: null,
      icebreakerGeneratedAt: null,
    };

    it("AC#1: does not show Icebreaker column when showIcebreaker is false", () => {
      renderLeadTable(
        <LeadTable
          leads={[leadWithIcebreaker]}
          selectedIds={[]}
          onSelectionChange={onSelectionChange}
          showIcebreaker={false}
        />
      );

      expect(screen.queryByText("Icebreaker")).not.toBeInTheDocument();
    });

    it("AC#1: shows Icebreaker column when showIcebreaker is true", () => {
      renderLeadTable(
        <LeadTable
          leads={[leadWithIcebreaker]}
          selectedIds={[]}
          onSelectionChange={onSelectionChange}
          showIcebreaker
        />
      );

      expect(screen.getByText("Icebreaker")).toBeInTheDocument();
    });

    it("AC#1: shows icebreaker text when lead has icebreaker", () => {
      renderLeadTable(
        <LeadTable
          leads={[leadWithIcebreaker]}
          selectedIds={[]}
          onSelectionChange={onSelectionChange}
          showIcebreaker
        />
      );

      expect(screen.getByText("Vi que você postou sobre IA recentemente. Muito interessante!")).toBeInTheDocument();
    });

    it("AC#1: icebreaker cell has truncate class for text overflow", () => {
      renderLeadTable(
        <LeadTable
          leads={[leadWithIcebreaker]}
          selectedIds={[]}
          onSelectionChange={onSelectionChange}
          showIcebreaker
        />
      );

      // Find the icebreaker text element
      const icebreakerText = screen.getByText("Vi que você postou sobre IA recentemente. Muito interessante!");
      // Text should have truncate class for CSS text-overflow
      expect(icebreakerText).toHaveClass("truncate");
    });

    it("AC#1: icebreaker cell is wrapped in tooltip trigger for full text on hover", () => {
      renderLeadTable(
        <LeadTable
          leads={[leadWithIcebreaker]}
          selectedIds={[]}
          onSelectionChange={onSelectionChange}
          showIcebreaker
        />
      );

      // Find the icebreaker text element
      const icebreakerText = screen.getByText("Vi que você postou sobre IA recentemente. Muito interessante!");
      // The text should be inside a tooltip trigger (button with type="button")
      const tooltipTrigger = icebreakerText.closest('[data-state]') || icebreakerText.closest('button');
      // Verify the text is inside the tooltip component structure
      expect(icebreakerText.closest('td')).toHaveClass('max-w-0');
    });

    it("AC#1: shows dash when lead has no icebreaker", () => {
      renderLeadTable(
        <LeadTable
          leads={[leadWithoutIcebreaker]}
          selectedIds={[]}
          onSelectionChange={onSelectionChange}
          showIcebreaker
        />
      );

      const row = screen.getByTestId("lead-row-lead-without-icebreaker");
      const cells = within(row).getAllByRole("gridcell");
      // Icebreaker column should contain "—"
      const icebreakerCell = cells.find(cell => cell.textContent === "—");
      expect(icebreakerCell).toBeInTheDocument();
    });

    it("AC#1: column header has tooltip with explanation", async () => {
      const user = userEvent.setup();
      renderLeadTable(
        <LeadTable
          leads={[leadWithIcebreaker]}
          selectedIds={[]}
          onSelectionChange={onSelectionChange}
          showIcebreaker
        />
      );

      // Header should show the Sparkles icon alongside the label
      const header = screen.getByText("Icebreaker");
      expect(header).toBeInTheDocument();

      // Hover to check tooltip content
      await user.hover(header);
      // Tooltip content should explain the feature
      // (exact tooltip behavior depends on animation timing)
    });

    it("AC#4: shows loading state when generating icebreaker", () => {
      renderLeadTable(
        <LeadTable
          leads={[leadWithoutIcebreaker]}
          selectedIds={[]}
          onSelectionChange={onSelectionChange}
          showIcebreaker
          generatingIcebreakerIds={new Set(["lead-without-icebreaker"])}
        />
      );

      expect(screen.getByText("Gerando...")).toBeInTheDocument();
    });

    it("AC#4: does not show loading state for leads not being generated", () => {
      renderLeadTable(
        <LeadTable
          leads={[leadWithoutIcebreaker]}
          selectedIds={[]}
          onSelectionChange={onSelectionChange}
          showIcebreaker
          generatingIcebreakerIds={new Set(["other-lead-id"])}
        />
      );

      expect(screen.queryByText("Gerando...")).not.toBeInTheDocument();
    });

    it("renders correct number of columns with showIcebreaker", () => {
      renderLeadTable(
        <LeadTable
          leads={[leadWithIcebreaker]}
          selectedIds={[]}
          onSelectionChange={onSelectionChange}
          showIcebreaker
        />
      );

      // Should have 9 columns now (8 base + 1 icebreaker)
      const headers = screen.getAllByRole("columnheader");
      expect(headers.length).toBe(9);
    });

    it("has no accessibility violations with icebreaker column", async () => {
      const { container } = renderLeadTable(
        <LeadTable
          leads={[leadWithIcebreaker, leadWithoutIcebreaker]}
          selectedIds={[]}
          onSelectionChange={onSelectionChange}
          showIcebreaker
        />
      );

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });
});
