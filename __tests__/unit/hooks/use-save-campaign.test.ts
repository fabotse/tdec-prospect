/**
 * Unit Tests for useSaveCampaign hook
 * Story 5.9: Campaign Save & Multiple Campaigns
 *
 * AC: #1, #3, #5 - Salvar campanha e blocos
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useSaveCampaign } from "@/hooks/use-campaigns";

// Mock fetch
global.fetch = vi.fn();

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
      mutations: {
        retry: false,
      },
    },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("useSaveCampaign (AC 5.9: #1, #3, #5)", () => {
  const mockCampaignId = "550e8400-e29b-41d4-a716-446655440000";

  const mockCampaignResponse = {
    id: mockCampaignId,
    tenantId: "tenant-123",
    name: "Updated Campaign",
    status: "draft",
    createdAt: "2026-02-02T10:00:00Z",
    updatedAt: "2026-02-02T12:00:00Z",
    leadCount: 10,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should save campaign name successfully", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: mockCampaignResponse }),
    } as Response);

    const { result } = renderHook(() => useSaveCampaign(mockCampaignId), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({ name: "New Name" });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetch).toHaveBeenCalledWith(`/api/campaigns/${mockCampaignId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "New Name" }),
    });
  });

  it("should save campaign blocks successfully", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: mockCampaignResponse }),
    } as Response);

    const blocks = [
      {
        id: "block-1",
        type: "email" as const,
        position: 0,
        data: { subject: "Hello", body: "World" },
      },
    ];

    const { result } = renderHook(() => useSaveCampaign(mockCampaignId), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({ blocks });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetch).toHaveBeenCalledWith(`/api/campaigns/${mockCampaignId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blocks }),
    });
  });

  it("should save both name and blocks", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: mockCampaignResponse }),
    } as Response);

    const input = {
      name: "New Name",
      blocks: [
        {
          id: "block-1",
          type: "email" as const,
          position: 0,
          data: { subject: "Test", body: "Body" },
        },
      ],
    };

    const { result } = renderHook(() => useSaveCampaign(mockCampaignId), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate(input);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(mockCampaignResponse);
  });

  it("should handle save error", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      json: async () => ({
        error: { code: "INTERNAL_ERROR", message: "Erro ao salvar campanha" },
      }),
    } as Response);

    const { result } = renderHook(() => useSaveCampaign(mockCampaignId), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({ name: "New Name" });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error?.message).toBe("Erro ao salvar campanha");
  });

  it("should provide isPending state during save", async () => {
    let resolvePromise: (value: Response) => void;
    const pendingPromise = new Promise<Response>((resolve) => {
      resolvePromise = resolve;
    });
    vi.mocked(fetch).mockReturnValueOnce(pendingPromise);

    const { result } = renderHook(() => useSaveCampaign(mockCampaignId), {
      wrapper: createWrapper(),
    });

    expect(result.current.isPending).toBe(false);

    act(() => {
      result.current.mutate({ name: "New Name" });
    });

    await waitFor(() => expect(result.current.isPending).toBe(true));

    // Resolve the promise
    resolvePromise!({
      ok: true,
      json: async () => ({ data: mockCampaignResponse }),
    } as Response);

    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(result.current.isSuccess).toBe(true);
  });

  it("should return updated campaign data on success", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: mockCampaignResponse }),
    } as Response);

    const { result } = renderHook(() => useSaveCampaign(mockCampaignId), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({ name: "Updated Campaign" });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(mockCampaignResponse);
    expect(result.current.data?.leadCount).toBe(10);
  });
});
