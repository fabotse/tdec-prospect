/**
 * LeadDetailPanel Component Tests
 * Story 4.3: Lead Detail View & Interaction History
 *
 * AC: #1 - Detail sidepanel opens
 * AC: #2 - Lead information display
 * AC: #3 - Interaction history section
 * AC: #4 - Add interaction note
 * AC: #7 - Close and keyboard accessibility
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LeadDetailPanel } from "@/components/leads/LeadDetailPanel";
import type { Lead } from "@/types/lead";

// Mock sonner toast
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock clipboard utility
const mockCopyToClipboard = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/utils/clipboard", () => ({
  copyToClipboard: (text: string) => mockCopyToClipboard(text),
}));

// Mock hooks
vi.mock("@/hooks/use-lead-interactions", () => ({
  useLeadInteractions: vi.fn(() => ({
    data: [],
    isLoading: false,
    isFetching: false,
    error: null,
    refetch: vi.fn(),
  })),
  useCreateInteraction: vi.fn(() => ({
    createInteraction: vi.fn(),
    createInteractionAsync: vi.fn(),
    isLoading: false,
    error: null,
    reset: vi.fn(),
  })),
}));

// Mock useIcebreakerEnrichment hook (Story 6.5.6)
const mockGenerateForLead = vi.fn();
vi.mock("@/hooks/use-icebreaker-enrichment", () => ({
  useIcebreakerEnrichment: vi.fn(() => ({
    generateForLead: mockGenerateForLead,
    generateForLeads: vi.fn(),
    isGenerating: false,
    error: null,
    mutation: { isPending: false },
  })),
}));

// ==============================================
// HELPER: Create mock lead
// ==============================================

function createMockLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: "lead-123",
    tenantId: "tenant-1",
    apolloId: "apollo-12345",
    firstName: "Joao",
    lastName: "Silva",
    email: "joao@example.com",
    phone: "+55 11 99999-9999",
    companyName: "Empresa ABC",
    companySize: "51-200",
    industry: "Technology",
    location: "Sao Paulo, BR",
    title: "CEO",
    linkedinUrl: "https://linkedin.com/in/joaosilva",
    photoUrl: null,
    hasEmail: true,
    hasDirectPhone: "Yes",
    status: "novo",
    createdAt: "2026-01-15T10:00:00Z",
    updatedAt: "2026-01-15T10:00:00Z",
    _isImported: true,
    // Story 6.5.4: Icebreaker fields
    icebreaker: null,
    icebreakerGeneratedAt: null,
    linkedinPostsCache: null,
    ...overrides,
  };
}

// ==============================================
// HELPER: Render with providers
// ==============================================

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  );
}

// ==============================================
// TESTS
// ==============================================

describe("LeadDetailPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("AC #1 - Detail sidepanel opens", () => {
    it("renders sidepanel when isOpen is true", () => {
      const lead = createMockLead();
      const onClose = vi.fn();

      renderWithProviders(
        <LeadDetailPanel lead={lead} isOpen={true} onClose={onClose} />
      );

      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    it("does not render sidepanel when isOpen is false", () => {
      const lead = createMockLead();
      const onClose = vi.fn();

      renderWithProviders(
        <LeadDetailPanel lead={lead} isOpen={false} onClose={onClose} />
      );

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("does not render sidepanel when lead is null", () => {
      const onClose = vi.fn();

      renderWithProviders(
        <LeadDetailPanel lead={null} isOpen={true} onClose={onClose} />
      );

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  describe("AC #2 - Lead information display", () => {
    it("displays lead full name in header", () => {
      const lead = createMockLead();
      const onClose = vi.fn();

      renderWithProviders(
        <LeadDetailPanel lead={lead} isOpen={true} onClose={onClose} />
      );

      expect(screen.getByText("Joao Silva")).toBeInTheDocument();
    });

    it("displays company name", () => {
      const lead = createMockLead();
      const onClose = vi.fn();

      renderWithProviders(
        <LeadDetailPanel lead={lead} isOpen={true} onClose={onClose} />
      );

      expect(screen.getByText("Empresa ABC")).toBeInTheDocument();
    });

    it("displays job title", () => {
      const lead = createMockLead();
      const onClose = vi.fn();

      renderWithProviders(
        <LeadDetailPanel lead={lead} isOpen={true} onClose={onClose} />
      );

      // Title appears in header and in InfoRow, so use getAllByText
      const titleElements = screen.getAllByText("CEO");
      expect(titleElements.length).toBeGreaterThanOrEqual(1);
    });

    it("displays email with copy button", () => {
      const lead = createMockLead();
      const onClose = vi.fn();

      renderWithProviders(
        <LeadDetailPanel lead={lead} isOpen={true} onClose={onClose} />
      );

      expect(screen.getByText("joao@example.com")).toBeInTheDocument();
      // Should have copy button
      const copyButtons = screen.getAllByText("Copiar");
      expect(copyButtons.length).toBeGreaterThan(0);
    });

    it("displays phone with copy button", () => {
      const lead = createMockLead();
      const onClose = vi.fn();

      renderWithProviders(
        <LeadDetailPanel lead={lead} isOpen={true} onClose={onClose} />
      );

      expect(screen.getByText("+55 11 99999-9999")).toBeInTheDocument();
    });

    it("displays status badge", () => {
      const lead = createMockLead({ status: "interessado" });
      const onClose = vi.fn();

      renderWithProviders(
        <LeadDetailPanel lead={lead} isOpen={true} onClose={onClose} />
      );

      expect(screen.getByText("Interessado")).toBeInTheDocument();
    });

    it("displays imported date formatted as dd/MM/yyyy", () => {
      const lead = createMockLead({ createdAt: "2026-01-15T10:00:00Z" });
      const onClose = vi.fn();

      renderWithProviders(
        <LeadDetailPanel lead={lead} isOpen={true} onClose={onClose} />
      );

      expect(screen.getByText("15/01/2026")).toBeInTheDocument();
    });
  });

  describe("AC #3 - Interaction history section", () => {
    it("displays empty state when no interactions", async () => {
      const lead = createMockLead();
      const onClose = vi.fn();

      renderWithProviders(
        <LeadDetailPanel lead={lead} isOpen={true} onClose={onClose} />
      );

      expect(
        screen.getByText("Nenhuma interação registrada")
      ).toBeInTheDocument();
    });

    it("displays interactions when available", async () => {
      const { useLeadInteractions } = await import(
        "@/hooks/use-lead-interactions"
      );
      vi.mocked(useLeadInteractions).mockReturnValue({
        data: [
          {
            id: "int-1",
            leadId: "lead-123",
            tenantId: "tenant-1",
            type: "note",
            content: "Primeira nota de teste",
            createdAt: "2026-01-15T11:00:00Z",
            createdBy: "user-1",
          },
        ],
        isLoading: false,
        isFetching: false,
        error: null,
        refetch: vi.fn(),
      });

      const lead = createMockLead();
      const onClose = vi.fn();

      renderWithProviders(
        <LeadDetailPanel lead={lead} isOpen={true} onClose={onClose} />
      );

      expect(screen.getByText("Primeira nota de teste")).toBeInTheDocument();
    });
  });

  describe("AC #4 - Add interaction note", () => {
    it("displays 'Adicionar Nota' button", () => {
      const lead = createMockLead();
      const onClose = vi.fn();

      renderWithProviders(
        <LeadDetailPanel lead={lead} isOpen={true} onClose={onClose} />
      );

      expect(screen.getByText("Adicionar Nota")).toBeInTheDocument();
    });

    it("shows textarea when clicking 'Adicionar Nota'", async () => {
      const user = userEvent.setup();
      const lead = createMockLead();
      const onClose = vi.fn();

      renderWithProviders(
        <LeadDetailPanel lead={lead} isOpen={true} onClose={onClose} />
      );

      await user.click(screen.getByText("Adicionar Nota"));

      expect(
        screen.getByPlaceholderText("Digite uma nota...")
      ).toBeInTheDocument();
      expect(screen.getByText("Salvar")).toBeInTheDocument();
      expect(screen.getByText("Cancelar")).toBeInTheDocument();
    });

    it("hides form when clicking 'Cancelar'", async () => {
      const user = userEvent.setup();
      const lead = createMockLead();
      const onClose = vi.fn();

      renderWithProviders(
        <LeadDetailPanel lead={lead} isOpen={true} onClose={onClose} />
      );

      await user.click(screen.getByText("Adicionar Nota"));
      await user.click(screen.getByText("Cancelar"));

      expect(
        screen.queryByPlaceholderText("Digite uma nota...")
      ).not.toBeInTheDocument();
    });

    it("calls createInteraction with correct data when clicking 'Salvar'", async () => {
      const user = userEvent.setup();
      const lead = createMockLead();
      const onClose = vi.fn();
      const mockCreateInteraction = vi.fn();

      const { useCreateInteraction } = await import(
        "@/hooks/use-lead-interactions"
      );
      vi.mocked(useCreateInteraction).mockReturnValue({
        createInteraction: mockCreateInteraction,
        createInteractionAsync: vi.fn(),
        isLoading: false,
        error: null,
        reset: vi.fn(),
      });

      renderWithProviders(
        <LeadDetailPanel lead={lead} isOpen={true} onClose={onClose} />
      );

      await user.click(screen.getByText("Adicionar Nota"));
      await user.type(
        screen.getByPlaceholderText("Digite uma nota..."),
        "Minha nota de teste"
      );
      await user.click(screen.getByText("Salvar"));

      expect(mockCreateInteraction).toHaveBeenCalledWith(
        { content: "Minha nota de teste", type: "note" },
        expect.objectContaining({
          onSuccess: expect.any(Function),
          onError: expect.any(Function),
        })
      );
    });

    it("disables 'Salvar' button when textarea is empty", async () => {
      const user = userEvent.setup();
      const lead = createMockLead();
      const onClose = vi.fn();

      renderWithProviders(
        <LeadDetailPanel lead={lead} isOpen={true} onClose={onClose} />
      );

      await user.click(screen.getByText("Adicionar Nota"));

      const saveButton = screen.getByText("Salvar");
      expect(saveButton).toBeDisabled();
    });
  });

  describe("AC #7 - Close and keyboard accessibility", () => {
    it("calls onClose when clicking close button", async () => {
      const user = userEvent.setup();
      const lead = createMockLead();
      const onClose = vi.fn();

      renderWithProviders(
        <LeadDetailPanel lead={lead} isOpen={true} onClose={onClose} />
      );

      // Find and click the close button (X)
      const closeButton = screen.getByRole("button", { name: /close/i });
      await user.click(closeButton);

      expect(onClose).toHaveBeenCalled();
    });

    it("calls onClose when pressing Escape key", async () => {
      const user = userEvent.setup();
      const lead = createMockLead();
      const onClose = vi.fn();

      renderWithProviders(
        <LeadDetailPanel lead={lead} isOpen={true} onClose={onClose} />
      );

      await user.keyboard("{Escape}");

      expect(onClose).toHaveBeenCalled();
    });
  });

  describe("Copy to clipboard", () => {
    beforeEach(() => {
      mockCopyToClipboard.mockClear();
    });

    it("copies email to clipboard when clicking copy button", async () => {
      const user = userEvent.setup();
      const lead = createMockLead();
      const onClose = vi.fn();

      renderWithProviders(
        <LeadDetailPanel lead={lead} isOpen={true} onClose={onClose} />
      );

      // Find the copy buttons (there should be two - one for email, one for phone)
      const copyButtons = screen.getAllByText("Copiar");
      // Click the first one (email)
      await user.click(copyButtons[0]);

      expect(mockCopyToClipboard).toHaveBeenCalledWith("joao@example.com");
    });

    it("copies phone to clipboard when clicking copy button", async () => {
      const user = userEvent.setup();
      const lead = createMockLead();
      const onClose = vi.fn();

      renderWithProviders(
        <LeadDetailPanel lead={lead} isOpen={true} onClose={onClose} />
      );

      // Find the copy buttons (there should be two - one for email, one for phone)
      const copyButtons = screen.getAllByText("Copiar");
      // Click the second one (phone)
      await user.click(copyButtons[1]);

      expect(mockCopyToClipboard).toHaveBeenCalledWith("+55 11 99999-9999");
    });
  });

  // ==============================================
  // STORY 6.5.6: ICEBREAKER SECTION
  // ==============================================

  describe("Icebreaker Section (Story 6.5.6)", () => {
    it("AC#3: displays Icebreaker section header", () => {
      const lead = createMockLead();
      const onClose = vi.fn();

      renderWithProviders(
        <LeadDetailPanel lead={lead} isOpen={true} onClose={onClose} />
      );

      expect(screen.getByText("Icebreaker")).toBeInTheDocument();
    });

    it("AC#3: shows 'Gerar Icebreaker' button when lead has no icebreaker", () => {
      const lead = createMockLead({ icebreaker: null });
      const onClose = vi.fn();

      renderWithProviders(
        <LeadDetailPanel lead={lead} isOpen={true} onClose={onClose} />
      );

      expect(screen.getByText("Gerar Icebreaker")).toBeInTheDocument();
    });

    it("AC#3: shows icebreaker text when lead has icebreaker", () => {
      const lead = createMockLead({
        icebreaker: "Vi que você postou sobre IA recentemente!",
        icebreakerGeneratedAt: "2026-02-04T10:00:00Z",
      });
      const onClose = vi.fn();

      renderWithProviders(
        <LeadDetailPanel lead={lead} isOpen={true} onClose={onClose} />
      );

      expect(screen.getByText("Vi que você postou sobre IA recentemente!")).toBeInTheDocument();
    });

    it("AC#3: shows 'Regenerar' button when lead has icebreaker", () => {
      const lead = createMockLead({
        icebreaker: "Vi que você postou sobre IA!",
        icebreakerGeneratedAt: "2026-02-04T10:00:00Z",
      });
      const onClose = vi.fn();

      renderWithProviders(
        <LeadDetailPanel lead={lead} isOpen={true} onClose={onClose} />
      );

      expect(screen.getByText("Regenerar")).toBeInTheDocument();
    });

    it("AC#5: shows message when lead has no LinkedIn URL", () => {
      const lead = createMockLead({
        icebreaker: null,
        linkedinUrl: null,
      });
      const onClose = vi.fn();

      renderWithProviders(
        <LeadDetailPanel lead={lead} isOpen={true} onClose={onClose} />
      );

      expect(screen.getByText("Lead sem LinkedIn cadastrado")).toBeInTheDocument();
    });

    it("AC#5: disables 'Gerar Icebreaker' button when no LinkedIn URL", () => {
      const lead = createMockLead({
        icebreaker: null,
        linkedinUrl: null,
      });
      const onClose = vi.fn();

      renderWithProviders(
        <LeadDetailPanel lead={lead} isOpen={true} onClose={onClose} />
      );

      const generateButton = screen.getByText("Gerar Icebreaker");
      expect(generateButton.closest("button")).toBeDisabled();
    });

    it("AC#6: displays generation timestamp when icebreaker exists", () => {
      const lead = createMockLead({
        icebreaker: "Vi que você postou sobre IA!",
        icebreakerGeneratedAt: "2026-02-04T10:30:00Z",
      });
      const onClose = vi.fn();

      renderWithProviders(
        <LeadDetailPanel lead={lead} isOpen={true} onClose={onClose} />
      );

      // Should show timestamp in format "Gerado em DD/MM/YYYY HH:MM"
      expect(screen.getByText(/Gerado em 04\/02\/2026 10:30/)).toBeInTheDocument();
    });

    it("AC#6: does not display timestamp when no icebreaker", () => {
      const lead = createMockLead({
        icebreaker: null,
        icebreakerGeneratedAt: null,
      });
      const onClose = vi.fn();

      renderWithProviders(
        <LeadDetailPanel lead={lead} isOpen={true} onClose={onClose} />
      );

      expect(screen.queryByText(/Gerado em/)).not.toBeInTheDocument();
    });
  });
});
