/**
 * PhoneLookupDialog Tests
 * Story 11.5: Busca de Telefone no Fluxo de Leads Quentes
 *
 * AC #2 — Dialog com info do lead e opções
 * AC #3 — Busca via SignalHire (loading, sucesso, not_found, erro)
 * AC #4 — Inserir manualmente (validação, save)
 * AC #7 — SignalHire não configurado
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PhoneLookupDialog } from "@/components/tracking/PhoneLookupDialog";

// ==============================================
// MOCKS
// ==============================================

const mockLookupPhoneAsync = vi.fn();
const mockReset = vi.fn();
let mockIsLoading = false;

vi.mock("@/hooks/use-phone-lookup", () => ({
  usePhoneLookup: () => ({
    lookupPhoneAsync: mockLookupPhoneAsync,
    isLoading: mockIsLoading,
    reset: mockReset,
  }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

// Mock fetch for manual save
const mockFetch = vi.fn();
global.fetch = mockFetch;

// ==============================================
// FIXTURES
// ==============================================

const defaultLead = {
  leadEmail: "joao@test.com",
  firstName: "Joao",
  lastName: "Silva",
  leadId: "lead-uuid-1",
};

const leadWithoutId = {
  leadEmail: "external@test.com",
  firstName: "Maria",
  lastName: undefined,
  leadId: undefined,
};

const mockOnPhoneFound = vi.fn();
const mockOnOpenChange = vi.fn();

function renderDialog(
  props: Partial<Parameters<typeof PhoneLookupDialog>[0]> = {}
) {
  return render(
    <PhoneLookupDialog
      open={true}
      onOpenChange={mockOnOpenChange}
      lead={defaultLead}
      onPhoneFound={mockOnPhoneFound}
      {...props}
    />
  );
}

// ==============================================
// TESTS
// ==============================================

describe("PhoneLookupDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsLoading = false;
    mockFetch.mockResolvedValue({ ok: true });
  });

  describe("render (AC #2)", () => {
    it("renderiza dialog com informações do lead", () => {
      renderDialog();

      expect(screen.getByTestId("phone-lookup-dialog")).toBeInTheDocument();
      expect(screen.getByText("Buscar Telefone")).toBeInTheDocument();
      expect(screen.getByTestId("phone-lookup-lead-info")).toHaveTextContent(
        "Joao Silva — joao@test.com"
      );
    });

    it("exibe email quando nome não disponível", () => {
      renderDialog({ lead: { leadEmail: "x@test.com" } });

      expect(screen.getByTestId("phone-lookup-lead-info")).toHaveTextContent(
        "x@test.com — x@test.com"
      );
    });

    it("exibe duas opções: SignalHire e manual", () => {
      renderDialog();

      expect(screen.getByTestId("phone-lookup-signalhire-button")).toBeInTheDocument();
      expect(screen.getByTestId("phone-lookup-manual-button")).toBeInTheDocument();
    });

    it("não renderiza quando open=false", () => {
      renderDialog({ open: false });

      expect(screen.queryByTestId("phone-lookup-dialog")).not.toBeInTheDocument();
    });
  });

  describe("modo SignalHire — sucesso (AC #3)", () => {
    it("exibe telefone encontrado e botão confirmar após sucesso", async () => {
      const user = userEvent.setup();
      mockLookupPhoneAsync.mockResolvedValue({
        phone: "+5511999999999",
        status: "success",
        identifier: "joao@test.com",
      });

      renderDialog();

      await user.click(screen.getByTestId("phone-lookup-signalhire-button"));

      await waitFor(() => {
        expect(screen.getByTestId("phone-lookup-success")).toBeInTheDocument();
      });
      expect(screen.getByTestId("phone-lookup-found-phone")).toHaveTextContent("+5511999999999");
    });

    it("chama onPhoneFound ao confirmar telefone encontrado", async () => {
      const user = userEvent.setup();
      mockLookupPhoneAsync.mockResolvedValue({
        phone: "+5511999999999",
        status: "success",
        identifier: "joao@test.com",
      });

      renderDialog();

      await user.click(screen.getByTestId("phone-lookup-signalhire-button"));

      await waitFor(() => {
        expect(screen.getByTestId("phone-lookup-confirm-button")).toBeInTheDocument();
      });

      await user.click(screen.getByTestId("phone-lookup-confirm-button"));

      expect(mockOnPhoneFound).toHaveBeenCalledWith("+5511999999999");
    });

    it("chama lookupPhoneAsync com identifier e leadId corretos", async () => {
      const user = userEvent.setup();
      mockLookupPhoneAsync.mockResolvedValue({
        phone: "+5511999999999",
        status: "success",
        identifier: "joao@test.com",
      });

      renderDialog();

      await user.click(screen.getByTestId("phone-lookup-signalhire-button"));

      expect(mockLookupPhoneAsync).toHaveBeenCalledWith({
        identifier: "joao@test.com",
        leadId: "lead-uuid-1",
      });
    });
  });

  describe("modo SignalHire — não encontrado (AC #3)", () => {
    it("exibe mensagem e sugere inserir manualmente quando not_found", async () => {
      const user = userEvent.setup();
      mockLookupPhoneAsync.mockRejectedValue(new Error("Telefone não encontrado"));

      renderDialog();

      await user.click(screen.getByTestId("phone-lookup-signalhire-button"));

      await waitFor(() => {
        expect(screen.getByTestId("phone-lookup-not-found")).toBeInTheDocument();
      });
      expect(screen.getByText("Telefone não encontrado no SignalHire")).toBeInTheDocument();
      expect(screen.getByTestId("phone-lookup-try-manual-button")).toBeInTheDocument();
    });

    it("navega para modo manual ao clicar sugestão após not_found", async () => {
      const user = userEvent.setup();
      mockLookupPhoneAsync.mockRejectedValue(new Error("Telefone não encontrado"));

      renderDialog();

      await user.click(screen.getByTestId("phone-lookup-signalhire-button"));

      await waitFor(() => {
        expect(screen.getByTestId("phone-lookup-try-manual-button")).toBeInTheDocument();
      });

      await user.click(screen.getByTestId("phone-lookup-try-manual-button"));

      expect(screen.getByTestId("phone-lookup-manual-mode")).toBeInTheDocument();
    });
  });

  describe("modo SignalHire — erro (AC #3, #7)", () => {
    it("exibe mensagem de erro em português", async () => {
      const user = userEvent.setup();
      mockLookupPhoneAsync.mockRejectedValue(new Error("Créditos esgotados"));

      renderDialog();

      await user.click(screen.getByTestId("phone-lookup-signalhire-button"));

      await waitFor(() => {
        expect(screen.getByTestId("phone-lookup-error")).toBeInTheDocument();
      });
      expect(screen.getByTestId("phone-lookup-error-message")).toHaveTextContent("Créditos esgotados");
    });

    it("exibe mensagem de erro quando API key não configurada (AC #7)", async () => {
      const user = userEvent.setup();
      mockLookupPhoneAsync.mockRejectedValue(new Error("API key não configurada"));

      renderDialog();

      await user.click(screen.getByTestId("phone-lookup-signalhire-button"));

      await waitFor(() => {
        expect(screen.getByTestId("phone-lookup-error")).toBeInTheDocument();
      });
      expect(screen.getByTestId("phone-lookup-error-message")).toHaveTextContent("API key não configurada");
      expect(screen.getByTestId("phone-lookup-try-manual-button")).toBeInTheDocument();
    });

    it("navega para modo manual após erro", async () => {
      const user = userEvent.setup();
      mockLookupPhoneAsync.mockRejectedValue(new Error("Erro qualquer"));

      renderDialog();

      await user.click(screen.getByTestId("phone-lookup-signalhire-button"));

      await waitFor(() => {
        expect(screen.getByTestId("phone-lookup-try-manual-button")).toBeInTheDocument();
      });

      await user.click(screen.getByTestId("phone-lookup-try-manual-button"));

      expect(screen.getByTestId("phone-lookup-manual-mode")).toBeInTheDocument();
    });
  });

  describe("modo manual (AC #4)", () => {
    it("exibe campo de input com placeholder", async () => {
      const user = userEvent.setup();
      renderDialog();

      await user.click(screen.getByTestId("phone-lookup-manual-button"));

      const input = screen.getByTestId("phone-lookup-manual-input");
      expect(input).toBeInTheDocument();
      expect(input).toHaveAttribute("placeholder", "+5511999999999");
    });

    it("botão Salvar desabilitado com input vazio", async () => {
      const user = userEvent.setup();
      renderDialog();

      await user.click(screen.getByTestId("phone-lookup-manual-button"));

      expect(screen.getByTestId("phone-lookup-manual-save-button")).toBeDisabled();
    });

    it("botão Salvar desabilitado com telefone inválido", async () => {
      const user = userEvent.setup();
      renderDialog();

      await user.click(screen.getByTestId("phone-lookup-manual-button"));
      await user.type(screen.getByTestId("phone-lookup-manual-input"), "123");

      expect(screen.getByTestId("phone-lookup-manual-save-button")).toBeDisabled();
      expect(screen.getByTestId("phone-lookup-manual-error")).toHaveTextContent("Formato inválido");
    });

    it("botão Salvar habilitado com telefone válido", async () => {
      const user = userEvent.setup();
      renderDialog();

      await user.click(screen.getByTestId("phone-lookup-manual-button"));
      await user.type(screen.getByTestId("phone-lookup-manual-input"), "+5511999999999");

      expect(screen.getByTestId("phone-lookup-manual-save-button")).not.toBeDisabled();
      expect(screen.queryByTestId("phone-lookup-manual-error")).not.toBeInTheDocument();
    });

    it("aceita formato sem + (10-15 dígitos)", async () => {
      const user = userEvent.setup();
      renderDialog();

      await user.click(screen.getByTestId("phone-lookup-manual-button"));
      await user.type(screen.getByTestId("phone-lookup-manual-input"), "5511999999999");

      expect(screen.getByTestId("phone-lookup-manual-save-button")).not.toBeDisabled();
    });

    it("chama onPhoneFound ao salvar telefone válido", async () => {
      const user = userEvent.setup();
      renderDialog();

      await user.click(screen.getByTestId("phone-lookup-manual-button"));
      await user.type(screen.getByTestId("phone-lookup-manual-input"), "+5511999999999");
      await user.click(screen.getByTestId("phone-lookup-manual-save-button"));

      await waitFor(() => {
        expect(mockOnPhoneFound).toHaveBeenCalledWith("+5511999999999");
      });
    });

    it("salva via PATCH quando leadId disponível", async () => {
      const user = userEvent.setup();
      renderDialog();

      await user.click(screen.getByTestId("phone-lookup-manual-button"));
      await user.type(screen.getByTestId("phone-lookup-manual-input"), "+5511999999999");
      await user.click(screen.getByTestId("phone-lookup-manual-save-button"));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          "/api/leads/lead-uuid-1/phone",
          expect.objectContaining({
            method: "PATCH",
            body: JSON.stringify({ phone: "+5511999999999" }),
          })
        );
      });
    });

    it("não chama PATCH quando leadId não disponível", async () => {
      const user = userEvent.setup();
      renderDialog({ lead: leadWithoutId });

      await user.click(screen.getByTestId("phone-lookup-manual-button"));
      await user.type(screen.getByTestId("phone-lookup-manual-input"), "+5511999999999");
      await user.click(screen.getByTestId("phone-lookup-manual-save-button"));

      await waitFor(() => {
        expect(mockOnPhoneFound).toHaveBeenCalledWith("+5511999999999");
      });
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe("loading spinner (AC #3)", () => {
    it("exibe spinner quando isLoading é true no modo signalhire", async () => {
      const user = userEvent.setup();
      // Make lookupPhoneAsync never resolve to keep isLoading behavior
      mockLookupPhoneAsync.mockImplementation(() => new Promise(() => {}));
      mockIsLoading = true;

      renderDialog();

      await user.click(screen.getByTestId("phone-lookup-signalhire-button"));

      expect(screen.getByTestId("phone-lookup-loading")).toBeInTheDocument();
      expect(screen.getByText("Buscando telefone...")).toBeInTheDocument();
    });
  });

  describe("PATCH failure feedback (AC #4)", () => {
    it("exibe toast warning quando PATCH falha no save manual", async () => {
      const { toast } = await import("sonner");
      const user = userEvent.setup();
      mockFetch.mockResolvedValue({ ok: false, status: 500 });

      renderDialog();

      await user.click(screen.getByTestId("phone-lookup-manual-button"));
      await user.type(screen.getByTestId("phone-lookup-manual-input"), "+5511999999999");
      await user.click(screen.getByTestId("phone-lookup-manual-save-button"));

      await waitFor(() => {
        expect(toast.warning).toHaveBeenCalledWith(
          "Telefone salvo apenas na sessão — falha ao persistir no banco"
        );
      });
      // Still calls onPhoneFound (non-blocking)
      expect(mockOnPhoneFound).toHaveBeenCalledWith("+5511999999999");
    });
  });

  describe("navegação entre modos", () => {
    it("inicia no modo choose", () => {
      renderDialog();

      expect(screen.getByTestId("phone-lookup-choose-mode")).toBeInTheDocument();
    });

    it("navega direto para manual ao clicar 'Inserir manualmente'", async () => {
      const user = userEvent.setup();
      renderDialog();

      await user.click(screen.getByTestId("phone-lookup-manual-button"));

      expect(screen.getByTestId("phone-lookup-manual-mode")).toBeInTheDocument();
      expect(screen.queryByTestId("phone-lookup-choose-mode")).not.toBeInTheDocument();
    });
  });

  describe("reset ao fechar", () => {
    it("chama reset do hook ao fechar dialog", () => {
      const { rerender } = renderDialog();

      // Close dialog
      rerender(
        <PhoneLookupDialog
          open={false}
          onOpenChange={mockOnOpenChange}
          lead={defaultLead}
          onPhoneFound={mockOnPhoneFound}
        />
      );

      expect(mockReset).toHaveBeenCalled();
    });
  });
});
