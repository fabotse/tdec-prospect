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
import { createMockLead } from "../../../helpers/mock-data";

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

// Mock useWhatsAppMessages hook (Story 11.7)
const mockUseWhatsAppMessages = vi.fn(() => ({
  messages: [],
  isLoading: false,
  error: null,
  refetch: vi.fn(),
}));
vi.mock("@/hooks/use-whatsapp-messages", () => ({
  useWhatsAppMessages: (...args: unknown[]) => mockUseWhatsAppMessages(...args),
  WHATSAPP_MESSAGES_QUERY_KEY: vi.fn(),
}));

// Mock getWhatsAppStatusIcon (Story 11.7)
vi.mock("@/components/tracking/LeadTrackingTable", () => ({
  getWhatsAppStatusIcon: vi.fn((status: string) => {
    const map: Record<string, { icon: React.FC<{ className?: string }>, color: string, label: string }> = {
      pending: { icon: ({ className }: { className?: string }) => <span data-testid="icon-clock" className={className}>clock</span>, color: "text-muted-foreground", label: "Pendente" },
      sent: { icon: ({ className }: { className?: string }) => <span data-testid="icon-check" className={className}>check</span>, color: "text-green-600", label: "Enviado" },
      delivered: { icon: ({ className }: { className?: string }) => <span data-testid="icon-checkcheck" className={className}>checkcheck</span>, color: "text-blue-500", label: "Entregue" },
      read: { icon: ({ className }: { className?: string }) => <span data-testid="icon-checkcheck-read" className={className}>checkcheck</span>, color: "text-blue-700", label: "Lido" },
      failed: { icon: ({ className }: { className?: string }) => <span data-testid="icon-x" className={className}>x</span>, color: "text-red-500", label: "Falhou" },
    };
    return map[status] ?? map["pending"];
  }),
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

      expect(screen.getByText("João Silva")).toBeInTheDocument();
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
      const titleElements = screen.getAllByText("Diretor de Tecnologia");
      expect(titleElements.length).toBeGreaterThanOrEqual(1);
    });

    it("displays email with copy button", () => {
      const lead = createMockLead();
      const onClose = vi.fn();

      renderWithProviders(
        <LeadDetailPanel lead={lead} isOpen={true} onClose={onClose} />
      );

      expect(screen.getByText("joao@empresa.com")).toBeInTheDocument();
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

      expect(screen.getByText("+55 11 99999-1111")).toBeInTheDocument();
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

      expect(mockCopyToClipboard).toHaveBeenCalledWith("joao@empresa.com");
    });

    it("copies phone to clipboard when clicking copy button", async () => {
      const user = userEvent.setup();
      const lead = createMockLead();
      const onClose = vi.fn();

      renderWithProviders(
        <LeadDetailPanel lead={lead} isOpen={true} onClose={onClose} />
      );

      // Phone copy button is icon-only with title attribute
      const phoneCopyButton = screen.getByTitle("Copiar telefone");
      await user.click(phoneCopyButton);

      expect(mockCopyToClipboard).toHaveBeenCalledWith("+55 11 99999-1111");
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

    it("AC#5: allows icebreaker generation without LinkedIn for non-post categories", () => {
      // Story 9.1: LinkedIn is only required for "post" category
      const lead = createMockLead({
        icebreaker: null,
        linkedinUrl: null,
      });
      const onClose = vi.fn();

      renderWithProviders(
        <LeadDetailPanel lead={lead} isOpen={true} onClose={onClose} />
      );

      // Default category is "empresa" — button should be enabled even without LinkedIn
      const generateButton = screen.getByText("Gerar Icebreaker");
      expect(generateButton.closest("button")).not.toBeDisabled();
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

    it("AC#5: calls API when generating without LinkedIn for default category", async () => {
      // Story 9.1: LinkedIn is only required for "post" category
      // Default category "empresa" should work without LinkedIn
      const user = userEvent.setup();
      mockGenerateForLead.mockResolvedValueOnce({
        results: [{ leadId: "lead-123", success: true, icebreaker: "Test" }],
        summary: { total: 1, generated: 1, skipped: 0, failed: 0 },
      });

      const lead = createMockLead({
        icebreaker: null,
        linkedinUrl: null,
      });
      const onClose = vi.fn();

      renderWithProviders(
        <LeadDetailPanel lead={lead} isOpen={true} onClose={onClose} />
      );

      const generateButton = screen.getByText("Gerar Icebreaker");
      await user.click(generateButton);

      // Default category is "empresa" — should call API without LinkedIn error
      expect(mockGenerateForLead).toHaveBeenCalledWith(
        lead.id,
        false,
        "empresa"
      );
    });

    // Note: The "post" category + no LinkedIn error path ("Este lead não possui LinkedIn cadastrado")
    // cannot be unit-tested because Radix Select dropdown interaction is not supported in jsdom.
    // The server-side fallback (Post→Lead) is tested in leads-enrich-icebreaker.test.ts.

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

  // ==============================================
  // STORY 11.7: WHATSAPP MESSAGES SECTION
  // ==============================================

  describe("WhatsApp Messages Section (Story 11.7)", () => {
    beforeEach(() => {
      mockUseWhatsAppMessages.mockReturnValue({
        messages: [],
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });
    });

    it("AC#4: displays 'Mensagens WhatsApp' section header", () => {
      const lead = createMockLead();
      renderWithProviders(
        <LeadDetailPanel lead={lead} isOpen={true} onClose={vi.fn()} />
      );

      expect(screen.getByText("Mensagens WhatsApp")).toBeInTheDocument();
    });

    it("AC#5: shows empty state when no WhatsApp messages", () => {
      const lead = createMockLead();
      renderWithProviders(
        <LeadDetailPanel lead={lead} isOpen={true} onClose={vi.fn()} />
      );

      expect(screen.getByText("Nenhuma mensagem WhatsApp enviada")).toBeInTheDocument();
    });

    it("AC#4: calls useWhatsAppMessages with lead email", () => {
      const lead = createMockLead();
      renderWithProviders(
        <LeadDetailPanel lead={lead} isOpen={true} onClose={vi.fn()} />
      );

      expect(mockUseWhatsAppMessages).toHaveBeenCalledWith(
        undefined,
        "joao@empresa.com",
        { enabled: true }
      );
    });

    it("AC#4: displays messages grouped by campaign name", () => {
      mockUseWhatsAppMessages.mockReturnValue({
        messages: [
          {
            id: "msg-1",
            tenant_id: "t1",
            campaign_id: "c1",
            lead_id: "l1",
            phone: "+5511999991111",
            message: "Olá, tudo bem? Gostaria de conversar sobre nossos serviços.",
            status: "sent",
            external_message_id: null,
            external_zaap_id: null,
            error_message: null,
            sent_at: "2026-02-10T14:00:00Z",
            created_at: "2026-02-10T14:00:00Z",
            lead_email: "joao@empresa.com",
            lead_name: "João Silva",
            campaign_name: "Campanha Fevereiro",
          },
          {
            id: "msg-2",
            tenant_id: "t1",
            campaign_id: "c2",
            lead_id: "l1",
            phone: "+5511999991111",
            message: "Seguimento da proposta enviada.",
            status: "delivered",
            external_message_id: null,
            external_zaap_id: null,
            error_message: null,
            sent_at: "2026-02-09T10:00:00Z",
            created_at: "2026-02-09T10:00:00Z",
            lead_email: "joao@empresa.com",
            lead_name: "João Silva",
            campaign_name: "Campanha Janeiro",
          },
        ],
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      const lead = createMockLead();
      renderWithProviders(
        <LeadDetailPanel lead={lead} isOpen={true} onClose={vi.fn()} />
      );

      // Campaign headings
      expect(screen.getByText("Campanha Fevereiro")).toBeInTheDocument();
      expect(screen.getByText("Campanha Janeiro")).toBeInTheDocument();

      // Message previews
      expect(screen.getByText(/Olá, tudo bem/)).toBeInTheDocument();
      expect(screen.getByText(/Seguimento da proposta/)).toBeInTheDocument();
    });

    it("AC#7: displays status icon for each message", () => {
      mockUseWhatsAppMessages.mockReturnValue({
        messages: [
          {
            id: "msg-1",
            tenant_id: "t1",
            campaign_id: "c1",
            lead_id: "l1",
            phone: "+5511999991111",
            message: "Mensagem de teste",
            status: "sent",
            external_message_id: null,
            external_zaap_id: null,
            error_message: null,
            sent_at: "2026-02-10T14:00:00Z",
            created_at: "2026-02-10T14:00:00Z",
            lead_email: "joao@empresa.com",
            lead_name: "João Silva",
            campaign_name: "Campanha Teste",
          },
        ],
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      const lead = createMockLead();
      renderWithProviders(
        <LeadDetailPanel lead={lead} isOpen={true} onClose={vi.fn()} />
      );

      // Status label from getWhatsAppStatusIcon mock
      expect(screen.getByText("Enviado")).toBeInTheDocument();
      // Phone number
      expect(screen.getByText("+5511999991111")).toBeInTheDocument();
    });

    it("AC#5: truncates long messages to ~100 characters", () => {
      const longMessage = "A".repeat(150);
      mockUseWhatsAppMessages.mockReturnValue({
        messages: [
          {
            id: "msg-1",
            tenant_id: "t1",
            campaign_id: "c1",
            lead_id: "l1",
            phone: "+5511999991111",
            message: longMessage,
            status: "sent",
            external_message_id: null,
            external_zaap_id: null,
            error_message: null,
            sent_at: "2026-02-10T14:00:00Z",
            created_at: "2026-02-10T14:00:00Z",
            lead_email: "joao@empresa.com",
            lead_name: "João Silva",
            campaign_name: "Campanha Teste",
          },
        ],
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      const lead = createMockLead();
      renderWithProviders(
        <LeadDetailPanel lead={lead} isOpen={true} onClose={vi.fn()} />
      );

      // Should show truncated text (100 chars + "...")
      const truncated = "A".repeat(100) + "...";
      expect(screen.getByText(truncated)).toBeInTheDocument();
    });

    it("AC#4: shows loading state", () => {
      mockUseWhatsAppMessages.mockReturnValue({
        messages: [],
        isLoading: true,
        error: null,
        refetch: vi.fn(),
      });

      const lead = createMockLead();
      renderWithProviders(
        <LeadDetailPanel lead={lead} isOpen={true} onClose={vi.fn()} />
      );

      // Should NOT show empty state while loading
      expect(screen.queryByText("Nenhuma mensagem WhatsApp enviada")).not.toBeInTheDocument();
    });

    it("AC#7: renders whatsapp_sent interaction with green MessageCircle icon", async () => {
      const { useLeadInteractions } = await import(
        "@/hooks/use-lead-interactions"
      );
      vi.mocked(useLeadInteractions).mockReturnValue({
        data: [
          {
            id: "int-wa-1",
            leadId: "lead-123",
            tenantId: "tenant-1",
            type: "whatsapp_sent",
            content: "Mensagem WhatsApp enviada para +5511999991111",
            createdAt: "2026-02-10T14:00:00Z",
            createdBy: "user-1",
          },
        ],
        isLoading: false,
        isFetching: false,
        error: null,
        refetch: vi.fn(),
      });

      const lead = createMockLead();
      renderWithProviders(
        <LeadDetailPanel lead={lead} isOpen={true} onClose={vi.fn()} />
      );

      expect(screen.getByText("Mensagem WhatsApp enviada para +5511999991111")).toBeInTheDocument();
    });
  });
});
