/**
 * LeadPreviewPanel Component Tests
 * Story 4.3: Lead Detail View & Interaction History
 *
 * AC: #6 - Simplified preview for Apollo search leads
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LeadPreviewPanel } from "@/components/leads/LeadPreviewPanel";
import type { Lead } from "@/types/lead";

// Mock sonner toast
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock import leads hook
const mockMutateAsync = vi.fn();
vi.mock("@/hooks/use-import-leads", () => ({
  useImportLeads: () => ({
    mutate: vi.fn(),
    mutateAsync: mockMutateAsync,
    isPending: false,
    error: null,
  }),
  LeadDataForImport: {},
}));

// ==============================================
// HELPER: Create mock lead
// ==============================================

function createMockLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: "lead-123",
    tenantId: "tenant-1",
    apolloId: "apollo-12345",
    firstName: "Maria",
    lastName: "Santos",
    email: "maria@example.com",
    phone: "+55 11 88888-8888",
    companyName: "Tech Corp",
    companySize: "201-500",
    industry: "Software",
    location: "Rio de Janeiro, BR",
    title: "CTO",
    linkedinUrl: "https://linkedin.com/in/mariasantos",
    hasEmail: true,
    hasDirectPhone: "Yes",
    status: "novo",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    _isImported: false, // Not imported (Apollo lead)
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

describe("LeadPreviewPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMutateAsync.mockResolvedValue({ message: "Lead importado com sucesso" });
  });

  describe("AC #6 - Simplified preview for Apollo leads", () => {
    it("renders sidepanel when isOpen is true", () => {
      const lead = createMockLead();
      const onClose = vi.fn();

      renderWithProviders(
        <LeadPreviewPanel lead={lead} isOpen={true} onClose={onClose} />
      );

      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    it("does not render sidepanel when isOpen is false", () => {
      const lead = createMockLead();
      const onClose = vi.fn();

      renderWithProviders(
        <LeadPreviewPanel lead={lead} isOpen={false} onClose={onClose} />
      );

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("displays lead full name in header", () => {
      const lead = createMockLead();
      const onClose = vi.fn();

      renderWithProviders(
        <LeadPreviewPanel lead={lead} isOpen={true} onClose={onClose} />
      );

      expect(screen.getByText("Maria Santos")).toBeInTheDocument();
    });

    it("displays lead info without interaction history section", () => {
      const lead = createMockLead();
      const onClose = vi.fn();

      renderWithProviders(
        <LeadPreviewPanel lead={lead} isOpen={true} onClose={onClose} />
      );

      // Should have lead info
      expect(screen.getByText("Tech Corp")).toBeInTheDocument();
      expect(screen.getByText("CTO")).toBeInTheDocument();

      // Should NOT have interaction history (only has message about importing)
      expect(
        screen.queryByText("Historico de Interacoes")
      ).not.toBeInTheDocument();
    });

    it("shows 'Importar Lead' button for non-imported leads", () => {
      const lead = createMockLead({ _isImported: false });
      const onClose = vi.fn();

      renderWithProviders(
        <LeadPreviewPanel lead={lead} isOpen={true} onClose={onClose} />
      );

      expect(screen.getByText("Importar Lead")).toBeInTheDocument();
    });

    it("shows 'ja foi importado' message for imported leads", () => {
      const lead = createMockLead({ _isImported: true });
      const onClose = vi.fn();

      renderWithProviders(
        <LeadPreviewPanel lead={lead} isOpen={true} onClose={onClose} />
      );

      expect(
        screen.getByText('Este lead ja foi importado para "Meus Leads".')
      ).toBeInTheDocument();
    });

    it("calls import when clicking 'Importar Lead'", async () => {
      const user = userEvent.setup();
      const lead = createMockLead({ _isImported: false });
      const onClose = vi.fn();
      const onImportSuccess = vi.fn();

      renderWithProviders(
        <LeadPreviewPanel
          lead={lead}
          isOpen={true}
          onClose={onClose}
          onImportSuccess={onImportSuccess}
        />
      );

      await user.click(screen.getByText("Importar Lead"));

      expect(mockMutateAsync).toHaveBeenCalled();
    });

    it("displays email with copy button", () => {
      const lead = createMockLead();
      const onClose = vi.fn();

      renderWithProviders(
        <LeadPreviewPanel lead={lead} isOpen={true} onClose={onClose} />
      );

      expect(screen.getByText("maria@example.com")).toBeInTheDocument();
      const copyButtons = screen.getAllByText("Copiar");
      expect(copyButtons.length).toBeGreaterThan(0);
    });

    it("displays phone with copy button", () => {
      const lead = createMockLead();
      const onClose = vi.fn();

      renderWithProviders(
        <LeadPreviewPanel lead={lead} isOpen={true} onClose={onClose} />
      );

      expect(screen.getByText("+55 11 88888-8888")).toBeInTheDocument();
    });

    it("displays location", () => {
      const lead = createMockLead();
      const onClose = vi.fn();

      renderWithProviders(
        <LeadPreviewPanel lead={lead} isOpen={true} onClose={onClose} />
      );

      expect(screen.getByText("Rio de Janeiro, BR")).toBeInTheDocument();
    });

    it("displays status badge", () => {
      const lead = createMockLead({ status: "novo" });
      const onClose = vi.fn();

      renderWithProviders(
        <LeadPreviewPanel lead={lead} isOpen={true} onClose={onClose} />
      );

      expect(screen.getByText("Novo")).toBeInTheDocument();
    });

    it("shows message about importing to enable interaction history", () => {
      const lead = createMockLead({ _isImported: false });
      const onClose = vi.fn();

      renderWithProviders(
        <LeadPreviewPanel lead={lead} isOpen={true} onClose={onClose} />
      );

      expect(
        screen.getByText(
          "Importe o lead para habilitar o historico de interacoes."
        )
      ).toBeInTheDocument();
    });
  });

  describe("Accessibility", () => {
    it("calls onClose when clicking close button", async () => {
      const user = userEvent.setup();
      const lead = createMockLead();
      const onClose = vi.fn();

      renderWithProviders(
        <LeadPreviewPanel lead={lead} isOpen={true} onClose={onClose} />
      );

      const closeButton = screen.getByRole("button", { name: /close/i });
      await user.click(closeButton);

      expect(onClose).toHaveBeenCalled();
    });
  });
});
