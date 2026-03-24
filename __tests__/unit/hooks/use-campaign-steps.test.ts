/**
 * Unit Tests for useCampaignSteps hook
 * Story 14.6: Tooltip com Preview do Email por Step
 *
 * AC: #3 — Cache with staleTime: Infinity
 * AC: #6 — Non-blocking loading state
 */

import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useCampaignSteps } from "@/hooks/use-campaign-steps";
import type { CampaignStep } from "@/types/tracking";

const originalFetch = global.fetch;
global.fetch = vi.fn();

afterAll(() => {
  global.fetch = originalFetch;
});

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("useCampaignSteps (AC: #3, #6)", () => {
  const campaignId = "campaign-uuid-001";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches steps and returns Map<number, string>", async () => {
    const mockSteps: CampaignStep[] = [
      { stepNumber: 1, subject: "Olá {{firstName}}" },
      { stepNumber: 2, subject: "Follow-up sobre proposta" },
      { stepNumber: 3, subject: "Última tentativa" },
    ];

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: mockSteps }),
    } as Response);

    const { result } = renderHook(() => useCampaignSteps(campaignId), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toBeInstanceOf(Map);
    expect(result.current.data?.size).toBe(3);
    expect(result.current.data?.get(1)).toBe("Olá {{firstName}}");
    expect(result.current.data?.get(2)).toBe("Follow-up sobre proposta");
    expect(result.current.data?.get(3)).toBe("Última tentativa");
    expect(fetch).toHaveBeenCalledWith(`/api/campaigns/${campaignId}/steps`);
  });

  it("returns empty Map when no steps available", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [] }),
    } as Response);

    const { result } = renderHook(() => useCampaignSteps(campaignId), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toBeInstanceOf(Map);
    expect(result.current.data?.size).toBe(0);
  });

  it("handles error response", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "Erro ao buscar steps da campanha" }),
    } as Response);

    const { result } = renderHook(() => useCampaignSteps(campaignId), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it("does not fetch when campaignId is empty", () => {
    renderHook(() => useCampaignSteps(""), {
      wrapper: createWrapper(),
    });

    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not fetch when enabled is false", () => {
    renderHook(() => useCampaignSteps(campaignId, { enabled: false }), {
      wrapper: createWrapper(),
    });

    expect(fetch).not.toHaveBeenCalled();
  });

  it("filters out steps with empty subject from Map", async () => {
    const mockSteps: CampaignStep[] = [
      { stepNumber: 1, subject: "Valid subject" },
      { stepNumber: 2, subject: "" },
      { stepNumber: 3, subject: "Another valid" },
    ];

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: mockSteps }),
    } as Response);

    const { result } = renderHook(() => useCampaignSteps(campaignId), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.size).toBe(2);
    expect(result.current.data?.has(2)).toBe(false);
  });

  it("handles non-JSON response gracefully", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      json: async () => { throw new SyntaxError("Unexpected token <"); },
    } as Response);

    const { result } = renderHook(() => useCampaignSteps(campaignId), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe("Erro ao buscar steps da campanha");
  });
});
