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
 */

import { create } from "zustand";

interface AgentUIState {
  currentExecutionId: string | null;
  isInputDisabled: boolean;
  isAgentProcessing: boolean;
  showModeSelector: boolean;
  showExecutionPlan: boolean;
}

interface AgentUIActions {
  setCurrentExecutionId: (id: string | null) => void;
  setInputDisabled: (disabled: boolean) => void;
  setAgentProcessing: (processing: boolean) => void;
  setShowModeSelector: (show: boolean) => void;
  setShowExecutionPlan: (show: boolean) => void;
}

export const useAgentStore = create<AgentUIState & AgentUIActions>((set) => ({
  currentExecutionId: null,
  isInputDisabled: false,
  isAgentProcessing: false,
  showModeSelector: false,
  showExecutionPlan: false,

  setCurrentExecutionId: (id) => set({ currentExecutionId: id }),
  setInputDisabled: (disabled) => set({ isInputDisabled: disabled }),
  setAgentProcessing: (processing) => set({ isAgentProcessing: processing }),
  setShowModeSelector: (show) => set({ showModeSelector: show }),
  setShowExecutionPlan: (show) => set({ showExecutionPlan: show }),
}));
