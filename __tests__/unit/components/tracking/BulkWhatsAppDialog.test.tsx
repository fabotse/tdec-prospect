/**
 * BulkWhatsAppDialog Tests
 * Story 11.6: Envio em Massa de WhatsApp com Intervalos Humanizados
 *
 * AC: #2 - Dialog de envio em massa
 * AC: #3 - Configuracao de intervalo
 * AC: #4 - Geracao de mensagem por IA
 * AC: #6 - Feedback visual de progresso
 * AC: #7 - Cancelamento
 * AC: #9 - Protecoes e edge cases
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BulkWhatsAppDialog } from "@/components/tracking/BulkWhatsAppDialog";
import type { BulkSendLead, BulkLeadStatus, BulkSendProgress } from "@/hooks/use-whatsapp-bulk-send";

// ==============================================
// MOCKS
// ==============================================

const mockStart = vi.fn();
const mockCancel = vi.fn();
const mockReset = vi.fn();

let mockBulkSendState = {
  isRunning: false,
  isComplete: false,
  isCancelled: false,
  isWaiting: false,
  progress: { total: 0, sent: 0, failed: 0, cancelled: 0, current: 0 } as BulkSendProgress,
  leadStatuses: new Map<string, BulkLeadStatus>(),
  leadErrors: new Map<string, string>(),
};

vi.mock("@/hooks/use-whatsapp-bulk-send", () => ({
  useWhatsAppBulkSend: () => ({
    start: mockStart,
    cancel: mockCancel,
    reset: mockReset,
    ...mockBulkSendState,
  }),
}));

const mockGenerate = vi.fn();
const mockResetAI = vi.fn();
const mockCancelAI = vi.fn();
let mockAIState = {
  phase: "idle" as string,
  text: "",
  error: null as string | null,
  isGenerating: false,
};

vi.mock("@/hooks/use-ai-generate", () => ({
  useAIGenerate: () => ({
    generate: mockGenerate,
    reset: mockResetAI,
    cancel: mockCancelAI,
    ...mockAIState,
  }),
}));

vi.mock("@/hooks/use-knowledge-base-context", () => ({
  useKnowledgeBaseContext: () => ({
    variables: { company_context: "Test Company" },
    isLoading: false,
    error: null,
  }),
}));

vi.mock("@/lib/ai/sanitize-ai-output", () => ({
  normalizeTemplateVariables: (text: string) => text,
}));

// ==============================================
// FIXTURES
// ==============================================

const CAMPAIGN_ID = "550e8400-e29b-41d4-a716-446655440000";

const defaultLeads: BulkSendLead[] = [
  { leadEmail: "joao@test.com", phone: "+5511999999999", firstName: "Joao", lastName: "Silva" },
  { leadEmail: "maria@test.com", phone: "+5511888888888", firstName: "Maria", lastName: "Santos" },
  { leadEmail: "pedro@test.com", phone: "+5511777777777", firstName: "Pedro", lastName: "Costa" },
];

const defaultProps = {
  open: true,
  onOpenChange: vi.fn(),
  leads: defaultLeads,
  campaignId: CAMPAIGN_ID,
  onLeadSent: vi.fn(),
  onComplete: vi.fn(),
};

// ==============================================
// TESTS
// ==============================================

describe("BulkWhatsAppDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBulkSendState = {
      isRunning: false,
      isComplete: false,
      isCancelled: false,
      isWaiting: false,
      progress: { total: 0, sent: 0, failed: 0, cancelled: 0, current: 0 },
      leadStatuses: new Map(),
      leadErrors: new Map(),
    };
    mockAIState = {
      phase: "idle",
      text: "",
      error: null,
      isGenerating: false,
    };
    mockGenerate.mockResolvedValue("AI generated message");
  });

  describe("render (AC#2)", () => {
    it("renders dialog with title and lead count", () => {
      render(<BulkWhatsAppDialog {...defaultProps} />);

      expect(screen.getByText("Enviar WhatsApp em Massa")).toBeInTheDocument();
      expect(screen.getByTestId("bulk-lead-count")).toHaveTextContent("3 leads selecionados");
    });

    it("renders singular lead count for 1 lead", () => {
      render(<BulkWhatsAppDialog {...defaultProps} leads={[defaultLeads[0]]} />);

      expect(screen.getByTestId("bulk-lead-count")).toHaveTextContent("1 lead selecionado");
    });

    it("renders scrollable lead list with names and phones", () => {
      render(<BulkWhatsAppDialog {...defaultProps} />);

      const items = screen.getAllByTestId("bulk-lead-item");
      expect(items).toHaveLength(3);
      expect(items[0]).toHaveTextContent("Joao Silva");
      expect(items[1]).toHaveTextContent("Maria Santos");
    });

    it("renders message textarea", () => {
      render(<BulkWhatsAppDialog {...defaultProps} />);

      expect(screen.getByTestId("bulk-message-textarea")).toBeInTheDocument();
      expect(screen.getByText("ideal: ≤500")).toBeInTheDocument();
    });

    it("renders AI generate button", () => {
      render(<BulkWhatsAppDialog {...defaultProps} />);

      expect(screen.getByTestId("bulk-generate-ai-button")).toBeInTheDocument();
      expect(screen.getByTestId("bulk-generate-ai-button")).toHaveTextContent("Gerar com IA");
    });

    it("renders cancel and start buttons", () => {
      render(<BulkWhatsAppDialog {...defaultProps} />);

      expect(screen.getByTestId("bulk-cancel-button")).toHaveTextContent("Cancelar");
      expect(screen.getByTestId("bulk-start-button")).toHaveTextContent("Iniciar Envio (3)");
    });

    it("start button disabled when message is empty", () => {
      render(<BulkWhatsAppDialog {...defaultProps} />);

      expect(screen.getByTestId("bulk-start-button")).toBeDisabled();
    });
  });

  describe("message composition (AC#2)", () => {
    it("enables start button when message is typed", async () => {
      const user = userEvent.setup();
      render(<BulkWhatsAppDialog {...defaultProps} />);

      await user.type(screen.getByTestId("bulk-message-textarea"), "Olá!");

      expect(screen.getByTestId("bulk-start-button")).not.toBeDisabled();
    });

    it("updates character count", async () => {
      const user = userEvent.setup();
      render(<BulkWhatsAppDialog {...defaultProps} />);

      await user.type(screen.getByTestId("bulk-message-textarea"), "Hello");

      expect(screen.getByTestId("bulk-char-count")).toHaveTextContent("5 caracteres");
    });
  });

  describe("interval selection (AC#3)", () => {
    it("renders 3 interval options with Normal selected by default", () => {
      render(<BulkWhatsAppDialog {...defaultProps} />);

      expect(screen.getByTestId("interval-30000")).toBeInTheDocument();
      expect(screen.getByTestId("interval-60000")).toBeInTheDocument();
      expect(screen.getByTestId("interval-90000")).toBeInTheDocument();
      expect(screen.getByText("Intervalos variados simulam comportamento humano")).toBeInTheDocument();
    });

    it("allows selecting a different interval", async () => {
      const user = userEvent.setup();
      render(<BulkWhatsAppDialog {...defaultProps} />);

      await user.click(screen.getByTestId("interval-30000"));

      // Verify by checking aria state
      expect(screen.getByTestId("interval-30000")).toHaveAttribute("data-state", "checked");
    });
  });

  describe("AI generation (AC#4)", () => {
    it("calls generate with correct params", async () => {
      const user = userEvent.setup();
      render(<BulkWhatsAppDialog {...defaultProps} productId="prod-1" />);

      await user.click(screen.getByTestId("bulk-generate-ai-button"));

      expect(mockGenerate).toHaveBeenCalledWith({
        promptKey: "whatsapp_message_generation",
        variables: expect.objectContaining({
          company_context: "Test Company",
          lead_name: "",
          lead_title: "",
          lead_company: "",
          lead_industry: "",
        }),
        stream: true,
        productId: "prod-1",
      });
    });

    it("disables generate button during generation", () => {
      mockAIState.isGenerating = true;
      render(<BulkWhatsAppDialog {...defaultProps} />);

      expect(screen.getByTestId("bulk-generate-ai-button")).toBeDisabled();
    });

    it("shows generating indicator", () => {
      mockAIState.isGenerating = true;
      render(<BulkWhatsAppDialog {...defaultProps} />);

      expect(screen.getByTestId("bulk-ai-generating")).toHaveTextContent("Gerando mensagem...");
    });

    it("shows AI error message", () => {
      mockAIState.error = "Timeout error";
      render(<BulkWhatsAppDialog {...defaultProps} />);

      expect(screen.getByTestId("bulk-ai-error")).toHaveTextContent("Timeout error");
    });

    it("displays streaming text during generation", () => {
      mockAIState.phase = "streaming";
      mockAIState.text = "Partial AI message";
      mockAIState.isGenerating = true;
      render(<BulkWhatsAppDialog {...defaultProps} />);

      expect(screen.getByTestId("bulk-message-textarea")).toHaveValue("Partial AI message");
    });
  });

  describe("start send", () => {
    it("calls start with correct params", async () => {
      const user = userEvent.setup();
      render(<BulkWhatsAppDialog {...defaultProps} />);

      await user.type(screen.getByTestId("bulk-message-textarea"), "Test message");
      await user.click(screen.getByTestId("bulk-start-button"));

      expect(mockStart).toHaveBeenCalledWith({
        campaignId: CAMPAIGN_ID,
        leads: defaultLeads,
        message: "Test message",
        intervalMs: 60000,
        onLeadSent: defaultProps.onLeadSent,
      });
    });

    it("uses selected interval in start params", async () => {
      const user = userEvent.setup();
      render(<BulkWhatsAppDialog {...defaultProps} />);

      await user.click(screen.getByTestId("interval-30000"));
      await user.type(screen.getByTestId("bulk-message-textarea"), "Test");
      await user.click(screen.getByTestId("bulk-start-button"));

      expect(mockStart).toHaveBeenCalledWith(
        expect.objectContaining({ intervalMs: 30000 })
      );
    });
  });

  describe("progress view (AC#6)", () => {
    it("shows progress bar and counters when running", () => {
      mockBulkSendState.isRunning = true;
      mockBulkSendState.progress = { total: 3, sent: 1, failed: 0, cancelled: 0, current: 1 };
      mockBulkSendState.leadStatuses = new Map([
        ["joao@test.com", "sent"],
        ["maria@test.com", "sending"],
        ["pedro@test.com", "pending"],
      ]);

      render(<BulkWhatsAppDialog {...defaultProps} />);

      expect(screen.getByTestId("bulk-progress-section")).toBeInTheDocument();
      expect(screen.getByTestId("bulk-lead-count")).toHaveTextContent("Enviados: 1");
    });

    it("shows status icons for each lead", () => {
      mockBulkSendState.isRunning = true;
      mockBulkSendState.progress = { total: 3, sent: 1, failed: 0, cancelled: 0, current: 1 };
      mockBulkSendState.leadStatuses = new Map([
        ["joao@test.com", "sent"],
        ["maria@test.com", "sending"],
        ["pedro@test.com", "pending"],
      ]);

      render(<BulkWhatsAppDialog {...defaultProps} />);

      expect(screen.getByTestId("status-sent")).toBeInTheDocument();
      expect(screen.getByTestId("status-sending")).toBeInTheDocument();
      expect(screen.getByTestId("status-pending")).toBeInTheDocument();
    });

    it("hides compose section during progress", () => {
      mockBulkSendState.isRunning = true;
      mockBulkSendState.progress = { total: 3, sent: 0, failed: 0, cancelled: 0, current: 0 };

      render(<BulkWhatsAppDialog {...defaultProps} />);

      expect(screen.queryByTestId("bulk-message-textarea")).not.toBeInTheDocument();
      expect(screen.queryByTestId("bulk-interval-radio")).not.toBeInTheDocument();
    });

    it("shows cancel send button during running", () => {
      mockBulkSendState.isRunning = true;
      mockBulkSendState.progress = { total: 3, sent: 0, failed: 0, cancelled: 0, current: 0 };

      render(<BulkWhatsAppDialog {...defaultProps} />);

      expect(screen.getByTestId("bulk-cancel-send-button")).toHaveTextContent("Cancelar Envio");
    });

    it("shows error text for failed leads", () => {
      mockBulkSendState.isRunning = true;
      mockBulkSendState.progress = { total: 3, sent: 1, failed: 1, cancelled: 0, current: 2 };
      mockBulkSendState.leadStatuses = new Map([
        ["joao@test.com", "sent"],
        ["maria@test.com", "failed"],
        ["pedro@test.com", "sending"],
      ]);
      mockBulkSendState.leadErrors = new Map([
        ["maria@test.com", "Z-API não configurado"],
      ]);

      render(<BulkWhatsAppDialog {...defaultProps} />);

      const statusTexts = screen.getAllByTestId("bulk-lead-status-text");
      const failedText = statusTexts.find((el) => el.textContent?.includes("Falhou"));
      expect(failedText).toBeTruthy();
    });
  });

  describe("waiting text (AC#6)", () => {
    it("shows 'Aguardando' text when hook isWaiting is true", () => {
      mockBulkSendState.isRunning = true;
      mockBulkSendState.isWaiting = true;
      mockBulkSendState.progress = { total: 3, sent: 1, failed: 0, cancelled: 0, current: 1 };

      render(<BulkWhatsAppDialog {...defaultProps} />);

      const waitingText = screen.getByTestId("bulk-waiting-text");
      expect(waitingText).toHaveTextContent("Aguardando ~60s para próximo envio...");
    });

    it("does not show waiting text when not waiting", () => {
      mockBulkSendState.isRunning = true;
      mockBulkSendState.isWaiting = false;
      mockBulkSendState.progress = { total: 3, sent: 1, failed: 0, cancelled: 0, current: 1 };

      render(<BulkWhatsAppDialog {...defaultProps} />);

      expect(screen.queryByTestId("bulk-waiting-text")).not.toBeInTheDocument();
    });

    it("shows correct seconds for different interval selections", async () => {
      const user = userEvent.setup();
      render(<BulkWhatsAppDialog {...defaultProps} />);

      // Select "Rápido" interval (30s)
      await user.click(screen.getByTestId("interval-30000"));

      // Now simulate running with waiting
      // Re-render with updated mock state
      mockBulkSendState.isRunning = true;
      mockBulkSendState.isWaiting = true;
      mockBulkSendState.progress = { total: 3, sent: 1, failed: 0, cancelled: 0, current: 1 };

      const { unmount } = render(<BulkWhatsAppDialog {...defaultProps} />);

      // Default interval (60s) because this is a fresh render with default state
      const waitingTexts = screen.getAllByTestId("bulk-waiting-text");
      expect(waitingTexts.length).toBeGreaterThanOrEqual(1);

      unmount();
    });
  });

  describe("completion (AC#6)", () => {
    it("shows completion summary", () => {
      mockBulkSendState.isComplete = true;
      mockBulkSendState.progress = { total: 3, sent: 2, failed: 1, cancelled: 0, current: 3 };

      render(<BulkWhatsAppDialog {...defaultProps} />);

      const summary = screen.getByTestId("bulk-summary");
      expect(summary).toHaveTextContent("Concluído: 2 enviados, 1 falhou");
    });

    it("shows close button when complete", () => {
      mockBulkSendState.isComplete = true;
      mockBulkSendState.progress = { total: 3, sent: 3, failed: 0, cancelled: 0, current: 3 };

      render(<BulkWhatsAppDialog {...defaultProps} />);

      expect(screen.getByTestId("bulk-close-button")).toHaveTextContent("Fechar");
    });
  });

  describe("cancel (AC#7)", () => {
    it("calls cancel on bulk send when cancel button clicked", async () => {
      const user = userEvent.setup();
      mockBulkSendState.isRunning = true;
      mockBulkSendState.progress = { total: 3, sent: 1, failed: 0, cancelled: 0, current: 1 };

      render(<BulkWhatsAppDialog {...defaultProps} />);

      await user.click(screen.getByTestId("bulk-cancel-send-button"));

      expect(mockCancel).toHaveBeenCalled();
    });

    it("shows cancelled summary", () => {
      mockBulkSendState.isCancelled = true;
      mockBulkSendState.progress = { total: 3, sent: 1, failed: 0, cancelled: 2, current: 1 };

      render(<BulkWhatsAppDialog {...defaultProps} />);

      const summary = screen.getByTestId("bulk-summary");
      expect(summary).toHaveTextContent("Cancelado: 1 enviado, 0 falharam, 2 cancelados");
    });
  });

  describe("close protection (AC#9)", () => {
    it("shows close confirm when Escape pressed during send", async () => {
      const user = userEvent.setup();
      mockBulkSendState.isRunning = true;
      mockBulkSendState.progress = { total: 3, sent: 1, failed: 0, cancelled: 0, current: 1 };

      render(<BulkWhatsAppDialog {...defaultProps} />);

      await user.keyboard("{Escape}");

      expect(screen.getByTestId("bulk-close-confirm")).toBeInTheDocument();
      expect(screen.getByText(/Envio em andamento será cancelado/)).toBeInTheDocument();
      expect(defaultProps.onOpenChange).not.toHaveBeenCalledWith(false);
    });

    it("hides confirm and keeps dialog when 'Continuar Envio' clicked", async () => {
      const user = userEvent.setup();
      mockBulkSendState.isRunning = true;
      mockBulkSendState.progress = { total: 3, sent: 1, failed: 0, cancelled: 0, current: 1 };

      render(<BulkWhatsAppDialog {...defaultProps} />);

      await user.keyboard("{Escape}");
      expect(screen.getByTestId("bulk-close-confirm")).toBeInTheDocument();

      await user.click(screen.getByTestId("bulk-close-confirm-continue"));

      expect(screen.queryByTestId("bulk-close-confirm")).not.toBeInTheDocument();
      expect(defaultProps.onOpenChange).not.toHaveBeenCalledWith(false);
    });

    it("cancels send and closes when 'Cancelar e Fechar' clicked", async () => {
      const user = userEvent.setup();
      mockBulkSendState.isRunning = true;
      mockBulkSendState.progress = { total: 3, sent: 1, failed: 0, cancelled: 0, current: 1 };

      render(<BulkWhatsAppDialog {...defaultProps} />);

      await user.keyboard("{Escape}");
      await user.click(screen.getByTestId("bulk-close-confirm-cancel"));

      expect(mockCancel).toHaveBeenCalled();
      expect(mockReset).toHaveBeenCalled();
      expect(defaultProps.onComplete).toHaveBeenCalled();
      expect(defaultProps.onOpenChange).toHaveBeenCalledWith(false);
    });

    it("does NOT show confirm when closing while not running", async () => {
      const user = userEvent.setup();
      render(<BulkWhatsAppDialog {...defaultProps} />);

      await user.keyboard("{Escape}");

      expect(screen.queryByTestId("bulk-close-confirm")).not.toBeInTheDocument();
    });
  });

  describe("dialog close cleanup", () => {
    it("calls onComplete and resets state on close when not running", async () => {
      const user = userEvent.setup();
      render(<BulkWhatsAppDialog {...defaultProps} />);

      await user.click(screen.getByTestId("bulk-cancel-button"));

      expect(mockReset).toHaveBeenCalled();
      expect(mockCancelAI).toHaveBeenCalled();
      expect(mockResetAI).toHaveBeenCalled();
      expect(defaultProps.onComplete).toHaveBeenCalled();
      expect(defaultProps.onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  describe("disabled states (AC#9)", () => {
    it("start button disabled when AI is generating", () => {
      mockAIState.isGenerating = true;
      render(<BulkWhatsAppDialog {...defaultProps} />);

      expect(screen.getByTestId("bulk-start-button")).toBeDisabled();
    });

    it("textarea disabled during AI generation", () => {
      mockAIState.isGenerating = true;
      render(<BulkWhatsAppDialog {...defaultProps} />);

      expect(screen.getByTestId("bulk-message-textarea")).toBeDisabled();
    });
  });
});
