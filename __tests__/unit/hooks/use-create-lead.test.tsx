/**
 * Tests for useCreateLead Hook
 * Quick Dev: Manual Lead Creation
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useCreateLead } from "@/hooks/use-create-lead";

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

describe("useCreateLead", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should create a lead successfully", async () => {
    const mockLead = {
      id: "lead-1",
      firstName: "João",
      lastName: "Silva",
      status: "novo",
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: mockLead }),
    });

    const { result } = renderHook(() => useCreateLead(), {
      wrapper: createWrapper(),
    });

    const lead = await result.current.mutateAsync({
      firstName: "João",
      lastName: "Silva",
    });

    expect(lead.id).toBe("lead-1");
    expect(lead.firstName).toBe("João");

    expect(mockFetch).toHaveBeenCalledWith("/api/leads/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ firstName: "João", lastName: "Silva" }),
    });
  });

  it("should throw error on API failure", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () =>
        Promise.resolve({
          error: { message: "Erro ao criar lead" },
        }),
    });

    const { result } = renderHook(() => useCreateLead(), {
      wrapper: createWrapper(),
    });

    await expect(
      result.current.mutateAsync({ firstName: "João" })
    ).rejects.toThrow("Erro ao criar lead");
  });

  it("should throw default error message when API returns no message", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({}),
    });

    const { result } = renderHook(() => useCreateLead(), {
      wrapper: createWrapper(),
    });

    await expect(
      result.current.mutateAsync({ firstName: "João" })
    ).rejects.toThrow("Erro ao criar lead");
  });

  it("should invalidate my-leads queries on success", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    function Wrapper({ children }: { children: ReactNode }) {
      return (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      );
    }

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: { id: "lead-1", firstName: "João" } }),
    });

    const { result } = renderHook(() => useCreateLead(), {
      wrapper: Wrapper,
    });

    await result.current.mutateAsync({ firstName: "João" });

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["my-leads"],
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["interested-count"],
      });
    });
  });
});
