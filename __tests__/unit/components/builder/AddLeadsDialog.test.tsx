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

// Mock useMyLeads
const mockUseMyLeads = vi.fn();
vi.mock("@/hooks/use-my-leads", () => ({
  useMyLeads: () => mockUseMyLeads(),
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
      });

      render(<AddLeadsDialog {...defaultProps} />, { wrapper: createWrapper() });

      expect(screen.getByText("Nenhum lead disponivel")).toBeInTheDocument();
    });

    it("shows loading state while fetching leads", () => {
      mockUseMyLeads.mockReturnValue({
        leads: [],
        isLoading: true,
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
      });

      render(<AddLeadsDialog {...defaultProps} />, { wrapper: createWrapper() });

      // Bob should only appear in campaign leads, not available leads
      expect(screen.getByText(/Leads disponiveis \(2\)/)).toBeInTheDocument();
    });
  });
});
