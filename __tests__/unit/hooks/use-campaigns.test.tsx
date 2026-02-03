/**
 * useCampaigns Hook Tests
 * Story 5.1: Campaigns Page & Data Model
 *
 * AC: #1 - View campaigns list
 * AC: #4 - Create new campaign
 * AC: #5 - Lead count per campaign
 */

import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import {
  useCampaigns,
  useCampaign,
  useCreateCampaign,
  useDeleteCampaign,
} from "@/hooks/use-campaigns";

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Test data
const mockCampaigns = [
  {
    id: "campaign-1",
    tenantId: "tenant-1",
    name: "Q1 Outreach",
    status: "active",
    createdAt: "2026-02-01T10:00:00Z",
    updatedAt: "2026-02-01T10:00:00Z",
    leadCount: 25,
  },
  {
    id: "campaign-2",
    tenantId: "tenant-1",
    name: "Welcome Series",
    status: "draft",
    createdAt: "2026-01-30T10:00:00Z",
    updatedAt: "2026-01-30T10:00:00Z",
    leadCount: 0,
  },
  {
    id: "campaign-3",
    tenantId: "tenant-1",
    name: "Re-engagement",
    status: "paused",
    createdAt: "2026-01-28T10:00:00Z",
    updatedAt: "2026-01-29T10:00:00Z",
    leadCount: 150,
  },
];

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

