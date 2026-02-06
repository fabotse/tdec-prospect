/**
 * Lead Status Hooks Tests
 * Story 4.2: Lead Status Management
 *
 * AC: #2 - Change individual status
 * AC: #4 - Bulk status update
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useUpdateLeadStatus, useBulkUpdateStatus } from "@/hooks/use-lead-status";
import { toast } from "sonner";

// Mock sonner toast
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Create wrapper with QueryClientProvider
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
// useUpdateLeadStatus TESTS
// ==============================================

describe("useUpdateLeadStatus", () => {
  beforeEach(() => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: {} }),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("calls the correct API endpoint", async () => {
    const { result } = renderHook(() => useUpdateLeadStatus(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({ leadId: "lead-123", status: "interessado" });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/leads/lead-123/status",
        expect.objectContaining({
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "interessado" }),
        })
      );
    });
  });

  it("shows success toast on successful update", async () => {
    const { result } = renderHook(() => useUpdateLeadStatus(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({ leadId: "lead-123", status: "interessado" });

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        'Status atualizado para "Interessado"'
      );
    });
  });

  it("shows error toast on failed update", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      json: async () => ({ error: { message: "Lead não encontrado" } }),
    });

    const { result } = renderHook(() => useUpdateLeadStatus(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({ leadId: "invalid-lead", status: "interessado" });

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Lead não encontrado");
    });
  });
});

// ==============================================
// useBulkUpdateStatus TESTS
// ==============================================

describe("useBulkUpdateStatus", () => {
  beforeEach(() => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: { updated: 3 } }),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("calls the correct API endpoint with multiple lead IDs", async () => {
    const { result } = renderHook(() => useBulkUpdateStatus(), {
      wrapper: createWrapper(),
    });

    const leadIds = ["lead-1", "lead-2", "lead-3"];
    result.current.mutate({ leadIds, status: "em_campanha" });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/leads/bulk-status",
        expect.objectContaining({
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ leadIds, status: "em_campanha" }),
        })
      );
    });
  });

  it("shows success toast with count on successful bulk update", async () => {
    const { result } = renderHook(() => useBulkUpdateStatus(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({
      leadIds: ["lead-1", "lead-2", "lead-3"],
      status: "em_campanha",
    });

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        '3 leads atualizados para "Em Campanha"'
      );
    });
  });

  it("shows error toast on failed bulk update", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      json: async () => ({ error: { message: "Erro ao atualizar status" } }),
    });

    const { result } = renderHook(() => useBulkUpdateStatus(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({
      leadIds: ["lead-1"],
      status: "interessado",
    });

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Erro ao atualizar status");
    });
  });
});
