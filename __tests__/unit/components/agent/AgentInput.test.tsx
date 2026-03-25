/**
 * AgentInput Tests
 * Story: 16.1 - Data Models, Tipos e Pagina do Agente
 *
 * AC: #4 - Input de texto com botao de envio
 */

import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AgentInput } from "@/components/agent/AgentInput";
import { useAgentStore } from "@/stores/use-agent-store";

describe("AgentInput (AC: #4)", () => {
  beforeEach(() => {
    useAgentStore.setState({ isInputDisabled: false });
  });

  it("renders the input form", () => {
    render(<AgentInput />);
    expect(screen.getByTestId("agent-input")).toBeInTheDocument();
  });

  it("renders text input with placeholder", () => {
    render(<AgentInput />);
    expect(
      screen.getByPlaceholderText("Descreva sua campanha de prospeccao...")
    ).toBeInTheDocument();
  });

  it("renders send button", () => {
    render(<AgentInput />);
    expect(screen.getByRole("button", { name: /enviar mensagem/i })).toBeInTheDocument();
  });

  it("send button is disabled when input is empty", () => {
    render(<AgentInput />);
    expect(screen.getByRole("button", { name: /enviar mensagem/i })).toBeDisabled();
  });

  it("send button is enabled when input has text", async () => {
    const user = userEvent.setup();
    render(<AgentInput />);

    await user.type(screen.getByRole("textbox"), "Buscar leads de tecnologia");
    expect(screen.getByRole("button", { name: /enviar mensagem/i })).toBeEnabled();
  });

  it("clears input on form submit", async () => {
    const user = userEvent.setup();
    render(<AgentInput />);

    const input = screen.getByRole("textbox");
    await user.type(input, "Buscar leads");
    await user.click(screen.getByRole("button", { name: /enviar mensagem/i }));

    expect(input).toHaveValue("");
  });

  it("disables input when store isInputDisabled is true", () => {
    useAgentStore.setState({ isInputDisabled: true });
    render(<AgentInput />);

    expect(screen.getByRole("textbox")).toBeDisabled();
  });

  it("disables send button when store isInputDisabled is true", () => {
    act(() => {
      useAgentStore.setState({ isInputDisabled: true });
    });

    render(<AgentInput />);

    expect(screen.getByRole("button", { name: /enviar mensagem/i })).toBeDisabled();
  });

  it("does not submit when input is whitespace only", async () => {
    const user = userEvent.setup();
    render(<AgentInput />);

    const input = screen.getByRole("textbox");
    await user.type(input, "   ");

    expect(screen.getByRole("button", { name: /enviar mensagem/i })).toBeDisabled();
  });

  it("clears input on Enter key submit", async () => {
    const user = userEvent.setup();
    render(<AgentInput />);

    const input = screen.getByRole("textbox");
    await user.type(input, "Buscar leads{Enter}");

    expect(input).toHaveValue("");
  });

  it("has accessible label on text input", () => {
    render(<AgentInput />);
    expect(screen.getByLabelText("Mensagem para o agente")).toBeInTheDocument();
  });
});