describe("useCampaigns Hook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("useCampaigns - List (AC: #1, #5)", () => {
    it("fetches campaigns successfully", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: mockCampaigns }),
      });

      const { result } = renderHook(() => useCampaigns(), {
        wrapper: createWrapper(),
      });

      expect(result.current.isLoading).toBe(true);

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toEqual(mockCampaigns);
      expect(mockFetch).toHaveBeenCalledWith("/api/campaigns");
    });

    it("returns campaigns with lead counts (AC: #5)", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: mockCampaigns }),
      });

      const { result } = renderHook(() => useCampaigns(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data?.[0]?.leadCount).toBe(25);
      expect(result.current.data?.[1]?.leadCount).toBe(0);
      expect(result.current.data?.[2]?.leadCount).toBe(150);
    });

    it("handles fetch error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          error: { message: "Erro ao buscar campanhas" },
        }),
      });

      const { result } = renderHook(() => useCampaigns(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error?.message).toBe("Erro ao buscar campanhas");
    });

    it("returns empty array when no campaigns exist", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [] }),
      });

      const { result } = renderHook(() => useCampaigns(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toEqual([]);
    });
  });

  describe("useCampaign - Single Campaign (Story 5.2 AC: #1)", () => {
    const mockCampaign = mockCampaigns[0];
    const campaignId = mockCampaign.id;

    it("fetches single campaign successfully", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: mockCampaign }),
      });

      const { result } = renderHook(() => useCampaign(campaignId), {
        wrapper: createWrapper(),
      });

      expect(result.current.isLoading).toBe(true);

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toEqual(mockCampaign);
      expect(mockFetch).toHaveBeenCalledWith(`/api/campaigns/${campaignId}`);
    });

    it("returns campaign with lead count", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: mockCampaign }),
      });

      const { result } = renderHook(() => useCampaign(campaignId), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data?.leadCount).toBe(25);
    });

    it("handles 404 error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          error: { code: "NOT_FOUND", message: "Campanha nao encontrada" },
        }),
      });

      const { result } = renderHook(() => useCampaign("non-existent-id"), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error?.message).toBe("Campanha nao encontrada");
    });

    it("handles fetch error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          error: { message: "Erro ao buscar campanha" },
        }),
      });

      const { result } = renderHook(() => useCampaign(campaignId), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error?.message).toBe("Erro ao buscar campanha");
    });

    it("does not fetch when campaignId is undefined", async () => {
      const { result } = renderHook(() => useCampaign(undefined), {
        wrapper: createWrapper(),
      });

      // Should not be loading because query is disabled
      expect(result.current.isLoading).toBe(false);
      expect(result.current.isFetching).toBe(false);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("uses correct query key", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: mockCampaign }),
      });

      const { result } = renderHook(() => useCampaign(campaignId), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Query key should be ["campaigns", campaignId]
      expect(mockFetch).toHaveBeenCalledWith(`/api/campaigns/${campaignId}`);
    });
  });

  describe("useCreateCampaign - Create (AC: #4)", () => {
    it("creates campaign successfully", async () => {
      const newCampaign = { name: "New Campaign" };

      const createdCampaign = {
        id: "campaign-new",
        tenantId: "tenant-1",
        name: "New Campaign",
        status: "draft",
        createdAt: "2026-02-02T10:00:00Z",
        updatedAt: "2026-02-02T10:00:00Z",
        leadCount: 0,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: createdCampaign }),
      });

      const { result } = renderHook(() => useCreateCampaign(), {
        wrapper: createWrapper(),
      });

      const campaign = await result.current.mutateAsync(newCampaign);

      expect(mockFetch).toHaveBeenCalledWith("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newCampaign),
      });

      expect(campaign.id).toBe("campaign-new");
      expect(campaign.status).toBe("draft");
      expect(campaign.leadCount).toBe(0);
    });

    it("handles create error - validation", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          error: { message: "Nome e obrigatorio" },
        }),
      });

      const { result } = renderHook(() => useCreateCampaign(), {
        wrapper: createWrapper(),
      });

      await expect(
        result.current.mutateAsync({ name: "" })
      ).rejects.toThrow("Nome e obrigatorio");
    });

    it("handles create error - server error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          error: { message: "Erro ao criar campanha" },
        }),
      });

      const { result } = renderHook(() => useCreateCampaign(), {
        wrapper: createWrapper(),
      });

      await expect(
        result.current.mutateAsync({ name: "Test" })
      ).rejects.toThrow("Erro ao criar campanha");
    });

    it("returns campaign with default status draft (AC: #4)", async () => {
      const createdCampaign = {
        id: "campaign-new",
        tenantId: "tenant-1",
        name: "New Campaign",
        status: "draft",
        createdAt: "2026-02-02T10:00:00Z",
        updatedAt: "2026-02-02T10:00:00Z",
        leadCount: 0,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: createdCampaign }),
      });

      const { result } = renderHook(() => useCreateCampaign(), {
        wrapper: createWrapper(),
      });

      const campaign = await result.current.mutateAsync({ name: "New Campaign" });

      // AC: #4 - Campaign created with status "draft"
      expect(campaign.status).toBe("draft");
    });
  });

  describe("useDeleteCampaign - Delete Campaign", () => {
    const campaignId = "campaign-1";

    it("deletes campaign successfully", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
      });

      const { result } = renderHook(() => useDeleteCampaign(), {
        wrapper: createWrapper(),
      });

      await result.current.mutateAsync(campaignId);

      expect(mockFetch).toHaveBeenCalledWith(`/api/campaigns/${campaignId}`, {
        method: "DELETE",
      });
    });

    it("handles delete error - not found", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          error: { code: "NOT_FOUND", message: "Campanha nao encontrada" },
        }),
      });

      const { result } = renderHook(() => useDeleteCampaign(), {
        wrapper: createWrapper(),
      });

      await expect(
        result.current.mutateAsync(campaignId)
      ).rejects.toThrow("Campanha nao encontrada");
    });

    it("handles delete error - server error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          error: { message: "Erro ao remover campanha" },
        }),
      });

      const { result } = renderHook(() => useDeleteCampaign(), {
        wrapper: createWrapper(),
      });

      await expect(
        result.current.mutateAsync(campaignId)
      ).rejects.toThrow("Erro ao remover campanha");
    });

    it("returns isPending state while deleting", async () => {
      let resolveDelete: () => void;
      const deletePromise = new Promise<void>((resolve) => {
        resolveDelete = resolve;
      });

      mockFetch.mockImplementationOnce(() =>
        deletePromise.then(() => ({ ok: true, status: 204 }))
      );

      const { result } = renderHook(() => useDeleteCampaign(), {
        wrapper: createWrapper(),
      });

      // Start mutation
      const mutationPromise = result.current.mutateAsync(campaignId);

      // Should be pending
      await waitFor(() => {
        expect(result.current.isPending).toBe(true);
      });

      // Resolve the delete
      resolveDelete!();
      await mutationPromise;

      // Should no longer be pending
      await waitFor(() => {
        expect(result.current.isPending).toBe(false);
      });
    });

    it("returns isError state on failure", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          error: { message: "Erro ao remover campanha" },
        }),
      });

      const { result } = renderHook(() => useDeleteCampaign(), {
        wrapper: createWrapper(),
      });

      try {
        await result.current.mutateAsync(campaignId);
      } catch {
        // Expected to throw
      }

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error?.message).toBe("Erro ao remover campanha");
    });
  });
});
