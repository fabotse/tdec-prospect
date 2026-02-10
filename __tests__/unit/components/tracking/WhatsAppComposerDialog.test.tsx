/**
 * WhatsAppComposerDialog Component Tests
 * Story 11.3: Composer de Mensagem WhatsApp
 *
 * AC: #1 - Dialog com dados do lead, textarea, botoes
 * AC: #2 - Composicao manual + contador de caracteres
 * AC: #3 - Geracao IA com promptKey e variaveis
 * AC: #4 - Estados durante streaming
 * AC: #5 - Erro na geracao
 * AC: #6 - Prompt key registrado
 * AC: #7 - Lead sem telefone
 * AC: #8 - Cobertura de testes
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { WhatsAppComposerDialog } from "@/components/tracking/WhatsAppComposerDialog";
import type { GenerationPhase } from "@/hooks/use-ai-generate";

// ==============================================
// MOCKS
// ==============================================

const mockGenerate = vi.fn();
const mockResetAI = vi.fn();
const mockCancelAI = vi.fn();
let mockAIPhase: GenerationPhase = "idle";
let mockStreamingText = "";
let mockAIError: string | null = null;
let mockIsGenerating = false;

vi.mock("@/hooks/use-ai-generate", () => ({
  useAIGenerate: () => ({
    generate: mockGenerate,
    phase: mockAIPhase,
    text: mockStreamingText,
    error: mockAIError,
    reset: mockResetAI,
    cancel: mockCancelAI,
    isGenerating: mockIsGenerating,
  }),
}));

const mockKBVariables = {
  company_context: "TDEC Prospect",
  tone_style: "casual",
  tone_description: "Tom casual",
  writing_guidelines: "Seja direto",
  icp_summary: "Tech companies",
  competitive_advantages: "Fast support",
  products_services: "Product A",
};

vi.mock("@/hooks/use-knowledge-base-context", () => ({
  useKnowledgeBaseContext: () => ({
    context: null,
    variables: mockKBVariables,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    hasExamples: false,
  }),
}));

const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
    info: vi.fn(),
  },
}));

// ==============================================
// TEST HELPERS
// ==============================================

const createDefaultProps = (overrides = {}) => ({
  open: true,
  onOpenChange: vi.fn(),
  lead: {
    firstName: "Joao",
    lastName: "Silva",
    phone: "551199999999",
    leadEmail: "joao@acme.com",
    companyName: "Acme Corp",
    title: "CTO",
    industry: "Tecnologia",
  },
  campaignId: "campaign-123",
  campaignName: "Campanha Q1",
  productId: "product-456",
  onSend: vi.fn(),
  ...overrides,
});

// ==============================================
// TESTS
// ==============================================

describe("WhatsAppComposerDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAIPhase = "idle";
    mockStreamingText = "";
    mockAIError = null;
    mockIsGenerating = false;
  });

  // ============================================
  // AC #1: Renderizacao com dados do lead
  // ============================================
  describe("AC #1: Renderizacao com dados do lead", () => {
    it("exibe nome completo do lead", () => {
      render(<WhatsAppComposerDialog {...createDefaultProps()} />);
      expect(screen.getByTestId("whatsapp-lead-name")).toHaveTextContent("Joao Silva");
    });

    it("exibe telefone formatado do lead", () => {
      render(<WhatsAppComposerDialog {...createDefaultProps()} />);
      const phone = screen.getByTestId("whatsapp-lead-phone");
      expect(phone).toHaveTextContent("+55 (11) 9999-9999");
    });

    it("exibe empresa do lead", () => {
      render(<WhatsAppComposerDialog {...createDefaultProps()} />);
      expect(screen.getByTestId("whatsapp-lead-company")).toHaveTextContent("Acme Corp");
    });

    it("exibe cargo do lead", () => {
      render(<WhatsAppComposerDialog {...createDefaultProps()} />);
      expect(screen.getByTestId("whatsapp-lead-title")).toHaveTextContent("CTO");
    });

    it("renderiza Textarea para composicao", () => {
      render(<WhatsAppComposerDialog {...createDefaultProps()} />);
      expect(screen.getByTestId("whatsapp-message-textarea")).toBeInTheDocument();
    });

    it("renderiza botao Gerar com IA", () => {
      render(<WhatsAppComposerDialog {...createDefaultProps()} />);
      expect(screen.getByTestId("whatsapp-generate-ai-button")).toBeInTheDocument();
      expect(screen.getByTestId("whatsapp-generate-ai-button")).toHaveTextContent("Gerar com IA");
    });

    it("renderiza botao Enviar desabilitado quando mensagem vazia", () => {
      render(<WhatsAppComposerDialog {...createDefaultProps()} />);
      expect(screen.getByTestId("whatsapp-send-button")).toBeDisabled();
    });

    it("renderiza DialogDescription acessivel", () => {
      render(<WhatsAppComposerDialog {...createDefaultProps()} />);
      expect(screen.getByText("Compor mensagem para Joao Silva")).toBeInTheDocument();
    });

    it("exibe titulo do dialog", () => {
      render(<WhatsAppComposerDialog {...createDefaultProps()} />);
      expect(screen.getByRole("heading", { name: "Enviar WhatsApp" })).toBeInTheDocument();
    });

    it("formata telefone com 12 digitos (fixo)", () => {
      const props = createDefaultProps({
        lead: {
          firstName: "Maria",
          phone: "551133334444",
          companyName: "Test",
          title: "CEO",
        },
      });
      render(<WhatsAppComposerDialog {...props} />);
      expect(screen.getByTestId("whatsapp-lead-phone")).toHaveTextContent("+55 (11) 3333-4444");
    });

    it("exibe telefone sem formatacao para numeros nao brasileiros", () => {
      const props = createDefaultProps({
        lead: {
          firstName: "John",
          phone: "+1234567890",
          companyName: "US Corp",
          title: "VP",
        },
      });
      render(<WhatsAppComposerDialog {...props} />);
      expect(screen.getByTestId("whatsapp-lead-phone")).toHaveTextContent("+1234567890");
    });

    it("exibe apenas primeiro nome quando lastName ausente", () => {
      const props = createDefaultProps({
        lead: {
          firstName: "Carlos",
          phone: "551199999999",
          companyName: "Test",
          title: "Dev",
        },
      });
      render(<WhatsAppComposerDialog {...props} />);
      expect(screen.getByTestId("whatsapp-lead-name")).toHaveTextContent("Carlos");
    });
  });

  // ============================================
  // AC #2: Composicao manual
  // ============================================
  describe("AC #2: Composicao manual", () => {
    it("atualiza texto no textarea ao digitar", async () => {
      const user = userEvent.setup();
      render(<WhatsAppComposerDialog {...createDefaultProps()} />);

      const textarea = screen.getByTestId("whatsapp-message-textarea");
      await user.type(textarea, "Ola, tudo bem?");

      expect(textarea).toHaveValue("Ola, tudo bem?");
    });

    it("exibe contador de caracteres atualizado", async () => {
      const user = userEvent.setup();
      render(<WhatsAppComposerDialog {...createDefaultProps()} />);

      const textarea = screen.getByTestId("whatsapp-message-textarea");
      await user.type(textarea, "Hello");

      expect(screen.getByTestId("whatsapp-char-count")).toHaveTextContent("5 caracteres");
    });

    it("exibe 0 caracteres inicialmente", () => {
      render(<WhatsAppComposerDialog {...createDefaultProps()} />);
      expect(screen.getByTestId("whatsapp-char-count")).toHaveTextContent("0 caracteres");
    });

    it("habilita botao Enviar quando mensagem nao vazia", async () => {
      const user = userEvent.setup();
      render(<WhatsAppComposerDialog {...createDefaultProps()} />);

      const textarea = screen.getByTestId("whatsapp-message-textarea");
      await user.type(textarea, "Mensagem de teste");

      expect(screen.getByTestId("whatsapp-send-button")).not.toBeDisabled();
    });

    it("mantem botao Enviar desabilitado com apenas espacos", async () => {
      const user = userEvent.setup();
      render(<WhatsAppComposerDialog {...createDefaultProps()} />);

      const textarea = screen.getByTestId("whatsapp-message-textarea");
      await user.type(textarea, "   ");

      expect(screen.getByTestId("whatsapp-send-button")).toBeDisabled();
    });

    it("indica faixa verde ate 500 caracteres", async () => {
      const user = userEvent.setup();
      render(<WhatsAppComposerDialog {...createDefaultProps()} />);

      const textarea = screen.getByTestId("whatsapp-message-textarea");
      await user.type(textarea, "Hi");

      const charCount = screen.getByTestId("whatsapp-char-count");
      expect(charCount.className).toContain("text-green-600");
    });

    it("indica faixa amarela entre 501 e 1000 caracteres", async () => {
      const user = userEvent.setup();
      render(<WhatsAppComposerDialog {...createDefaultProps()} />);

      const textarea = screen.getByTestId("whatsapp-message-textarea");
      const longText = "a".repeat(501);
      await user.click(textarea);
      fireEvent.change(textarea, { target: { value: longText } });

      const charCount = screen.getByTestId("whatsapp-char-count");
      expect(charCount.className).toContain("text-yellow-600");
    });

    it("indica faixa vermelha acima de 1000 caracteres", async () => {
      render(<WhatsAppComposerDialog {...createDefaultProps()} />);

      const textarea = screen.getByTestId("whatsapp-message-textarea");
      const veryLongText = "a".repeat(1001);
      fireEvent.change(textarea, { target: { value: veryLongText } });

      const charCount = screen.getByTestId("whatsapp-char-count");
      expect(charCount.className).toContain("text-red-600");
    });

    it("exibe orientacao de faixa ideal", () => {
      render(<WhatsAppComposerDialog {...createDefaultProps()} />);
      expect(screen.getByText("ideal: ≤500")).toBeInTheDocument();
    });

    it("chama onSend com phone e message ao clicar Enviar", async () => {
      const user = userEvent.setup();
      const props = createDefaultProps();
      render(<WhatsAppComposerDialog {...props} />);

      const textarea = screen.getByTestId("whatsapp-message-textarea");
      await user.type(textarea, "Mensagem de envio");
      await user.click(screen.getByTestId("whatsapp-send-button"));

      expect(props.onSend).toHaveBeenCalledWith({
        phone: "551199999999",
        message: "Mensagem de envio",
      });
    });

    it("chama onOpenChange ao clicar Cancelar", async () => {
      const user = userEvent.setup();
      const props = createDefaultProps();
      render(<WhatsAppComposerDialog {...props} />);

      await user.click(screen.getByText("Cancelar"));

      expect(props.onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  // ============================================
  // AC #3: Geracao com IA
  // ============================================
  describe("AC #3: Geracao com IA", () => {
    it("chama generate com promptKey whatsapp_message_generation", async () => {
      const user = userEvent.setup();
      mockGenerate.mockResolvedValue("Mensagem gerada");
      render(<WhatsAppComposerDialog {...createDefaultProps()} />);

      await user.click(screen.getByTestId("whatsapp-generate-ai-button"));

      expect(mockGenerate).toHaveBeenCalledWith(
        expect.objectContaining({
          promptKey: "whatsapp_message_generation",
        })
      );
    });

    it("passa variaveis do KB e dados do lead", async () => {
      const user = userEvent.setup();
      mockGenerate.mockResolvedValue("Resultado");
      render(<WhatsAppComposerDialog {...createDefaultProps()} />);

      await user.click(screen.getByTestId("whatsapp-generate-ai-button"));

      expect(mockGenerate).toHaveBeenCalledWith(
        expect.objectContaining({
          variables: expect.objectContaining({
            company_context: "TDEC Prospect",
            tone_style: "casual",
            lead_name: "Joao",
            lead_title: "CTO",
            lead_company: "Acme Corp",
            lead_industry: "Tecnologia",
          }),
        })
      );
    });

    it("passa productId da campanha", async () => {
      const user = userEvent.setup();
      mockGenerate.mockResolvedValue("Resultado");
      render(<WhatsAppComposerDialog {...createDefaultProps()} />);

      await user.click(screen.getByTestId("whatsapp-generate-ai-button"));

      expect(mockGenerate).toHaveBeenCalledWith(
        expect.objectContaining({
          productId: "product-456",
        })
      );
    });

    it("passa stream: true", async () => {
      const user = userEvent.setup();
      mockGenerate.mockResolvedValue("Resultado");
      render(<WhatsAppComposerDialog {...createDefaultProps()} />);

      await user.click(screen.getByTestId("whatsapp-generate-ai-button"));

      expect(mockGenerate).toHaveBeenCalledWith(
        expect.objectContaining({
          stream: true,
        })
      );
    });

    it("chama resetAI antes de gerar", async () => {
      const user = userEvent.setup();
      mockGenerate.mockResolvedValue("Resultado");
      render(<WhatsAppComposerDialog {...createDefaultProps()} />);

      await user.click(screen.getByTestId("whatsapp-generate-ai-button"));

      expect(mockResetAI).toHaveBeenCalled();
    });

    it("passa string vazia quando dados do lead ausentes", async () => {
      const user = userEvent.setup();
      mockGenerate.mockResolvedValue("Resultado");
      const props = createDefaultProps({
        lead: {
          phone: "551199999999",
        },
      });
      render(<WhatsAppComposerDialog {...props} />);

      await user.click(screen.getByTestId("whatsapp-generate-ai-button"));

      expect(mockGenerate).toHaveBeenCalledWith(
        expect.objectContaining({
          variables: expect.objectContaining({
            lead_name: "",
            lead_title: "",
            lead_company: "",
            lead_industry: "",
          }),
        })
      );
    });
  });

  // ============================================
  // AC #4: Estados durante streaming
  // ============================================
  describe("AC #4: Estados durante streaming", () => {
    it("desabilita botao Gerar com IA durante geracao", () => {
      mockIsGenerating = true;
      render(<WhatsAppComposerDialog {...createDefaultProps()} />);

      expect(screen.getByTestId("whatsapp-generate-ai-button")).toBeDisabled();
    });

    it("desabilita botao Enviar durante geracao", () => {
      mockIsGenerating = true;
      render(<WhatsAppComposerDialog {...createDefaultProps()} />);

      expect(screen.getByTestId("whatsapp-send-button")).toBeDisabled();
    });

    it("exibe indicador Gerando mensagem durante geracao", () => {
      mockIsGenerating = true;
      render(<WhatsAppComposerDialog {...createDefaultProps()} />);

      expect(screen.getByTestId("whatsapp-ai-generating")).toHaveTextContent("Gerando mensagem...");
    });

    it("nao exibe indicador quando nao esta gerando", () => {
      mockIsGenerating = false;
      render(<WhatsAppComposerDialog {...createDefaultProps()} />);

      expect(screen.queryByTestId("whatsapp-ai-generating")).not.toBeInTheDocument();
    });

    it("exibe texto acumulado durante streaming", () => {
      mockAIPhase = "streaming";
      mockStreamingText = "Ola Joao, tudo";
      mockIsGenerating = true;
      render(<WhatsAppComposerDialog {...createDefaultProps()} />);

      const textarea = screen.getByTestId("whatsapp-message-textarea");
      expect(textarea).toHaveValue("Ola Joao, tudo");
    });

    it("desabilita textarea durante geracao", () => {
      mockIsGenerating = true;
      render(<WhatsAppComposerDialog {...createDefaultProps()} />);

      expect(screen.getByTestId("whatsapp-message-textarea")).toBeDisabled();
    });
  });

  // ============================================
  // AC #5: Erro na geracao
  // ============================================
  describe("AC #5: Erro na geracao", () => {
    it("exibe mensagem de erro quando geracao falha", () => {
      mockAIError = "Tempo limite excedido. Tente novamente.";
      render(<WhatsAppComposerDialog {...createDefaultProps()} />);

      expect(screen.getByTestId("whatsapp-ai-error")).toHaveTextContent(
        "Tempo limite excedido. Tente novamente."
      );
    });

    it("reabilita botao Gerar com IA apos erro", () => {
      mockAIError = "Erro na API";
      mockAIPhase = "error";
      mockIsGenerating = false;
      render(<WhatsAppComposerDialog {...createDefaultProps()} />);

      expect(screen.getByTestId("whatsapp-generate-ai-button")).not.toBeDisabled();
    });

    it("nao exibe erro quando nao ha erro", () => {
      mockAIError = null;
      render(<WhatsAppComposerDialog {...createDefaultProps()} />);

      expect(screen.queryByTestId("whatsapp-ai-error")).not.toBeInTheDocument();
    });

    it("preserva texto ja digitado quando geracao falha", async () => {
      const user = userEvent.setup();
      mockGenerate.mockRejectedValue(new Error("Falha na geracao"));
      render(<WhatsAppComposerDialog {...createDefaultProps()} />);

      const textarea = screen.getByTestId("whatsapp-message-textarea");
      await user.type(textarea, "Texto anterior");

      await user.click(screen.getByTestId("whatsapp-generate-ai-button"));

      await waitFor(() => {
        expect(textarea).toHaveValue("Texto anterior");
      });
    });
  });

  // ============================================
  // AC #6: Prompt key registrado
  // ============================================
  describe("AC #6: Prompt key registrado", () => {
    it("whatsapp_message_generation existe no promptKeySchema", async () => {
      const { promptKeySchema } = await import("@/types/ai-prompt");
      const result = promptKeySchema.safeParse("whatsapp_message_generation");
      expect(result.success).toBe(true);
    });

    it("whatsapp_message_generation existe no PROMPT_KEYS array", async () => {
      const { PROMPT_KEYS } = await import("@/types/ai-prompt");
      expect(PROMPT_KEYS).toContain("whatsapp_message_generation");
    });

    it("whatsapp_message_generation existe no CODE_DEFAULT_PROMPTS", async () => {
      const { CODE_DEFAULT_PROMPTS } = await import("@/lib/ai/prompts/defaults");
      expect(CODE_DEFAULT_PROMPTS).toHaveProperty("whatsapp_message_generation");
    });

    it("prompt template contem variaveis obrigatorias", async () => {
      const { CODE_DEFAULT_PROMPTS } = await import("@/lib/ai/prompts/defaults");
      const prompt = CODE_DEFAULT_PROMPTS.whatsapp_message_generation;
      expect(prompt.template).toContain("{{lead_name}}");
      expect(prompt.template).toContain("{{lead_title}}");
      expect(prompt.template).toContain("{{lead_company}}");
      expect(prompt.template).toContain("{{lead_industry}}");
      expect(prompt.template).toContain("{{company_context}}");
      expect(prompt.template).toContain("{{tone_style}}");
      expect(prompt.template).toContain("{{tone_description}}");
      expect(prompt.template).toContain("{{writing_guidelines}}");
    });

    it("prompt suporta conditional product_name", async () => {
      const { CODE_DEFAULT_PROMPTS } = await import("@/lib/ai/prompts/defaults");
      const prompt = CODE_DEFAULT_PROMPTS.whatsapp_message_generation;
      expect(prompt.template).toContain("{{#if product_name}}");
    });

    it("prompt tem maxTokens de 300", async () => {
      const { CODE_DEFAULT_PROMPTS } = await import("@/lib/ai/prompts/defaults");
      const prompt = CODE_DEFAULT_PROMPTS.whatsapp_message_generation;
      expect(prompt.metadata?.maxTokens).toBe(300);
    });
  });

  // ============================================
  // AC #7: Lead sem telefone
  // ============================================
  describe("AC #7: Lead sem telefone", () => {
    const noPhoneProps = () =>
      createDefaultProps({
        lead: {
          firstName: "Maria",
          lastName: "Santos",
          companyName: "Tech Corp",
          title: "VP",
          industry: "SaaS",
        },
      });

    it("exibe aviso Telefone nao disponivel", () => {
      render(<WhatsAppComposerDialog {...noPhoneProps()} />);
      expect(screen.getByTestId("whatsapp-no-phone-warning")).toHaveTextContent(
        "Telefone nao disponivel"
      );
    });

    it("nao exibe campo de telefone", () => {
      render(<WhatsAppComposerDialog {...noPhoneProps()} />);
      expect(screen.queryByTestId("whatsapp-lead-phone")).not.toBeInTheDocument();
    });

    it("botao Enviar permanentemente desabilitado", async () => {
      const user = userEvent.setup();
      render(<WhatsAppComposerDialog {...noPhoneProps()} />);

      const textarea = screen.getByTestId("whatsapp-message-textarea");
      await user.type(textarea, "Mensagem de teste");

      expect(screen.getByTestId("whatsapp-send-button")).toBeDisabled();
    });

    it("composicao manual funciona normalmente", async () => {
      const user = userEvent.setup();
      render(<WhatsAppComposerDialog {...noPhoneProps()} />);

      const textarea = screen.getByTestId("whatsapp-message-textarea");
      await user.type(textarea, "Texto de teste");

      expect(textarea).toHaveValue("Texto de teste");
    });

    it("geracao IA funciona normalmente", async () => {
      const user = userEvent.setup();
      mockGenerate.mockResolvedValue("Resultado AI");
      render(<WhatsAppComposerDialog {...noPhoneProps()} />);

      await user.click(screen.getByTestId("whatsapp-generate-ai-button"));

      expect(mockGenerate).toHaveBeenCalledWith(
        expect.objectContaining({
          promptKey: "whatsapp_message_generation",
        })
      );
    });

    it("exibe botao Copiar mensagem", () => {
      render(<WhatsAppComposerDialog {...noPhoneProps()} />);
      expect(screen.getByTestId("whatsapp-copy-button")).toBeInTheDocument();
      expect(screen.getByTestId("whatsapp-copy-button")).toHaveTextContent("Copiar mensagem");
    });

    it("botao Copiar desabilitado quando mensagem vazia", () => {
      render(<WhatsAppComposerDialog {...noPhoneProps()} />);
      expect(screen.getByTestId("whatsapp-copy-button")).toBeDisabled();
    });

    it("botao Copiar habilitado quando ha mensagem", async () => {
      const user = userEvent.setup();
      render(<WhatsAppComposerDialog {...noPhoneProps()} />);

      const textarea = screen.getByTestId("whatsapp-message-textarea");
      await user.type(textarea, "Texto para copiar");

      expect(screen.getByTestId("whatsapp-copy-button")).not.toBeDisabled();
    });

    it("copia mensagem para clipboard ao clicar Copiar", async () => {
      const user = userEvent.setup();
      const mockWriteText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText: mockWriteText },
        writable: true,
        configurable: true,
      });

      render(<WhatsAppComposerDialog {...noPhoneProps()} />);

      const textarea = screen.getByTestId("whatsapp-message-textarea");
      await user.type(textarea, "Mensagem para copiar");
      await user.click(screen.getByTestId("whatsapp-copy-button"));

      expect(mockWriteText).toHaveBeenCalledWith("Mensagem para copiar");
      expect(mockToastSuccess).toHaveBeenCalledWith("Mensagem copiada!");
    });

    it("nao exibe botao Copiar quando lead tem telefone", () => {
      render(<WhatsAppComposerDialog {...createDefaultProps()} />);
      expect(screen.queryByTestId("whatsapp-copy-button")).not.toBeInTheDocument();
    });
  });

  // ============================================
  // Edge cases
  // ============================================
  describe("Edge cases", () => {
    it("nao renderiza quando open=false", () => {
      const props = createDefaultProps({ open: false });
      render(<WhatsAppComposerDialog {...props} />);
      expect(screen.queryByTestId("whatsapp-composer-dialog")).not.toBeInTheDocument();
    });

    it("nao chama onSend quando message so tem espacos", async () => {
      const user = userEvent.setup();
      const props = createDefaultProps();
      render(<WhatsAppComposerDialog {...props} />);

      const textarea = screen.getByTestId("whatsapp-message-textarea");
      await user.type(textarea, "   ");

      // Button should be disabled, but verify onSend not called
      expect(props.onSend).not.toHaveBeenCalled();
    });

    it("exibe Lead como nome quando firstName e lastName ausentes", () => {
      const props = createDefaultProps({
        lead: {
          phone: "551199999999",
          companyName: "Test",
        },
      });
      render(<WhatsAppComposerDialog {...props} />);
      expect(screen.getByText("Compor mensagem para Lead")).toBeInTheDocument();
    });

    it("funciona sem onSend callback", async () => {
      const user = userEvent.setup();
      const props = createDefaultProps({ onSend: undefined });
      render(<WhatsAppComposerDialog {...props} />);

      const textarea = screen.getByTestId("whatsapp-message-textarea");
      await user.type(textarea, "Test");

      // Should not throw
      await user.click(screen.getByTestId("whatsapp-send-button"));
    });

    it("funciona sem productId", async () => {
      const user = userEvent.setup();
      mockGenerate.mockResolvedValue("Result");
      const props = createDefaultProps({ productId: null });
      render(<WhatsAppComposerDialog {...props} />);

      await user.click(screen.getByTestId("whatsapp-generate-ai-button"));

      expect(mockGenerate).toHaveBeenCalledWith(
        expect.objectContaining({
          productId: null,
        })
      );
    });
  });
});
