/**
 * AgentInput Tests
 * Story 16.1: Input basico
 * Story 16.2: Integrar com useSendMessage
 *
 * AC 16.1: #4 - Input de texto com botao de envio
 * AC 16.2: #1 - Enviar mensagem via hook
 */

import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AgentInput } from "@/components/agent/AgentInput";
import { useAgentStore } from "@/stores/use-agent-store";

describe("AgentInput", () => {
  const mockOnSendMessage = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    act(() => {
      useAgentStore.setState({
        isInputDisabled: false,
        isAgentProcessing: false,
        adjustingStep: null,
      });
    });
  });

  // Story 22.13 (AC1): em ajuste pos-rejeicao o input orienta o que escrever.
  it("mostra placeholder de ajuste quando ha step em ajuste (22.13 AC1)", () => {
    act(() => {
      useAgentStore.setState({
        adjustingStep: {
          executionId: "exec-001",
          stepNumber: 2,
          stepType: "search_leads",
          phase: "describe",
        },
      });
    });

    render(<AgentInput onSendMessage={mockOnSendMessage} isSending={false} />);

    expect(screen.getByPlaceholderText(/descreva o ajuste/i)).toBeInTheDocument();
  });

  it("renders the input form", () => {
    render(<AgentInput onSendMessage={mockOnSendMessage} isSending={false} />);
    expect(screen.getByTestId("agent-input")).toBeInTheDocument();
  });

  it("renders text input with placeholder", () => {
    render(<AgentInput onSendMessage={mockOnSendMessage} isSending={false} />);
    expect(
      screen.getByPlaceholderText("Descreva sua campanha de prospeccao...")
    ).toBeInTheDocument();
  });

  it("renders send button", () => {
    render(<AgentInput onSendMessage={mockOnSendMessage} isSending={false} />);
    expect(screen.getByRole("button", { name: /enviar mensagem/i })).toBeInTheDocument();
  });

  it("send button is disabled when input is empty", () => {
    render(<AgentInput onSendMessage={mockOnSendMessage} isSending={false} />);
    expect(screen.getByRole("button", { name: /enviar mensagem/i })).toBeDisabled();
  });

  it("send button is enabled when input has text", async () => {
    const user = userEvent.setup();
    render(<AgentInput onSendMessage={mockOnSendMessage} isSending={false} />);

    await user.type(screen.getByRole("textbox"), "Buscar leads de tecnologia");
    expect(screen.getByRole("button", { name: /enviar mensagem/i })).toBeEnabled();
  });

  it("calls onSendMessage and clears input on submit", async () => {
    const user = userEvent.setup();
    render(<AgentInput onSendMessage={mockOnSendMessage} isSending={false} />);

    const input = screen.getByRole("textbox");
    await user.type(input, "Buscar leads");
    await user.click(screen.getByRole("button", { name: /enviar mensagem/i }));

    expect(mockOnSendMessage).toHaveBeenCalledWith("Buscar leads");
    expect(input).toHaveValue("");
  });

  it("calls onSendMessage on Enter key", async () => {
    const user = userEvent.setup();
    render(<AgentInput onSendMessage={mockOnSendMessage} isSending={false} />);

    const input = screen.getByRole("textbox");
    await user.type(input, "Buscar leads{Enter}");

    expect(mockOnSendMessage).toHaveBeenCalledWith("Buscar leads");
    expect(input).toHaveValue("");
  });

  it("disables input when store isInputDisabled is true", () => {
    act(() => {
      useAgentStore.setState({ isInputDisabled: true });
    });
    render(<AgentInput onSendMessage={mockOnSendMessage} isSending={false} />);
    expect(screen.getByRole("textbox")).toBeDisabled();
  });

  it("disables input when isSending is true", () => {
    render(<AgentInput onSendMessage={mockOnSendMessage} isSending={true} />);
    expect(screen.getByRole("textbox")).toBeDisabled();
  });

  it("disables input when isAgentProcessing is true", () => {
    act(() => {
      useAgentStore.setState({ isAgentProcessing: true });
    });
    render(<AgentInput onSendMessage={mockOnSendMessage} isSending={false} />);
    expect(screen.getByRole("textbox")).toBeDisabled();
  });

  it("does not submit when input is whitespace only", async () => {
    const user = userEvent.setup();
    render(<AgentInput onSendMessage={mockOnSendMessage} isSending={false} />);

    const input = screen.getByRole("textbox");
    await user.type(input, "   ");

    expect(screen.getByRole("button", { name: /enviar mensagem/i })).toBeDisabled();
  });

  it("has accessible label on text input", () => {
    render(<AgentInput onSendMessage={mockOnSendMessage} isSending={false} />);
    expect(screen.getByLabelText("Mensagem para o agente")).toBeInTheDocument();
  });

  // ==============================================
  // Story 22.14 — chip de localizacao pre-preenche o input
  // ==============================================

  describe("Story 22.14 - texto sugerido pelo chip (AC #3)", () => {
    beforeEach(() => {
      act(() => {
        useAgentStore.setState({ chatInputDraft: null });
      });
    });

    it("pre-preenche o input com o texto do chip — sem enviar sozinho", () => {
      render(<AgentInput onSendMessage={mockOnSendMessage} isSending={false} />);

      act(() => {
        useAgentStore.setState({ chatInputDraft: "buscar no estado inteiro em vez de so Atibaia" });
      });

      expect(screen.getByRole("textbox")).toHaveValue(
        "buscar no estado inteiro em vez de so Atibaia"
      );
      // Guardrail: um clique NUNCA dispara busca paga — quem envia e o usuario.
      expect(mockOnSendMessage).not.toHaveBeenCalled();
    });

    /**
     * Code review 22.14: a versao anterior deste teste limpava o input e afirmava que ele
     * ficava vazio — verdade INCONDICIONAL, que passaria com o consumo do sinal deletado.
     * O que precisa ser provado e que o texto apagado NAO volta quando a store muda de novo
     * (era o risco real: o valor ficar preso e ser reinjetado a cada re-render).
     */
    it("consome o sinal na hora: apagar o texto nao o traz de volta num novo update", async () => {
      const user = userEvent.setup();
      render(<AgentInput onSendMessage={mockOnSendMessage} isSending={false} />);

      act(() => {
        useAgentStore.setState({ chatInputDraft: "ampliar para o estado" });
      });
      expect(screen.getByRole("textbox")).toHaveValue("ampliar para o estado");
      expect(useAgentStore.getState().chatInputDraft).toBeNull();

      await user.clear(screen.getByRole("textbox"));

      // Qualquer outro update da store re-renderiza o input. O texto apagado tem que
      // continuar apagado — o sinal ja foi gasto.
      act(() => {
        useAgentStore.setState({ isAgentProcessing: false });
      });
      expect(screen.getByRole("textbox")).toHaveValue("");
    });

    /**
     * Code review 22.14: `subscribe` so reage a TRANSICOES. Um draft gravado antes deste
     * componente montar ficava preso na store para sempre — e um segundo clique no mesmo
     * chip era descartado pelo guard `draft === previous.chatInputDraft`.
     */
    it("le o draft que ja estava na store no momento do mount", () => {
      act(() => {
        useAgentStore.setState({ chatInputDraft: "ampliar a busca para uma regiao maior" });
      });

      render(<AgentInput onSendMessage={mockOnSendMessage} isSending={false} />);

      expect(screen.getByRole("textbox")).toHaveValue("ampliar a busca para uma regiao maior");
      // E consome: nao pode reaparecer no proximo mount.
      expect(useAgentStore.getState().chatInputDraft).toBeNull();
    });

    /**
     * Code review 22.14: o `setChatInputDraft(null)` do "Nova conversa" nao alcancava a
     * caixa de texto — o draft ja tinha sido COPIADO para o estado local e o listener
     * ignora `null`. A sugestao do chip da execucao encerrada sobrevivia visivel na
     * conversa nova, ao contrario do que o comentario do `cancelCurrentExecution` prometia.
     */
    it("limpa a caixa quando a execucao troca (Nova conversa)", () => {
      act(() => {
        useAgentStore.setState({ currentExecutionId: "exec-antiga" });
      });
      render(<AgentInput onSendMessage={mockOnSendMessage} isSending={false} />);

      act(() => {
        useAgentStore.setState({ chatInputDraft: "ampliar para o estado de SP" });
      });
      expect(screen.getByRole("textbox")).toHaveValue("ampliar para o estado de SP");

      act(() => {
        useAgentStore.setState({ currentExecutionId: null });
      });

      expect(screen.getByRole("textbox")).toHaveValue("");
    });

    it("sem chip clicado, o input nasce vazio (NFR4)", () => {
      render(<AgentInput onSendMessage={mockOnSendMessage} isSending={false} />);
      expect(screen.getByRole("textbox")).toHaveValue("");
    });
  });
});
