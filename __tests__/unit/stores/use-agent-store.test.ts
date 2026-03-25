/**
 * Agent UI Store Tests
 * Story: 16.1 - Data Models, Tipos e Pagina do Agente
 *
 * AC: #4 - Estado da UI do agente
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
});
