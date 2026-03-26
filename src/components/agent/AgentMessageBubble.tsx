/**
 * AgentMessageBubble
 * Story 16.2: Sistema de Mensagens do Chat
 *
 * AC: #3 - Cada tipo de mensagem tem estilo visual distinto
 *        - Mensagens do usuario alinhadas a direita, do agente a esquerda
 */

"use client";

import { Bot, Loader2, AlertCircle, DollarSign, BarChart3, ShieldCheck } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import type { AgentMessage, MessageType } from "@/types/agent";

interface AgentMessageBubbleProps {
  message: AgentMessage;
}

function getMessageType(message: AgentMessage): MessageType {
  return message.metadata?.messageType || "text";
}

function getTimestamp(dateStr: string): string {
  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true, locale: ptBR });
  } catch {
    return "";
  }
}

export function AgentMessageBubble({ message }: AgentMessageBubbleProps) {
  const isUser = message.role === "user";
  const messageType = getMessageType(message);

  return (
    <div
      className={cn("flex gap-3 max-w-[80%]", isUser ? "ml-auto flex-row-reverse" : "mr-auto")}
      data-testid="agent-message-bubble"
      data-role={message.role}
      data-message-type={messageType}
    >
      {/* Avatar */}
      {!isUser && (
        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
          <Bot className="h-4 w-4 text-muted-foreground" />
        </div>
      )}

      {/* Bubble */}
      <div className="flex flex-col gap-1">
        <div
          className={cn(
            "rounded-2xl px-4 py-2.5 text-body-small",
            isUser
              ? "bg-foreground text-background rounded-br-md"
              : messageType === "error"
                ? "bg-muted border border-destructive/50 rounded-bl-md"
                : messageType === "cost_estimate" || messageType === "summary"
                  ? "bg-muted rounded-bl-md border border-border"
                  : "bg-muted rounded-bl-md"
          )}
        >
          {/* Message type icon for agent messages */}
          {!isUser && messageType !== "text" && (
            <div className="flex items-center gap-2 mb-1.5 text-muted-foreground">
              <MessageTypeIcon messageType={messageType} />
              <span className="text-xs font-medium">
                {messageType === "progress" && "Processando..."}
                {messageType === "error" && "Erro"}
                {messageType === "cost_estimate" && "Estimativa de Custo"}
                {messageType === "summary" && "Resumo"}
                {messageType === "approval_gate" && "Aprovacao"}
              </span>
            </div>
          )}

          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        </div>

        {/* Timestamp */}
        <span
          className={cn(
            "text-xs text-muted-foreground",
            isUser ? "text-right" : "text-left"
          )}
          data-testid="message-timestamp"
        >
          {getTimestamp(message.created_at)}
        </span>
      </div>
    </div>
  );
}

function MessageTypeIcon({ messageType }: { messageType: MessageType }) {
  switch (messageType) {
    case "progress":
      return <Loader2 className="h-3.5 w-3.5 animate-spin" />;
    case "error":
      return <AlertCircle className="h-3.5 w-3.5 text-destructive" />;
    case "cost_estimate":
      return <DollarSign className="h-3.5 w-3.5" />;
    case "summary":
      return <BarChart3 className="h-3.5 w-3.5" />;
    case "approval_gate":
      return <ShieldCheck className="h-3.5 w-3.5" />;
    default:
      return null;
  }
}
