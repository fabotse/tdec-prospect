/**
 * Unit Tests for useCampaignSteps hook
 * Story 14.6: Tooltip com Preview do Email por Step
 * Story 14.7: Painel lateral com preview dos steps
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

  it("fetches steps and returns stepsMap and stepsData", async () => {
    const mockSteps: CampaignStep[] = [
      { stepNumber: 0, subject: "Olá {{firstName}}", body: "Corpo 1" },
      { stepNumber: 1, subject: "Follow-up sobre proposta", body: "Corpo 2" },
      { stepNumber: 2, subject: "Última tentativa", body: "Corpo 3" },
    ];

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: mockSteps }),
    } as Response);

    const { result } = renderHook(() => useCampaignSteps(campaignId), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // stepsMap: Map<number, string> for tooltips (backward compatible)
    expect(result.current.stepsMap).toBeInstanceOf(Map);
    expect(result.current.stepsMap?.size).toBe(3);
    expect(result.current.stepsMap?.get(0)).toBe("Olá {{firstName}}");
    expect(result.current.stepsMap?.get(1)).toBe("Follow-up sobre proposta");
    expect(result.current.stepsMap?.get(2)).toBe("Última tentativa");

    // stepsData: CampaignStep[] for panel
    expect(result.current.stepsData).toEqual(mockSteps);
    expect(result.current.stepsData?.[0].body).toBe("Corpo 1");

    expect(fetch).toHaveBeenCalledWith(`/api/campaigns/${campaignId}/steps`);
  });

  it("returns undefined stepsMap and stepsData when no steps available", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [] }),
    } as Response);

    const { result } = renderHook(() => useCampaignSteps(campaignId), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.stepsMap).toBeInstanceOf(Map);
    expect(result.current.stepsMap?.size).toBe(0);
    expect(result.current.stepsData).toEqual([]);
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

  it("filters out steps with empty subject from stepsMap", async () => {
    const mockSteps: CampaignStep[] = [
      { stepNumber: 0, subject: "Valid subject", body: "Body 1" },
      { stepNumber: 1, subject: "", body: "Body 2" },
      { stepNumber: 2, subject: "Another valid", body: "Body 3" },
    ];

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: mockSteps }),
    } as Response);

    const { result } = renderHook(() => useCampaignSteps(campaignId), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // stepsMap filters empty subjects
    expect(result.current.stepsMap?.size).toBe(2);
    expect(result.current.stepsMap?.has(1)).toBe(false);

    // stepsData includes all steps (for panel)
    expect(result.current.stepsData).toHaveLength(3);
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
  });
});
