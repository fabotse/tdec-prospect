/**
 * AgentMessageBubble Tests
 * Story 16.2: Sistema de Mensagens do Chat
 *
 * AC: #3 - Cada tipo de mensagem tem estilo visual distinto
 *        - Mensagens do usuario alinhadas a direita, do agente a esquerda
 */

import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { AgentMessageBubble } from "@/components/agent/AgentMessageBubble";
import type { AgentMessage } from "@/types/agent";

function createMessage(overrides: Partial<AgentMessage> = {}): AgentMessage {
  return {
    id: "msg-001",
    execution_id: "exec-001",
    role: "user",
    content: "Buscar leads de tecnologia",
    metadata: { messageType: "text" },
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("AgentMessageBubble (AC: #3)", () => {
  it("renders message content", () => {
    render(<AgentMessageBubble message={createMessage()} />);
    expect(screen.getByText("Buscar leads de tecnologia")).toBeInTheDocument();
  });

  it("renders user message with data-role user", () => {
    render(<AgentMessageBubble message={createMessage({ role: "user" })} />);
    const bubble = screen.getByTestId("agent-message-bubble");
    expect(bubble.getAttribute("data-role")).toBe("user");
  });

  it("renders agent message with data-role agent", () => {
    render(
      <AgentMessageBubble
        message={createMessage({ role: "agent", content: "Resposta do agente" })}
      />
    );
    const bubble = screen.getByTestId("agent-message-bubble");
    expect(bubble.getAttribute("data-role")).toBe("agent");
  });

  it("renders user message aligned to the right (ml-auto)", () => {
    render(<AgentMessageBubble message={createMessage({ role: "user" })} />);
    const bubble = screen.getByTestId("agent-message-bubble");
    expect(bubble.className).toContain("ml-auto");
  });

  it("renders agent message aligned to the left (mr-auto)", () => {
    render(<AgentMessageBubble message={createMessage({ role: "agent" })} />);
    const bubble = screen.getByTestId("agent-message-bubble");
    expect(bubble.className).toContain("mr-auto");
  });

  it("renders bot icon for agent messages", () => {
    const { container } = render(
      <AgentMessageBubble message={createMessage({ role: "agent" })} />
    );
    // Bot icon is inside a rounded-full div
    const avatar = container.querySelector(".rounded-full");
    expect(avatar).toBeInTheDocument();
  });

  it("does not render bot icon for user messages", () => {
    const { container } = render(
      <AgentMessageBubble message={createMessage({ role: "user" })} />
    );
    const avatar = container.querySelector(".rounded-full");
    expect(avatar).toBeNull();
  });

  it("renders timestamp", () => {
    render(<AgentMessageBubble message={createMessage()} />);
    expect(screen.getByTestId("message-timestamp")).toBeInTheDocument();
  });

  // Message types
  it("renders text message type", () => {
    render(
      <AgentMessageBubble
        message={createMessage({ metadata: { messageType: "text" } })}
      />
    );
    const bubble = screen.getByTestId("agent-message-bubble");
    expect(bubble.getAttribute("data-message-type")).toBe("text");
  });

  it("renders progress message type with label", () => {
    render(
      <AgentMessageBubble
        message={createMessage({
          role: "agent",
          content: "Etapa em andamento...",
          metadata: { messageType: "progress" },
        })}
      />
    );
    expect(screen.getByText("Processando...")).toBeInTheDocument();
  });

  it("renders error message type with label", () => {
    render(
      <AgentMessageBubble
        message={createMessage({
          role: "agent",
          content: "Ocorreu um erro",
          metadata: { messageType: "error" },
        })}
      />
    );
    expect(screen.getByText("Erro")).toBeInTheDocument();
  });

  it("renders cost_estimate message type with label", () => {
    render(
      <AgentMessageBubble
        message={createMessage({
          role: "agent",
          content: "Custo estimado: R$ 50",
          metadata: { messageType: "cost_estimate" },
        })}
      />
    );
    expect(screen.getByText("Estimativa de Custo")).toBeInTheDocument();
  });

  it("renders summary message type with label", () => {
    render(
      <AgentMessageBubble
        message={createMessage({
          role: "agent",
          content: "Resumo da execucao",
          metadata: { messageType: "summary" },
        })}
      />
    );
    expect(screen.getByText("Resumo")).toBeInTheDocument();
  });

  it("renders error message with destructive border", () => {
    const { container } = render(
      <AgentMessageBubble
        message={createMessage({
          role: "agent",
          content: "Erro",
          metadata: { messageType: "error" },
        })}
      />
    );
    const bubbleContent = container.querySelector(".border-destructive\\/50");
    expect(bubbleContent).toBeInTheDocument();
  });

  it("defaults to text messageType when metadata is missing messageType", () => {
    render(
      <AgentMessageBubble
        message={createMessage({ metadata: {} })}
      />
    );
    const bubble = screen.getByTestId("agent-message-bubble");
    expect(bubble.getAttribute("data-message-type")).toBe("text");
  });
});
