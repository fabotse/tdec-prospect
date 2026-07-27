/**
 * Unit Tests for AgentActivationGate
 * Story 17.6 - AC: #4, #5, #6
 *
 * Tests: renders summary, activate sends activate:true, defer sends activate:false,
 * disable after action, error states
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AgentActivationGate } from "@/components/agent/AgentActivationGate";

// ==============================================
// MOCKS
// ==============================================

const mockFetch = vi.fn();
global.fetch = mockFetch;

// ==============================================
// HELPERS
// ==============================================

const defaultData = {
  externalCampaignId: "camp-ext-001",
  campaignName: "Campanha React - 25/03/2026",
  totalEmails: 3,
  leadsUploaded: 42,
  accountsAdded: 0,
  platform: "instantly" as const,
  accounts: [
    { email: "sender1@company.com", first_name: "Alice", last_name: "Santos" },
    { email: "sender2@company.com", first_name: "Bob" },
  ],
};

const defaultProps = {
  executionId: "exec-001",
  stepNumber: 4,
  totalSteps: 5,
  onAction: vi.fn(),
};

function renderComponent() {
  return render(
    <AgentActivationGate data={defaultData} {...defaultProps} />
  );
}

// ==============================================
// TESTS
// ==============================================

describe("AgentActivationGate (AC: #4, #5, #6)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { stepNumber: 4, status: "approved", nextStep: 5 } }),
    });
  });

  // AC #4 - Renders summary: leads, emails, platform
  it("renders campaign name, leads, emails, platform", () => {
    renderComponent();
    expect(screen.getByText("Campanha React - 25/03/2026")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText(/leads exportados/)).toBeInTheDocument();
    expect(screen.getByText(/emails na sequencia/)).toBeInTheDocument();
    expect(screen.getByText(/instantly/)).toBeInTheDocument();
  });

  // AC #4 - Renders activation question
  it("renders activation question", () => {
    renderComponent();
    expect(screen.getByText("Quer ativar a campanha agora?")).toBeInTheDocument();
  });

  // AC #5 - Activate sends activate:true with selectedAccounts
  it("sends approve with activate:true and selectedAccounts on activate click", async () => {
    renderComponent();
    // Must select at least one account before activate is enabled
    fireEvent.click(screen.getByLabelText("Selecionar conta sender1@company.com"));
    fireEvent.click(screen.getByTestId("activation-activate-btn"));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/agent/executions/exec-001/steps/4/approve",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            approvedData: {
              activate: true,
              selectedAccounts: ["sender1@company.com"],
            },
          }),
        })
      );
    });
  });

  // AC #5 - Activate shows feedback
  it("shows activated feedback after activate", async () => {
    renderComponent();
    fireEvent.click(screen.getByLabelText("Selecionar conta sender1@company.com"));
    fireEvent.click(screen.getByTestId("activation-activate-btn"));

    await waitFor(() => {
      expect(screen.getByText(/Campanha ativada/)).toBeInTheDocument();
    });
  });

  // AC #6 - Defer sends activate:false, deferred:true with selectedAccounts
  it("sends approve with activate:false, deferred:true and selectedAccounts on defer click", async () => {
    renderComponent();
    fireEvent.click(screen.getByLabelText("Selecionar conta sender1@company.com"));
    fireEvent.click(screen.getByTestId("activation-defer-btn"));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/agent/executions/exec-001/steps/4/approve",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            approvedData: {
              activate: false,
              deferred: true,
              selectedAccounts: ["sender1@company.com"],
            },
          }),
        })
      );
    });
  });

  // AC #6 - Defer shows feedback
  it("shows deferred feedback after defer", async () => {
    renderComponent();
    fireEvent.click(screen.getByLabelText("Selecionar conta sender1@company.com"));
    fireEvent.click(screen.getByTestId("activation-defer-btn"));

    await waitFor(() => {
      expect(screen.getByText(/Ativacao adiada/)).toBeInTheDocument();
    });
  });

  // Disable after action
  it("disables buttons after activation", async () => {
    renderComponent();
    fireEvent.click(screen.getByLabelText("Selecionar conta sender1@company.com"));
    fireEvent.click(screen.getByTestId("activation-activate-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("activation-activate-btn")).toBeDisabled();
      expect(screen.getByTestId("activation-defer-btn")).toBeDisabled();
    });
  });

  // ==============================================
  // Story 22.17 (AC1): o spinner tem que PARAR no sucesso
  // ==============================================

  describe("Story 22.17 - spinner para no sucesso (AC1)", () => {
    it("para o spinner do botao apos ativar com sucesso", async () => {
      const { container } = renderComponent();
      fireEvent.click(screen.getByLabelText("Selecionar conta sender1@company.com"));
      fireEvent.click(screen.getByTestId("activation-activate-btn"));

      await waitFor(() => {
        expect(screen.getByText(/Campanha ativada/)).toBeInTheDocument();
      });
      // O bug: `loading` continuava "activate" no caminho de sucesso — o Loader2
      // girava para sempre ao lado do "✅ Campanha ativada".
      expect(container.querySelector(".animate-spin")).toBeNull();
    });

    it("para o spinner do botao apos adiar com sucesso", async () => {
      const { container } = renderComponent();
      fireEvent.click(screen.getByLabelText("Selecionar conta sender1@company.com"));
      fireEvent.click(screen.getByTestId("activation-defer-btn"));

      await waitFor(() => {
        expect(screen.getByText(/Ativacao adiada/)).toBeInTheDocument();
      });
      expect(container.querySelector(".animate-spin")).toBeNull();
    });

    it("mantem os botoes desabilitados apos o sucesso (actionTaken segura)", async () => {
      renderComponent();
      fireEvent.click(screen.getByLabelText("Selecionar conta sender1@company.com"));
      fireEvent.click(screen.getByTestId("activation-activate-btn"));

      await waitFor(() => {
        expect(screen.getByText(/Campanha ativada/)).toBeInTheDocument();
      });
      expect(screen.getByTestId("activation-activate-btn")).toBeDisabled();
      expect(screen.getByTestId("activation-defer-btn")).toBeDisabled();
    });
  });

  // ==============================================
  // Story 22.18 (AC1): a falha do EXECUTE vira sinal
  // ==============================================

  describe("Story 22.18 (AC1) - falha do execute vira sinal", () => {
    /** approve OK, execute com erro PRE-orchestrator (nao escreve bolha no chat). */
    function mockApproveOkExecuteFails(errorBody: Record<string, unknown>, status = 409) {
      mockFetch.mockReset();
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ data: { stepNumber: 4, status: "approved" } }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status,
          json: () => Promise.resolve(errorBody),
        });
    }

    it("NAO exibe 'Campanha ativada' quando o execute devolve 409 EXECUTION_NOT_ACTIVE", async () => {
      mockApproveOkExecuteFails({
        error: {
          code: "EXECUTION_NOT_ACTIVE",
          message: "Execucao encerrada (status: cancelled). Nenhum step novo pode rodar.",
        },
      });

      renderComponent();
      fireEvent.click(screen.getByLabelText("Selecionar conta sender1@company.com"));
      fireEvent.click(screen.getByTestId("activation-activate-btn"));

      await waitFor(() => {
        expect(screen.getByTestId("activation-gate-error")).toBeInTheDocument();
      });
      expect(screen.queryByText(/Campanha ativada/)).not.toBeInTheDocument();
    });

    it("renderiza a mensagem do erro PRE-orchestrator (o chat nao tem bolha nesse caso)", async () => {
      mockApproveOkExecuteFails({
        error: {
          code: "API_KEY_NOT_FOUND",
          message: "API key do TheirStack nao configurada",
        },
        // 422
      }, 422);

      renderComponent();
      fireEvent.click(screen.getByLabelText("Selecionar conta sender1@company.com"));
      fireEvent.click(screen.getByTestId("activation-activate-btn"));

      await waitFor(() => {
        expect(screen.getByTestId("activation-gate-error")).toHaveTextContent(
          "API key do TheirStack nao configurada"
        );
      });
    });

    it("re-arma os botoes e para o spinner apos a falha do execute", async () => {
      mockApproveOkExecuteFails({
        error: { code: "EXECUTION_NOT_ACTIVE", message: "Execucao encerrada" },
      });

      const { container } = renderComponent();
      fireEvent.click(screen.getByLabelText("Selecionar conta sender1@company.com"));
      fireEvent.click(screen.getByTestId("activation-activate-btn"));

      await waitFor(() => {
        expect(screen.getByTestId("activation-gate-error")).toBeInTheDocument();
      });
      expect(container.querySelector(".animate-spin")).toBeNull();
      expect(screen.getByTestId("activation-activate-btn")).not.toBeDisabled();
      expect(screen.getByTestId("activation-defer-btn")).not.toBeDisabled();
    });

    it("NAO duplica a mensagem quando o servidor afirma reportedInChat", async () => {
      mockApproveOkExecuteFails(
        {
          error: {
            code: "STEP_ACTIVATE_ERROR",
            message: "Erro na comunicacao com Instantly.",
            stepNumber: 5,
            stepType: "activate",
            isRetryable: true,
            externalService: "instantly",
            // Story 22.18 (code review, P2): a supressao passou a exigir este FATO. Antes
            // bastava `stepType` estar presente — e ele esta presente tambem nos erros
            // lancados fora do catch que escreve a bolha.
            reportedInChat: true,
          },
        },
        503
      );

      renderComponent();
      fireEvent.click(screen.getByLabelText("Selecionar conta sender1@company.com"));
      fireEvent.click(screen.getByTestId("activation-activate-btn"));

      // Estado revertido: nada de "✅ Campanha ativada" e botoes re-armados...
      await waitFor(() => {
        expect(screen.getByTestId("activation-activate-btn")).not.toBeDisabled();
      });
      expect(screen.queryByText(/Campanha ativada/)).not.toBeInTheDocument();
      // ...mas o gate NAO repete a mensagem que o sendErrorMessage ja escreveu no chat.
      expect(screen.queryByTestId("activation-gate-error")).not.toBeInTheDocument();
    });

    it("aplica a mesma regra ao 'Ativar Depois'", async () => {
      mockApproveOkExecuteFails({
        error: { code: "EXECUTION_NOT_ACTIVE", message: "Execucao encerrada" },
      });

      renderComponent();
      fireEvent.click(screen.getByLabelText("Selecionar conta sender1@company.com"));
      fireEvent.click(screen.getByTestId("activation-defer-btn"));

      await waitFor(() => {
        expect(screen.getByTestId("activation-gate-error")).toBeInTheDocument();
      });
      expect(screen.queryByText(/Ativacao adiada/)).not.toBeInTheDocument();
      expect(screen.getByTestId("activation-defer-btn")).not.toBeDisabled();
    });

    it("nao trata o guard de ultimo step (execute nao disparado) como falha", async () => {
      mockFetch.mockReset();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: { stepNumber: 5, status: "approved" } }),
      });

      render(
        <AgentActivationGate
          data={defaultData}
          {...defaultProps}
          stepNumber={5}
          totalSteps={5}
        />
      );
      fireEvent.click(screen.getByLabelText("Selecionar conta sender1@company.com"));
      fireEvent.click(screen.getByTestId("activation-activate-btn"));

      await waitFor(() => {
        expect(screen.getByText(/Campanha ativada/)).toBeInTheDocument();
      });
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  // ==============================================
  // Story 22.18 (AC2): retomada apos falha — 409 ESTRUTURADO
  // ==============================================

  describe("Story 22.18 (AC2) - retomada pelo 409 estruturado", () => {
    /** approve devolve 409 com o discriminador; execute (se chamado) responde ok. */
    function mockApproveConflict(errorFields: Record<string, unknown>) {
      mockFetch.mockReset();
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 409,
          json: () =>
            Promise.resolve({
              error: {
                code: "STEP_ALREADY_APPROVED",
                message: "Step nao esta aguardando aprovacao. Status atual: approved",
                ...errorFields,
              },
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ data: { success: true } }),
        });
    }

    it("segue adiante (dispara o execute) quando currentStatus === 'approved'", async () => {
      mockApproveConflict({ currentStatus: "approved", activationDeferred: false });

      renderComponent();
      fireEvent.click(screen.getByLabelText("Selecionar conta sender1@company.com"));
      fireEvent.click(screen.getByTestId("activation-activate-btn"));

      await waitFor(() => {
        expect(screen.getByText(/Campanha ativada/)).toBeInTheDocument();
      });
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch.mock.calls[1][0]).toBe(
        "/api/agent/executions/exec-001/steps/5/execute"
      );
    });

    it("avisa que a retomada reusa a selecao de contas ja salva", async () => {
      mockApproveConflict({ currentStatus: "approved", activationDeferred: false });

      renderComponent();
      fireEvent.click(screen.getByLabelText("Selecionar conta sender1@company.com"));
      fireEvent.click(screen.getByTestId("activation-activate-btn"));

      await waitFor(() => {
        expect(screen.getByTestId("activation-gate-resumed")).toBeInTheDocument();
      });
      expect(screen.getByTestId("activation-gate-resumed")).toHaveTextContent(
        /selecao de contas/i
      );
    });

    it.each(["running", "failed", "completed", "skipped", "pending"])(
      "NAO segue adiante quando currentStatus === '%s' (erro visivel, execute nao disparado)",
      async (status) => {
        mockApproveConflict({ currentStatus: status, activationDeferred: false });

        renderComponent();
        fireEvent.click(screen.getByLabelText("Selecionar conta sender1@company.com"));
        fireEvent.click(screen.getByTestId("activation-activate-btn"));

        await waitFor(() => {
          expect(screen.getByTestId("activation-gate-error")).toBeInTheDocument();
        });
        expect(mockFetch).toHaveBeenCalledTimes(1);
        expect(screen.queryByText(/Campanha ativada/)).not.toBeInTheDocument();
      }
    );

    it("NAO segue adiante num 409 sem currentStatus (ex.: EXECUTION_NOT_ACTIVE do approve)", async () => {
      mockFetch.mockReset();
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: () =>
          Promise.resolve({
            error: {
              code: "EXECUTION_NOT_ACTIVE",
              message: "Execucao encerrada (status: cancelled).",
            },
          }),
      });

      renderComponent();
      fireEvent.click(screen.getByLabelText("Selecionar conta sender1@company.com"));
      fireEvent.click(screen.getByTestId("activation-activate-btn"));

      await waitFor(() => {
        expect(screen.getByTestId("activation-gate-error")).toHaveTextContent(
          "Execucao encerrada"
        );
      });
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("retoma o ADIAMENTO quando a intencao persistida foi adiar", async () => {
      mockApproveConflict({ currentStatus: "approved", activationDeferred: true });

      renderComponent();
      fireEvent.click(screen.getByLabelText("Selecionar conta sender1@company.com"));
      fireEvent.click(screen.getByTestId("activation-defer-btn"));

      await waitFor(() => {
        expect(screen.getByText(/Ativacao adiada/)).toBeInTheDocument();
      });
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("RECUSA adiar quando a aprovacao persistida foi ATIVAR (nao troca de caminho)", async () => {
      mockApproveConflict({ currentStatus: "approved", activationDeferred: false });

      renderComponent();
      fireEvent.click(screen.getByLabelText("Selecionar conta sender1@company.com"));
      fireEvent.click(screen.getByTestId("activation-defer-btn"));

      await waitFor(() => {
        expect(screen.getByTestId("activation-gate-error")).toBeInTheDocument();
      });
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(screen.queryByText(/Ativacao adiada/)).not.toBeInTheDocument();
    });

    it("RECUSA ativar quando a aprovacao persistida foi ADIAR", async () => {
      mockApproveConflict({ currentStatus: "approved", activationDeferred: true });

      renderComponent();
      fireEvent.click(screen.getByLabelText("Selecionar conta sender1@company.com"));
      fireEvent.click(screen.getByTestId("activation-activate-btn"));

      await waitFor(() => {
        expect(screen.getByTestId("activation-gate-error")).toBeInTheDocument();
      });
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(screen.queryByText(/Campanha ativada/)).not.toBeInTheDocument();
    });
  });

  // ==============================================
  // Story 22.18 (AC3): gate DURAVEL — o carimbo sobrevive ao F5
  // ==============================================

  describe("Story 22.18 (AC3) - marcacao duravel", () => {
    it("volta marcado e desabilitado com activationOutcome='activated' (sem interacao)", () => {
      render(
        <AgentActivationGate
          data={defaultData}
          {...defaultProps}
          activationOutcome="activated"
        />
      );

      expect(screen.getByText(/Campanha ativada/)).toBeInTheDocument();
      expect(screen.getByTestId("activation-activate-btn")).toBeDisabled();
      expect(screen.getByTestId("activation-defer-btn")).toBeDisabled();
    });

    it("volta marcado e desabilitado com activationOutcome='deferred'", () => {
      render(
        <AgentActivationGate
          data={defaultData}
          {...defaultProps}
          activationOutcome="deferred"
        />
      );

      expect(screen.getByText(/Ativacao adiada/)).toBeInTheDocument();
      expect(screen.getByTestId("activation-activate-btn")).toBeDisabled();
      expect(screen.getByTestId("activation-defer-btn")).toBeDisabled();
    });

    it("o sinal duravel VENCE o local (card carimbado nao volta re-armado)", () => {
      const { rerender } = render(
        <AgentActivationGate data={defaultData} {...defaultProps} />
      );
      expect(screen.queryByText(/Campanha ativada/)).not.toBeInTheDocument();

      rerender(
        <AgentActivationGate
          data={defaultData}
          {...defaultProps}
          activationOutcome="activated"
        />
      );
      expect(screen.getByText(/Campanha ativada/)).toBeInTheDocument();
    });

    it("sem carimbo, o card continua RE-ARMADO (a ativacao que falhou nao pode desabilitar o retry)", () => {
      render(<AgentActivationGate data={defaultData} {...defaultProps} />);

      // O gate so desabilita por acao local; sem flag duravel os botoes seguem vivos
      // (com uma conta selecionada) para a retomada da AC2 ser alcancavel.
      fireEvent.click(screen.getByLabelText("Selecionar conta sender1@company.com"));
      expect(screen.getByTestId("activation-activate-btn")).not.toBeDisabled();
      expect(screen.getByTestId("activation-defer-btn")).not.toBeDisabled();
    });
  });

  // Error handling
  it("shows error message on activation failure", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ error: { message: "Falha na ativacao" } }),
    });

    renderComponent();
    fireEvent.click(screen.getByLabelText("Selecionar conta sender1@company.com"));
    fireEvent.click(screen.getByTestId("activation-activate-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("activation-gate-error")).toHaveTextContent("Falha na ativacao");
    });
  });

  // onAction callback
  it("calls onAction callback after defer", async () => {
    renderComponent();
    fireEvent.click(screen.getByLabelText("Selecionar conta sender1@company.com"));
    fireEvent.click(screen.getByTestId("activation-defer-btn"));

    await waitFor(() => {
      expect(defaultProps.onAction).toHaveBeenCalled();
    });
  });

  // ==============================================
  // Story 17.9: Account Selection Tests
  // ==============================================

  describe("Story 17.9 - Account Selection", () => {
    it("renders account list with checkboxes (AC #1)", () => {
      renderComponent();
      expect(screen.getByTestId("account-selection")).toBeInTheDocument();
      expect(screen.getByText("Alice Santos")).toBeInTheDocument();
      expect(screen.getByText("sender1@company.com")).toBeInTheDocument();
      expect(screen.getByText("Bob")).toBeInTheDocument();
      expect(screen.getByText("sender2@company.com")).toBeInTheDocument();
    });

    it("buttons are disabled when no account is selected (AC #1)", () => {
      renderComponent();
      expect(screen.getByTestId("activation-activate-btn")).toBeDisabled();
      expect(screen.getByTestId("activation-defer-btn")).toBeDisabled();
    });

    it("selecting an account enables buttons", () => {
      renderComponent();
      fireEvent.click(screen.getByLabelText("Selecionar conta sender1@company.com"));
      expect(screen.getByTestId("activation-activate-btn")).not.toBeDisabled();
      expect(screen.getByTestId("activation-defer-btn")).not.toBeDisabled();
    });

    it("toggle all selects all accounts, then clears", () => {
      renderComponent();
      const toggleBtn = screen.getByTestId("account-toggle-all-btn");
      expect(toggleBtn).toHaveTextContent("Selecionar Todas");

      fireEvent.click(toggleBtn);
      expect(screen.getByText(/2\/2/)).toBeInTheDocument();
      expect(toggleBtn).toHaveTextContent("Limpar Selecao");

      fireEvent.click(toggleBtn);
      expect(screen.getByText(/0\/2/)).toBeInTheDocument();
      expect(toggleBtn).toHaveTextContent("Selecionar Todas");
    });

    it("approve sends all selected accounts in body (AC #2)", async () => {
      renderComponent();
      // Select both accounts
      fireEvent.click(screen.getByTestId("account-toggle-all-btn"));
      fireEvent.click(screen.getByTestId("activation-activate-btn"));

      await waitFor(() => {
        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.approvedData.selectedAccounts).toEqual(
          expect.arrayContaining(["sender1@company.com", "sender2@company.com"])
        );
        expect(body.approvedData.selectedAccounts).toHaveLength(2);
      });
    });

    it("shows account count in header", () => {
      renderComponent();
      expect(screen.getByText(/0\/2/)).toBeInTheDocument();
      fireEvent.click(screen.getByLabelText("Selecionar conta sender1@company.com"));
      expect(screen.getByText(/1\/2/)).toBeInTheDocument();
    });

    // Story 22.18 (AC6): com ZERO contas o "Ativar Campanha" passa a ser BLOQUEADO —
    // ativar uma campanha sem remetente nunca e sucesso. "Ativar Depois" segue livre.
    it("hides account selection when accounts is empty (defer continua habilitado)", () => {
      render(
        <AgentActivationGate
          data={{ ...defaultData, accounts: [] }}
          {...defaultProps}
        />
      );
      expect(screen.queryByTestId("account-selection")).not.toBeInTheDocument();
      expect(screen.getByTestId("activation-defer-btn")).not.toBeDisabled();
    });
  });

  // ==============================================
  // Story 22.18 (AC6): zero contas de envio nao e sucesso
  // ==============================================

  describe("Story 22.18 (AC6) - zero contas de envio", () => {
    function renderWithoutAccounts(accounts: unknown = []) {
      return render(
        <AgentActivationGate
          data={{ ...defaultData, accounts: accounts as typeof defaultData.accounts }}
          {...defaultProps}
        />
      );
    }

    it("desabilita 'Ativar Campanha' quando nao ha nenhuma conta de envio", () => {
      renderWithoutAccounts();
      expect(screen.getByTestId("activation-activate-btn")).toBeDisabled();
    });

    it("mantem 'Ativar Depois' habilitado (exportar sem ativar e legitimo)", () => {
      renderWithoutAccounts();
      expect(screen.getByTestId("activation-defer-btn")).not.toBeDisabled();
    });

    it("explica por que o botao esta bloqueado", () => {
      renderWithoutAccounts();
      expect(screen.getByTestId("activation-no-accounts")).toHaveTextContent(
        /conta de envio/i
      );
    });

    // Story 22.18 (code review, P10): `[]` (sabemos que nao ha remetente) e diferente de
    // AUSENTE (nao sabemos) — a mesma distincao que o servidor faz no `emailList`.
    // Tratando os dois igual, qualquer gate antigo cujo `previewData` foi gravado antes
    // de o campo `accounts` existir ficava com "Ativar Campanha" desabilitado PARA
    // SEMPRE, sem outra saida alem de adiar.
    it("P10: `accounts` AUSENTE nao bloqueia (nao sabemos != sabemos que e zero)", () => {
      // Nao usar `renderWithoutAccounts(undefined)`: o parametro tem default `[]`, entao
      // passar `undefined` explicitamente cairia no default e testaria o caso ERRADO.
      const { accounts: _omitted, ...dataWithoutAccounts } = defaultData;
      render(
        <AgentActivationGate
          data={dataWithoutAccounts as typeof defaultData}
          {...defaultProps}
        />
      );

      expect(screen.getByTestId("activation-activate-btn")).not.toBeDisabled();
      expect(screen.queryByTestId("activation-no-accounts")).not.toBeInTheDocument();
    });

    it("nao exibe o aviso quando ha contas", () => {
      renderComponent();
      expect(screen.queryByTestId("activation-no-accounts")).not.toBeInTheDocument();
    });
  });

  // ==============================================
  // Story 22.18 (code review): P6 e P11
  // ==============================================

  describe("Story 22.18 (code review) - P6 e P11", () => {
    // P6: corpo de erro nao-JSON (HTML de gateway 502/504, corpo vazio, pagina de crash)
    // fazia o `SyntaxError` do `response.json()` escapar pelo catch e o card renderizar
    // `Unexpected token '<', "<!DOCTYPE"...` no lugar de "Erro ao ativar".
    it("P6: corpo de erro nao-JSON no approve cai no fallback, nao no SyntaxError", async () => {
      mockFetch.mockReset();
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 502,
        json: () => Promise.reject(new SyntaxError("Unexpected token '<'")),
      });

      renderComponent();
      fireEvent.click(screen.getByLabelText("Selecionar conta sender1@company.com"));
      fireEvent.click(screen.getByTestId("activation-activate-btn"));

      await waitFor(() => {
        expect(screen.getByTestId("activation-gate-error")).toHaveTextContent(
          "Erro ao ativar"
        );
      });
      expect(screen.getByTestId("activation-gate-error")).not.toHaveTextContent(
        /Unexpected token/
      );
    });

    // P11: o aviso de "usamos a selecao salva" so era ligado no caminho de SUCESSO — o
    // usuario remarcava as contas, clicava, a campanha ativava com a selecao ANTIGA e so
    // entao lia que a marcacao nova nao valeu. Agora ele aparece mesmo quando o `execute`
    // da retomada falha de novo.
    it("P11: o aviso da selecao salva aparece mesmo quando o execute da retomada falha", async () => {
      mockFetch.mockReset();
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 409,
          json: () =>
            Promise.resolve({
              error: {
                code: "STEP_ALREADY_APPROVED",
                message: "Step nao esta aguardando aprovacao. Status atual: approved",
                currentStatus: "approved",
                activationDeferred: false,
              },
            }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          json: () =>
            Promise.resolve({
              error: { code: "API_KEY_ERROR", message: "Erro ao decriptar a API key" },
            }),
        });

      renderComponent();
      fireEvent.click(screen.getByLabelText("Selecionar conta sender1@company.com"));
      fireEvent.click(screen.getByTestId("activation-activate-btn"));

      await waitFor(() => {
        expect(screen.getByTestId("activation-gate-resumed")).toBeInTheDocument();
      });
      // ...e o card continua re-armado, com o erro visivel.
      expect(screen.getByTestId("activation-gate-error")).toBeInTheDocument();
      expect(screen.getByTestId("activation-activate-btn")).not.toBeDisabled();
      expect(screen.queryByText(/Campanha ativada/)).not.toBeInTheDocument();
    });
  });
});
