/**
 * AgentTypingIndicator Tests
 * Story 16.2: Sistema de Mensagens do Chat
 *
 * AC: #5 - Indicador de "agente digitando" com animacao
 */

import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { AgentTypingIndicator } from "@/components/agent/AgentTypingIndicator";

describe("AgentTypingIndicator (AC: #5)", () => {
  it("renders when isVisible is true", () => {
    render(<AgentTypingIndicator isVisible={true} />);
    expect(screen.getByTestId("agent-typing-indicator")).toBeInTheDocument();
  });

  it("does not render when isVisible is false", () => {
    render(<AgentTypingIndicator isVisible={false} />);
    expect(screen.queryByTestId("agent-typing-indicator")).not.toBeInTheDocument();
  });

  it("shows 'Agente digitando...' text", () => {
    render(<AgentTypingIndicator isVisible={true} />);
    expect(screen.getByText("Agente digitando...")).toBeInTheDocument();
  });

  it("renders 3 animated dots", () => {
    const { container } = render(<AgentTypingIndicator isVisible={true} />);
    const dots = container.querySelectorAll(".rounded-full.bg-muted-foreground");
    expect(dots).toHaveLength(3);
  });

  it("renders bot icon", () => {
    const { container } = render(<AgentTypingIndicator isVisible={true} />);
    const avatar = container.querySelector(".rounded-full.bg-muted");
    expect(avatar).toBeInTheDocument();
  });
});
