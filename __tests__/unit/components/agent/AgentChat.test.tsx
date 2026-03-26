/**
 * AgentChat Tests
 * Story 16.1: Composicao basica
 * Story 16.2: Orquestracao de execucao + mensagens
 *
 * AC 16.1: #4 - AgentChat renderiza area de mensagens e input
 * AC 16.2: #1-#5 - Orquestracao completa do chat
 */

import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { AgentChat } from "@/components/agent/AgentChat";

// Mock hooks
vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}));

vi.mock("@/hooks/use-agent-messages", () => ({
  useAgentMessages: () => ({ messages: [], isLoading: false, isConnected: false }),
  useSendMessage: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("@/stores/use-agent-store", () => ({
  useAgentStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      currentExecutionId: null,
      setCurrentExecutionId: vi.fn(),
      isAgentProcessing: false,
      isInputDisabled: false,
    }),
}));

// Mock child components to isolate AgentChat tests
vi.mock("@/components/agent/AgentMessageList", () => ({
  AgentMessageList: () => <div data-testid="agent-message-list">messages</div>,
}));

vi.mock("@/components/agent/AgentInput", () => ({
  AgentInput: () => <div data-testid="agent-input">input</div>,
}));

describe("AgentChat", () => {
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
