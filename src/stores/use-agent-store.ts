/**
 * Agent UI Store
 * Story: 16.1 - Data Models, Tipos e Pagina do Agente
 * Story: 16.2 - Sistema de Mensagens do Chat
 *
 * AC 16.1: #4 - Estado da UI do agente
 * AC 16.2: #5 - Indicador de agente processando
 */

import { create } from "zustand";

interface AgentUIState {
  currentExecutionId: string | null;
  isInputDisabled: boolean;
  isAgentProcessing: boolean;
}

interface AgentUIActions {
  setCurrentExecutionId: (id: string | null) => void;
  setInputDisabled: (disabled: boolean) => void;
  setAgentProcessing: (processing: boolean) => void;
}

export const useAgentStore = create<AgentUIState & AgentUIActions>((set) => ({
  currentExecutionId: null,
  isInputDisabled: false,
  isAgentProcessing: false,

  setCurrentExecutionId: (id) => set({ currentExecutionId: id }),
  setInputDisabled: (disabled) => set({ isInputDisabled: disabled }),
  setAgentProcessing: (processing) => set({ isAgentProcessing: processing }),
}));
