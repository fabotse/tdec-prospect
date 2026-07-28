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

  // Story 22.8: persistencia client-side de currentExecutionId (reattach no refresh)
  describe("persistence (Story 22.8)", () => {
    const STORAGE_KEY = "tdec-agent-ui";

    beforeEach(() => {
      localStorage.clear();
      act(() => {
        useAgentStore.setState({
          currentExecutionId: null,
          showModeSelector: false,
          showExecutionPlan: false,
          executionMode: null,
          isAgentProcessing: false,
          totalSteps: 0,
        });
      });
      localStorage.clear();
    });

    it("persiste currentExecutionId no localStorage sob a chave namespaced", () => {
      act(() => {
        useAgentStore.getState().setCurrentExecutionId("exec-persist");
      });

      const raw = localStorage.getItem(STORAGE_KEY);
      expect(raw).toBeTruthy();
      const parsed = JSON.parse(raw as string);
      expect(parsed.state.currentExecutionId).toBe("exec-persist");
    });

    it("NAO persiste flags efemeras (partialize so o id)", () => {
      act(() => {
        useAgentStore.getState().setCurrentExecutionId("exec-1");
        useAgentStore.getState().setShowModeSelector(true);
        useAgentStore.getState().setShowExecutionPlan(true);
        useAgentStore.getState().setExecutionMode("guided");
        useAgentStore.getState().setAgentProcessing(true);
        useAgentStore.getState().setTotalSteps(5);
      });

      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) as string);
      expect(parsed.state).toHaveProperty("currentExecutionId", "exec-1");
      expect(parsed.state).not.toHaveProperty("showModeSelector");
      expect(parsed.state).not.toHaveProperty("showExecutionPlan");
      expect(parsed.state).not.toHaveProperty("executionMode");
      expect(parsed.state).not.toHaveProperty("isAgentProcessing");
      expect(parsed.state).not.toHaveProperty("totalSteps");
    });

    it("limpa o id persistido quando setado para null (AC5)", () => {
      act(() => {
        useAgentStore.getState().setCurrentExecutionId("exec-1");
      });
      act(() => {
        useAgentStore.getState().setCurrentExecutionId(null);
      });

      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) as string);
      expect(parsed.state.currentExecutionId).toBeNull();
    });

    it("REIDRATA currentExecutionId do localStorage (o restore que o refresh exercita) (AC1)", async () => {
      // Simula o que um refresh encontra: id gravado por uma sessao anterior.
      // Este e o caminho inverso da escrita — o unico comportamento do qual a story
      // inteira depende — e o que os outros testes (so escrita) nao provavam.
      // Estado em memoria ja comeca limpo (beforeEach). Semeia SO o storage — sem
      // mexer no state depois, senao o persist re-gravaria null e clobberaria a semente.
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ state: { currentExecutionId: "exec-rehydrated" }, version: 0 })
      );

      // Um mount novo dispara a reidratacao; aqui forcamos a releitura do storage.
      await act(async () => {
        await useAgentStore.persist.rehydrate();
      });

      expect(useAgentStore.getState().currentExecutionId).toBe("exec-rehydrated");
    });

    it("clearPersistedAgentExecution limpa memoria E storage (logout)", async () => {
      const { clearPersistedAgentExecution } = await import("@/stores/use-agent-store");
      act(() => {
        useAgentStore.getState().setCurrentExecutionId("exec-do-usuario-anterior");
      });
      expect(localStorage.getItem(STORAGE_KEY)).toBeTruthy();

      act(() => {
        clearPersistedAgentExecution();
      });

      // Memoria zerada e chave removida -> proximo usuario do browser nao reidrata nada
      expect(useAgentStore.getState().currentExecutionId).toBeNull();
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });
  });
});
