/**
 * Lead Monitoring Hooks Tests
 * Story 13.2: Toggle de Monitoramento na Tabela de Leads
 * Story 13.9: Verificação Inicial ao Ativar Monitoramento
 *
 * AC: #1 - Toggle individual
 * AC: #2 - Bulk toggle
 * AC: #6 - Contador monitorados
 * AC: #6, #7 (13.9) - Initial scan hook
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import {
  useToggleMonitoring,
  useBulkToggleMonitoring,
  useMonitoredCount,
} from "@/hooks/use-lead-monitoring";
import { toast } from "sonner";

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    loading: vi.fn(),
  },
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

// ==============================================
// useToggleMonitoring TESTS
// ==============================================

describe("useToggleMonitoring", () => {
  beforeEach(() => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: {} }),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should call PATCH with correct params when enabling", async () => {
    const { result } = renderHook(() => useToggleMonitoring(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({ leadId: "lead-1", isMonitored: true });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockFetch).toHaveBeenCalledWith("/api/leads/lead-1/monitor", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isMonitored: true }),
    });
    expect(toast.success).toHaveBeenCalledWith("Lead monitorado");
  });

  it("should show disable message when disabling", async () => {
    const { result } = renderHook(() => useToggleMonitoring(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({ leadId: "lead-1", isMonitored: false });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(toast.success).toHaveBeenCalledWith("Monitoramento desativado");
  });

  it("should show error toast on failure", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      json: () =>
        Promise.resolve({ error: { message: "Lead sem perfil LinkedIn" } }),
    });

    const { result } = renderHook(() => useToggleMonitoring(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({ leadId: "lead-1", isMonitored: true });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(toast.error).toHaveBeenCalledWith("Lead sem perfil LinkedIn");
  });

  it("should trigger initial-scan after enabling monitoring (Story 13.9)", async () => {
    // First call: toggle PATCH, second call: initial-scan POST
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: {} }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            totalProcessed: 1,
            totalLeads: 1,
            newPostsFound: 0,
            insightsGenerated: 0,
            errors: [],
          }),
      });

    const { result } = renderHook(() => useToggleMonitoring(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({ leadId: "lead-1", isMonitored: true });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // Verify initial-scan was called
    await waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith("/api/monitoring/initial-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadIds: ["lead-1"] }),
      })
    );
    expect(toast.loading).toHaveBeenCalledWith(
      "Verificando posts dos leads...",
      { id: "initial-scan" }
    );
  });

  it("should NOT trigger initial-scan when disabling monitoring", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: {} }),
    });

    const { result } = renderHook(() => useToggleMonitoring(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({ leadId: "lead-1", isMonitored: false });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // Only the toggle call, not initial-scan
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

// ==============================================
// useBulkToggleMonitoring TESTS
// ==============================================

describe("useBulkToggleMonitoring", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should call bulk endpoint and show success toast", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: { updated: 3, skippedNoLinkedin: [], limitExceeded: false },
        }),
    });

    const { result } = renderHook(() => useBulkToggleMonitoring(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({
      leadIds: ["a", "b", "c"],
      isMonitored: true,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(toast.success).toHaveBeenCalledWith("3 leads monitorados");
  });

  it("should include skipped count in toast", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: { updated: 2, skippedNoLinkedin: ["c"], limitExceeded: false },
        }),
    });

    const { result } = renderHook(() => useBulkToggleMonitoring(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({
      leadIds: ["a", "b", "c"],
      isMonitored: true,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(toast.success).toHaveBeenCalledWith(
      "2 leads monitorados (1 sem LinkedIn ignorados)"
    );
  });

  it("should show disable message when bulk disabling", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: { updated: 3, skippedNoLinkedin: [], limitExceeded: false },
        }),
    });

    const { result } = renderHook(() => useBulkToggleMonitoring(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({
      leadIds: ["a", "b", "c"],
      isMonitored: false,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(toast.success).toHaveBeenCalledWith("3 leads desmonitorados");
  });

  it("should show error toast on failure", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      json: () =>
        Promise.resolve({ error: { message: "Limite excedido" } }),
    });

    const { result } = renderHook(() => useBulkToggleMonitoring(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({
      leadIds: ["a"],
      isMonitored: true,
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(toast.error).toHaveBeenCalledWith("Limite excedido");
  });

  it("should trigger initial-scan after bulk enabling (Story 13.9)", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: { updated: 2, skippedNoLinkedin: [], limitExceeded: false },
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            totalProcessed: 2,
            totalLeads: 2,
            newPostsFound: 1,
            insightsGenerated: 1,
            errors: [],
          }),
      });

    const { result } = renderHook(() => useBulkToggleMonitoring(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({
      leadIds: ["a", "b"],
      isMonitored: true,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    await waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith("/api/monitoring/initial-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadIds: ["a", "b"] }),
      })
    );
  });

  it("should NOT trigger initial-scan when bulk disabling", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: { updated: 2, skippedNoLinkedin: [], limitExceeded: false },
        }),
    });

    const { result } = renderHook(() => useBulkToggleMonitoring(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({
      leadIds: ["a", "b"],
      isMonitored: false,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("should exclude skipped leads from initial-scan", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: { updated: 1, skippedNoLinkedin: ["b"], limitExceeded: false },
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            totalProcessed: 1,
            totalLeads: 1,
            newPostsFound: 0,
            insightsGenerated: 0,
            errors: [],
          }),
      });

    const { result } = renderHook(() => useBulkToggleMonitoring(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({
      leadIds: ["a", "b"],
      isMonitored: true,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // Should only include "a", not "b" (skipped)
    await waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith("/api/monitoring/initial-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadIds: ["a"] }),
      })
    );
  });
});

// ==============================================
// useMonitoredCount TESTS
// ==============================================

describe("useMonitoredCount", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should fetch monitored count", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { current: 42, max: 100 } }),
    });

    const { result } = renderHook(() => useMonitoredCount(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ current: 42, max: 100 });
    expect(mockFetch).toHaveBeenCalledWith("/api/leads/monitored-count");
  });

  it("should handle error", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: { message: "Error" } }),
    });

    const { result } = renderHook(() => useMonitoredCount(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

