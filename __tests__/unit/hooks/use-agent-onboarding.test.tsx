/**
 * Unit Tests for useAgentOnboarding
 * Story 16.4 - AC: #1, #2
 */

import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useAgentOnboarding } from "@/hooks/use-agent-onboarding";
import type { ReactNode } from "react";

// ==============================================
// HELPERS
// ==============================================

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

// ==============================================
// TESTS
// ==============================================

describe("useAgentOnboarding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deve retornar isFirstTime true quando nao ha execucoes", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [] }),
    });

    const { result } = renderHook(() => useAgentOnboarding(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isFirstTime).toBe(true);
  });

  it("deve retornar isFirstTime false quando ha execucoes", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: [{ id: "exec-1", status: "completed" }],
        }),
    });

    const { result } = renderHook(() => useAgentOnboarding(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isFirstTime).toBe(false);
  });

  it("deve retornar isLoading true durante carregamento", () => {
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {})); // never resolves

    const { result } = renderHook(() => useAgentOnboarding(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.isFirstTime).toBe(false);
  });

  it("deve chamar GET /api/agent/executions", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [] }),
    });

    renderHook(() => useAgentOnboarding(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith("/api/agent/executions");
    });
  });

  it("deve retornar isFirstTime false quando API falha", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    });

    const { result } = renderHook(() => useAgentOnboarding(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isFirstTime).toBe(false);
  });
});
