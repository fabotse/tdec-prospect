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

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AgentMessageList } from "./AgentMessageList";
import { AgentModeSelector } from "./AgentModeSelector";
import { AgentExecutionPlan } from "./AgentExecutionPlan";
import { AgentStepProgress } from "./AgentStepProgress";
import { AgentInput } from "./AgentInput";
import { useAgentExecution, useSendMessage } from "@/hooks/use-agent-execution";
import { useAgentOnboarding } from "@/hooks/use-agent-onboarding";
import { useAutoTrigger } from "@/hooks/use-auto-trigger";
import { useAgentStore } from "@/stores/use-agent-store";
import { useBriefingFlow } from "@/hooks/use-briefing-flow";
import { useUser } from "@/hooks/use-user";
import type { AgentExecution, ExecutionMode } from "@/types/agent";
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
  const executionMode = useAgentStore((s) => s.executionMode);
  const setExecutionMode = useAgentStore((s) => s.setExecutionMode);
  const setTotalSteps = useAgentStore((s) => s.setTotalSteps);

  const [isModeSubmitting, setIsModeSubmitting] = useState(false);
  const [isPlanSubmitting, setIsPlanSubmitting] = useState(false);
  // Story 22.10: "Nova conversa"
  const [showAbandonDialog, setShowAbandonDialog] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  // Status confirmado pela validacao-no-mount (null quando a execucao nasceu nesta sessao).
  const [reattachedStatus, setReattachedStatus] = useState<string | null>(null);
  // Story 22.10 (code review): sinal de "confirmado nesta sessao". Cobre a janela entre o
  // POST /confirm retornar (dinheiro ja gasto, step 1 disparando) e o cliente hidratar os
  // steps / reattachedStatus — sem ele, "Nova conversa" nessa janela cancelaria uma execucao
  // paga SEM o dialog de aviso de creditos.
  const [confirmedThisSession, setConfirmedThisSession] = useState(false);

  const { isFirstTime } = useAgentOnboarding();
  const { profile } = useUser();

  // Story 22.8 — Reattach de execucao no refresh.
  // O currentExecutionId persiste em localStorage (zustand persist). No mount, o id
  // restaurado NAO e confiado de imediato: so anexamos os hooks de dados a ele depois
  // de validar contra o servidor (reataca so execucao existente, do usuario atual e
  // CONFIRMADA E EM ANDAMENTO). Terminal/inexistente/de-outro-usuario -> descarta e
  // inicia limpo (fecha o buraco da "execucao fantasma").
  //
  // Story 22.10 — o criterio estreitou de {pending, running, paused} para
  // {running, paused}: conversa abandonada no meio do briefing fica 'pending' PARA
  // SEMPRE (nada a encerra) e voltava em todo login/refresh — e voltava quebrada (o
  // historico reidratava, mas o useBriefingFlow renascia em 'idle' e o agente
  // reperguntava tudo dentro do mesmo historico). Desde a 22.10 o POST /confirm grava
  // 'running', entao 'pending' significa exatamente "briefing nao confirmado" e
  // 'running'/'paused' significam "confirmada, ja gastou/esta gastando" — o unico caso
  // que realmente precisa voltar. Para sair de uma execucao confirmada existe o botao
  // "Nova conversa" (cancela no servidor).
  //
  // O "portao" (attachGateOpen) fecha a janela em que um id ainda nao validado ja
  // seria pollado/exibido por useAgentExecution (dados de execucao terminal — ou de
  // outro usuario do mesmo tenant, em browser compartilhado — apareceriam antes do
  // descarte). Enquanto ha id persistido pendente de validacao, nao anexamos. Quando
  // NAO ha id persistido no mount, o portao ja nasce aberto — execucoes criadas em
  // sessao anexam na hora e o first-time fica byte-a-byte igual ao de hoje (NFR4).
  const [attachGateOpen, setAttachGateOpen] = useState(
    () => !useAgentStore.getState().currentExecutionId
  );

  // So anexa os hooks de dados a um id ja validado (ou criado durante a sessao).
  const attachedExecutionId = attachGateOpen ? currentExecutionId : null;
  const { messages, steps, refetchMessages } = useAgentExecution(attachedExecutionId);

  // Roda UMA vez, apos o profile carregar (necessario para conferir user_id).
  const didValidateExecutionRef = useRef(false);
  useEffect(() => {
    if (didValidateExecutionRef.current) return;
    // Aguarda o profile para poder conferir a titularidade (user_id).
    if (!profile?.id) return;

    didValidateExecutionRef.current = true;

    const persistedId = useAgentStore.getState().currentExecutionId;
    if (!persistedId) return; // first-time / sem id -> comportamento identico ao de hoje (NFR4)

    const userId = profile.id;
    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch("/api/agent/executions");
        if (!response.ok) return; // falha transitoria: nao apaga o id a toa
        const result = await response.json();
        // Shape inesperado (200 sem array) e tao suspeito quanto um !ok: trata como
        // transitorio (mantem o id) em vez de descartar uma execucao possivelmente ativa.
        if (!Array.isArray(result?.data)) return;
        const executions: AgentExecution[] = result.data;
        const match = executions.find((e) => e.id === persistedId);
        // Story 22.10: so execucao CONFIRMADA reatacha (running/paused). Ver o bloco
        // de comentario acima para o porque de 'pending' ter deixado de contar.
        const isActive =
          !!match &&
          match.user_id === userId &&
          (match.status === "running" || match.status === "paused");

        if (cancelled) return;
        if (isActive) {
          // Story 22.10: guarda o status validado — e o que diz ao botao "Nova conversa"
          // se esta execucao ja passou pelo confirm (logo, ja gastou) e portanto exige
          // confirmacao explicita antes de ser abandonada.
          setReattachedStatus(match.status);
          // Restaura o modo: o avanco de step (autopilot/guided) e disparado NO
          // CLIENTE por useAutoTrigger, que exige o mode. O partialize so persiste o
          // id, entao sem isto uma execucao autopilot reatachada mostraria o progresso
          // mas pararia de avancar silenciosamente. A validacao ja tem o mode em maos.
          if (match.mode) setExecutionMode(match.mode);
        } else {
          // terminal / inexistente / de outro usuario -> descarta e comeca limpo
          setCurrentExecutionId(null);
        }
      } catch {
        // rede indisponivel: mantem o id e revalida no proximo mount (sem loop)
      } finally {
        // Abre o portao qualquer que seja o desfecho (mantido, descartado ou falha
        // transitoria): id valido anexa; descartado ja virou null; falha revalida no
        // proximo mount sem travar a UI em branco.
        if (!cancelled) setAttachGateOpen(true);
      }
    })();

    return () => {
      cancelled = true;
      // StrictMode (dev) monta em dobro preservando refs: sem rearmar, a 1a run trava
      // o ref e e cancelada, a 2a sai cedo e a validacao vira no-op (o descarte da
      // fantasma nunca roda em dev). Rearmar no cleanup tambem cobre troca de usuario
      // sem unmount (profile.id muda -> cleanup -> re-valida para o novo dono).
      didValidateExecutionRef.current = false;
    };
  }, [profile?.id, setCurrentExecutionId, setExecutionMode]);
  // Fix #1: useSendMessage sem parametro — executionId passado no mutate
  const sendMessageMutation = useSendMessage();

  // Story 22.10: `reset` existe no hook desde a 16.3 mas nunca foi consumido — e o que
  // impede o agente de repreguntar tudo com o estado da conversa morta apos "Nova conversa".
  const {
    state: briefingState,
    processMessage: processBriefing,
    reset: resetBriefing,
  } = useBriefingFlow();

  // Story 17.7: Sync totalSteps to store for approval gates
  useEffect(() => {
    if (steps.length > 0) setTotalSteps(steps.length);
  }, [steps.length, setTotalSteps]);

  // Story 17.7 - AC #1: Auto-trigger next step in autopilot mode
  useAutoTrigger({ executionId: currentExecutionId, steps, mode: executionMode });

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

        if (result.confirmed) {
          await saveBriefing(execId);
          await sendAgentMessage(
            execId,
            "Briefing confirmado! Agora escolha o modo de operacao:"
          );
          setShowModeSelector(true);
        }

        // Se briefing nao conseguiu processar, informar usuario
        if (!result.handled && !result.confirmed) {
          await sendAgentMessage(
            execId,
            "Desculpe, nao consegui processar sua mensagem. Pode tentar novamente?"
          );
        }

        // Refetch com execId explicito — cobre race condition quando closure
        // ainda tem executionId stale (null) antes do re-render.
        // Await garante que mensagens estao no cache ANTES de esconder typing.
        await refetchMessages(execId);
        setAgentProcessing(false);

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
      refetchMessages,
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
        setExecutionMode(mode);
        const label = mode === "guided" ? "Guiado" : "Autopilot";
        await sendAgentMessage(
          currentExecutionId,
          `Modo ${label} selecionado. Preparando plano de execucao...`
        );
        refetchMessages();
        setShowModeSelector(false);
        setShowExecutionPlan(true);
      } catch {
        toast.error("Erro ao salvar modo. Tente novamente.");
      } finally {
        setIsModeSubmitting(false);
      }
    },
    [currentExecutionId, sendAgentMessage, setShowModeSelector, setShowExecutionPlan, setExecutionMode, refetchMessages]
  );

  const handleConfirmPlan = useCallback(async (premiumIcebreakers: boolean) => {
    if (!currentExecutionId) return;
    setIsPlanSubmitting(true);
    try {
      const response = await fetch(
        `/api/agent/executions/${currentExecutionId}/confirm`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // Story 22.2: repassa o toggle de icebreaker premium (LinkedIn) ao confirm
          body: JSON.stringify({ premiumIcebreakers }),
        }
      );
      if (!response.ok) {
        toast.error("Erro ao confirmar execucao. Tente novamente.");
        return;
      }
      // Story 22.10 (code review): marca confirmacao nesta sessao -> "Nova conversa" passa a
      // exigir o dialog mesmo antes de steps/reattachedStatus estarem disponiveis.
      setConfirmedThisSession(true);
      // Fechar plan imediatamente apos confirm bem-sucedido
      // para evitar UI travada se sendAgentMessage falhar
      setShowExecutionPlan(false);
      await sendAgentMessage(
        currentExecutionId,
        "Execucao iniciada! Vou comecar pelo primeiro passo..."
      );
      refetchMessages();

      // Story 17.7 - AC #5: Auto-trigger step 1 (both guided and autopilot)
      // Fire-and-forget: plan already confirmed, don't let trigger failure show misleading error
      fetch(
        `/api/agent/executions/${currentExecutionId}/steps/1/execute`,
        { method: "POST" }
      ).catch(() => {});
    } catch {
      toast.error("Erro ao confirmar execucao. Tente novamente.");
    } finally {
      setIsPlanSubmitting(false);
    }
  }, [currentExecutionId, sendAgentMessage, setShowExecutionPlan, refetchMessages]);

  const handleCancelPlan = useCallback(async () => {
    if (!currentExecutionId) return;
    setShowExecutionPlan(false);
    try {
      await sendAgentMessage(
        currentExecutionId,
        "Tudo bem! Quando quiser tentar de novo, e so me dizer"
      );
      refetchMessages();
    } catch {
      toast.error("Erro ao enviar mensagem. Tente novamente.");
    }
  }, [currentExecutionId, sendAgentMessage, setShowExecutionPlan, refetchMessages]);

  // ============================================================
  // Story 22.10 — "Nova conversa"
  // ============================================================

  // A execucao ja passou pelo confirm? Dois sinais, ambos confiaveis:
  // - steps existem: SO o POST /confirm cria agent_steps;
  // - status validado no mount e running/paused: idem (running so e escrito pelo confirm),
  //   e cobre a janela em que a execucao reatachada ainda nao carregou os steps.
  // `executionMode` NAO serve: e escolhido ANTES do confirm (mode selector), quando nada
  // foi gasto ainda e o cancelamento deve ser sem fricção.
  const isPostConfirmExecution =
    steps.length > 0 ||
    reattachedStatus === "running" ||
    reattachedStatus === "paused" ||
    confirmedThisSession;

  // Cancela no servidor e — SO em caso de sucesso — zera o cliente inteiro.
  // Tudo-ou-nada de proposito: limpar a UI com a execucao viva no servidor recriaria a
  // "execucao fantasma" que a 22.8 fechou (steps rodando e gastando, invisiveis).
  const cancelCurrentExecution = useCallback(async () => {
    if (!currentExecutionId) return;
    setIsCancelling(true);
    try {
      const response = await fetch(`/api/agent/executions/${currentExecutionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "cancelled" }),
      });
      if (!response.ok) {
        // Story 22.10 (code review): 409 = execucao JA terminal no servidor (nada vivo
        // rodando/gastando). Nesse caso e seguro — e necessario — resetar o cliente: senao o
        // usuario fica preso ao botao "Nova conversa" (todo retry 409 de novo) ate dar F5.
        // Falha transitoria (500/rede) preserva o id para nao criar fantasma.
        if (response.status !== 409) {
          toast.error("Erro ao encerrar a conversa. Tente novamente.");
          return;
        }
      }

      // Reset integral (AC6). O persist/partialize do zustand propaga o null ao
      // localStorage sozinho — nao ha o que limpar a mao.
      setCurrentExecutionId(null);
      setShowModeSelector(false);
      setShowExecutionPlan(false);
      setExecutionMode(null);
      setAgentProcessing(false);
      setTotalSteps(0);
      setReattachedStatus(null);
      setConfirmedThisSession(false);
      // Sem isto o historico some da tela mas o briefing sobrevive em memoria: o agente
      // retomaria a conversa antiga (pedindo confirmacao de um resumo que ninguem ve).
      resetBriefing();
      setShowAbandonDialog(false);
    } catch {
      toast.error("Erro ao encerrar a conversa. Tente novamente.");
    } finally {
      setIsCancelling(false);
    }
  }, [
    currentExecutionId,
    setCurrentExecutionId,
    setShowModeSelector,
    setShowExecutionPlan,
    setExecutionMode,
    setAgentProcessing,
    setTotalSteps,
    resetBriefing,
  ]);

  const handleNewConversation = useCallback(() => {
    // Briefing (pending): nada foi gasto -> encerra direto, sem fricção (a dor comum).
    // Pos-confirm: creditos/progresso ja consumidos -> exige confirmacao explicita.
    if (isPostConfirmExecution) {
      setShowAbandonDialog(true);
      return;
    }
    void cancelCurrentExecution();
  }, [isPostConfirmExecution, cancelCurrentExecution]);

  return (
    <div className="flex flex-col flex-1 min-h-0" data-testid="agent-chat">
      {/* Story 22.10: so aparece com conversa em andamento — sem execucao, o chat ja
          esta limpo e o botao nao teria o que encerrar (first-time byte-a-byte, NFR4). */}
      {currentExecutionId && (
        <div className="flex items-center justify-end gap-2 px-4 py-2 border-b">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleNewConversation}
            disabled={isCancelling}
            data-testid="agent-new-conversation"
          >
            <RotateCcw className="size-4" />
            Nova conversa
          </Button>
        </div>
      )}
      <AlertDialog open={showAbandonDialog} onOpenChange={setShowAbandonDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Comecar uma nova conversa?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta execucao ja foi confirmada e esta em andamento. Ao comecar uma nova
              conversa ela sera encerrada e nao podera ser retomada. O progresso e os
              creditos ja consumidos nao sao revertidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isCancelling}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                // Impede o Radix de fechar o dialog antes da resposta do servidor:
                // se o PATCH falhar, o usuario continua no dialog e nada foi limpo.
                event.preventDefault();
                void cancelCurrentExecution();
              }}
              disabled={isCancelling}
              data-testid="agent-confirm-new-conversation"
            >
              Encerrar e comecar nova
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
