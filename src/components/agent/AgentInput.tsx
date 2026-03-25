"use client";

import { useState } from "react";
import { SendHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAgentStore } from "@/stores/use-agent-store";

export function AgentInput() {
  const [message, setMessage] = useState("");
  const isInputDisabled = useAgentStore((s) => s.isInputDisabled);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || isInputDisabled) return;
    // Envio de mensagens sera implementado na Story 16.2
    setMessage("");
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="border-t border-border px-6 py-4 flex items-center gap-3"
      data-testid="agent-input"
    >
      <Input
        type="text"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Descreva sua campanha de prospeccao..."
        disabled={isInputDisabled}
        className="flex-1 border-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 bg-transparent text-foreground text-body"
        aria-label="Mensagem para o agente"
      />
      <Button
        type="submit"
        size="icon"
        variant="ghost"
        disabled={!message.trim() || isInputDisabled}
        aria-label="Enviar mensagem"
      >
        <SendHorizontal className="h-5 w-5" />
      </Button>
    </form>
  );
}
