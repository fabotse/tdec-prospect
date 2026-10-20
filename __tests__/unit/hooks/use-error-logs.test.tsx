/**
 * useErrorLogs Hook Tests
 * Story 23.3: Configurações → Erros
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useErrorLogs } from "@/hooks/use-error-logs";

const mockFetch = vi.fn();
global.fetch = mockFetch;

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe("useErrorLogs", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("busca /api/settings/errors e devolve data", async () => {
    const logs = [
      {
        id: "e1",
        tenantId: null,
        source: "cron",
        route: "pg_net/http",
        message: "falhou",
        createdAt: "2026-10-20T12:00:00Z",
      },
    ];
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ data: logs }) });

    const { result } = renderHook(() => useErrorLogs(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFetch).toHaveBeenCalledWith("/api/settings/errors");
    expect(result.current.data).toEqual(logs);
  });

  it("propaga a mensagem de erro da API", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      json: async () => ({ error: { code: "FORBIDDEN", message: "Acesso negado" } }),
    });

    const { result } = renderHook(() => useErrorLogs(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe("Acesso negado");
  });

  it("mensagem padrão quando a API não manda uma", async () => {
    mockFetch.mockResolvedValue({ ok: false, json: async () => ({}) });

    const { result } = renderHook(() => useErrorLogs(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe("Erro ao buscar o registro de erros");
  });

  it("corpo não-JSON (504 HTML) mostra a mensagem padrão", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      json: async () => {
        throw new SyntaxError("Unexpected token '<'");
      },
    });

    const { result } = renderHook(() => useErrorLogs(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe("Erro ao buscar o registro de erros");
  });
});
