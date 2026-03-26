/**
 * AgentChat
 * Story 16.1: Composicao basica
 * Story 16.2: Orquestracao de execucao + mensagens
 * Story 16.3: Briefing parser + fluxo conversacional
 * Story 16.4: Onboarding + selecao de modo
 *
 * AC: #1-#5 - Orquestra estado do chat completo
 * AC 16.3: #1,#3,#4 - Intercepta mensagens para fluxo de briefing
 * AC 16.4: #1-#4 - Onboarding, deteccao first-time, selecao de modo
 */

"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { AgentMessageList } from "./AgentMessageList";
import { AgentModeSelector } from "./AgentModeSelector";
import { AgentInput } from "./AgentInput";
import { useAgentMessages, useSendMessage } from "@/hooks/use-agent-messages";
import { useAgentOnboarding } from "@/hooks/use-agent-onboarding";
import { useAgentStore } from "@/stores/use-agent-store";
import { useBriefingFlow } from "@/hooks/use-briefing-flow";
import type { ExecutionMode } from "@/types/agent";

export function AgentChat() {
  const currentExecutionId = useAgentStore((s) => s.currentExecutionId);
  const setCurrentExecutionId = useAgentStore((s) => s.setCurrentExecutionId);
  const isAgentProcessing = useAgentStore((s) => s.isAgentProcessing);
  const setAgentProcessing = useAgentStore((s) => s.setAgentProcessing);
  const showModeSelector = useAgentStore((s) => s.showModeSelector);
  const setShowModeSelector = useAgentStore((s) => s.setShowModeSelector);

  const [isModeSubmitting, setIsModeSubmitting] = useState(false);

  const { isFirstTime } = useAgentOnboarding();

  const { messages } = useAgentMessages(currentExecutionId);
  // Fix #1: useSendMessage sem parametro — executionId passado no mutate
  const sendMessageMutation = useSendMessage();

  const { state: briefingState, processMessage: processBriefing } = useBriefingFlow();

  // Helper: inserir mensagem do agente via API
  const sendAgentMessage = useCallback(
    async (executionId: string, content: string) => {
      const response = await fetch(`/api/agent/executions/${executionId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, role: "agent" }),
      });
      if (!response.ok) {
        toast.error("Erro ao enviar resposta do agente.");
      }
    },
    []
  );

  // Helper: salvar briefing confirmado na execucao
  const saveBriefing = useCallback(
    async (executionId: string) => {
      if (!briefingState.briefing) return;
      const response = await fetch(`/api/agent/executions/${executionId}/briefing`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(briefingState.briefing),
      });
      if (!response.ok) {
        toast.error("Erro ao salvar briefing. Tente novamente.");
      }
    },
    [briefingState.briefing]
  );

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

      // Guard: execId must be defined after creation block
      if (!execId) return;

      // Story 16.3: Rotear para fluxo de briefing se nao confirmado
      if (briefingState.status !== "confirmed") {
        // Enviar mensagem do usuario primeiro
        sendMessageMutation.mutate({ executionId: execId, content });

        // Indicar que agente esta processando
        setAgentProcessing(true);

        const result = await processBriefing(content, execId, sendAgentMessage);

        setAgentProcessing(false);

        if (result.confirmed) {
          await saveBriefing(execId);
          await sendAgentMessage(
            execId,
            "Briefing confirmado! Agora escolha o modo de operacao:"
          );
          setShowModeSelector(true);
        }

        // Mensagem ja enviada acima — nao duplicar
        return;
      }

      // Briefing confirmado — fluxo normal de mensagens
      sendMessageMutation.mutate({ executionId: execId, content });
    },
    [
      currentExecutionId,
      setCurrentExecutionId,
      sendMessageMutation,
      briefingState.status,
      processBriefing,
      sendAgentMessage,
      saveBriefing,
      setAgentProcessing,
      setShowModeSelector,
    ]
  );

  const handleModeSelect = useCallback(
    async (mode: ExecutionMode) => {
      if (!currentExecutionId) return;
      setIsModeSubmitting(true);
      try {
        const response = await fetch(
          `/api/agent/executions/${currentExecutionId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mode }),
          }
        );
        if (!response.ok) {
          toast.error("Erro ao salvar modo. Tente novamente.");
          return;
        }
        const label = mode === "guided" ? "Guiado" : "Autopilot";
        await sendAgentMessage(
          currentExecutionId,
          `Modo ${label} selecionado. Preparando plano de execucao...`
        );
        setShowModeSelector(false);
      } catch {
        toast.error("Erro ao salvar modo. Tente novamente.");
      } finally {
        setIsModeSubmitting(false);
      }
    },
    [currentExecutionId, sendAgentMessage, setShowModeSelector]
  );

  return (
    <div className="flex flex-col flex-1 min-h-0" data-testid="agent-chat">
      <AgentMessageList
        messages={messages}
        isAgentProcessing={isAgentProcessing}
        isFirstTime={isFirstTime}
      />
      {showModeSelector && (
        <AgentModeSelector
          onModeSelect={handleModeSelect}
          defaultMode={briefingState.briefing?.mode}
          isSubmitting={isModeSubmitting}
        />
      )}
      <AgentInput
        onSendMessage={handleSendMessage}
        isSending={sendMessageMutation.isPending}
        disabled={showModeSelector}
      />
    </div>
  );
}
