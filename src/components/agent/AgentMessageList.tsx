/**
 * AgentMessageList
 * Story 16.1: Placeholder inicial
 * Story 16.2: Renderizar mensagens reais + auto-scroll + typing indicator
 *
 * AC: #2 - Lista rola automaticamente para a mensagem mais recente
 * AC: #3 - Cada tipo tem estilo visual distinto
 * AC: #4 - Historico completo carregado na ordem cronologica
 * AC: #5 - Indicador de "agente digitando"
 */

"use client";

import { useRef, useEffect } from "react";
import { Bot } from "lucide-react";
import { AgentMessageBubble } from "./AgentMessageBubble";
import { AgentTypingIndicator } from "./AgentTypingIndicator";
import type { AgentMessage } from "@/types/agent";

interface AgentMessageListProps {
  messages: AgentMessage[];
  isAgentProcessing: boolean;
}

export function AgentMessageList({ messages, isAgentProcessing }: AgentMessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll para o final quando nova mensagem chega
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isAgentProcessing]);

  // Placeholder quando nao ha mensagens
  if (messages.length === 0) {
    return (
      <div
        className="flex-1 overflow-y-auto flex items-center justify-center"
        data-testid="agent-message-list"
      >
        <div className="text-center flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
            <Bot className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-body-small text-muted-foreground max-w-sm">
            Descreva o que voce precisa e o agente monta a campanha de prospeccao passo a passo.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex-1 overflow-y-auto px-6 py-4"
      data-testid="agent-message-list"
    >
      <div className="flex flex-col gap-4">
        {messages.map((message) => (
          <AgentMessageBubble key={message.id} message={message} />
        ))}
        <AgentTypingIndicator isVisible={isAgentProcessing} />
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
}
