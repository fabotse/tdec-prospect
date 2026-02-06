/**
 * LeadPreviewSelector Component Tests
 * Story 6.6: Personalized Icebreakers
 *
 * AC #1: Lead Preview Selector in Builder
 * AC #6: No Leads Associated State
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LeadPreviewSelector } from "@/components/builder/LeadPreviewSelector";

// Mock useBuilderStore
const mockSetPreviewLead = vi.fn();
let mockPreviewLeadId: string | null = null;

const mockBuilderState = () => ({
  previewLeadId: mockPreviewLeadId,
  setPreviewLead: mockSetPreviewLead,
});

vi.mock("@/stores/use-builder-store", () => ({
  useBuilderStore: (selector?: (state: unknown) => unknown) => {
    const state = mockBuilderState();
    // Handle both selector and direct destructuring patterns
    return selector ? selector(state) : state;
  },
}));

// Mock useCampaignLeads - uses CampaignLeadWithLead interface (camelCase)
interface MockCampaignLeadWithLead {
  id: string;
  addedAt: string;
  lead: {
    id: string;
    firstName: string;
    lastName: string | null;
    companyName: string | null;
    title: string | null;
    email: string | null;
    photoUrl: string | null;
  };
}

let mockLeads: MockCampaignLeadWithLead[] = [];
let mockIsLoading = false;

vi.mock("@/hooks/use-campaign-leads", () => ({
  useCampaignLeads: () => ({
    leads: mockLeads,
    isLoading: mockIsLoading,
    leadCount: mockLeads.length,
    error: null,
  }),
}));

// Helper to wrap component with QueryClient
function renderWithQueryClient(component: React.ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>{component}</QueryClientProvider>
  );
}

describe("LeadPreviewSelector (Story 6.6)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPreviewLeadId = null;
    mockLeads = [];
    mockIsLoading = false;
  });

  describe("Renders leads correctly (AC #1)", () => {
    it("renders dropdown with leads", () => {
      mockLeads = [
        {
          id: "cl-1",
          addedAt: "2025-01-01",
          lead: {
            id: "lead-1",
            firstName: "Joao",
            lastName: "Silva",
            companyName: "Tech Corp",
            title: "CTO",
            email: "joao@techcorp.com",
            photoUrl: null,
          },
        },
        {
          id: "cl-2",
          addedAt: "2025-01-02",
          lead: {
            id: "lead-2",
            firstName: "Maria",
            lastName: "Santos",
            companyName: "Startup Inc",
            title: "CEO",
            email: "maria@startup.com",
            photoUrl: null,
          },
        },
      ];

      renderWithQueryClient(<LeadPreviewSelector campaignId="campaign-1" />);

      expect(screen.getByText("Preview:")).toBeInTheDocument();
      expect(screen.getByTestId("lead-preview-selector")).toBeInTheDocument();
    });

    it("shows lead name and company in dropdown options", async () => {
      mockLeads = [
        {
          id: "cl-1",
          addedAt: "2025-01-01",
          lead: {
            id: "lead-1",
            firstName: "Joao",
            lastName: "Silva",
            companyName: "Tech Corp",
            title: "CTO",
            email: "joao@techcorp.com",
            photoUrl: null,
          },
        },
      ];
      mockPreviewLeadId = "lead-1";

      renderWithQueryClient(<LeadPreviewSelector campaignId="campaign-1" />);

      // Click to open dropdown
      const trigger = screen.getByTestId("lead-preview-selector");
      fireEvent.click(trigger);

      await waitFor(() => {
        // Use getAllByText since value appears in both selected value and dropdown option
        const elements = screen.getAllByText("Joao Silva - Tech Corp");
        expect(elements.length).toBeGreaterThanOrEqual(1);
      });
    });

    it("auto-selects first lead on mount", () => {
      mockLeads = [
        {
          id: "cl-1",
          addedAt: "2025-01-01",
          lead: {
            id: "lead-1",
            firstName: "Joao",
            lastName: "Silva",
            companyName: "Tech Corp",
            title: "CTO",
            email: "joao@techcorp.com",
            photoUrl: null,
          },
        },
      ];
      mockPreviewLeadId = null;

      renderWithQueryClient(<LeadPreviewSelector campaignId="campaign-1" />);

      expect(mockSetPreviewLead).toHaveBeenCalledWith({
        id: "lead-1",
        firstName: "Joao",
        lastName: "Silva",
        companyName: "Tech Corp",
        title: "CTO",
        email: "joao@techcorp.com",
      });
    });

    it("does not auto-select if lead is already selected", () => {
      mockLeads = [
        {
          id: "cl-1",
          addedAt: "2025-01-01",
          lead: {
            id: "lead-1",
            firstName: "Joao",
            lastName: "Silva",
            companyName: "Tech Corp",
            title: "CTO",
            email: "joao@techcorp.com",
            photoUrl: null,
          },
        },
      ];
      mockPreviewLeadId = "lead-1";

      renderWithQueryClient(<LeadPreviewSelector campaignId="campaign-1" />);

      // Should not call setPreviewLead since lead is already selected
      expect(mockSetPreviewLead).not.toHaveBeenCalled();
    });

    it("selects first lead when selected lead is removed (CR-M2)", () => {
      // Start with lead-2 selected but only lead-1 available
      mockLeads = [
        {
          id: "cl-1",
          addedAt: "2025-01-01",
          lead: {
            id: "lead-1",
            firstName: "Maria",
            lastName: "Santos",
            companyName: "Other Corp",
            title: "CEO",
            email: "maria@other.com",
            photoUrl: null,
          },
        },
      ];
      mockPreviewLeadId = "lead-2"; // This lead no longer exists in the list

      renderWithQueryClient(<LeadPreviewSelector campaignId="campaign-1" />);

      // Should select first available lead since lead-2 was removed
      expect(mockSetPreviewLead).toHaveBeenCalledWith({
        id: "lead-1",
        firstName: "Maria",
        lastName: "Santos",
        companyName: "Other Corp",
        title: "CEO",
        email: "maria@other.com",
      });
    });
  });

  describe("Empty state (AC #6)", () => {
    it("shows 'Nenhum lead associado' when no leads", () => {
      mockLeads = [];
      mockIsLoading = false;

      renderWithQueryClient(<LeadPreviewSelector campaignId="campaign-1" />);

      expect(screen.getByTestId("no-leads-message")).toBeInTheDocument();
      expect(screen.getByText("Nenhum lead associado")).toBeInTheDocument();
    });

    it("does not show empty state when loading", () => {
      mockLeads = [];
      mockIsLoading = true;

      renderWithQueryClient(<LeadPreviewSelector campaignId="campaign-1" />);

      expect(screen.queryByTestId("no-leads-message")).not.toBeInTheDocument();
    });
  });

  describe("Lead selection", () => {
    it("calls setPreviewLead when lead is selected", async () => {
      mockLeads = [
        {
          id: "cl-1",
          addedAt: "2025-01-01",
          lead: {
            id: "lead-1",
            firstName: "Joao",
            lastName: "Silva",
            companyName: "Tech Corp",
            title: "CTO",
            email: "joao@techcorp.com",
            photoUrl: null,
          },
        },
        {
          id: "cl-2",
          addedAt: "2025-01-02",
          lead: {
            id: "lead-2",
            firstName: "Maria",
            lastName: "Santos",
            companyName: "Startup Inc",
            title: "CEO",
            email: "maria@startup.com",
            photoUrl: null,
          },
        },
      ];
      mockPreviewLeadId = "lead-1";

      renderWithQueryClient(<LeadPreviewSelector campaignId="campaign-1" />);

      // Clear auto-select call
      mockSetPreviewLead.mockClear();

      // Open dropdown
      const trigger = screen.getByTestId("lead-preview-selector");
      fireEvent.click(trigger);

      // Select different lead
      await waitFor(() => {
        const option = screen.getByText("Maria Santos - Startup Inc");
        fireEvent.click(option);
      });

      expect(mockSetPreviewLead).toHaveBeenCalledWith({
        id: "lead-2",
        firstName: "Maria",
        lastName: "Santos",
        companyName: "Startup Inc",
        title: "CEO",
        email: "maria@startup.com",
      });
    });

    it("disables dropdown when loading", () => {
      mockLeads = [
        {
          id: "cl-1",
          addedAt: "2025-01-01",
          lead: {
            id: "lead-1",
            firstName: "Joao",
            lastName: "Silva",
            companyName: "Tech Corp",
            title: "CTO",
            email: "joao@techcorp.com",
            photoUrl: null,
          },
        },
      ];
      mockIsLoading = true;
      mockPreviewLeadId = "lead-1";

      renderWithQueryClient(<LeadPreviewSelector campaignId="campaign-1" />);

      const trigger = screen.getByTestId("lead-preview-selector");
      // The Select component uses disabled attribute when disabled prop is true
      expect(trigger).toBeDisabled();
    });
  });

  describe("Accessibility", () => {
    it("has correct aria-label on trigger", () => {
      mockLeads = [
        {
          id: "cl-1",
          addedAt: "2025-01-01",
          lead: {
            id: "lead-1",
            firstName: "Joao",
            lastName: "Silva",
            companyName: "Tech Corp",
            title: "CTO",
            email: "joao@techcorp.com",
            photoUrl: null,
          },
        },
      ];
      mockPreviewLeadId = "lead-1";

      renderWithQueryClient(<LeadPreviewSelector campaignId="campaign-1" />);

      const trigger = screen.getByTestId("lead-preview-selector");
      expect(trigger).toHaveAttribute(
        "aria-label",
        "Selecionar lead para preview"
      );
    });

    it("has help tooltip with correct aria-label", () => {
      mockLeads = [
        {
          id: "cl-1",
          addedAt: "2025-01-01",
          lead: {
            id: "lead-1",
            firstName: "Joao",
            lastName: "Silva",
            companyName: "Tech Corp",
            title: "CTO",
            email: "joao@techcorp.com",
            photoUrl: null,
          },
        },
      ];
      mockPreviewLeadId = "lead-1";

      renderWithQueryClient(<LeadPreviewSelector campaignId="campaign-1" />);

      expect(
        screen.getByLabelText("Ajuda sobre preview do lead")
      ).toBeInTheDocument();
    });
  });

  describe("Format lead label", () => {
    it("shows only first name when no last name", async () => {
      mockLeads = [
        {
          id: "cl-1",
          addedAt: "2025-01-01",
          lead: {
            id: "lead-1",
            firstName: "Joao",
            lastName: null,
            companyName: "Tech Corp",
            title: "CTO",
            email: "joao@techcorp.com",
            photoUrl: null,
          },
        },
      ];
      mockPreviewLeadId = "lead-1";

      renderWithQueryClient(<LeadPreviewSelector campaignId="campaign-1" />);

      const trigger = screen.getByTestId("lead-preview-selector");
      fireEvent.click(trigger);

      await waitFor(() => {
        // Use getAllByText since value appears in both selected value and dropdown option
        const elements = screen.getAllByText("Joao - Tech Corp");
        expect(elements.length).toBeGreaterThanOrEqual(1);
      });
    });

    it("shows only name when no company", async () => {
      mockLeads = [
        {
          id: "cl-1",
          addedAt: "2025-01-01",
          lead: {
            id: "lead-1",
            firstName: "Joao",
            lastName: "Silva",
            companyName: null,
            title: "CTO",
            email: "joao@techcorp.com",
            photoUrl: null,
          },
        },
      ];
      mockPreviewLeadId = "lead-1";

      renderWithQueryClient(<LeadPreviewSelector campaignId="campaign-1" />);

      const trigger = screen.getByTestId("lead-preview-selector");
      fireEvent.click(trigger);

      await waitFor(() => {
        // Use getAllByText since value appears in both selected value and dropdown option
        const elements = screen.getAllByText("Joao Silva");
        expect(elements.length).toBeGreaterThanOrEqual(1);
      });
    });
  });
});
