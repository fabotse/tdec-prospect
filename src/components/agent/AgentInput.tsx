/**
 * AgentInput
 * Story 16.1: Input basico
 * Story 16.2: Integrar com useSendMessage
 *
 * AC: #1 - Enviar mensagem ao pressionar Enter ou clicar no botao
 */

"use client";

import { useState } from "react";
import { SendHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAgentStore } from "@/stores/use-agent-store";

interface AgentInputProps {
  onSendMessage: (content: string) => void;
  isSending: boolean;
}

export function AgentInput({ onSendMessage, isSending }: AgentInputProps) {
  const [message, setMessage] = useState("");
  const isInputDisabled = useAgentStore((s) => s.isInputDisabled);
  const isAgentProcessing = useAgentStore((s) => s.isAgentProcessing);

  const disabled = isInputDisabled || isSending || isAgentProcessing;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || disabled) return;
    onSendMessage(message.trim());
    setMessage("");
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="border-t border-border px-6 py-3.5 flex items-center gap-3"
      data-testid="agent-input"
    >
      <Input
        type="text"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Descreva sua campanha de prospeccao..."
        disabled={disabled}
        className="flex-1 border-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 bg-transparent text-foreground text-body"
        aria-label="Mensagem para o agente"
      />
      <Button
        type="submit"
        size="icon"
        variant="ghost"
        disabled={!message.trim() || disabled}
        aria-label="Enviar mensagem"
      >
        <SendHorizontal className="h-5 w-5" />
      </Button>
    </form>
  );
}
