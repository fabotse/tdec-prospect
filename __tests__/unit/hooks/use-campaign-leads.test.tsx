/**
 * Tests for useCampaignLeads Hook
 * Story 5.7: Campaign Lead Association
 *
 * AC: #4 - Add leads to campaign
 * AC: #7 - View leads associated
 * AC: #8 - Remove leads from campaign
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useCampaignLeads } from "@/hooks/use-campaign-leads";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock sonner toast
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe("useCampaignLeads", () => {
  const mockCampaignLeads = [
    {
      id: "cl-1",
      added_at: "2026-01-30T10:00:00Z",
      lead: {
        id: "lead-1",
        first_name: "John",
        last_name: "Doe",
        email: "john@example.com",
        company_name: "Acme Inc",
        title: "CEO",
        photo_url: null,
      },
    },
    {
      id: "cl-2",
      added_at: "2026-01-29T10:00:00Z",
      lead: {
        id: "lead-2",
        first_name: "Jane",
        last_name: "Smith",
        email: "jane@example.com",
        company_name: "Tech Corp",
        title: "CTO",
        photo_url: null,
      },
    },
  ];

  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("Fetching leads (AC #7)", () => {
    it("should fetch campaign leads", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: mockCampaignLeads }),
      });

      const { result } = renderHook(() => useCampaignLeads("campaign-123"), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.leads).toHaveLength(2);
      expect(result.current.leadCount).toBe(2);
      expect(mockFetch).toHaveBeenCalledWith("/api/campaigns/campaign-123/leads");
    });

    it("should transform snake_case to camelCase", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: mockCampaignLeads }),
      });

      const { result } = renderHook(() => useCampaignLeads("campaign-123"), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.leads[0].lead.firstName).toBe("John");
      expect(result.current.leads[0].lead.lastName).toBe("Doe");
      expect(result.current.leads[0].lead.companyName).toBe("Acme Inc");
      expect(result.current.leads[0].addedAt).toBe("2026-01-30T10:00:00Z");
    });

    it("should not fetch when campaignId is null", () => {
      const { result } = renderHook(() => useCampaignLeads(null), {
        wrapper: createWrapper(),
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.leads).toEqual([]);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("should handle fetch error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            error: { message: "Erro ao buscar leads" },
          }),
      });

      const { result } = renderHook(() => useCampaignLeads("campaign-123"), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.error).toBe("Erro ao buscar leads");
      });
    });
  });

  describe("Adding leads (AC #4)", () => {
    it("should add leads to campaign", async () => {
      // First call: fetch campaign leads
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [] }),
      });

      // Second call: add leads
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [{ id: "cl-new", campaign_id: "campaign-123", lead_id: "lead-1" }],
            meta: { added: 1 },
          }),
      });

      const { result } = renderHook(() => useCampaignLeads("campaign-123"), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.addLeads.mutateAsync(["lead-1"]);
      });

      expect(mockFetch).toHaveBeenCalledWith("/api/campaigns/campaign-123/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadIds: ["lead-1"] }),
      });
    });

    it("should handle add leads error", async () => {
      const { toast } = await import("sonner");

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [] }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            error: { message: "Erro ao adicionar leads" },
          }),
      });

      const { result } = renderHook(() => useCampaignLeads("campaign-123"), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        try {
          await result.current.addLeads.mutateAsync(["lead-1"]);
        } catch {
          // Expected to throw
        }
      });

      expect(toast.error).toHaveBeenCalledWith("Erro ao adicionar leads");
    });

    it("should throw when campaignId is null", async () => {
      const { result } = renderHook(() => useCampaignLeads(null), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        try {
          await result.current.addLeads.mutateAsync(["lead-1"]);
        } catch (error) {
          expect((error as Error).message).toBe("ID da campanha e obrigatorio");
        }
      });
    });
  });

  describe("Removing leads (AC #8)", () => {
    it("should remove lead from campaign", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: mockCampaignLeads }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
      });

      const { result } = renderHook(() => useCampaignLeads("campaign-123"), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.removeLead.mutateAsync("lead-1");
      });

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/campaigns/campaign-123/leads/lead-1",
        { method: "DELETE" }
      );
    });

    it("should handle remove lead error", async () => {
      const { toast } = await import("sonner");

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [] }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () =>
          Promise.resolve({
            error: { message: "Lead nao encontrado" },
          }),
      });

      const { result } = renderHook(() => useCampaignLeads("campaign-123"), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        try {
          await result.current.removeLead.mutateAsync("lead-invalid");
        } catch {
          // Expected to throw
        }
      });

      expect(toast.error).toHaveBeenCalledWith("Lead nao encontrado");
    });
  });

  describe("State management", () => {
    it("should return empty array when no leads", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [] }),
      });

      const { result } = renderHook(() => useCampaignLeads("campaign-123"), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.leads).toEqual([]);
      expect(result.current.leadCount).toBe(0);
    });

    it("should expose isAdding state from mutation", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [] }),
      });

      const { result } = renderHook(() => useCampaignLeads("campaign-123"), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Just verify the property exists and has correct initial value
      expect(result.current.isAdding).toBe(false);
    });

    it("should expose isRemoving state from mutation", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: mockCampaignLeads }),
      });

      const { result } = renderHook(() => useCampaignLeads("campaign-123"), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Just verify the property exists and has correct initial value
      expect(result.current.isRemoving).toBe(false);
    });
  });
});
