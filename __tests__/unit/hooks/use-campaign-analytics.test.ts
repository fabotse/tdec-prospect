/**
 * Unit Tests for useCampaignAnalytics and useSyncAnalytics hooks
 * Story 10.3: Instantly Analytics Service (Polling)
 *
 * AC: #1 — useCampaignAnalytics returns CampaignAnalytics
 * AC: #2 — useSyncAnalytics triggers sync and invalidates query
 * AC: #6 — Data includes lastSyncAt, not persisted
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useCampaignAnalytics, useSyncAnalytics } from "@/hooks/use-campaign-analytics";
import { createMockCampaignAnalytics } from "../../helpers/mock-data";

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

describe("useCampaignAnalytics (AC: #1, #6)", () => {
  const campaignId = "campaign-uuid-001";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 7.1: renders, loading state, data returned
  it("starts in loading state and returns analytics data (7.1)", async () => {
    const mockAnalytics = createMockCampaignAnalytics({ campaignId });

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: mockAnalytics }),
    } as Response);

    const { result } = renderHook(() => useCampaignAnalytics(campaignId), {
      wrapper: createWrapper(),
    });

    // Initially loading
    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(mockAnalytics);
    expect(result.current.data?.lastSyncAt).toBeDefined();
    expect(fetch).toHaveBeenCalledWith(`/api/campaigns/${campaignId}/analytics`);
  });

  it("does not fetch when campaignId is empty", () => {
    renderHook(() => useCampaignAnalytics(""), {
      wrapper: createWrapper(),
    });

    expect(fetch).not.toHaveBeenCalled();
  });

  it("handles error response", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "Campanha não encontrada" }),
    } as Response);

    const { result } = renderHook(() => useCampaignAnalytics(campaignId), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error?.message).toBe("Campanha não encontrada");
  });
});

describe("useSyncAnalytics (AC: #2)", () => {
  const campaignId = "campaign-uuid-001";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 7.2: mutation trigger, invalidation
  it("triggers sync and returns SyncResult (7.2)", async () => {
    const mockSyncResult = {
      campaignId,
      analytics: createMockCampaignAnalytics({ campaignId }),
      dailyAnalytics: [],
      lastSyncAt: "2026-02-10T10:00:00.000Z",
      source: "polling" as const,
    };

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: mockSyncResult }),
    } as Response);

    const { result } = renderHook(() => useSyncAnalytics(campaignId), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate();
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(mockSyncResult);
    expect(fetch).toHaveBeenCalledWith(
      `/api/campaigns/${campaignId}/analytics/sync`,
      { method: "POST" }
    );
  });
});
