/**
 * AgentChat
 * Story 16.1: Composicao basica
 * Story 16.2: Orquestracao de execucao + mensagens
 * Story 16.3: Briefing parser + fluxo conversacional
 * Story 16.4: Onboarding + selecao de modo
 * Story 16.5: Plano de execucao & estimativa de custo
 *
 * AC: #1-#5 - Orquestra estado do chat completo
 * AC 16.3: #1,#3,#4 - Intercepta mensagens para fluxo de briefing
 * AC 16.4: #1-#4 - Onboarding, deteccao first-time, selecao de modo
 * AC 16.5: #1-#5 - Plano de execucao, custo, confirmar/cancelar
 */

"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { AgentMessageList } from "./AgentMessageList";
import { AgentModeSelector } from "./AgentModeSelector";
import { AgentExecutionPlan } from "./AgentExecutionPlan";
import { AgentStepProgress } from "./AgentStepProgress";
import { AgentInput } from "./AgentInput";
import { useAgentExecution, useSendMessage } from "@/hooks/use-agent-execution";
import { useAgentOnboarding } from "@/hooks/use-agent-onboarding";
import { useAgentStore } from "@/stores/use-agent-store";
import { useBriefingFlow } from "@/hooks/use-briefing-flow";
import type { ExecutionMode } from "@/types/agent";
import type { CreateProductInput } from "@/types/product";

export function AgentChat() {
  const currentExecutionId = useAgentStore((s) => s.currentExecutionId);
  const setCurrentExecutionId = useAgentStore((s) => s.setCurrentExecutionId);
  const isAgentProcessing = useAgentStore((s) => s.isAgentProcessing);
  const setAgentProcessing = useAgentStore((s) => s.setAgentProcessing);
  const showModeSelector = useAgentStore((s) => s.showModeSelector);
  const setShowModeSelector = useAgentStore((s) => s.setShowModeSelector);
  const showExecutionPlan = useAgentStore((s) => s.showExecutionPlan);
  const setShowExecutionPlan = useAgentStore((s) => s.setShowExecutionPlan);

  const [isModeSubmitting, setIsModeSubmitting] = useState(false);
  const [isPlanSubmitting, setIsPlanSubmitting] = useState(false);

  const { isFirstTime } = useAgentOnboarding();

  const { messages, steps } = useAgentExecution(currentExecutionId);
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

  // Helper: criar produto via API existente
  const createProduct = useCallback(
    async (product: CreateProductInput): Promise<string | null> => {
      try {
        const response = await fetch("/api/products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(product),
        });
        if (!response.ok) return null;
        const result = await response.json();
        return result.data.id;
      } catch {
        return null;
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

        const result = await processBriefing(content, execId, sendAgentMessage, createProduct);

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
      createProduct,
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
        setShowExecutionPlan(true);
      } catch {
        toast.error("Erro ao salvar modo. Tente novamente.");
      } finally {
        setIsModeSubmitting(false);
      }
    },
    [currentExecutionId, sendAgentMessage, setShowModeSelector, setShowExecutionPlan]
  );

  const handleConfirmPlan = useCallback(async () => {
    if (!currentExecutionId) return;
    setIsPlanSubmitting(true);
    try {
      const response = await fetch(
        `/api/agent/executions/${currentExecutionId}/confirm`,
        { method: "POST" }
      );
      if (!response.ok) {
        toast.error("Erro ao confirmar execucao. Tente novamente.");
        return;
      }
      // Fechar plan imediatamente apos confirm bem-sucedido
      // para evitar UI travada se sendAgentMessage falhar
      setShowExecutionPlan(false);
      await sendAgentMessage(
        currentExecutionId,
        "Execucao iniciada! Vou comecar pelo primeiro passo..."
      );
    } catch {
      toast.error("Erro ao confirmar execucao. Tente novamente.");
    } finally {
      setIsPlanSubmitting(false);
    }
  }, [currentExecutionId, sendAgentMessage, setShowExecutionPlan]);

  const handleCancelPlan = useCallback(async () => {
    if (!currentExecutionId) return;
    setShowExecutionPlan(false);
    try {
      await sendAgentMessage(
        currentExecutionId,
        "Tudo bem! Quando quiser tentar de novo, e so me dizer"
      );
    } catch {
      toast.error("Erro ao enviar mensagem. Tente novamente.");
    }
  }, [currentExecutionId, sendAgentMessage, setShowExecutionPlan]);

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
      {showExecutionPlan && currentExecutionId && (
        <AgentExecutionPlan
          executionId={currentExecutionId}
          onConfirm={handleConfirmPlan}
          onCancel={handleCancelPlan}
          isSubmitting={isPlanSubmitting}
        />
      )}
      {steps.length > 0 && (
        <AgentStepProgress
          steps={steps}
          currentStep={steps.find((s) => s.status === "running")?.step_number ?? 0}
        />
      )}
      <AgentInput
        onSendMessage={handleSendMessage}
        isSending={sendMessageMutation.isPending}
        disabled={showModeSelector || showExecutionPlan}
      />
    </div>
  );
}
