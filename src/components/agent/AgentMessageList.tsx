/**
 * AgentMessageList
 * Story 16.1: Placeholder inicial
 * Story 16.2: Renderizar mensagens reais + auto-scroll + typing indicator
 * Story 16.4: Onboarding diferenciado para first-time users
 *
 * AC: #2 - Lista rola automaticamente para a mensagem mais recente
 * AC: #3 - Cada tipo tem estilo visual distinto
 * AC: #4 - Historico completo carregado na ordem cronologica
 * AC: #5 - Indicador de "agente digitando"
 * AC 16.4: #1, #2 - Onboarding para first-time, saudacao breve para returning
 */

"use client";

import { useRef, useEffect } from "react";
import { Bot } from "lucide-react";
import { AgentOnboarding } from "./AgentOnboarding";
import { AgentMessageBubble } from "./AgentMessageBubble";
import { AgentTypingIndicator } from "./AgentTypingIndicator";
import type { AgentMessage } from "@/types/agent";

interface AgentMessageListProps {
  messages: AgentMessage[];
  isAgentProcessing: boolean;
  isFirstTime?: boolean;
  /**
   * Story 24.14: mensagem do agente que abre a conversa nova (proposta do ICP) antes de a
   * execucao existir. Sem mensagens, vira uma bolha do agente sintetica no lugar do
   * onboarding/placeholder.
   */
  introMessage?: string | null;
  /** Story 24.14: dica extra do estado vazio (ex.: preencher o ICP). */
  emptyStateHint?: string | null;
}

export function AgentMessageList({
  messages,
  isAgentProcessing,
  isFirstTime,
  introMessage,
  emptyStateHint,
}: AgentMessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll para o final quando nova mensagem chega
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isAgentProcessing]);

  // Story 24.14: proposta do ICP ainda sem execucao -> bolha sintetica do agente.
  if (messages.length === 0 && introMessage) {
    const intro: AgentMessage = {
      id: "icp-proposal-intro",
      execution_id: "",
      role: "agent",
      content: introMessage,
      metadata: { messageType: "text" },
      created_at: "",
    };
    return (
      <div className="flex-1 overflow-y-auto px-6 py-4" data-testid="agent-message-list">
        <div className="flex flex-col gap-4">
          <AgentMessageBubble message={intro} />
          <AgentTypingIndicator isVisible={isAgentProcessing} />
          <div ref={messagesEndRef} />
        </div>
      </div>
    );
  }

  const hint = emptyStateHint ? (
    <p
      className="text-body-small text-muted-foreground max-w-sm text-center mx-auto px-6 pb-4"
      data-testid="agent-icp-hint"
    >
      {emptyStateHint}
    </p>
  ) : null;

  // Empty state: onboarding para first-time, placeholder breve para returning
  if (messages.length === 0) {
    // First-time user: onboarding completo
    if (isFirstTime === true) {
      return (
        <div className="flex-1 flex flex-col min-h-0" data-testid="agent-message-list">
          <AgentOnboarding />
          {hint}
        </div>
      );
    }

    // Returning user ou loading (isFirstTime === false ou undefined): placeholder breve
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
          {hint}
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
