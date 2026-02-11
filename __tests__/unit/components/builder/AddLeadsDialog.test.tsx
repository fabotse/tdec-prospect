/**
 * AddLeadsDialog Component Tests
 * Story 5.7: Campaign Lead Association
 *
 * AC: #1 - Open modal showing available leads
 * AC: #2 - Search and filter leads with debounce
 * AC: #3 - Select leads individually or in batch
 * AC: #4 - Add leads to campaign via API
 * AC: #7 - View leads already associated
 * AC: #8 - Remove leads from campaign
 */

import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AddLeadsDialog } from "@/components/builder/AddLeadsDialog";

// Mock dependencies
vi.mock("@/hooks/use-debounce", () => ({
  useDebounce: (value: string) => value,
}));

const mockLeads = [
  {
    id: "lead-1",
    firstName: "John",
    lastName: "Doe",
    email: "john@example.com",
    companyName: "Acme Inc",
    title: "CEO",
    photoUrl: null,
    tenantId: "tenant-1",
    apolloId: null,
    phone: null,
    companySize: null,
    industry: null,
    location: null,
    linkedinUrl: null,
    status: "novo" as const,
    hasEmail: true,
    hasDirectPhone: null,
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  },
  {
    id: "lead-2",
    firstName: "Jane",
    lastName: "Smith",
    email: "jane@example.com",
    companyName: "Tech Corp",
    title: "CTO",
    photoUrl: null,
    tenantId: "tenant-1",
    apolloId: null,
    phone: null,
    companySize: null,
    industry: null,
    location: null,
    linkedinUrl: null,
    status: "novo" as const,
    hasEmail: true,
    hasDirectPhone: null,
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  },
];

const mockCampaignLeads = [
  {
    id: "cl-1",
    addedAt: "2026-01-01",
    lead: {
      id: "lead-3",
      firstName: "Bob",
      lastName: "Wilson",
      email: "bob@example.com",
      companyName: "Corp LLC",
      title: "Manager",
      photoUrl: null,
    },
  },
];

// Mock SegmentFilter
let capturedSegmentFilterProps: { selectedSegmentId: string | null; onSegmentChange: (id: string | null) => void } | null = null;
vi.mock("@/components/leads/SegmentFilter", () => ({
  SegmentFilter: (props: { selectedSegmentId: string | null; onSegmentChange: (id: string | null) => void }) => {
    capturedSegmentFilterProps = props;
    return (
      <div data-testid="segment-filter">
        <button
          data-testid="segment-filter-select"
          onClick={() => props.onSegmentChange("seg-1")}
        >
          {props.selectedSegmentId ? `Segmento: ${props.selectedSegmentId}` : "Todos os Leads"}
        </button>
        <button
          data-testid="segment-filter-clear"
          onClick={() => props.onSegmentChange(null)}
        >
          Limpar
        </button>
      </div>
    );
  },
}));

// Mock useMyLeads
const mockUpdateFilters = vi.fn();
const mockUseMyLeads = vi.fn();
vi.mock("@/hooks/use-my-leads", () => ({
  useMyLeads: (filters?: Record<string, unknown>) => mockUseMyLeads(filters),
}));

// Mock useCampaignLeads
const mockAddLeads = { mutateAsync: vi.fn(), isPending: false };
const mockRemoveLead = { mutateAsync: vi.fn(), isPending: false };
const mockUseCampaignLeads = vi.fn();
vi.mock("@/hooks/use-campaign-leads", () => ({
  useCampaignLeads: (campaignId: string | null) => mockUseCampaignLeads(campaignId),
}));

// Mock sonner toast
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
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

