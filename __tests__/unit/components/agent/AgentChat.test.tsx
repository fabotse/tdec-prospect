/**
 * AgentChat Tests
 * Story 16.1: Composicao basica
 * Story 16.2: Orquestracao de execucao + mensagens
 * Story 16.3: Briefing parser + fluxo conversacional
 * Story 16.4: Onboarding + selecao de modo
 * Story 16.5: Plano de execucao & estimativa de custo
 *
 * AC 16.1: #4 - AgentChat renderiza area de mensagens e input
 * AC 16.2: #1-#5 - Orquestracao completa do chat
 * AC 16.3: #1,#3,#4 - Intercepta mensagens para fluxo de briefing
 * AC 16.4: #1-#4 - Onboarding, deteccao first-time, selecao de modo
 * AC 16.5: #1-#5 - Plano de execucao, confirmar/cancelar
 */

import { render, screen, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AgentChat } from "@/components/agent/AgentChat";

// ==============================================
// MOCKS — Shared state for spying
// ==============================================

const mockMutate = vi.fn();
const mockSetCurrentExecutionId = vi.fn();
const mockSetAgentProcessing = vi.fn();
const mockSetShowModeSelector = vi.fn();
const mockSetShowExecutionPlan = vi.fn();
const mockProcessMessage = vi.fn().mockResolvedValue({ handled: true });
const mockToastError = vi.fn();

let capturedOnSendMessage: ((content: string) => Promise<void>) | null = null;
let capturedMessageListProps: Record<string, unknown> = {};
let capturedInputProps: Record<string, unknown> = {};
let capturedModeSelectorProps: Record<string, unknown> | null = null;
let capturedExecutionPlanProps: Record<string, unknown> | null = null;
let mockStoreState: Record<string, unknown> = {};
let mockBriefingState: Record<string, unknown> = {};

vi.mock("sonner", () => ({
  toast: { error: (...args: unknown[]) => mockToastError(...args) },
}));

vi.mock("@/hooks/use-agent-messages", () => ({
  useAgentMessages: () => ({ messages: [], isLoading: false, isConnected: false }),
  useSendMessage: () => ({ mutate: mockMutate, isPending: false }),
}));

vi.mock("@/hooks/use-agent-onboarding", () => ({
  useAgentOnboarding: () => ({ isFirstTime: true, isLoading: false }),
}));

vi.mock("@/stores/use-agent-store", () => ({
  useAgentStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector(mockStoreState),
}));

vi.mock("@/hooks/use-briefing-flow", () => ({
  useBriefingFlow: () => ({
    state: mockBriefingState,
    processMessage: mockProcessMessage,
    reset: vi.fn(),
  }),
}));

vi.mock("@/components/agent/AgentMessageList", () => ({
  AgentMessageList: (props: Record<string, unknown>) => {
    capturedMessageListProps = props;
    return <div data-testid="agent-message-list">messages</div>;
  },
}));

vi.mock("@/components/agent/AgentInput", () => ({
  AgentInput: (props: { onSendMessage: (content: string) => Promise<void>; disabled?: boolean }) => {
    capturedOnSendMessage = props.onSendMessage;
    capturedInputProps = props as unknown as Record<string, unknown>;
    return <div data-testid="agent-input">input</div>;
  },
}));

vi.mock("@/components/agent/AgentModeSelector", () => ({
  AgentModeSelector: (props: Record<string, unknown>) => {
    capturedModeSelectorProps = props;
    return <div data-testid="agent-mode-selector">mode selector</div>;
  },
}));

vi.mock("@/components/agent/AgentExecutionPlan", () => ({
  AgentExecutionPlan: (props: Record<string, unknown>) => {
    capturedExecutionPlanProps = props;
    return <div data-testid="agent-execution-plan">execution plan</div>;
  },
}));

// ==============================================
// HELPERS
// ==============================================

