/**
 * Tests for useMonitoringConfig hook
 * Story 13.8: Configuracoes de Monitoramento
 *
 * AC: #2 - Dropdown para frequencia
 * AC: #3, #4, #5, #6 - Dados de config
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import { toast } from "sonner";
import { useMonitoringConfig } from "@/hooks/use-monitoring-config";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(
      QueryClientProvider,
      { client: queryClient },
      children
    );
  };
}

const MOCK_CONFIG = {
  id: "config-1",
  tenantId: "tenant-1",
  frequency: "weekly" as const,
  maxMonitoredLeads: 100,
  lastRunAt: "2026-02-28T10:00:00Z",
  nextRunAt: "2026-03-07T10:00:00Z",
  runStatus: "idle" as const,
  runCursor: null,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-02-28T10:00:00Z",
};

function mockFetchSuccess(data: unknown) {
  return vi.spyOn(global, "fetch").mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve({ data }),
  } as Response);
}

function mockFetchError(status = 500) {
  return vi.spyOn(global, "fetch").mockResolvedValueOnce({
    ok: false,
    status,
    json: () =>
      Promise.resolve({ error: { code: "ERROR", message: "Erro" } }),
  } as Response);
}

describe("useMonitoringConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  describe("query (GET config)", () => {
    it("fetches config successfully", async () => {
      mockFetchSuccess({ config: MOCK_CONFIG, exists: true });

      const { result } = renderHook(() => useMonitoringConfig(), {
        wrapper: createWrapper(),
      });

      expect(result.current.isLoading).toBe(true);

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.config).toEqual(MOCK_CONFIG);
      expect(result.current.configExists).toBe(true);
    });

    it("returns null config when no data exists", async () => {
      const defaultConfig = {
        id: null,
        tenantId: "tenant-1",
        frequency: "weekly",
        maxMonitoredLeads: 100,
        runStatus: "idle",
        lastRunAt: null,
        nextRunAt: null,
        runCursor: null,
        createdAt: null,
        updatedAt: null,
      };
      mockFetchSuccess({ config: defaultConfig, exists: false });

      const { result } = renderHook(() => useMonitoringConfig(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.configExists).toBe(false);
      expect(result.current.config?.frequency).toBe("weekly");
    });

    it("handles fetch error", async () => {
      mockFetchError();

      const { result } = renderHook(() => useMonitoringConfig(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBeTruthy();
      expect(result.current.config).toBeNull();
    });
  });

  describe("mutation (PATCH frequency)", () => {
    it("updates frequency successfully with toast", async () => {
      mockFetchSuccess({ config: MOCK_CONFIG, exists: true });

      const { result } = renderHook(() => useMonitoringConfig(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const updatedConfig = { ...MOCK_CONFIG, frequency: "biweekly" as const };
      mockFetchSuccess({ config: updatedConfig, exists: true });

      await act(async () => {
        result.current.updateFrequency.mutate("biweekly");
      });

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith(
          "Configuracao de monitoramento atualizada"
        );
      });
    });

    it("shows error toast on mutation failure", async () => {
      mockFetchSuccess({ config: MOCK_CONFIG, exists: true });

      const { result } = renderHook(() => useMonitoringConfig(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      mockFetchError();

      await act(async () => {
        result.current.updateFrequency.mutate("biweekly");
      });

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          "Erro ao salvar configuracao"
        );
      });
    });

    it("sends PATCH request with correct frequency", async () => {
      mockFetchSuccess({ config: MOCK_CONFIG, exists: true });

      const { result } = renderHook(() => useMonitoringConfig(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const fetchSpy = mockFetchSuccess({
        config: { ...MOCK_CONFIG, frequency: "biweekly" },
        exists: true,
      });

      await act(async () => {
        result.current.updateFrequency.mutate("biweekly");
      });

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalledWith("/api/settings/monitoring", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ frequency: "biweekly" }),
        });
      });
    });

    it("invalidates monitoring-config query on success", async () => {
      mockFetchSuccess({ config: MOCK_CONFIG, exists: true });

      const { result } = renderHook(() => useMonitoringConfig(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Mock for PATCH
      mockFetchSuccess({
        config: { ...MOCK_CONFIG, frequency: "biweekly" },
        exists: true,
      });
      // Mock for refetch after invalidation
      mockFetchSuccess({
        config: { ...MOCK_CONFIG, frequency: "biweekly" },
        exists: true,
      });

      await act(async () => {
        result.current.updateFrequency.mutate("biweekly");
      });

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalled();
      });
    });
  });
});
