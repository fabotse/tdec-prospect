/**
 * Agent UI Store
 * Story: 16.1 - Data Models, Tipos e Pagina do Agente
 *
 * AC: #4 - Estado da UI do agente
 */

import { create } from "zustand";

interface AgentUIState {
  currentExecutionId: string | null;
  isInputDisabled: boolean;
}

interface AgentUIActions {
  setCurrentExecutionId: (id: string | null) => void;
  setInputDisabled: (disabled: boolean) => void;
}

export const useAgentStore = create<AgentUIState & AgentUIActions>((set) => ({
  currentExecutionId: null,
  isInputDisabled: false,

  setCurrentExecutionId: (id) => set({ currentExecutionId: id }),
  setInputDisabled: (disabled) => set({ isInputDisabled: disabled }),
}));
