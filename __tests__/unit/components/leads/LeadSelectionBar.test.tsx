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
  motion: {
    div: ({ children, className, "data-testid": testId, onClick, ...props }: Record<string, unknown>) => (
      <div className={className as string} data-testid={testId as string} onClick={onClick as () => void}>
        {children as React.ReactNode}
      </div>
    ),
    button: ({ children, className, onClick, type, ...props }: Record<string, unknown>) => (
      <button className={className as string} onClick={onClick as () => void} type={type as "button"}>
        {children as React.ReactNode}
      </button>
    ),
    a: ({ children, className, href, ...props }: Record<string, unknown>) => (
      <a className={className as string} href={href as string}>
        {children as React.ReactNode}
      </a>
    ),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useMotionValue: () => ({ set: vi.fn(), get: () => 0 }),
  useSpring: (v: unknown) => v,
  useTransform: () => 0,
  useReducedMotion: () => false,
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
        photoUrl: null,
        hasEmail: true,
        hasDirectPhone: "Yes",
        status: "novo" as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        // Story 6.5.4: Icebreaker fields
        icebreaker: null,
        icebreakerGeneratedAt: null,
        linkedinPostsCache: null,
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
        photoUrl: null,
        hasEmail: true,
        hasDirectPhone: "No",
        status: "novo" as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        // Story 6.5.4: Icebreaker fields
        icebreaker: null,
        icebreakerGeneratedAt: null,
        linkedinPostsCache: null,
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
  // ICEBREAKER GENERATION TESTS (Story 6.5.6: AC #2, #4)
  // ==============================================

  describe("Icebreaker Generation (Story 6.5.6)", () => {
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
        photoUrl: null,
        hasEmail: true,
        hasDirectPhone: "Yes" as const,
        status: "novo" as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        icebreaker: null,
        icebreakerGeneratedAt: null,
        linkedinPostsCache: null,
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
        linkedinUrl: "https://linkedin.com/in/mariasantos",
        photoUrl: null,
        hasEmail: true,
        hasDirectPhone: "No" as const,
        status: "novo" as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        icebreaker: null,
        icebreakerGeneratedAt: null,
        linkedinPostsCache: null,
      },
    ];

    beforeEach(() => {
      useSelectionStore.setState({ selectedIds: ["lead-1", "lead-2"] });
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: [] }),
      });
    });

    it("AC#2: does not show icebreaker button when showIcebreaker is false", () => {
      render(
        <LeadSelectionBar
          visibleSelectedCount={2}
          leads={sampleLeads}
          showIcebreaker={false}
        />,
        { wrapper: createWrapper() }
      );

      expect(screen.queryByTestId("generate-icebreaker-button")).not.toBeInTheDocument();
    });

    it("AC#2: shows icebreaker button when showIcebreaker is true", () => {
      render(
        <LeadSelectionBar
          visibleSelectedCount={2}
          leads={sampleLeads}
          showIcebreaker
        />,
        { wrapper: createWrapper() }
      );

      expect(screen.getByTestId("generate-icebreaker-button")).toBeInTheDocument();
      expect(screen.getByText(/Gerar Icebreaker/)).toBeInTheDocument();
    });

    it("AC#2: shows lead count in icebreaker button", () => {
      render(
        <LeadSelectionBar
          visibleSelectedCount={2}
          leads={sampleLeads}
          showIcebreaker
        />,
        { wrapper: createWrapper() }
      );

      expect(screen.getByText("Gerar Icebreaker (2)")).toBeInTheDocument();
    });

    it("AC#2: shows confirmation dialog when icebreaker button clicked", async () => {
      const user = userEvent.setup();
      render(
        <LeadSelectionBar
          visibleSelectedCount={2}
          leads={sampleLeads}
          showIcebreaker
        />,
        { wrapper: createWrapper() }
      );

      await user.click(screen.getByTestId("generate-icebreaker-button"));

      await waitFor(() => {
        expect(screen.getByText("Gerar Icebreakers")).toBeInTheDocument();
        expect(screen.getByText(/Gerar icebreaker para 2 leads/)).toBeInTheDocument();
        expect(screen.getByText(/Custo estimado/)).toBeInTheDocument();
      });
    });

    it("AC#2: confirmation dialog shows cost estimate", async () => {
      const user = userEvent.setup();
      render(
        <LeadSelectionBar
          visibleSelectedCount={2}
          leads={sampleLeads}
          showIcebreaker
        />,
        { wrapper: createWrapper() }
      );

      await user.click(screen.getByTestId("generate-icebreaker-button"));

      await waitFor(() => {
        // Cost for 2 leads is ~$0.008, displayed as "<$0.01"
        expect(screen.getByText(/<\$0\.01/)).toBeInTheDocument();
      });
    });

    it("AC#2: can cancel confirmation dialog", async () => {
      const user = userEvent.setup();
      render(
        <LeadSelectionBar
          visibleSelectedCount={2}
          leads={sampleLeads}
          showIcebreaker
        />,
        { wrapper: createWrapper() }
      );

      await user.click(screen.getByTestId("generate-icebreaker-button"));

      await waitFor(() => {
        expect(screen.getByText("Cancelar")).toBeInTheDocument();
      });

      await user.click(screen.getByText("Cancelar"));

      await waitFor(() => {
        expect(screen.queryByText("Gerar Icebreakers")).not.toBeInTheDocument();
      });
    });

    it("AC#2: calls API when generation confirmed", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: [] }),
        })
        .mockResolvedValue({
          ok: true,
          json: async () => ({
            success: true,
            results: [{ leadId: "lead-1", success: true, icebreaker: "Test" }],
            summary: { total: 1, generated: 1, skipped: 0, failed: 0 },
          }),
        });

      const user = userEvent.setup();
      render(
        <LeadSelectionBar
          visibleSelectedCount={2}
          leads={sampleLeads}
          showIcebreaker
        />,
        { wrapper: createWrapper() }
      );

      await user.click(screen.getByTestId("generate-icebreaker-button"));

      await waitFor(() => {
        expect(screen.getByText("Gerar", { selector: "button" })).toBeInTheDocument();
      });

      await user.click(screen.getByText("Gerar", { selector: "button" }));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          "/api/leads/enrich-icebreaker",
          expect.objectContaining({
            method: "POST",
          })
        );
      });
    });

    it("AC#4: button is disabled during generation", async () => {
      let resolveGeneration: (value: unknown) => void;
      const generationPromise = new Promise((resolve) => {
        resolveGeneration = resolve;
      });

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: [] }),
        })
        .mockReturnValueOnce(generationPromise);

      const user = userEvent.setup();
      render(
        <LeadSelectionBar
          visibleSelectedCount={2}
          leads={sampleLeads}
          showIcebreaker
        />,
        { wrapper: createWrapper() }
      );

      await user.click(screen.getByTestId("generate-icebreaker-button"));

      await waitFor(() => {
        expect(screen.getByText("Gerar", { selector: "button" })).toBeInTheDocument();
      });

      await user.click(screen.getByText("Gerar", { selector: "button" }));

      await waitFor(() => {
        const button = screen.getByTestId("generate-icebreaker-button");
        expect(button).toBeDisabled();
      });

      resolveGeneration!({
        ok: true,
        json: async () => ({
          success: true,
          results: [{ leadId: "lead-1", success: true }],
          summary: { total: 1, generated: 1, skipped: 0, failed: 0 },
        }),
      });
    });

    it("AC#4: calls onIcebreakerGenerationStart callback", async () => {
      const onStart = vi.fn();
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          results: [{ leadId: "lead-1", success: true, icebreaker: "Test" }],
          summary: { total: 1, generated: 1, skipped: 0, failed: 0 },
        }),
      });

      const user = userEvent.setup();
      render(
        <LeadSelectionBar
          visibleSelectedCount={2}
          leads={sampleLeads}
          showIcebreaker
          onIcebreakerGenerationStart={onStart}
        />,
        { wrapper: createWrapper() }
      );

      await user.click(screen.getByTestId("generate-icebreaker-button"));

      await waitFor(() => {
        expect(screen.getByText("Gerar", { selector: "button" })).toBeInTheDocument();
      });

      await user.click(screen.getByText("Gerar", { selector: "button" }));

      await waitFor(() => {
        expect(onStart).toHaveBeenCalledWith(["lead-1", "lead-2"]);
      });
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
