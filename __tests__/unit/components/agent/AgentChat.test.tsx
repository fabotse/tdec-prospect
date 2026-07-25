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
const mockSetExecutionMode = vi.fn();
const mockSetTotalSteps = vi.fn();
const mockProcessMessage = vi.fn().mockResolvedValue({ handled: true });
const mockToastError = vi.fn();
// Story 22.13: setters do estado de ajuste pos-rejeicao
const mockSetAdjustingStep = vi.fn();
const mockClearAdjustingStep = vi.fn();

let capturedOnSendMessage: ((content: string) => Promise<void>) | null = null;
let capturedMessageListProps: Record<string, unknown> = {};
let capturedInputProps: Record<string, unknown> = {};
let capturedModeSelectorProps: Record<string, unknown> | null = null;
let capturedExecutionPlanProps: Record<string, unknown> | null = null;
let mockStoreState: Record<string, unknown> = {};
let mockBriefingState: Record<string, unknown> = {};
// Story 22.8: profile do usuario logado (usado na validacao-no-mount do reattach).
// Default null -> a validacao aguarda o profile e nao dispara (mantem os testes legados intactos).
let mockUserState: { profile: { id: string } | null } = { profile: null };

vi.mock("sonner", () => ({
  toast: { error: (...args: unknown[]) => mockToastError(...args) },
}));

vi.mock("@/hooks/use-user", () => ({
  useUser: () => mockUserState,
}));

const mockRefetchMessages = vi.fn();
// Story 22.8: dados da execucao reidratados pelo hook (mutavel para testar reattach de steps/mensagens)
let mockExecutionData: { messages: unknown[]; steps: unknown[] } = { messages: [], steps: [] };

vi.mock("@/hooks/use-agent-execution", () => ({
  useAgentExecution: () => ({
    messages: mockExecutionData.messages,
    steps: mockExecutionData.steps,
    isLoading: false,
    isConnected: false,
    refetchMessages: mockRefetchMessages,
  }),
  useSendMessage: () => ({ mutate: mockMutate, isPending: false }),
}));

vi.mock("@/hooks/use-agent-onboarding", () => ({
  useAgentOnboarding: () => ({ isFirstTime: true, isLoading: false }),
}));

vi.mock("@/stores/use-agent-store", () => ({
  // Story 22.8: expoe getState() (usado pela validacao-no-mount para ler o id persistido)
  useAgentStore: Object.assign(
    (selector: (s: Record<string, unknown>) => unknown) => selector(mockStoreState),
    { getState: () => mockStoreState }
  ),
}));

vi.mock("@/hooks/use-auto-trigger", () => ({
  useAutoTrigger: () => {},
}));

// Story 22.10: `reset` e spy compartilhado — o botao "Nova conversa" precisa chama-lo
// (sem isso o briefing sobrevive em memoria e o agente retoma a conversa morta).
const mockResetBriefing = vi.fn();
// Story 22.13: seams do ajuste pos-rejeicao (memoria da 22.3 reusada, nunca duplicada).
const mockParseAdjustment = vi.fn();
const mockRecordAgentTurn = vi.fn();
const mockRecordUserTurn = vi.fn();

// Story 22.13: importOriginal preserva os helpers PUROS exportados pelo modulo
// (isConfirmation — SSOT deterministico da confirmacao). Sem isso o AgentChat
// importaria `undefined` e o ramo de ajuste quebraria no teste por artefato do mock.
vi.mock("@/hooks/use-briefing-flow", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/use-briefing-flow")>();
  return {
    ...actual,
    useBriefingFlow: () => ({
      state: mockBriefingState,
      processMessage: mockProcessMessage,
      reset: mockResetBriefing,
      parseAdjustment: mockParseAdjustment,
      recordAgentTurn: mockRecordAgentTurn,
      recordUserTurn: mockRecordUserTurn,
    }),
  };
});

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

