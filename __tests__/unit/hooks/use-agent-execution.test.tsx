/**
 * Unit Tests for useAgentExecution and useSendMessage hooks
 * Refator: useAgentMessages → useAgentExecution (Retro Epic 16)
 *
 * AC: Canal Realtime consolidado (agent_messages + agent_steps)
 * AC: Backward compat — mesma API de messages que useAgentMessages
 * AC: Steps via Realtime (INSERT + UPDATE)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode } from "react";
import { useAgentExecution, useSendMessage } from "@/hooks/use-agent-execution";
import {
  createMockFetch,
  mockJsonResponse,
  mockErrorResponse,
  restoreFetch,
} from "../../helpers/mock-fetch";
import type { AgentMessage } from "@/types/agent";

// Mock Supabase browser client for realtime
const mockSubscribe = vi.fn().mockImplementation((callback) => {
  callback("SUBSCRIBED");
  return { unsubscribe: vi.fn() };
});
const mockOnHandlers: Array<{ table: string; event: string; callback: (payload: unknown) => void }> = [];
const mockOn = vi.fn().mockImplementation((_type, config, callback) => {
  mockOnHandlers.push({ table: config.table, event: config.event, callback });
  return { on: mockOn, subscribe: mockSubscribe };
});
const mockChannel = vi.fn().mockReturnValue({ on: mockOn, subscribe: mockSubscribe });
const mockRemoveChannel = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    channel: mockChannel,
    removeChannel: mockRemoveChannel,
  }),
}));

// Mock store
const mockSetAgentProcessing = vi.fn();
vi.mock("@/stores/use-agent-store", () => ({
  useAgentStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ setAgentProcessing: mockSetAgentProcessing }),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });

  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

const mockMessages: AgentMessage[] = [
  {
    id: "msg-001",
    execution_id: "exec-001",
    role: "user",
    content: "Buscar leads",
    metadata: { messageType: "text" },
    created_at: "2026-03-26T10:00:00Z",
  },
  {
    id: "msg-002",
    execution_id: "exec-001",
    role: "agent",
    content: "Buscando...",
    metadata: { messageType: "progress" },
    created_at: "2026-03-26T10:00:01Z",
  },
];

describe("useAgentExecution — messages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOnHandlers.length = 0;
    createMockFetch([
      {
        url: /\/api\/agent\/executions\/exec-001\/messages/,
        method: "GET",
        response: mockJsonResponse({ data: mockMessages }),
      },
    ]);
  });

  afterEach(() => restoreFetch());

  it("should return empty messages and steps when executionId is null", () => {
    const { result } = renderHook(() => useAgentExecution(null), {
      wrapper: createWrapper(),
    });

    expect(result.current.messages).toEqual([]);
    expect(result.current.steps).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });

  it("should fetch messages for a given executionId", async () => {
    const { result } = renderHook(() => useAgentExecution("exec-001"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.messages).toHaveLength(2);
    });
    expect(result.current.messages[0].content).toBe("Buscar leads");
  });

  it("should return empty steps initially", async () => {
    const { result } = renderHook(() => useAgentExecution("exec-001"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.messages).toHaveLength(2);
    });
    expect(result.current.steps).toEqual([]);
  });

  it("should set isConnected when subscription is active", async () => {
    const { result } = renderHook(() => useAgentExecution("exec-001"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true);
    });
  });

  it("should cleanup channel on unmount", async () => {
    const { unmount } = renderHook(() => useAgentExecution("exec-001"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(mockChannel).toHaveBeenCalled();
    });

    unmount();
    expect(mockRemoveChannel).toHaveBeenCalled();
  });

  it("should not subscribe when executionId is null", () => {
    renderHook(() => useAgentExecution(null), {
      wrapper: createWrapper(),
    });

    expect(mockChannel).not.toHaveBeenCalled();
  });
});

describe("useAgentExecution — consolidated Realtime channel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOnHandlers.length = 0;
    createMockFetch([
      {
        url: /\/api\/agent\/executions\/exec-001\/messages/,
        method: "GET",
        response: mockJsonResponse({ data: [] }),
      },
    ]);
  });

  afterEach(() => restoreFetch());

  it("should create a single channel with execution-scoped name", async () => {
    renderHook(() => useAgentExecution("exec-001"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(mockChannel).toHaveBeenCalledWith("agent-execution-exec-001");
    });
    // Single channel call, not two separate channels
    expect(mockChannel).toHaveBeenCalledTimes(1);
  });

  it("should subscribe to agent_messages INSERT and agent_steps INSERT+UPDATE", async () => {
    renderHook(() => useAgentExecution("exec-001"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(mockOn).toHaveBeenCalledTimes(3);
    });

    // Verify all 3 subscriptions on the same channel
    const tables = mockOnHandlers.map((h) => `${h.table}:${h.event}`);
    expect(tables).toContain("agent_messages:INSERT");
    expect(tables).toContain("agent_steps:INSERT");
    expect(tables).toContain("agent_steps:UPDATE");
  });

  it("should turn off agent processing when agent message arrives via Realtime", async () => {
    renderHook(() => useAgentExecution("exec-001"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(mockOnHandlers.length).toBe(3);
    });

    const messageHandler = mockOnHandlers.find(
      (h) => h.table === "agent_messages" && h.event === "INSERT"
    );

    act(() => {
      messageHandler?.callback({
        new: {
          id: "msg-rt-001",
          execution_id: "exec-001",
          role: "agent",
          content: "Resposta do agente",
          metadata: { messageType: "text" },
          created_at: "2026-03-26T10:00:05Z",
        },
      });
    });

    expect(mockSetAgentProcessing).toHaveBeenCalledWith(false);
  });
});

describe("useSendMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createMockFetch([
      {
        url: /\/api\/agent\/executions\/exec-001\/messages/,
        method: "GET",
        response: mockJsonResponse({ data: [] }),
      },
      {
        url: /\/api\/agent\/executions\/exec-001\/messages/,
        method: "POST",
        response: mockJsonResponse(
          {
            data: {
              id: "msg-new",
              execution_id: "exec-001",
              role: "user",
              content: "Nova mensagem",
              metadata: { messageType: "text" },
              created_at: "2026-03-26T10:00:00Z",
            },
          },
          201
        ),
      },
    ]);
  });

  afterEach(() => restoreFetch());

  it("should send message via POST with executionId in params", async () => {
    const { result } = renderHook(() => useSendMessage(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({ executionId: "exec-001", content: "Nova mensagem" });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
  });

  it("should NOT set isAgentProcessing on send (managed by briefing flow)", async () => {
    const { result } = renderHook(() => useSendMessage(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({ executionId: "exec-001", content: "Teste" });
    });

    // isAgentProcessing is now managed explicitly by the briefing flow in AgentChat,
    // not by useSendMessage — prevents getting stuck after briefing confirmation.
    expect(mockSetAgentProcessing).not.toHaveBeenCalledWith(true);
  });

  it("should reset isAgentProcessing on error", async () => {
    restoreFetch();
    createMockFetch([
      {
        url: /\/api\/agent\/executions\/exec-001\/messages/,
        method: "GET",
        response: mockJsonResponse({ data: [] }),
      },
      {
        url: /\/api\/agent\/executions\/exec-001\/messages/,
        method: "POST",
        response: mockErrorResponse(500, "Erro interno"),
      },
    ]);

    const { result } = renderHook(() => useSendMessage(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({ executionId: "exec-001", content: "Teste erro" });
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
    expect(mockSetAgentProcessing).toHaveBeenCalledWith(false);
  });
});