function setupDefaults(overrides?: {
  executionId?: string | null;
  briefingStatus?: string;
  briefing?: Record<string, unknown> | null;
  showModeSelector?: boolean;
  showExecutionPlan?: boolean;
}) {
  mockStoreState = {
    currentExecutionId: overrides?.executionId ?? null,
    setCurrentExecutionId: mockSetCurrentExecutionId,
    isAgentProcessing: false,
    setAgentProcessing: mockSetAgentProcessing,
    isInputDisabled: false,
    showModeSelector: overrides?.showModeSelector ?? false,
    setShowModeSelector: mockSetShowModeSelector,
    showExecutionPlan: overrides?.showExecutionPlan ?? false,
    setShowExecutionPlan: mockSetShowExecutionPlan,
  };
  mockBriefingState = {
    status: overrides?.briefingStatus ?? "idle",
    briefing: overrides?.briefing ?? null,
    missingFields: [],
    isComplete: false,
  };
  capturedModeSelectorProps = null;
  capturedExecutionPlanProps = null;
}

// ==============================================
// TESTS
// ==============================================

describe("AgentChat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedOnSendMessage = null;
    setupDefaults();
    // Default fetch mock: successful execution creation
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { id: "exec-new" } }),
    });
  });

  // --- Story 16.1: Render tests ---

  it("renders the chat container", () => {
    render(<AgentChat />);
    expect(screen.getByTestId("agent-chat")).toBeInTheDocument();
  });

  it("renders AgentMessageList", () => {
    render(<AgentChat />);
    expect(screen.getByTestId("agent-message-list")).toBeInTheDocument();
  });

  it("renders AgentInput", () => {
    render(<AgentChat />);
    expect(screen.getByTestId("agent-input")).toBeInTheDocument();
  });

  it("has flex column layout", () => {
    render(<AgentChat />);
    const container = screen.getByTestId("agent-chat");
    expect(container.className).toContain("flex");
    expect(container.className).toContain("flex-col");
  });

  // --- Story 16.3: Briefing flow interception ---

  describe("briefing flow (Story 16.3)", () => {
    it("deve criar execucao e rotear para briefing na primeira mensagem", async () => {
      setupDefaults({ executionId: null, briefingStatus: "idle" });
      mockProcessMessage.mockResolvedValueOnce({ handled: true });

      render(<AgentChat />);
      expect(capturedOnSendMessage).toBeTruthy();

      await act(async () => {
        await capturedOnSendMessage!("Quero prospectar CTOs que usam Netskope");
      });

      // Criou execucao
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/agent/executions",
        expect.objectContaining({ method: "POST" })
      );
      // Enviou mensagem do usuario
      expect(mockMutate).toHaveBeenCalledWith({
        executionId: "exec-new",
        content: "Quero prospectar CTOs que usam Netskope",
      });
      // Processou briefing
      expect(mockProcessMessage).toHaveBeenCalledWith(
        "Quero prospectar CTOs que usam Netskope",
        "exec-new",
        expect.any(Function)
      );
      // Ligou/desligou processing
      expect(mockSetAgentProcessing).toHaveBeenCalledWith(true);
      expect(mockSetAgentProcessing).toHaveBeenCalledWith(false);
    });

    it("deve rotear para briefing com execucao existente", async () => {
      setupDefaults({ executionId: "exec-existing", briefingStatus: "idle" });
      mockProcessMessage.mockResolvedValueOnce({ handled: true });

      render(<AgentChat />);

      await act(async () => {
        await capturedOnSendMessage!("briefing");
      });

      // NAO criou nova execucao
      expect(global.fetch).not.toHaveBeenCalledWith(
        "/api/agent/executions",
        expect.anything()
      );
      // Enviou mensagem
      expect(mockMutate).toHaveBeenCalledWith({
        executionId: "exec-existing",
        content: "briefing",
      });
      expect(mockProcessMessage).toHaveBeenCalled();
    });

    it("deve salvar briefing, enviar confirmacao e mostrar mode selector quando confirmado", async () => {
      const confirmedBriefing = {
        technology: "Netskope",
        jobTitles: ["CTO"],
        location: "Sao Paulo",
        companySize: null,
        industry: "fintech",
        productSlug: null,
        mode: "guided",
        skipSteps: [],
      };
      setupDefaults({
        executionId: "exec-123",
        briefingStatus: "confirming",
        briefing: confirmedBriefing,
      });
      mockProcessMessage.mockResolvedValueOnce({ handled: true, confirmed: true });

      // Mock fetch for sendAgentMessage and saveBriefing
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: {} }),
      });

      render(<AgentChat />);

      await act(async () => {
        await capturedOnSendMessage!("sim");
      });

      // saveBriefing PATCH call
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/agent/executions/exec-123/briefing",
        expect.objectContaining({ method: "PATCH" })
      );
      // sendAgentMessage with mode selection prompt
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/agent/executions/exec-123/messages",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("escolha o modo"),
        })
      );
      // setShowModeSelector(true)
      expect(mockSetShowModeSelector).toHaveBeenCalledWith(true);
    });

    it("deve enviar pelo fluxo normal quando briefing ja confirmado", async () => {
      setupDefaults({ executionId: "exec-123", briefingStatus: "confirmed" });

      render(<AgentChat />);

      await act(async () => {
        await capturedOnSendMessage!("mensagem normal");
      });

      // NAO chama processBriefing
      expect(mockProcessMessage).not.toHaveBeenCalled();
      // Envia diretamente via mutation
      expect(mockMutate).toHaveBeenCalledWith({
        executionId: "exec-123",
        content: "mensagem normal",
      });
    });

    it("deve mostrar toast quando criacao de execucao falha", async () => {
      setupDefaults({ executionId: null, briefingStatus: "idle" });
      (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error("Network error")
      );

      render(<AgentChat />);

      await act(async () => {
        await capturedOnSendMessage!("mensagem");
      });

      expect(mockToastError).toHaveBeenCalledWith(
        "Erro ao iniciar conversa. Tente novamente."
      );
      expect(mockMutate).not.toHaveBeenCalled();
    });

    it("deve mostrar toast quando sendAgentMessage falha (M1 fix)", async () => {
      setupDefaults({ executionId: "exec-123", briefingStatus: "idle" });
      mockProcessMessage.mockImplementationOnce(
        async (
          _content: string,
          _execId: string,
          sendAgentMsg: (id: string, msg: string) => Promise<void>
        ) => {
          // Simulate the hook calling sendAgentMessage
          await sendAgentMsg("exec-123", "resumo do briefing");
          return { handled: true };
        }
      );

      let fetchCallCount = 0;
      (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(() => {
        fetchCallCount++;
        // First call is sendMessageMutation (not fetch), second is sendAgentMessage
        return Promise.resolve({
          ok: false,
          status: 500,
          json: () => Promise.resolve({ error: { message: "Server error" } }),
        });
      });

      render(<AgentChat />);

      await act(async () => {
        await capturedOnSendMessage!("briefing");
      });

      expect(mockToastError).toHaveBeenCalledWith(
        "Erro ao enviar resposta do agente."
      );
    });

    it("deve mostrar toast quando saveBriefing falha (M2 fix)", async () => {
      const briefing = {
        technology: "AWS",
        jobTitles: ["CTO"],
        location: null,
        companySize: null,
        industry: null,
        productSlug: null,
        mode: "guided",
        skipSteps: [],
      };
      setupDefaults({
        executionId: "exec-123",
        briefingStatus: "confirming",
        briefing,
      });
      mockProcessMessage.mockResolvedValueOnce({ handled: true, confirmed: true });

      (global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
        if (typeof url === "string" && url.includes("/briefing")) {
          return Promise.resolve({
            ok: false,
            status: 500,
            json: () => Promise.resolve({ error: { message: "DB error" } }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ data: {} }),
        });
      });

      render(<AgentChat />);

      await act(async () => {
        await capturedOnSendMessage!("sim");
      });

      expect(mockToastError).toHaveBeenCalledWith(
        "Erro ao salvar briefing. Tente novamente."
      );
    });
  });

  // --- Story 16.4: Onboarding + Mode Selector ---

  describe("onboarding + mode selector (Story 16.4)", () => {
    it("passa isFirstTime para AgentMessageList", () => {
      setupDefaults();
      render(<AgentChat />);
      expect(capturedMessageListProps.isFirstTime).toBe(true);
    });

    it("renderiza mode selector quando showModeSelector e true", () => {
      setupDefaults({ showModeSelector: true });
      render(<AgentChat />);
      expect(screen.getByTestId("agent-mode-selector")).toBeInTheDocument();
    });

    it("nao renderiza mode selector quando showModeSelector e false", () => {
      setupDefaults({ showModeSelector: false });
      render(<AgentChat />);
      expect(screen.queryByTestId("agent-mode-selector")).not.toBeInTheDocument();
    });

    it("passa disabled para AgentInput quando showModeSelector e true", () => {
      setupDefaults({ showModeSelector: true });
      render(<AgentChat />);
      expect(capturedInputProps.disabled).toBe(true);
    });

    it("nao desabilita AgentInput quando showModeSelector e false", () => {
      setupDefaults({ showModeSelector: false });
      render(<AgentChat />);
      expect(capturedInputProps.disabled).toBe(false);
    });

    it("handleModeSelect salva modo via API e envia mensagem de confirmacao", async () => {
      setupDefaults({ executionId: "exec-123", showModeSelector: true });

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: {} }),
      });

      render(<AgentChat />);

      // Invoke onModeSelect from captured mode selector props
      const onModeSelect = capturedModeSelectorProps?.onModeSelect as (mode: string) => Promise<void>;
      expect(onModeSelect).toBeTruthy();

      await act(async () => {
        await onModeSelect("guided");
      });

      // PATCH mode
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/agent/executions/exec-123",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ mode: "guided" }),
        })
      );
      // Agent message confirming mode
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/agent/executions/exec-123/messages",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("Modo Guiado selecionado"),
        })
      );
      // Hide mode selector
      expect(mockSetShowModeSelector).toHaveBeenCalledWith(false);
    });

    it("handleModeSelect mostra toast quando PATCH falha", async () => {
      setupDefaults({ executionId: "exec-123", showModeSelector: true });

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: { message: "DB error" } }),
      });

      render(<AgentChat />);

      const onModeSelect = capturedModeSelectorProps?.onModeSelect as (mode: string) => Promise<void>;

      await act(async () => {
        await onModeSelect("autopilot");
      });

      expect(mockToastError).toHaveBeenCalledWith(
        "Erro ao salvar modo. Tente novamente."
      );
      // Should NOT hide mode selector on failure
      expect(mockSetShowModeSelector).not.toHaveBeenCalledWith(false);
    });

    it("handleModeSelect mostra toast quando fetch lanca excecao", async () => {
      setupDefaults({ executionId: "exec-123", showModeSelector: true });

      (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("Network error")
      );

      render(<AgentChat />);

      const onModeSelect = capturedModeSelectorProps?.onModeSelect as (mode: string) => Promise<void>;

      await act(async () => {
        await onModeSelect("guided");
      });

      expect(mockToastError).toHaveBeenCalledWith(
        "Erro ao salvar modo. Tente novamente."
      );
    });

    it("passa isSubmitting para AgentModeSelector", () => {
      setupDefaults({ executionId: "exec-123", showModeSelector: true });
      render(<AgentChat />);
      expect(capturedModeSelectorProps?.isSubmitting).toBe(false);
    });

    it("handleModeSelect ativa showExecutionPlan apos sucesso", async () => {
      setupDefaults({ executionId: "exec-123", showModeSelector: true });

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: {} }),
      });

      render(<AgentChat />);

      const onModeSelect = capturedModeSelectorProps?.onModeSelect as (mode: string) => Promise<void>;

      await act(async () => {
        await onModeSelect("guided");
      });

      expect(mockSetShowExecutionPlan).toHaveBeenCalledWith(true);
    });
  });

  // --- Story 16.5: Execution Plan ---

  describe("execution plan (Story 16.5)", () => {
    it("renderiza execution plan quando showExecutionPlan e true e executionId existe", () => {
      setupDefaults({ executionId: "exec-123", showExecutionPlan: true });
      render(<AgentChat />);
      expect(screen.getByTestId("agent-execution-plan")).toBeInTheDocument();
    });

    it("nao renderiza execution plan quando showExecutionPlan e false", () => {
      setupDefaults({ executionId: "exec-123", showExecutionPlan: false });
      render(<AgentChat />);
      expect(screen.queryByTestId("agent-execution-plan")).not.toBeInTheDocument();
    });

    it("nao renderiza execution plan quando executionId e null", () => {
      setupDefaults({ executionId: null, showExecutionPlan: true });
      render(<AgentChat />);
      expect(screen.queryByTestId("agent-execution-plan")).not.toBeInTheDocument();
    });

    it("passa disabled para AgentInput quando showExecutionPlan e true", () => {
      setupDefaults({ executionId: "exec-123", showExecutionPlan: true });
      render(<AgentChat />);
      expect(capturedInputProps.disabled).toBe(true);
    });

    it("handleConfirmPlan chama POST confirm e envia mensagem de confirmacao", async () => {
      setupDefaults({ executionId: "exec-123", showExecutionPlan: true });

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: {} }),
      });

      render(<AgentChat />);

      const onConfirm = capturedExecutionPlanProps?.onConfirm as () => Promise<void>;
      expect(onConfirm).toBeTruthy();

      await act(async () => {
        await onConfirm();
      });

      // POST confirm
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/agent/executions/exec-123/confirm",
        expect.objectContaining({ method: "POST" })
      );
      // Agent message confirming start
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/agent/executions/exec-123/messages",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("Execucao iniciada"),
        })
      );
      // Hide execution plan
      expect(mockSetShowExecutionPlan).toHaveBeenCalledWith(false);
    });

    it("handleConfirmPlan mostra toast quando POST confirm falha", async () => {
      setupDefaults({ executionId: "exec-123", showExecutionPlan: true });

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        status: 500,
      });

      render(<AgentChat />);

      const onConfirm = capturedExecutionPlanProps?.onConfirm as () => Promise<void>;

      await act(async () => {
        await onConfirm();
      });

      expect(mockToastError).toHaveBeenCalledWith(
        "Erro ao confirmar execucao. Tente novamente."
      );
      // Should NOT hide plan on failure
      expect(mockSetShowExecutionPlan).not.toHaveBeenCalledWith(false);
    });

    it("handleCancelPlan envia mensagem e esconde plan", async () => {
      setupDefaults({ executionId: "exec-123", showExecutionPlan: true });

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: {} }),
      });

      render(<AgentChat />);

      const onCancel = capturedExecutionPlanProps?.onCancel as () => Promise<void>;
      expect(onCancel).toBeTruthy();

      await act(async () => {
        await onCancel();
      });

      // Agent message for cancel
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/agent/executions/exec-123/messages",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("Tudo bem"),
        })
      );
      // Hide execution plan
      expect(mockSetShowExecutionPlan).toHaveBeenCalledWith(false);
    });

    it("handleCancelPlan fecha plan mesmo quando sendAgentMessage falha", async () => {
      setupDefaults({ executionId: "exec-123", showExecutionPlan: true });

      (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("Network error")
      );

      render(<AgentChat />);

      const onCancel = capturedExecutionPlanProps?.onCancel as () => Promise<void>;

      await act(async () => {
        await onCancel();
      });

      // Plan should still be hidden despite error
      expect(mockSetShowExecutionPlan).toHaveBeenCalledWith(false);
      // Toast shown for the error
      expect(mockToastError).toHaveBeenCalledWith(
        "Erro ao enviar mensagem. Tente novamente."
      );
    });

    it("handleConfirmPlan fecha plan antes de enviar mensagem (resiliente a falha de mensagem)", async () => {
      setupDefaults({ executionId: "exec-123", showExecutionPlan: true });

      let fetchCallCount = 0;
      (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(() => {
        fetchCallCount++;
        if (fetchCallCount === 1) {
          // POST /confirm succeeds
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ data: {} }),
          });
        }
        // sendAgentMessage throws
        return Promise.reject(new Error("Network error"));
      });

      render(<AgentChat />);

      const onConfirm = capturedExecutionPlanProps?.onConfirm as () => Promise<void>;

      await act(async () => {
        await onConfirm();
      });

      // Plan closed even though message failed
      expect(mockSetShowExecutionPlan).toHaveBeenCalledWith(false);
      // Toast shown for the catch
      expect(mockToastError).toHaveBeenCalledWith(
        "Erro ao confirmar execucao. Tente novamente."
      );
    });

    it("passa executionId e isSubmitting para AgentExecutionPlan", () => {
      setupDefaults({ executionId: "exec-123", showExecutionPlan: true });
      render(<AgentChat />);
      expect(capturedExecutionPlanProps?.executionId).toBe("exec-123");
      expect(capturedExecutionPlanProps?.isSubmitting).toBe(false);
    });
  });
});