vi.mock("@/components/agent/AgentStepProgress", () => ({
  AgentStepProgress: () => <div data-testid="agent-step-progress">step progress</div>,
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
  adjustingStep?: Record<string, unknown> | null;
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
    executionMode: null,
    setExecutionMode: mockSetExecutionMode,
    totalSteps: 0,
    setTotalSteps: mockSetTotalSteps,
    // Story 22.13: estado de ajuste pos-rejeicao (efemero, nunca persistido)
    adjustingStep: overrides?.adjustingStep ?? null,
    setAdjustingStep: mockSetAdjustingStep,
    clearAdjustingStep: mockClearAdjustingStep,
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
    // Story 22.8: profile ausente por padrao -> validacao-no-mount nao dispara nos testes legados
    mockUserState = { profile: null };
    mockExecutionData = { messages: [], steps: [] };
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
      // Processou briefing (4 args: content, execId, sendAgentMessage, createProduct)
      expect(mockProcessMessage).toHaveBeenCalledWith(
        "Quero prospectar CTOs que usam Netskope",
        "exec-new",
        expect.any(Function),
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

      // First call is sendMessageMutation (not fetch), second is sendAgentMessage
      (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(() => {
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

  // --- Story 16.6: Product creation ---

  describe("product creation (Story 16.6)", () => {
    it("deve passar createProduct como 4o argumento ao processBriefing", async () => {
      setupDefaults({ executionId: "exec-123", briefingStatus: "idle" });
      mockProcessMessage.mockResolvedValueOnce({ handled: true });

      render(<AgentChat />);

      await act(async () => {
        await capturedOnSendMessage!("Quero prospectar pro TDEC Analytics");
      });

      // processMessage should have been called with 4 args: content, execId, sendAgentMessage, createProduct
      expect(mockProcessMessage).toHaveBeenCalledWith(
        "Quero prospectar pro TDEC Analytics",
        "exec-123",
        expect.any(Function),
        expect.any(Function)
      );
    });

    it("createProduct chama POST /api/products e retorna id", async () => {
      setupDefaults({ executionId: "exec-123", briefingStatus: "idle" });

      // Capture the createProduct callback
      let capturedCreateProduct: ((product: Record<string, unknown>) => Promise<string | null>) | null = null;
      mockProcessMessage.mockImplementationOnce(
        async (
          _content: string,
          _execId: string,
          _sendAgentMsg: unknown,
          createProduct?: (product: Record<string, unknown>) => Promise<string | null>
        ) => {
          capturedCreateProduct = createProduct ?? null;
          return { handled: true };
        }
      );

      (global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string, options?: RequestInit) => {
        if (typeof url === "string" && url === "/api/products" && options?.method === "POST") {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ data: { id: "new-prod-123" } }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ data: { id: "exec-123" } }),
        });
      });

      render(<AgentChat />);

      await act(async () => {
        await capturedOnSendMessage!("Quero prospectar pro TDEC Analytics");
      });

      expect(capturedCreateProduct).toBeTruthy();

      let productId: string | null = null;
      await act(async () => {
        productId = await capturedCreateProduct!({
          name: "TDEC Analytics",
          description: "Plataforma de analytics",
        });
      });

      expect(productId).toBe("new-prod-123");
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/products",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            name: "TDEC Analytics",
            description: "Plataforma de analytics",
          }),
        })
      );
    });

    it("createProduct retorna null quando API falha", async () => {
      setupDefaults({ executionId: "exec-123", briefingStatus: "idle" });

      let capturedCreateProduct: ((product: Record<string, unknown>) => Promise<string | null>) | null = null;
      mockProcessMessage.mockImplementationOnce(
        async (
          _content: string,
          _execId: string,
          _sendAgentMsg: unknown,
          createProduct?: (product: Record<string, unknown>) => Promise<string | null>
        ) => {
          capturedCreateProduct = createProduct ?? null;
          return { handled: true };
        }
      );

      (global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
        if (typeof url === "string" && url === "/api/products") {
          return Promise.resolve({
            ok: false,
            status: 500,
            json: () => Promise.resolve({ error: "Server error" }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ data: { id: "exec-123" } }),
        });
      });

      render(<AgentChat />);

      await act(async () => {
        await capturedOnSendMessage!("mensagem");
      });

      let productId: string | null = "not-null";
      await act(async () => {
        productId = await capturedCreateProduct!({
          name: "Test",
          description: "Test",
        });
      });

      expect(productId).toBeNull();
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

  // --- Story 22.8: Reattach de execucao no refresh ---

  describe("reattach de execucao no refresh (Story 22.8)", () => {
    const USER_ID = "user-1";

    // Mock URL-aware do GET /api/agent/executions (fonte da validacao-no-mount)
    function mockExecutionsList(executions: Array<Record<string, unknown>>) {
      (global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
        if (typeof url === "string" && url === "/api/agent/executions") {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ data: executions }),
          });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: {} }) });
      });
    }

    it("mantem o id quando a execucao persistida esta RUNNING e e do usuario (AC1/AC2)", async () => {
      setupDefaults({ executionId: "exec-run" });
      mockUserState = { profile: { id: USER_ID } };
      mockExecutionsList([{ id: "exec-run", user_id: USER_ID, status: "running" }]);

      await act(async () => {
        render(<AgentChat />);
      });

      // Validou contra o servidor (GET, sem body)
      expect(global.fetch).toHaveBeenCalledWith("/api/agent/executions");
      // NAO descartou o id
      expect(mockSetCurrentExecutionId).not.toHaveBeenCalledWith(null);
    });

    it("mantem o id quando a execucao esta PAUSED (ativo) (AC2)", async () => {
      setupDefaults({ executionId: "exec-paused" });
      mockUserState = { profile: { id: USER_ID } };
      mockExecutionsList([{ id: "exec-paused", user_id: USER_ID, status: "paused" }]);

      await act(async () => {
        render(<AgentChat />);
      });

      // Consultou o servidor antes de decidir manter (nao "manteve" so por nunca ter validado)
      expect(global.fetch).toHaveBeenCalledWith("/api/agent/executions");
      expect(mockSetCurrentExecutionId).not.toHaveBeenCalledWith(null);
    });

    // Story 22.10 (AC2): INVERSAO deliberada do caso PENDING da 22.8.
    // Toda conversa abandonada no meio do briefing fica 'pending' PARA SEMPRE (nada a
    // encerra), entao o criterio da 22.8 fazia historico morto reaparecer em todo login/
    // refresh — e reaparecer QUEBRADO (mensagens reidratam, mas o useBriefingFlow volta a
    // 'idle' e o agente repergunta tudo dentro do mesmo historico). Com o confirm gravando
    // 'running' (AC1), 'pending' passa a significar exatamente "briefing nao confirmado".
    it("DESCARTA o id quando a execucao esta PENDING (briefing abandonado) (AC2)", async () => {
      setupDefaults({ executionId: "exec-pending" });
      mockUserState = { profile: { id: USER_ID } };
      mockExecutionsList([{ id: "exec-pending", user_id: USER_ID, status: "pending" }]);

      await act(async () => {
        render(<AgentChat />);
      });

      expect(global.fetch).toHaveBeenCalledWith("/api/agent/executions");
      expect(mockSetCurrentExecutionId).toHaveBeenCalledWith(null);
    });

    it("descarta o id quando a execucao foi CANCELADA (terminal, Story 22.10) (AC2)", async () => {
      setupDefaults({ executionId: "exec-cancel" });
      mockUserState = { profile: { id: USER_ID } };
      mockExecutionsList([{ id: "exec-cancel", user_id: USER_ID, status: "cancelled" }]);

      await act(async () => {
        render(<AgentChat />);
      });

      expect(mockSetCurrentExecutionId).toHaveBeenCalledWith(null);
    });

    it("descarta o id quando a execucao esta COMPLETED (terminal) (AC2)", async () => {
      setupDefaults({ executionId: "exec-done" });
      mockUserState = { profile: { id: USER_ID } };
      mockExecutionsList([{ id: "exec-done", user_id: USER_ID, status: "completed" }]);

      await act(async () => {
        render(<AgentChat />);
      });

      expect(mockSetCurrentExecutionId).toHaveBeenCalledWith(null);
    });

    it("descarta o id quando a execucao FALHOU (terminal) (AC2)", async () => {
      setupDefaults({ executionId: "exec-fail" });
      mockUserState = { profile: { id: USER_ID } };
      mockExecutionsList([{ id: "exec-fail", user_id: USER_ID, status: "failed" }]);

      await act(async () => {
        render(<AgentChat />);
      });

      expect(mockSetCurrentExecutionId).toHaveBeenCalledWith(null);
    });

    it("descarta o id quando nao existe na lista (inexistente) (AC2)", async () => {
      setupDefaults({ executionId: "exec-ghost" });
      mockUserState = { profile: { id: USER_ID } };
      mockExecutionsList([{ id: "outra", user_id: USER_ID, status: "running" }]);

      await act(async () => {
        render(<AgentChat />);
      });

      expect(mockSetCurrentExecutionId).toHaveBeenCalledWith(null);
    });

    it("descarta o id de execucao de OUTRO usuario, mesmo ativa (guardrail user_id) (AC2)", async () => {
      setupDefaults({ executionId: "exec-alheia" });
      mockUserState = { profile: { id: USER_ID } };
      mockExecutionsList([{ id: "exec-alheia", user_id: "outro-user", status: "running" }]);

      await act(async () => {
        render(<AgentChat />);
      });

      expect(mockSetCurrentExecutionId).toHaveBeenCalledWith(null);
    });

    it("NAO descarta o id se o GET responde 200 com payload nao-array (defensivo, shape inesperado)", async () => {
      setupDefaults({ executionId: "exec-run" });
      mockUserState = { profile: { id: USER_ID } };
      // 200 OK mas data nao e array (contrato mudado / proxy / erro serializado)
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: { error: "unexpected" } }),
      });

      await act(async () => {
        render(<AgentChat />);
      });

      // Trata como transitorio: mantem o id (nao descarta uma execucao possivelmente ativa)
      expect(global.fetch).toHaveBeenCalledWith("/api/agent/executions");
      expect(mockSetCurrentExecutionId).not.toHaveBeenCalledWith(null);
    });

    it("NAO descarta o id em falha de rede, mas TENTA validar (defensivo — nao apaga a toa) (AC2)", async () => {
      setupDefaults({ executionId: "exec-run" });
      mockUserState = { profile: { id: USER_ID } };
      (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Network"));

      await act(async () => {
        render(<AgentChat />);
      });

      // A validacao foi tentada (o teste falharia se a validacao inteira nao rodasse)...
      expect(global.fetch).toHaveBeenCalledWith("/api/agent/executions");
      // ...e mesmo assim o id NAO foi descartado (revalida no proximo mount)
      expect(mockSetCurrentExecutionId).not.toHaveBeenCalledWith(null);
    });

    it("reataca RUNNING autopilot: reidrata steps + mensagens E restaura o mode (AC3/AC4)", async () => {
      setupDefaults({ executionId: "exec-run" });
      mockUserState = { profile: { id: USER_ID } };
      mockExecutionsList([
        { id: "exec-run", user_id: USER_ID, status: "running", mode: "autopilot" },
      ]);
      mockExecutionData = {
        messages: [{ id: "m1", role: "user", content: "oi" }],
        steps: [{ id: "s1", step_number: 1, status: "running" }],
      };

      await act(async () => {
        render(<AgentChat />);
      });

      // Progresso volta a ficar visivel (a execucao que gasta reaparece)
      expect(screen.getByTestId("agent-step-progress")).toBeInTheDocument();
      // Mensagens reidratadas -> sem tela em branco
      expect(capturedMessageListProps.messages).toHaveLength(1);
      // O id foi MANTIDO (nao descartado)
      expect(mockSetCurrentExecutionId).not.toHaveBeenCalledWith(null);
      // E o mode foi restaurado -> useAutoTrigger volta a avancar os steps
      // (sem isto, autopilot reatacharia visualmente mas pararia de progredir)
      expect(mockSetExecutionMode).toHaveBeenCalledWith("autopilot");
    });

    it("first-time / sem id persistido: nao valida nem descarta (zero regressao, NFR4)", async () => {
      setupDefaults({ executionId: null });
      mockUserState = { profile: { id: USER_ID } };

      await act(async () => {
        render(<AgentChat />);
      });

      // Sem id persistido -> nao bate no endpoint de validacao
      expect(global.fetch).not.toHaveBeenCalledWith("/api/agent/executions");
      expect(mockSetCurrentExecutionId).not.toHaveBeenCalledWith(null);
    });
  });

  // --- Story 22.10: botao "Nova conversa" ---

  describe('botao "Nova conversa" (Story 22.10)', () => {
    const USER_ID = "user-1";

    // Mock URL-aware: PATCH de cancelamento + GET de validacao.
    function mockCancel(ok: boolean) {
      (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(
        (url: string, options?: RequestInit) => {
          if (typeof url === "string" && url === "/api/agent/executions") {
            return Promise.resolve({
              ok: true,
              json: () => Promise.resolve({ data: [] }),
            });
          }
          if (options?.method === "PATCH") {
            return Promise.resolve({
              ok,
              status: ok ? 200 : 500,
              json: () => Promise.resolve({ data: { status: "cancelled" } }),
            });
          }
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: {} }) });
        }
      );
    }

    function clickNewConversation() {
      return act(async () => {
        screen.getByTestId("agent-new-conversation").click();
      });
    }

    it("NAO renderiza o botao sem execucao (first-time byte-a-byte, NFR4/AC5)", () => {
      setupDefaults({ executionId: null });
      render(<AgentChat />);
      expect(screen.queryByTestId("agent-new-conversation")).not.toBeInTheDocument();
    });

    it("renderiza o botao quando ha execucao em andamento (AC5)", () => {
      setupDefaults({ executionId: "exec-123" });
      render(<AgentChat />);
      expect(screen.getByTestId("agent-new-conversation")).toBeInTheDocument();
    });

    it("execucao de BRIEFING (pending, sem steps): cancela DIRETO, sem dialog (AC5)", async () => {
      setupDefaults({ executionId: "exec-123" });
      mockCancel(true);

      render(<AgentChat />);
      await clickNewConversation();

      // PATCH { status: "cancelled" } — sem passar por confirmacao
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/agent/executions/exec-123",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ status: "cancelled" }),
        })
      );
      expect(
        screen.queryByTestId("agent-confirm-new-conversation")
      ).not.toBeInTheDocument();
    });

    it("cancelamento bem-sucedido limpa TUDO: store + briefing reset() (AC6)", async () => {
      setupDefaults({ executionId: "exec-123" });
      mockCancel(true);

      render(<AgentChat />);
      await clickNewConversation();

      expect(mockSetCurrentExecutionId).toHaveBeenCalledWith(null);
      expect(mockSetShowModeSelector).toHaveBeenCalledWith(false);
      expect(mockSetShowExecutionPlan).toHaveBeenCalledWith(false);
      expect(mockSetExecutionMode).toHaveBeenCalledWith(null);
      expect(mockSetAgentProcessing).toHaveBeenCalledWith(false);
      expect(mockSetTotalSteps).toHaveBeenCalledWith(0);
      // o reset do briefing e o que impede o agente de retomar a conversa morta
      expect(mockResetBriefing).toHaveBeenCalled();
    });

    it("PATCH falhou: toast de erro e NADA e limpo (tudo-ou-nada, AC5)", async () => {
      setupDefaults({ executionId: "exec-123" });
      mockCancel(false);

      render(<AgentChat />);
      await clickNewConversation();

      expect(mockToastError).toHaveBeenCalledWith(
        "Erro ao encerrar a conversa. Tente novamente."
      );
      // execucao segue viva no servidor -> a UI NAO pode fingir que acabou
      expect(mockSetCurrentExecutionId).not.toHaveBeenCalledWith(null);
      expect(mockResetBriefing).not.toHaveBeenCalled();
    });

    it("falha de REDE no PATCH: toast e nada limpo (AC5)", async () => {
      setupDefaults({ executionId: "exec-123" });
      (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Network"));

      render(<AgentChat />);
      await clickNewConversation();

      expect(mockToastError).toHaveBeenCalledWith(
        "Erro ao encerrar a conversa. Tente novamente."
      );
      expect(mockSetCurrentExecutionId).not.toHaveBeenCalledWith(null);
      expect(mockResetBriefing).not.toHaveBeenCalled();
    });

    it("PATCH 409 (execucao ja terminal no servidor): reseta o cliente e NAO trava (code review)", async () => {
      setupDefaults({ executionId: "exec-123" });
      // Ex.: autopilot completou dentro da sessao; o id ainda esta setado, o botao aparece,
      // mas o PATCH cancel bate numa linha terminal -> 409. Antes do fix o cliente so dava
      // toast e nao limpava nada -> usuario preso ao botao (todo retry 409) ate dar F5.
      (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(
        (url: string, options?: RequestInit) => {
          if (typeof url === "string" && url === "/api/agent/executions") {
            return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [] }) });
          }
          if (options?.method === "PATCH") {
            return Promise.resolve({
              ok: false,
              status: 409,
              json: () => Promise.resolve({ error: { code: "INVALID_TRANSITION" } }),
            });
          }
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: {} }) });
        }
      );

      render(<AgentChat />);
      await clickNewConversation();

      // 409 = ja encerrou no servidor -> seguro (e necessario) resetar o cliente
      expect(mockSetCurrentExecutionId).toHaveBeenCalledWith(null);
      expect(mockResetBriefing).toHaveBeenCalled();
      // e SEM toast de erro: nao e falha real, a execucao ja estava encerrada
      expect(mockToastError).not.toHaveBeenCalled();
    });

    it("execucao POS-CONFIRM (com steps): exige confirmacao no dialog antes de cancelar (AC5)", async () => {
      setupDefaults({ executionId: "exec-123" });
      // steps so existem apos o POST /confirm -> ja gastou
      mockExecutionData = {
        messages: [],
        steps: [{ id: "s1", step_number: 1, status: "completed" }],
      };
      mockCancel(true);

      render(<AgentChat />);
      await clickNewConversation();

      // NAO cancelou ainda — abriu o dialog
      expect(global.fetch).not.toHaveBeenCalledWith(
        "/api/agent/executions/exec-123",
        expect.objectContaining({ method: "PATCH" })
      );
      const confirmButton = screen.getByTestId("agent-confirm-new-conversation");
      expect(confirmButton).toBeInTheDocument();

      // aviso explicito sobre o que se perde
      expect(screen.getByText(/creditos ja consumidos nao sao revertidos/i)).toBeInTheDocument();

      await act(async () => {
        confirmButton.click();
      });

      expect(global.fetch).toHaveBeenCalledWith(
        "/api/agent/executions/exec-123",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ status: "cancelled" }),
        })
      );
      expect(mockResetBriefing).toHaveBeenCalled();
    });

    it("execucao RUNNING reatachada: exige o dialog mesmo antes dos steps carregarem (AC5)", async () => {
      setupDefaults({ executionId: "exec-run" });
      mockUserState = { profile: { id: USER_ID } };
      // validacao-no-mount devolve running; steps ainda vazios (fetch em voo)
      (global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
        if (typeof url === "string" && url === "/api/agent/executions") {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                data: [{ id: "exec-run", user_id: USER_ID, status: "running" }],
              }),
          });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: {} }) });
      });

      await act(async () => {
        render(<AgentChat />);
      });

      await clickNewConversation();

      // dialog aberto, nenhum PATCH disparado
      expect(screen.getByTestId("agent-confirm-new-conversation")).toBeInTheDocument();
      expect(global.fetch).not.toHaveBeenCalledWith(
        "/api/agent/executions/exec-run",
        expect.objectContaining({ method: "PATCH" })
      );
    });
  });

  // ==============================================
  // Story 22.13 — Ajuste pos-rejeicao de etapa
  // ==============================================

  describe("ajuste pos-rejeicao (Story 22.13)", () => {
    const EXEC = "exec-adj";

    // Briefing PERSISTIDO na execucao (o que o servidor tem). Carrega a FORMA do
    // pipeline (skipSteps/mode/productSlug/premiumIcebreakers/importedLeads) que o
    // ajuste NUNCA pode alterar (AC4).
    const PERSISTED_BRIEFING = {
      technology: "Netskope",
      jobTitles: ["CTO"],
      location: "Sao Paulo",
      companySize: "51-200",
      industry: "fintech",
      productSlug: "prod-1",
      mode: "guided",
      skipSteps: ["search_companies"],
      premiumIcebreakers: true,
      objective: "COLD_OUTREACH",
      urgency: "MEDIUM",
      campaignDescription: null,
      emailCount: 3,
    };

    // Briefing devolvido pelo /parse apos o ajuste ("remove o filtro de tamanho e o de
    // industria"). O parse re-deriva o briefing INTEIRO — inclusive a forma, que deve
    // ser descartada pelo merge.
    const PARSED_BRIEFING = {
      technology: "Netskope",
      jobTitles: ["CTO"],
      location: "Sao Paulo",
      companySize: null,
      industry: null,
      productSlug: null,
      mode: "guided",
      skipSteps: [],
      objective: "COLD_OUTREACH",
      urgency: "MEDIUM",
      campaignDescription: null,
      emailCount: 3,
    };

    function mockAdjustmentFetch(opts?: {
      persistedBriefing?: Record<string, unknown> | null;
      planFails?: boolean;
      patchOk?: boolean;
    }) {
      const persisted = opts?.persistedBriefing ?? PERSISTED_BRIEFING;
      (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(
        (url: string, init?: { method?: string }) => {
          if (url === "/api/agent/executions") {
            return Promise.resolve({
              ok: true,
              json: () =>
                Promise.resolve({
                  data: [{ id: EXEC, user_id: "u1", status: "running", briefing: persisted }],
                }),
            });
          }
          if (url === `/api/agent/executions/${EXEC}/briefing`) {
            return Promise.resolve({
              ok: opts?.patchOk ?? true,
              json: () => Promise.resolve({ data: {} }),
            });
          }
          if (url === `/api/agent/executions/${EXEC}/plan`) {
            if (opts?.planFails) {
              return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
            }
            return Promise.resolve({
              ok: true,
              json: () =>
                Promise.resolve({
                  data: {
                    steps: [
                      { stepNumber: 1, stepType: "search_companies", estimatedCost: 5 },
                      { stepNumber: 2, stepType: "search_leads", estimatedCost: 12.5 },
                    ],
                  },
                }),
            });
          }
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ data: {} }),
            method: init?.method,
          });
        }
      );
    }

    function adjusting(phase: "describe" | "confirm") {
      return { executionId: EXEC, stepNumber: 2, stepType: "search_leads", phase };
    }

    function patchCalls() {
      return (global.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
        (c) => c[0] === `/api/agent/executions/${EXEC}/briefing`
      );
    }

    function executeCalls() {
      return (global.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
        (c) => c[0] === `/api/agent/executions/${EXEC}/steps/2/execute`
      );
    }

    function agentMessages(): string[] {
      return (global.fetch as ReturnType<typeof vi.fn>).mock.calls
        .filter((c) => c[0] === `/api/agent/executions/${EXEC}/messages`)
        .map((c) => JSON.parse((c[1] as { body: string }).body).content as string);
    }

    // --- AC2: descrever o ajuste -> parse + PATCH + resumo/custo + fase confirm ---

    it("fase describe: parseia com a memoria da 22.3, aplica PATCH e pede confirmacao (AC2)", async () => {
      setupDefaults({
        executionId: EXEC,
        briefingStatus: "confirmed",
        adjustingStep: adjusting("describe"),
      });
      mockAdjustmentFetch();
      mockParseAdjustment.mockResolvedValueOnce({
        briefing: PARSED_BRIEFING,
        missingFields: ["companySize", "industry"],
        isComplete: false,
        canProceed: true,
        suggestions: {},
        productMentioned: null,
        nextAction: "confirm",
        questionText: null,
      });

      render(<AgentChat />);
      await act(async () => {
        await capturedOnSendMessage!("remove o filtro de tamanho e o de industria");
      });

      // Mensagem do usuario persistida como hoje
      expect(mockMutate).toHaveBeenCalledWith({
        executionId: EXEC,
        content: "remove o filtro de tamanho e o de industria",
      });
      // Roteada ao parse REUSANDO o seam do hook (memoria conversacional da 22.3)
      expect(mockParseAdjustment).toHaveBeenCalledWith(
        "remove o filtro de tamanho e o de industria",
        EXEC
      );

      // PATCH com o briefing MESCLADO
      expect(patchCalls()).toHaveLength(1);
      const body = JSON.parse((patchCalls()[0][1] as { body: string }).body);
      // filtros vem do parse
      expect(body.companySize).toBeNull();
      expect(body.industry).toBeNull();
      expect(body.jobTitles).toEqual(["CTO"]);
      // forma vem da execucao em andamento (AC4)
      expect(body.skipSteps).toEqual(["search_companies"]);
      expect(body.productSlug).toBe("prod-1");
      expect(body.mode).toBe("guided");
      expect(body.premiumIcebreakers).toBe(true);

      // UMA mensagem do agente com resumo + custo + pergunta de confirmacao
      const msgs = agentMessages();
      expect(msgs).toHaveLength(1);
      expect(msgs[0]).toContain("12,50");
      expect(msgs[0]).toMatch(/confirma/i);
      // ...e ela entra na memoria conversacional (Trap #2)
      expect(mockRecordAgentTurn).toHaveBeenCalledWith(msgs[0]);

      // Fase avanca para confirm; NADA foi executado
      expect(mockSetAdjustingStep).toHaveBeenCalledWith({
        executionId: EXEC,
        stepNumber: 2,
        stepType: "search_leads",
        phase: "confirm",
      });
      expect(executeCalls()).toHaveLength(0);
      expect(mockRefetchMessages).toHaveBeenCalledWith(EXEC);
    });

    it("custo indisponivel: resumo sem o numero, confirmacao continua obrigatoria (AC2 fail-open)", async () => {
      setupDefaults({
        executionId: EXEC,
        briefingStatus: "confirmed",
        adjustingStep: adjusting("describe"),
      });
      mockAdjustmentFetch({ planFails: true });
      mockParseAdjustment.mockResolvedValueOnce({
        briefing: PARSED_BRIEFING,
        missingFields: [],
        isComplete: true,
        canProceed: true,
        suggestions: {},
        productMentioned: null,
        nextAction: "confirm",
        questionText: null,
      });

      render(<AgentChat />);
      await act(async () => {
        await capturedOnSendMessage!("tira o filtro de tamanho");
      });

      expect(patchCalls()).toHaveLength(1);
      expect(agentMessages()[0]).toMatch(/confirma/i);
      expect(mockSetAdjustingStep).toHaveBeenCalledWith(
        expect.objectContaining({ phase: "confirm" })
      );
      expect(executeCalls()).toHaveLength(0);
    });

    it("parse falha: avisa, MANTEM o estado de ajuste e nao faz PATCH nem execute (AC2 fail-open)", async () => {
      setupDefaults({
        executionId: EXEC,
        briefingStatus: "confirmed",
        adjustingStep: adjusting("describe"),
      });
      mockAdjustmentFetch();
      mockParseAdjustment.mockRejectedValueOnce(new Error("timeout"));

      render(<AgentChat />);
      await act(async () => {
        await capturedOnSendMessage!("remove o filtro de tamanho");
      });

      expect(patchCalls()).toHaveLength(0);
      expect(executeCalls()).toHaveLength(0);
      expect(mockClearAdjustingStep).not.toHaveBeenCalled();
      expect(mockSetAdjustingStep).not.toHaveBeenCalled();
      expect(agentMessages()[0]).toMatch(/nao consegui/i);
    });

    it("parse sem cargo/localizacao (canProceed=false): nao aplica nada — fail-safe do merge (AC4)", async () => {
      setupDefaults({
        executionId: EXEC,
        briefingStatus: "confirmed",
        adjustingStep: adjusting("describe"),
      });
      mockAdjustmentFetch();
      mockParseAdjustment.mockResolvedValueOnce({
        briefing: { ...PARSED_BRIEFING, jobTitles: [], location: null },
        missingFields: ["jobTitles", "location"],
        isComplete: false,
        canProceed: false,
        suggestions: {},
        productMentioned: null,
        nextAction: "ask",
        questionText: null,
      });

      render(<AgentChat />);
      await act(async () => {
        await capturedOnSendMessage!("de novo");
      });

      expect(patchCalls()).toHaveLength(0);
      expect(executeCalls()).toHaveLength(0);
      expect(mockSetAdjustingStep).not.toHaveBeenCalled();
    });

    // --- AC3: confirmacao deterministica -> re-execucao ---

    it("fase confirm + confirmacao deterministica: re-executa o step e limpa o estado (AC3)", async () => {
      setupDefaults({
        executionId: EXEC,
        briefingStatus: "confirmed",
        adjustingStep: adjusting("confirm"),
      });
      mockAdjustmentFetch();

      render(<AgentChat />);
      await act(async () => {
        await capturedOnSendMessage!("sim, pode buscar de novo");
      });

      expect(mockMutate).toHaveBeenCalledWith({
        executionId: EXEC,
        content: "sim, pode buscar de novo",
      });
      // Re-executa o step REJEITADO (nunca um "step corrente" — Trap #6)
      expect(executeCalls()).toHaveLength(1);
      expect(executeCalls()[0][1]).toEqual(expect.objectContaining({ method: "POST" }));
      expect(mockClearAdjustingStep).toHaveBeenCalled();
      // A decisao de executar NAO passa pelo LLM
      expect(mockParseAdjustment).not.toHaveBeenCalled();
      expect(patchCalls()).toHaveLength(0);
    });

    it("fase confirm + NAO-confirmacao: vira novo ajuste e NAO executa (AC3 fail-safe)", async () => {
      setupDefaults({
        executionId: EXEC,
        briefingStatus: "confirmed",
        adjustingStep: adjusting("confirm"),
      });
      mockAdjustmentFetch();
      mockParseAdjustment.mockResolvedValueOnce({
        briefing: { ...PARSED_BRIEFING, jobTitles: ["CFO"] },
        missingFields: [],
        isComplete: true,
        canProceed: true,
        suggestions: {},
        productMentioned: null,
        nextAction: "confirm",
        questionText: null,
      });

      render(<AgentChat />);
      await act(async () => {
        await capturedOnSendMessage!("na verdade troca o cargo pra CFO");
      });

      expect(executeCalls()).toHaveLength(0);
      expect(mockParseAdjustment).toHaveBeenCalled();
      expect(patchCalls()).toHaveLength(1);
      const body = JSON.parse((patchCalls()[0][1] as { body: string }).body);
      expect(body.jobTitles).toEqual(["CFO"]);
      expect(mockSetAdjustingStep).toHaveBeenCalledWith(
        expect.objectContaining({ phase: "confirm" })
      );
    });

    // --- AC6: sem regressao fora do estado de ajuste ---

    // --- Code review 2026-07-24: confirmacao ESTRITA (P1) ---

    it.each([
      ["pode tirar o filtro de industria?", "pergunta com keyword 'pode'"],
      ["assim nao da", "'assim' contem 'sim' + negacao"],
      ["sim, mas troca o cargo pra CFO", "confirmacao com ressalva/correcao"],
      ["isso nao esta certo", "'isso' + negacao"],
      ["vamos mudar o tamanho antes", "'vamos' + verbo de ajuste"],
    ])(
      "fase confirm: %s NAO re-executa — vira novo ajuste (review P1: %s)",
      async (message) => {
        setupDefaults({
          executionId: EXEC,
          briefingStatus: "confirmed",
          adjustingStep: adjusting("confirm"),
        });
        mockAdjustmentFetch();
        mockParseAdjustment.mockResolvedValueOnce({
          briefing: PARSED_BRIEFING,
          missingFields: [],
          isComplete: true,
          canProceed: true,
          suggestions: {},
          productMentioned: null,
          nextAction: "confirm",
          questionText: null,
        });

        render(<AgentChat />);
        await act(async () => {
          await capturedOnSendMessage!(message);
        });

        // NENHUM credito gasto; a mensagem foi tratada como ajuste
        expect(executeCalls()).toHaveLength(0);
        expect(mockClearAdjustingStep).not.toHaveBeenCalled();
        expect(mockParseAdjustment).toHaveBeenCalled();
      }
    );

    it.each(["sim", "pode ir", "isso mesmo", "beleza, confirmo"])(
      "fase confirm: '%s' e confirmacao limpa e re-executa (review P1)",
      async (message) => {
        setupDefaults({
          executionId: EXEC,
          briefingStatus: "confirmed",
          adjustingStep: adjusting("confirm"),
        });
        mockAdjustmentFetch();

        render(<AgentChat />);
        await act(async () => {
          await capturedOnSendMessage!(message);
        });

        expect(executeCalls()).toHaveLength(1);
        expect(mockClearAdjustingStep).toHaveBeenCalled();
        // o turno do usuario tambem entra na memoria (review P11)
        expect(mockRecordUserTurn).toHaveBeenCalledWith(message);
      }
    );

    // --- Code review 2026-07-24: falha do execute (P2) ---

    it("execute falha: restaura a fase confirm e avisa em vez de silenciar (review P2)", async () => {
      setupDefaults({
        executionId: EXEC,
        briefingStatus: "confirmed",
        adjustingStep: adjusting("confirm"),
      });
      (global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
        if (url === `/api/agent/executions/${EXEC}/steps/2/execute`) {
          return Promise.resolve({
            ok: false,
            status: 409,
            json: () => Promise.resolve({ error: { code: "EXECUTION_NOT_ACTIVE" } }),
          });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: {} }) });
      });

      render(<AgentChat />);
      await act(async () => {
        await capturedOnSendMessage!("sim");
      });

      // O estado de ajuste VOLTA (o usuario pode confirmar de novo)
      expect(mockSetAdjustingStep).toHaveBeenCalledWith(
        expect.objectContaining({ stepNumber: 2, phase: "confirm" })
      );
      // ...e o usuario e avisado, em vez de ficar com a promessa e nenhum resultado
      expect(agentMessages().some((m) => /nao consegui reexecutar/i.test(m))).toBe(true);
    });

    // --- Code review 2026-07-24: ajuste orfao de outra execucao (P6) ---

    it("ajuste de OUTRA execucao e descartado, nao aplicado (review P6)", async () => {
      setupDefaults({
        executionId: EXEC,
        briefingStatus: "confirmed",
        adjustingStep: {
          executionId: "exec-antiga",
          stepNumber: 2,
          stepType: "search_leads",
          phase: "describe",
        },
      });
      mockAdjustmentFetch();

      render(<AgentChat />);
      await act(async () => {
        await capturedOnSendMessage!("remove o filtro de tamanho");
      });

      expect(mockClearAdjustingStep).toHaveBeenCalled();
      expect(mockParseAdjustment).not.toHaveBeenCalled();
      expect(patchCalls()).toHaveLength(0);
      expect(executeCalls()).toHaveLength(0);
    });

    // --- Code review 2026-07-24: reentrada duravel (P3 / decisao 1) ---

    it("reentra em ajuste no load quando o gate mais recente esta rejeitado (review P3)", async () => {
      setupDefaults({ executionId: EXEC, briefingStatus: "confirmed", adjustingStep: null });
      // O portao de attach da 22.8 so abre com o profile carregado — sem isto
      // attachedExecutionId fica null e o efeito de reentrada nem chega a rodar.
      mockUserState = { profile: { id: "u1" } };
      mockExecutionData = {
        messages: [
          {
            id: "gate-1",
            execution_id: EXEC,
            role: "agent",
            content: "Revise os leads",
            created_at: new Date().toISOString(),
            metadata: {
              messageType: "approval_gate",
              stepNumber: 2,
              rejected: true,
              approvalData: { stepType: "search_leads", previewData: {} },
            },
          },
        ],
        steps: [{ id: "s2", step_number: 2, status: "awaiting_approval" }],
      };
      mockAdjustmentFetch();

      await act(async () => {
        render(<AgentChat />);
      });

      expect(mockSetAdjustingStep).toHaveBeenCalledWith({
        executionId: EXEC,
        stepNumber: 2,
        stepType: "search_leads",
        phase: "describe",
      });
    });

    it("NAO reentra quando o gate rejeitado ja foi superado por uma re-execucao (review P3)", async () => {
      setupDefaults({ executionId: EXEC, briefingStatus: "confirmed", adjustingStep: null });
      mockUserState = { profile: { id: "u1" } };
      mockExecutionData = {
        messages: [
          {
            id: "gate-1",
            execution_id: EXEC,
            role: "agent",
            content: "Revise os leads",
            created_at: "2026-07-24T10:00:00Z",
            metadata: {
              messageType: "approval_gate",
              stepNumber: 2,
              rejected: true,
              approvalData: { stepType: "search_leads", previewData: {} },
            },
          },
          {
            id: "gate-2",
            execution_id: EXEC,
            role: "agent",
            content: "Revise os leads (nova busca)",
            created_at: "2026-07-24T10:05:00Z",
            metadata: {
              messageType: "approval_gate",
              stepNumber: 2,
              approvalData: { stepType: "search_leads", previewData: {} },
            },
          },
        ],
        steps: [{ id: "s2", step_number: 2, status: "awaiting_approval" }],
      };
      mockAdjustmentFetch();

      await act(async () => {
        render(<AgentChat />);
      });

      expect(mockSetAdjustingStep).not.toHaveBeenCalled();
    });

    it("NAO reentra quando o step ja saiu de awaiting_approval (review P3)", async () => {
      setupDefaults({ executionId: EXEC, briefingStatus: "confirmed", adjustingStep: null });
      mockUserState = { profile: { id: "u1" } };
      mockExecutionData = {
        messages: [
          {
            id: "gate-1",
            execution_id: EXEC,
            role: "agent",
            content: "Revise os leads",
            created_at: new Date().toISOString(),
            metadata: {
              messageType: "approval_gate",
              stepNumber: 2,
              rejected: true,
              approvalData: { stepType: "search_leads", previewData: {} },
            },
          },
        ],
        steps: [{ id: "s2", step_number: 2, status: "running" }],
      };
      mockAdjustmentFetch();

      await act(async () => {
        render(<AgentChat />);
      });

      expect(mockSetAdjustingStep).not.toHaveBeenCalled();
    });

    it("sem estado de ajuste: mensagem pos-briefing so persiste (AC6 — comportamento atual)", async () => {
      setupDefaults({
        executionId: EXEC,
        briefingStatus: "confirmed",
        adjustingStep: null,
      });
      mockAdjustmentFetch();

      render(<AgentChat />);
      await act(async () => {
        await capturedOnSendMessage!("remove o filtro de tamanho");
      });

      expect(mockMutate).toHaveBeenCalledWith({
        executionId: EXEC,
        content: "remove o filtro de tamanho",
      });
      expect(mockParseAdjustment).not.toHaveBeenCalled();
      expect(patchCalls()).toHaveLength(0);
      expect(executeCalls()).toHaveLength(0);
      expect(mockProcessMessage).not.toHaveBeenCalled();
    });
  });
});
