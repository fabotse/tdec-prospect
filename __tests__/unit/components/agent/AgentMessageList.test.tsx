/**
 * AgentMessageList Tests
 * Story 16.1: Placeholder inicial
 * Story 16.2: Lista de mensagens reais + auto-scroll + typing indicator
 *
 * AC 16.1: #4 - Lista de mensagens vazia com placeholder
 * AC 16.2: #2 - Auto-scroll para mensagem mais recente
 * AC 16.2: #3 - Renderizar mensagens com estilos distintos
 * AC 16.2: #4 - Historico completo na ordem cronologica
 * AC 16.2: #5 - Typing indicator
 */

import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { AgentMessageList } from "@/components/agent/AgentMessageList";
import type { AgentMessage } from "@/types/agent";

// Mock child components to isolate tests
vi.mock("@/components/agent/AgentMessageBubble", () => ({
  AgentMessageBubble: ({ message }: { message: AgentMessage }) => (
    <div data-testid="agent-message-bubble" data-role={message.role}>
      {message.content}
    </div>
  ),
}));

vi.mock("@/components/agent/AgentTypingIndicator", () => ({
  AgentTypingIndicator: ({ isVisible }: { isVisible: boolean }) =>
    isVisible ? <div data-testid="agent-typing-indicator">typing...</div> : null,
}));

function createMessage(overrides: Partial<AgentMessage> = {}): AgentMessage {
  return {
    id: "msg-001",
    execution_id: "exec-001",
    role: "user",
    content: "Buscar leads",
    metadata: { messageType: "text" },
    created_at: "2026-03-26T10:00:00Z",
    ...overrides,
  };
}

describe("AgentMessageList", () => {
  describe("Empty state (AC 16.1: #4)", () => {
    it("renders the message list container", () => {
      render(<AgentMessageList messages={[]} isAgentProcessing={false} />);
      expect(screen.getByTestId("agent-message-list")).toBeInTheDocument();
    });

    it("shows placeholder text when empty", () => {
      render(<AgentMessageList messages={[]} isAgentProcessing={false} />);
      expect(
        screen.getByText(/descreva o que voce precisa/i)
      ).toBeInTheDocument();
    });

    it("has overflow-y-auto for scrolling", () => {
      render(<AgentMessageList messages={[]} isAgentProcessing={false} />);
      const container = screen.getByTestId("agent-message-list");
      expect(container.className).toContain("overflow-y-auto");
    });

    it("has flex-1 to fill available space", () => {
      render(<AgentMessageList messages={[]} isAgentProcessing={false} />);
      const container = screen.getByTestId("agent-message-list");
      expect(container.className).toContain("flex-1");
    });
  });

  describe("With messages (AC 16.2: #3, #4)", () => {
    const messages = [
      createMessage({ id: "msg-1", content: "Buscar leads", role: "user" }),
      createMessage({ id: "msg-2", content: "Buscando...", role: "agent" }),
    ];

    it("renders a bubble for each message", () => {
      render(<AgentMessageList messages={messages} isAgentProcessing={false} />);
      const bubbles = screen.getAllByTestId("agent-message-bubble");
      expect(bubbles).toHaveLength(2);
    });

    it("renders messages in order", () => {
      render(<AgentMessageList messages={messages} isAgentProcessing={false} />);
      const bubbles = screen.getAllByTestId("agent-message-bubble");
      expect(bubbles[0]).toHaveTextContent("Buscar leads");
      expect(bubbles[1]).toHaveTextContent("Buscando...");
    });

    it("does not show placeholder when messages exist", () => {
      render(<AgentMessageList messages={messages} isAgentProcessing={false} />);
      expect(
        screen.queryByText(/descreva o que voce precisa/i)
      ).not.toBeInTheDocument();
    });
  });

  describe("Typing indicator (AC 16.2: #5)", () => {
    it("shows typing indicator when isAgentProcessing is true", () => {
      render(
        <AgentMessageList
          messages={[createMessage()]}
          isAgentProcessing={true}
        />
      );
      expect(screen.getByTestId("agent-typing-indicator")).toBeInTheDocument();
    });

    it("hides typing indicator when isAgentProcessing is false", () => {
      render(
        <AgentMessageList
          messages={[createMessage()]}
          isAgentProcessing={false}
        />
      );
      expect(
        screen.queryByTestId("agent-typing-indicator")
      ).not.toBeInTheDocument();
    });
  });

  describe("Auto-scroll (AC 16.2: #2)", () => {
    it("calls scrollIntoView when messages change", () => {
      const scrollIntoViewMock = vi.fn();
      Element.prototype.scrollIntoView = scrollIntoViewMock;

      const { rerender } = render(
        <AgentMessageList messages={[createMessage()]} isAgentProcessing={false} />
      );

      rerender(
        <AgentMessageList
          messages={[
            createMessage(),
            createMessage({ id: "msg-2", content: "Nova mensagem" }),
          ]}
          isAgentProcessing={false}
        />
      );

      expect(scrollIntoViewMock).toHaveBeenCalled();
    });
  });
});
