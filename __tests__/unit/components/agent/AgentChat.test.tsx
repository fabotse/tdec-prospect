/**
 * AgentChat Tests
 * Story: 16.1 - Data Models, Tipos e Pagina do Agente
 *
 * AC: #4 - AgentChat renderiza area de mensagens e input
 */

import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { AgentChat } from "@/components/agent/AgentChat";

// Mock child components to isolate AgentChat tests
vi.mock("@/components/agent/AgentMessageList", () => ({
  AgentMessageList: () => <div data-testid="agent-message-list">messages</div>,
}));

vi.mock("@/components/agent/AgentInput", () => ({
  AgentInput: () => <div data-testid="agent-input">input</div>,
}));

describe("AgentChat (AC: #4)", () => {
  it("renders the chat container", () => {
    render(<AgentChat />);
    expect(screen.getByTestId("agent-chat")).toBeInTheDocument();
  });

  it("renders AgentMessageList", () => {
    render(<AgentChat />);
    expect(screen.getByTestId("agent-message-list")).toBeInTheDocument();
  });

  it("renders AgentInput", () => {
    render(<AgentChat />);
    expect(screen.getByTestId("agent-input")).toBeInTheDocument();
  });

  it("has flex column layout", () => {
    render(<AgentChat />);
    const container = screen.getByTestId("agent-chat");
    expect(container.className).toContain("flex");
    expect(container.className).toContain("flex-col");
  });
});
