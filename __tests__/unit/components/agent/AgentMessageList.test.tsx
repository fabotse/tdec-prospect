/**
 * AgentMessageList Tests
 * Story: 16.1 - Data Models, Tipos e Pagina do Agente
 *
 * AC: #4 - Lista de mensagens vazia com placeholder
 */

import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { AgentMessageList } from "@/components/agent/AgentMessageList";

describe("AgentMessageList (AC: #4)", () => {
  it("renders the message list container", () => {
    render(<AgentMessageList />);
    expect(screen.getByTestId("agent-message-list")).toBeInTheDocument();
  });

  it("shows placeholder text when empty", () => {
    render(<AgentMessageList />);
    expect(
      screen.getByText(/descreva o que voce precisa/i)
    ).toBeInTheDocument();
  });

  it("has overflow-y-auto for scrolling", () => {
    render(<AgentMessageList />);
    const container = screen.getByTestId("agent-message-list");
    expect(container.className).toContain("overflow-y-auto");
  });

  it("has flex-1 to fill available space", () => {
    render(<AgentMessageList />);
    const container = screen.getByTestId("agent-message-list");
    expect(container.className).toContain("flex-1");
  });
});
