/**
 * Agent UI Store Tests
 * Story 16.1: Data Models, Tipos e Pagina do Agente
 * Story 16.2: Sistema de Mensagens do Chat
 *
 * AC 16.1: #4 - Estado da UI do agente
 * AC 16.2: #5 - Indicador de agente processando
 */

import { describe, it, expect, beforeEach } from "vitest";
import { act } from "@testing-library/react";
import { useAgentStore } from "@/stores/use-agent-store";

describe("useAgentStore", () => {
  beforeEach(() => {
    act(() => {
      useAgentStore.setState({
        currentExecutionId: null,
        isInputDisabled: false,
        isAgentProcessing: false,
      });
    });
  });

  it("initializes with null currentExecutionId", () => {
    const state = useAgentStore.getState();
    expect(state.currentExecutionId).toBeNull();
  });

  it("initializes with isInputDisabled false", () => {
    const state = useAgentStore.getState();
    expect(state.isInputDisabled).toBe(false);
  });

  it("initializes with isAgentProcessing false", () => {
    const state = useAgentStore.getState();
    expect(state.isAgentProcessing).toBe(false);
  });

  it("sets currentExecutionId", () => {
    act(() => {
      useAgentStore.getState().setCurrentExecutionId("exec-123");
    });

    expect(useAgentStore.getState().currentExecutionId).toBe("exec-123");
  });

  it("clears currentExecutionId", () => {
    act(() => {
      useAgentStore.getState().setCurrentExecutionId("exec-123");
    });
    act(() => {
      useAgentStore.getState().setCurrentExecutionId(null);
    });

    expect(useAgentStore.getState().currentExecutionId).toBeNull();
  });

  it("sets isInputDisabled to true", () => {
    act(() => {
      useAgentStore.getState().setInputDisabled(true);
    });

    expect(useAgentStore.getState().isInputDisabled).toBe(true);
  });

  it("sets isInputDisabled back to false", () => {
    act(() => {
      useAgentStore.getState().setInputDisabled(true);
    });
    act(() => {
      useAgentStore.getState().setInputDisabled(false);
    });

    expect(useAgentStore.getState().isInputDisabled).toBe(false);
  });

  it("sets isAgentProcessing to true", () => {
    act(() => {
      useAgentStore.getState().setAgentProcessing(true);
    });

    expect(useAgentStore.getState().isAgentProcessing).toBe(true);
  });

  it("sets isAgentProcessing back to false", () => {
    act(() => {
      useAgentStore.getState().setAgentProcessing(true);
    });
    act(() => {
      useAgentStore.getState().setAgentProcessing(false);
    });

    expect(useAgentStore.getState().isAgentProcessing).toBe(false);
  });
});
