/**
 * Unit Tests for useAgentMessages and useSendMessage hooks
 * Story 16.2: Sistema de Mensagens do Chat
 *
 * AC: #1 - Enviar mensagem com optimistic update
 * AC: #2 - Receber mensagens via Supabase Realtime
 * AC: #4 - Carregar historico de mensagens
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode } from "react";
import { useAgentMessages, useSendMessage } from "@/hooks/use-agent-messages";
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
const mockOn = vi.fn().mockReturnValue({ subscribe: mockSubscribe });
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

describe("useAgentMessages (AC: #2, #4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createMockFetch([
      {
        url: /\/api\/agent\/executions\/exec-001\/messages/,
        method: "GET",
        response: mockJsonResponse({ data: mockMessages }),
      },
    ]);
  });

  afterEach(() => restoreFetch());

  it("should return empty messages when executionId is null", () => {
    const { result } = renderHook(() => useAgentMessages(null), {
      wrapper: createWrapper(),
    });

    expect(result.current.messages).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });

  it("should fetch messages for a given executionId", async () => {
    const { result } = renderHook(() => useAgentMessages("exec-001"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.messages).toHaveLength(2);
    });
    expect(result.current.messages[0].content).toBe("Buscar leads");
  });

  it("should setup Supabase Realtime subscription", async () => {
    renderHook(() => useAgentMessages("exec-001"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(mockChannel).toHaveBeenCalledWith("agent-messages-exec-001");
    });
    expect(mockOn).toHaveBeenCalledWith(
      "postgres_changes",
      expect.objectContaining({
        event: "INSERT",
        schema: "public",
        table: "agent_messages",
        filter: "execution_id=eq.exec-001",
      }),
      expect.any(Function)
    );
  });

  it("should set isConnected when subscription is active", async () => {
    const { result } = renderHook(() => useAgentMessages("exec-001"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true);
    });
  });

  it("should cleanup channel on unmount", async () => {
    const { unmount } = renderHook(() => useAgentMessages("exec-001"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(mockChannel).toHaveBeenCalled();
    });

    unmount();
    expect(mockRemoveChannel).toHaveBeenCalled();
  });

  it("should not subscribe when executionId is null", () => {
    renderHook(() => useAgentMessages(null), {
      wrapper: createWrapper(),
    });

    expect(mockChannel).not.toHaveBeenCalled();
  });
});

describe("useSendMessage (AC: #1)", () => {
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

  it("should set isAgentProcessing to true on send", async () => {
    const { result } = renderHook(() => useSendMessage(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({ executionId: "exec-001", content: "Teste" });
    });

    expect(mockSetAgentProcessing).toHaveBeenCalledWith(true);
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
