/**
 * Unit Tests for useLeadTracking hook
 * Story 10.3: Instantly Analytics Service (Polling)
 *
 * AC: #3 — LeadTracking[] with openCount, clickCount, hasReplied, lastOpenAt
 * AC: #6 — Data from polling, not persisted
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useLeadTracking } from "@/hooks/use-lead-tracking";
import { createMockLeadTracking } from "../../helpers/mock-data";

global.fetch = vi.fn();

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("useLeadTracking (AC: #3, #6)", () => {
  const campaignId = "campaign-uuid-001";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 7.3: renders, loading state, data mapped correctly
  it("starts in loading state and returns lead tracking data (7.3)", async () => {
    const mockLeads = [
      createMockLeadTracking({ leadEmail: "a@x.com", openCount: 5 }),
      createMockLeadTracking({ leadEmail: "b@x.com", openCount: 2, hasReplied: true }),
    ];

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: mockLeads }),
    } as Response);

    const { result } = renderHook(() => useLeadTracking(campaignId), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(2);
    expect(result.current.data?.[0].leadEmail).toBe("a@x.com");
    expect(result.current.data?.[0].openCount).toBe(5);
    expect(result.current.data?.[1].hasReplied).toBe(true);
    expect(fetch).toHaveBeenCalledWith(`/api/campaigns/${campaignId}/leads/tracking`);
  });

  it("does not fetch when campaignId is empty", () => {
    renderHook(() => useLeadTracking(""), {
      wrapper: createWrapper(),
    });

    expect(fetch).not.toHaveBeenCalled();
  });

  it("handles error response", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "Erro ao buscar tracking de leads" }),
    } as Response);

    const { result } = renderHook(() => useLeadTracking(campaignId), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error?.message).toBe("Erro ao buscar tracking de leads");
  });

  it("returns empty array when no leads", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [] }),
    } as Response);

    const { result } = renderHook(() => useLeadTracking(campaignId), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual([]);
  });
});
