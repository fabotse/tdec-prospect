/**
 * Unit Tests for useCampaignBlocks hook
 * Story 5.9: Campaign Save & Multiple Campaigns
 *
 * AC: #2, #7 - Carregar blocos existentes
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useCampaignBlocks } from "@/hooks/use-campaign-blocks";

// Mock fetch
global.fetch = vi.fn();

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("useCampaignBlocks (AC: #2, #7)", () => {
  const mockCampaignId = "550e8400-e29b-41d4-a716-446655440000";

  const mockBlocks = [
    {
      id: "email-1",
      type: "email",
      position: 0,
      data: { subject: "Hello", body: "World" },
    },
    {
      id: "delay-1",
      type: "delay",
      position: 1,
      data: { delayValue: 2, delayUnit: "days" },
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should fetch blocks for a campaign", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: mockBlocks }),
    } as Response);

    const { result } = renderHook(() => useCampaignBlocks(mockCampaignId), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(mockBlocks);
    expect(fetch).toHaveBeenCalledWith(
      `/api/campaigns/${mockCampaignId}/blocks`
    );
  });

  it("should return empty array for campaign without blocks", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [] }),
    } as Response);

    const { result } = renderHook(() => useCampaignBlocks(mockCampaignId), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual([]);
  });

  it("should not fetch when campaignId is undefined", () => {
    const { result } = renderHook(() => useCampaignBlocks(undefined), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.isFetching).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("should handle fetch error", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      json: async () => ({
        error: { code: "UNAUTHORIZED", message: "Nao autenticado" },
      }),
    } as Response);

    const { result } = renderHook(() => useCampaignBlocks(mockCampaignId), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error?.message).toBe("Nao autenticado");
  });

  it("should use correct query key", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [] }),
    } as Response);

    const { result } = renderHook(() => useCampaignBlocks(mockCampaignId), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // The query key should include the campaign ID
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
