/**
 * Tests for useDeleteLeads Hook
 * Story 12.5: Deleção de Leads (Individual e em Massa)
 *
 * AC: #6 - Toast de sucesso com contagem
 * AC: #7 - Toast de erro em caso de falha
 * AC: #8 - Invalidação de queries após deleção
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useDeleteLeads } from "@/hooks/use-delete-leads";

// Mock sonner toast
const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe("useDeleteLeads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // AC #6: Toast de sucesso com contagem
  it("should show success toast with deleted count", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: { deleted: 3 } }),
    });

    const { result } = renderHook(() => useDeleteLeads(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate(["id-1", "id-2", "id-3"]);
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockToastSuccess).toHaveBeenCalledWith("3 leads excluídos com sucesso");
    expect(mockFetch).toHaveBeenCalledWith("/api/leads/bulk-delete", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadIds: ["id-1", "id-2", "id-3"] }),
    });
  });

  // AC #6: Singular when 1 lead
  it("should show singular toast when deleting 1 lead", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: { deleted: 1 } }),
    });

    const { result } = renderHook(() => useDeleteLeads(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate(["id-1"]);
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockToastSuccess).toHaveBeenCalledWith("1 lead excluído com sucesso");
  });

  // AC #7: Toast de erro
  it("should show error toast on failure", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () =>
        Promise.resolve({
          error: { message: "Erro ao deletar leads" },
        }),
    });

    const { result } = renderHook(() => useDeleteLeads(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate(["id-1"]);
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(mockToastError).toHaveBeenCalledWith("Erro ao deletar leads");
  });

  // AC #7: Fallback error message
  it("should show fallback error message when no message from server", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({}),
    });

    const { result } = renderHook(() => useDeleteLeads(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate(["id-1"]);
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(mockToastError).toHaveBeenCalledWith("Erro ao excluir leads");
  });

  // AC #8: Invalidação de queries
  it("should invalidate lead-related queries on success", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: { deleted: 1 } }),
    });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    function Wrapper({ children }: { children: ReactNode }) {
      return (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      );
    }

    const { result } = renderHook(() => useDeleteLeads(), { wrapper: Wrapper });

    await act(async () => {
      result.current.mutate(["id-1"]);
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["leads"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["my-leads"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["searchLeads"] });
  });

  // Network error (fetch throws)
  it("should handle network errors gracefully", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    const { result } = renderHook(() => useDeleteLeads(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate(["id-1"]);
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(mockToastError).toHaveBeenCalledWith("Network error");
  });
});