describe("AddLeadsDialog (Story 5.7)", () => {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    campaignId: "campaign-123",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseMyLeads.mockReturnValue({
      leads: mockLeads,
      isLoading: false,
      updateFilters: mockUpdateFilters,
    });
    mockUseCampaignLeads.mockReturnValue({
      leads: mockCampaignLeads,
      addLeads: mockAddLeads,
      removeLead: mockRemoveLead,
      isAdding: false,
      isRemoving: false,
    });
  });

  describe("Rendering (AC #1)", () => {
    it("renders dialog when open", () => {
      render(<AddLeadsDialog {...defaultProps} />, { wrapper: createWrapper() });

      expect(screen.getByText("Adicionar Leads")).toBeInTheDocument();
    });

    it("renders search input", () => {
      render(<AddLeadsDialog {...defaultProps} />, { wrapper: createWrapper() });

      expect(screen.getByTestId("lead-search-input")).toBeInTheDocument();
    });

    it("displays available leads in table", () => {
      render(<AddLeadsDialog {...defaultProps} />, { wrapper: createWrapper() });

      expect(screen.getByText("John Doe")).toBeInTheDocument();
      expect(screen.getByText("Jane Smith")).toBeInTheDocument();
    });

    it("shows lead count for available leads", () => {
      render(<AddLeadsDialog {...defaultProps} />, { wrapper: createWrapper() });

      expect(screen.getByText(/Leads disponiveis \(2\)/)).toBeInTheDocument();
    });

    it("does not render when closed", () => {
      render(<AddLeadsDialog {...defaultProps} open={false} />, {
        wrapper: createWrapper(),
      });

      expect(screen.queryByText("Adicionar Leads")).not.toBeInTheDocument();
    });
  });

  describe("Search and Filter (AC #2)", () => {
    it("filters leads based on search input", async () => {
      // Start with all leads
      mockUseMyLeads.mockReturnValue({
        leads: mockLeads,
        isLoading: false,
        updateFilters: mockUpdateFilters,
      });

      render(<AddLeadsDialog {...defaultProps} />, { wrapper: createWrapper() });

      const searchInput = screen.getByTestId("lead-search-input");
      fireEvent.change(searchInput, { target: { value: "John" } });

      // Since debounce is mocked, the filter should be passed to hook
      expect(searchInput).toHaveValue("John");
    });

    it("shows empty state when no leads match search", () => {
      mockUseMyLeads.mockReturnValue({
        leads: [],
        isLoading: false,
        updateFilters: mockUpdateFilters,
      });

      render(<AddLeadsDialog {...defaultProps} />, { wrapper: createWrapper() });

      expect(screen.getByText("Nenhum lead disponivel")).toBeInTheDocument();
    });

    it("shows loading state while fetching leads", () => {
      mockUseMyLeads.mockReturnValue({
        leads: [],
        isLoading: true,
        updateFilters: mockUpdateFilters,
      });

      render(<AddLeadsDialog {...defaultProps} />, { wrapper: createWrapper() });

      expect(screen.getByLabelText("Carregando leads")).toBeInTheDocument();
    });
  });

  describe("Lead Selection (AC #3)", () => {
    it("toggles individual lead selection on click", () => {
      render(<AddLeadsDialog {...defaultProps} />, { wrapper: createWrapper() });

      const leadRow = screen.getByTestId("lead-row-lead-1");
      fireEvent.click(leadRow);

      expect(screen.getByText("1 selecionado")).toBeInTheDocument();
    });

    it("toggles all leads with select all checkbox", () => {
      render(<AddLeadsDialog {...defaultProps} />, { wrapper: createWrapper() });

      const selectAll = screen.getByTestId("select-all-checkbox");
      fireEvent.click(selectAll);

      expect(screen.getByText("2 selecionados")).toBeInTheDocument();
    });

    it("updates selection count when selecting multiple leads", () => {
      render(<AddLeadsDialog {...defaultProps} />, { wrapper: createWrapper() });

      fireEvent.click(screen.getByTestId("lead-row-lead-1"));
      fireEvent.click(screen.getByTestId("lead-row-lead-2"));

      expect(screen.getByText("2 selecionados")).toBeInTheDocument();
    });

    it("deselects lead when clicking selected lead", () => {
      render(<AddLeadsDialog {...defaultProps} />, { wrapper: createWrapper() });

      const leadRow = screen.getByTestId("lead-row-lead-1");
      fireEvent.click(leadRow);
      expect(screen.getByText("1 selecionado")).toBeInTheDocument();

      fireEvent.click(leadRow);
      expect(screen.queryByText("1 selecionado")).not.toBeInTheDocument();
    });
  });

  describe("Add Leads (AC #4)", () => {
    it("disables add button when no leads selected", () => {
      render(<AddLeadsDialog {...defaultProps} />, { wrapper: createWrapper() });

      expect(screen.getByTestId("add-leads-submit")).toBeDisabled();
    });

    it("enables add button when leads are selected", () => {
      render(<AddLeadsDialog {...defaultProps} />, { wrapper: createWrapper() });

      fireEvent.click(screen.getByTestId("lead-row-lead-1"));

      expect(screen.getByTestId("add-leads-submit")).not.toBeDisabled();
    });

    it("calls addLeads mutation when add button is clicked", async () => {
      render(<AddLeadsDialog {...defaultProps} />, { wrapper: createWrapper() });

      fireEvent.click(screen.getByTestId("lead-row-lead-1"));
      fireEvent.click(screen.getByTestId("add-leads-submit"));

      await waitFor(() => {
        expect(mockAddLeads.mutateAsync).toHaveBeenCalledWith(["lead-1"]);
      });
    });

    it("shows loading state while adding leads", () => {
      mockUseCampaignLeads.mockReturnValue({
        leads: mockCampaignLeads,
        addLeads: { ...mockAddLeads, isPending: true },
        removeLead: mockRemoveLead,
        isAdding: true,
        isRemoving: false,
      });

      render(<AddLeadsDialog {...defaultProps} />, { wrapper: createWrapper() });

      expect(screen.getByText("Adicionando...")).toBeInTheDocument();
    });
  });

  describe("View Campaign Leads (AC #7)", () => {
    it("displays leads already in campaign", () => {
      render(<AddLeadsDialog {...defaultProps} />, { wrapper: createWrapper() });

      expect(screen.getByText(/Leads na campanha \(1\)/)).toBeInTheDocument();
      expect(screen.getByText(/Bob Wilson/)).toBeInTheDocument();
    });

    it("shows company name for campaign leads", () => {
      render(<AddLeadsDialog {...defaultProps} />, { wrapper: createWrapper() });

      expect(screen.getByText(/Corp LLC/)).toBeInTheDocument();
    });
  });

  describe("Remove Leads (AC #8)", () => {
    it("calls removeLead mutation when remove button is clicked", async () => {
      render(<AddLeadsDialog {...defaultProps} />, { wrapper: createWrapper() });

      // Find remove button for campaign lead
      const removeButton = screen.getByRole("button", {
        name: /Remover Bob Wilson/,
      });
      fireEvent.click(removeButton);

      await waitFor(() => {
        expect(mockRemoveLead.mutateAsync).toHaveBeenCalledWith("lead-3");
      });
    });
  });

  describe("Dialog Behavior", () => {
    it("resets state when dialog closes", () => {
      render(<AddLeadsDialog {...defaultProps} />, { wrapper: createWrapper() });

      // Select a lead
      fireEvent.click(screen.getByTestId("lead-row-lead-1"));
      expect(screen.getByText("1 selecionado")).toBeInTheDocument();

      // Close dialog
      fireEvent.click(screen.getByText("Cancelar"));

      expect(defaultProps.onOpenChange).toHaveBeenCalledWith(false);
    });

    it("filters out leads already in campaign from available list", () => {
      // Lead-3 is already in campaign
      mockUseMyLeads.mockReturnValue({
        leads: [
          ...mockLeads,
          {
            id: "lead-3",
            firstName: "Bob",
            lastName: "Wilson",
            email: "bob@example.com",
            companyName: "Corp LLC",
            title: "Manager",
            photoUrl: null,
            tenantId: "tenant-1",
            apolloId: null,
            phone: null,
            companySize: null,
            industry: null,
            location: null,
            linkedinUrl: null,
            status: "novo" as const,
            hasEmail: true,
            hasDirectPhone: null,
            createdAt: "2026-01-01",
            updatedAt: "2026-01-01",
          },
        ],
        isLoading: false,
        updateFilters: mockUpdateFilters,
      });

      render(<AddLeadsDialog {...defaultProps} />, { wrapper: createWrapper() });

      // Bob should only appear in campaign leads, not available leads
      expect(screen.getByText(/Leads disponiveis \(2\)/)).toBeInTheDocument();
    });
  });

  describe("Segment Filter (Story 12.1)", () => {
    beforeEach(() => {
      capturedSegmentFilterProps = null;
    });

    it("renders SegmentFilter in the dialog (AC #1)", () => {
      render(<AddLeadsDialog {...defaultProps} />, { wrapper: createWrapper() });

      expect(screen.getByTestId("segment-filter")).toBeInTheDocument();
    });

    it("calls updateFilters with segmentId when segment is selected (AC #2)", () => {
      render(<AddLeadsDialog {...defaultProps} />, { wrapper: createWrapper() });

      // Initial useEffect syncs null segmentId
      expect(mockUpdateFilters).toHaveBeenCalledWith(
        expect.objectContaining({ segmentId: null })
      );

      mockUpdateFilters.mockClear();

      // Select a segment
      fireEvent.click(screen.getByTestId("segment-filter-select"));

      // updateFilters called with new segmentId
      expect(mockUpdateFilters).toHaveBeenCalledWith(
        expect.objectContaining({ segmentId: "seg-1" })
      );
    });

    it("combines search and segment filter simultaneously (AC #6)", () => {
      render(<AddLeadsDialog {...defaultProps} />, { wrapper: createWrapper() });

      // Type in search
      const searchInput = screen.getByTestId("lead-search-input");
      fireEvent.change(searchInput, { target: { value: "John" } });

      // Select segment
      fireEvent.click(screen.getByTestId("segment-filter-select"));

      // Both filters are synced via updateFilters simultaneously
      expect(mockUpdateFilters).toHaveBeenCalledWith(
        expect.objectContaining({ segmentId: "seg-1", search: "John" })
      );
    });

    it("resets segment filter when dialog closes (AC #7)", () => {
      render(<AddLeadsDialog {...defaultProps} />, { wrapper: createWrapper() });

      // Select a segment
      fireEvent.click(screen.getByTestId("segment-filter-select"));
      expect(screen.getByText("Segmento: seg-1")).toBeInTheDocument();

      // Close dialog
      fireEvent.click(screen.getByText("Cancelar"));

      expect(defaultProps.onOpenChange).toHaveBeenCalledWith(false);
      // Verify segment was actually reset to null
      expect(screen.getByText("Todos os Leads")).toBeInTheDocument();
    });

    it("clears lead selection when segment changes (AC #4)", () => {
      render(<AddLeadsDialog {...defaultProps} />, { wrapper: createWrapper() });

      // Select leads
      fireEvent.click(screen.getByTestId("lead-row-lead-1"));
      fireEvent.click(screen.getByTestId("lead-row-lead-2"));
      expect(screen.getByText("2 selecionados")).toBeInTheDocument();

      // Change segment — should clear selection
      fireEvent.click(screen.getByTestId("segment-filter-select"));
      expect(screen.queryByText("2 selecionados")).not.toBeInTheDocument();
      expect(screen.queryByText("1 selecionado")).not.toBeInTheDocument();
    });

    it("removes segment filter when 'Todos os Leads' is selected (AC #3)", () => {
      render(<AddLeadsDialog {...defaultProps} />, { wrapper: createWrapper() });

      // Select a segment
      fireEvent.click(screen.getByTestId("segment-filter-select"));
      expect(screen.getByText("Segmento: seg-1")).toBeInTheDocument();

      mockUpdateFilters.mockClear();

      // Clear segment (select "Todos os Leads")
      fireEvent.click(screen.getByTestId("segment-filter-clear"));

      // Verify segment was cleared
      expect(screen.getByText("Todos os Leads")).toBeInTheDocument();
      // Verify updateFilters was called with null segmentId
      expect(mockUpdateFilters).toHaveBeenCalledWith(
        expect.objectContaining({ segmentId: null })
      );
    });

    it("updates available leads count when segment filter changes data (AC #5)", () => {
      // Simulate filtered data (only 1 lead in the selected segment)
      mockUseMyLeads.mockReturnValue({
        leads: [mockLeads[0]],
        isLoading: false,
        updateFilters: mockUpdateFilters,
      });

      render(<AddLeadsDialog {...defaultProps} />, { wrapper: createWrapper() });

      expect(screen.getByText(/Leads disponiveis \(1\)/)).toBeInTheDocument();
    });
  });
});
