/**
 * Agent UI Store
 * Story: 16.1 - Data Models, Tipos e Pagina do Agente
 * Story: 16.2 - Sistema de Mensagens do Chat
 * Story: 16.4 - Onboarding & Selecao de Modo
 * Story: 16.5 - Plano de Execucao & Estimativa de Custo
 *
 * AC 16.1: #4 - Estado da UI do agente
 * AC 16.2: #5 - Indicador de agente processando
 * AC 16.4: #3, #4 - Estado do seletor de modo
 * AC 16.5: #1-#5 - Estado do plano de execucao
 * Story 17.7: executionMode para auto-trigger
 * Story 22.8: Persistir currentExecutionId (reattach de execucao no refresh)
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ExecutionMode, StepType } from "@/types/agent";

/**
 * Story 22.13: estado de AJUSTE POS-REJEICAO.
 *
 * Ligado quando o usuario rejeita um gate de aprovacao; identifica QUAL step esta
 * sendo ajustado (generico: busca de empresas, busca de leads e campanha) e em que
 * fase a conversa esta:
 * - "describe": a proxima mensagem descreve o ajuste -> parse + PATCH do briefing;
 * - "confirm":  a proxima mensagem confirma (deterministicamente) a re-execucao.
 *
 * EFEMERO de proposito — ver o partialize abaixo.
 */
export interface AdjustingStepState {
  /**
   * Story 22.13 (review): o ajuste e AMARRADO a execucao que o originou. Sem isto o
   * estado (global e efemero) sobrevivia ao descarte de uma execucao fantasma ou a
   * troca de usuario sem unmount, e sequestrava a PRIMEIRA mensagem da conversa
   * seguinte — parseando, PATCHando e ate re-executando um step de OUTRA execucao.
   */
  executionId: string;
  stepNumber: number;
  stepType: StepType;
  phase: "describe" | "confirm";
}

interface AgentUIState {
  currentExecutionId: string | null;
  isInputDisabled: boolean;
  isAgentProcessing: boolean;
  showModeSelector: boolean;
  showExecutionPlan: boolean;
  executionMode: ExecutionMode | null;
  totalSteps: number;
  adjustingStep: AdjustingStepState | null;
}

interface AgentUIActions {
  setCurrentExecutionId: (id: string | null) => void;
  setInputDisabled: (disabled: boolean) => void;
  setAgentProcessing: (processing: boolean) => void;
  setShowModeSelector: (show: boolean) => void;
  setShowExecutionPlan: (show: boolean) => void;
  setExecutionMode: (mode: ExecutionMode | null) => void;
  setTotalSteps: (count: number) => void;
  setAdjustingStep: (adjusting: AdjustingStepState) => void;
  clearAdjustingStep: () => void;
}

export const useAgentStore = create<AgentUIState & AgentUIActions>()(
  persist(
    (set) => ({
      currentExecutionId: null,
      isInputDisabled: false,
      isAgentProcessing: false,
      showModeSelector: false,
      showExecutionPlan: false,
      executionMode: null,
      totalSteps: 0,
      adjustingStep: null,

      setCurrentExecutionId: (id) => set({ currentExecutionId: id }),
      setInputDisabled: (disabled) => set({ isInputDisabled: disabled }),
      setAgentProcessing: (processing) => set({ isAgentProcessing: processing }),
      setShowModeSelector: (show) => set({ showModeSelector: show }),
      setShowExecutionPlan: (show) => set({ showExecutionPlan: show }),
      setExecutionMode: (mode) => set({ executionMode: mode }),
      setTotalSteps: (count) => set({ totalSteps: count }),
      setAdjustingStep: (adjusting) => set({ adjustingStep: adjusting }),
      clearAdjustingStep: () => set({ adjustingStep: null }),
    }),
    {
      // Story 22.8: so o currentExecutionId persiste (localStorage). As demais flags
      // sao efemeras/derivadas — reidratar estado obsoleto delas quebraria a UI.
      // O id restaurado e VALIDADO contra o servidor no mount do AgentChat (nunca
      // reatacha execucao terminal ou de outro usuario).
      // Story 22.10: a validacao so reatacha execucao CONFIRMADA em andamento
      // (running/paused); 'pending' (briefing abandonado) e descartado — o chat abre
      // limpo em vez de ressuscitar conversa morta.
      // Story 22.13: adjustingStep TAMBEM fica fora do partialize, e nao por economia:
      // se ele sobrevivesse ao refresh, a mensagem seguinte seria parseada com a memoria
      // conversacional (conversationRef, 22.3) VAZIA — o parser derivaria um briefing do
      // zero a partir de uma frase e o merge destruiria os filtros. Pos-refresh o usuario
      // cai no comportamento atual (rejeitar de novo reabre o ajuste).
      name: "tdec-agent-ui",
      partialize: (state) => ({ currentExecutionId: state.currentExecutionId }),
    }
  )
);

/**
 * Story 22.8: limpa o id de execucao persistido (memoria + localStorage).
 * Chamado no logout para que o proximo usuario no mesmo browser NUNCA reidrate
 * — nem transitoriamente — a execucao do usuario anterior (o filtro por user_id
 * na validacao-no-mount ja descarta, mas limpar na origem elimina a janela).
 */
export function clearPersistedAgentExecution() {
  useAgentStore.getState().setCurrentExecutionId(null);
  useAgentStore.persist.clearStorage();
}
