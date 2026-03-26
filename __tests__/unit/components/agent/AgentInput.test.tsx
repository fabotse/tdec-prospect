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
      });
    });
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
});
