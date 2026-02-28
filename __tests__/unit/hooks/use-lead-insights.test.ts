/**
 * Tests for useLeadInsights hooks
 * Story 13.6: Pagina de Insights - UI
 *
 * AC: #10 - Hook useLeadInsights com React Query para fetch e mutations
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

// Mock toast
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import { toast } from "sonner";
import {
  useLeadInsights,
  useUpdateInsightStatus,
  useNewInsightsCount,
} from "@/hooks/use-lead-insights";

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

const mockInsightsResponse = {
  data: [
    {
      id: "insight-1",
      tenantId: "t1",
      leadId: "l1",
      postUrl: "https://linkedin.com/post/1",
      postText: "Test post",
      postPublishedAt: null,
      relevanceReasoning: null,
      suggestion: "Suggest something",
      status: "new" as const,
      createdAt: "2026-02-25T10:00:00Z",
      updatedAt: "2026-02-25T10:00:00Z",
      lead: {
        id: "l1",
        firstName: "John",
        lastName: "Doe",
        photoUrl: null,
        companyName: "Acme",
        title: "CTO",
        linkedinUrl: null,
      },
    },
  ],
  meta: { total: 1, page: 1, limit: 25, totalPages: 1 },
};

describe("useLeadInsights", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("should fetch insights successfully", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockInsightsResponse),
    } as Response);

    const { result } = renderHook(() => useLeadInsights(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.insights).toHaveLength(1);
    expect(result.current.insights[0].id).toBe("insight-1");
    expect(result.current.meta?.total).toBe(1);
    expect(result.current.error).toBeNull();
  });

  it("should handle fetch error", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ error: { message: "Erro de teste" } }),
    } as Response);

    const { result } = renderHook(() => useLeadInsights(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBe("Erro de teste");
    expect(result.current.insights).toEqual([]);
  });

  it("should pass filters as query params", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockInsightsResponse),
    } as Response);

    const { result } = renderHook(
      () => useLeadInsights({ status: "new", period: "7d", page: 2, perPage: 10 }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).toContain("status=new");
    expect(calledUrl).toContain("period=7d");
    expect(calledUrl).toContain("page=2");
    expect(calledUrl).toContain("per_page=10");
  });

  it("should return default values when no data", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: [], meta: { total: 0, page: 1, limit: 25, totalPages: 0 } }),
    } as Response);

    const { result } = renderHook(() => useLeadInsights(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.insights).toEqual([]);
    expect(result.current.meta?.total).toBe(0);
  });
});

describe("useUpdateInsightStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("should update insight status and show toast", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: { id: "insight-1", status: "used" } }),
    } as Response);

    const { result } = renderHook(() => useUpdateInsightStatus(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({ insightId: "insight-1", status: "used" });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(toast.success).toHaveBeenCalledWith("Insight marcado como usado");
  });

  it("should show toast on dismissed", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: { id: "insight-1", status: "dismissed" } }),
    } as Response);

    const { result } = renderHook(() => useUpdateInsightStatus(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({ insightId: "insight-1", status: "dismissed" });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(toast.success).toHaveBeenCalledWith("Insight descartado");
  });

  it("should show error toast on failure", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ error: { message: "Erro ao atualizar" } }),
    } as Response);

    const { result } = renderHook(() => useUpdateInsightStatus(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({ insightId: "insight-1", status: "used" });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(toast.error).toHaveBeenCalledWith("Erro ao atualizar");
  });

  it("should send PATCH request with correct body", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: {} }),
    } as Response);

    const { result } = renderHook(() => useUpdateInsightStatus(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({ insightId: "ins-123", status: "dismissed" });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(fetchSpy).toHaveBeenCalledWith("/api/insights/ins-123", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "dismissed" }),
    });
  });
});

describe("useNewInsightsCount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("should fetch new insights count", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: { count: 5 } }),
    } as Response);

    const { result } = renderHook(() => useNewInsightsCount(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.data).toBe(5);
    });
  });

  it("should return 0 when count is 0", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: { count: 0 } }),
    } as Response);

    const { result } = renderHook(() => useNewInsightsCount(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.data).toBe(0);
    });
  });

  it("should handle fetch error", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({}),
    } as Response);

    const { result } = renderHook(() => useNewInsightsCount(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });
});
