/**
 * AgentChat
 * Story 16.1: Composicao basica
 * Story 16.2: Orquestracao de execucao + mensagens
 *
 * AC: #1-#5 - Orquestra estado do chat completo
 */

"use client";

import { useCallback } from "react";
import { toast } from "sonner";
import { AgentMessageList } from "./AgentMessageList";
import { AgentInput } from "./AgentInput";
import { useAgentMessages, useSendMessage } from "@/hooks/use-agent-messages";
import { useAgentStore } from "@/stores/use-agent-store";

export function AgentChat() {
  const currentExecutionId = useAgentStore((s) => s.currentExecutionId);
  const setCurrentExecutionId = useAgentStore((s) => s.setCurrentExecutionId);
  const isAgentProcessing = useAgentStore((s) => s.isAgentProcessing);

  const { messages } = useAgentMessages(currentExecutionId);
  // Fix #1: useSendMessage sem parametro — executionId passado no mutate
  const sendMessageMutation = useSendMessage();

  const handleSendMessage = useCallback(
    async (content: string) => {
      let execId = currentExecutionId;

      // Criar execucao automaticamente se nao existe
      if (!execId) {
        try {
          const response = await fetch("/api/agent/executions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error?.message || "Erro ao criar execucao");
          execId = result.data.id;
          setCurrentExecutionId(execId);
        } catch {
          // Fix #4: feedback ao usuario quando criacao de execucao falha
          toast.error("Erro ao iniciar conversa. Tente novamente.");
          return;
        }
      }

      // Fix #1: executionId passado direto no mutate — sem race condition
      sendMessageMutation.mutate({ executionId: execId!, content });
    },
    [currentExecutionId, setCurrentExecutionId, sendMessageMutation]
  );

  return (
    <div className="flex flex-col flex-1 min-h-0" data-testid="agent-chat">
      <AgentMessageList
        messages={messages}
        isAgentProcessing={isAgentProcessing}
      />
      <AgentInput
        onSendMessage={handleSendMessage}
        isSending={sendMessageMutation.isPending}
      />
    </div>
  );
}
