/**
 * AgentChat Tests
 * Story 16.1: Composicao basica
 * Story 16.2: Orquestracao de execucao + mensagens
 * Story 16.3: Briefing parser + fluxo conversacional
 *
 * AC 16.1: #4 - AgentChat renderiza area de mensagens e input
 * AC 16.2: #1-#5 - Orquestracao completa do chat
 * AC 16.3: #1,#3,#4 - Intercepta mensagens para fluxo de briefing
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
const mockProcessMessage = vi.fn().mockResolvedValue({ handled: true });
const mockToastError = vi.fn();

let capturedOnSendMessage: ((content: string) => Promise<void>) | null = null;
let mockStoreState: Record<string, unknown> = {};
let mockBriefingState: Record<string, unknown> = {};

vi.mock("sonner", () => ({
  toast: { error: (...args: unknown[]) => mockToastError(...args) },
}));

vi.mock("@/hooks/use-agent-messages", () => ({
  useAgentMessages: () => ({ messages: [], isLoading: false, isConnected: false }),
  useSendMessage: () => ({ mutate: mockMutate, isPending: false }),
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
  AgentMessageList: () => <div data-testid="agent-message-list">messages</div>,
}));

vi.mock("@/components/agent/AgentInput", () => ({
  AgentInput: ({ onSendMessage }: { onSendMessage: (content: string) => Promise<void> }) => {
    capturedOnSendMessage = onSendMessage;
    return <div data-testid="agent-input">input</div>;
  },
}));

// ==============================================
// HELPERS
// ==============================================

function setupDefaults(overrides?: {
  executionId?: string | null;
  briefingStatus?: string;
  briefing?: Record<string, unknown> | null;
}) {
  mockStoreState = {
    currentExecutionId: overrides?.executionId ?? null,
    setCurrentExecutionId: mockSetCurrentExecutionId,
    isAgentProcessing: false,
    setAgentProcessing: mockSetAgentProcessing,
    isInputDisabled: false,
  };
  mockBriefingState = {
    status: overrides?.briefingStatus ?? "idle",
    briefing: overrides?.briefing ?? null,
    missingFields: [],
    isComplete: false,
  };
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

    it("deve salvar briefing e enviar confirmacao quando confirmado", async () => {
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
      // sendAgentMessage with confirmation
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/agent/executions/exec-123/messages",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("Briefing confirmado"),
        })
      );
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
});
