"use client";

import { Bot } from "lucide-react";

export function AgentMessageList() {
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
