/**
 * useCampaignTemplates Hook Tests
 * Story 6.13: Smart Campaign Templates
 *
 * AC #2 - Structure_json parsing and validation
 * AC #6 - Template fetching from database
 */

import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useCampaignTemplates, TEMPLATES_KEY } from "@/hooks/use-campaign-templates";
import type { CampaignTemplate } from "@/types/campaign-template";

const mockTemplates: CampaignTemplate[] = [
  {
    id: "template-1",
    name: "Cold Outreach Classico",
    nameKey: "cold_outreach_classic",
    description: "Sequencia para leads frios",
    structureJson: {
      emails: [
        { position: 1, context: "Introducao", emailMode: "initial" },
        { position: 2, context: "Beneficios", emailMode: "follow-up" },
      ],
      delays: [{ afterEmail: 1, days: 3 }],
    },
    useCase: "Primeiro contato com leads frios",
    emailCount: 5,
    totalDays: 14,
    isActive: true,
    displayOrder: 1,
    createdAt: "2026-02-03T00:00:00Z",
    updatedAt: "2026-02-03T00:00:00Z",
  },
  {
    id: "template-2",
    name: "Reengajamento Rapido",
    nameKey: "quick_reengagement",
    description: "Sequencia para reengajamento",
    structureJson: {
      emails: [{ position: 1, context: "Retomada", emailMode: "initial" }],
      delays: [],
    },
    useCase: "Reengajamento",
    emailCount: 3,
    totalDays: 7,
    isActive: true,
    displayOrder: 2,
    createdAt: "2026-02-03T00:00:00Z",
    updatedAt: "2026-02-03T00:00:00Z",
  },
];

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

describe("useCampaignTemplates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Successful Fetch (AC #6)", () => {
    it("fetches templates from API", async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: mockTemplates }),
      });

      const { result } = renderHook(() => useCampaignTemplates(), {
        wrapper: createWrapper(),
      });

      expect(result.current.isLoading).toBe(true);

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toEqual(mockTemplates);
      expect(result.current.error).toBeNull();
    });

    it("calls the correct API endpoint", async () => {
      const fetchSpy = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: mockTemplates }),
      });
      global.fetch = fetchSpy;

      const { result } = renderHook(() => useCampaignTemplates(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(fetchSpy).toHaveBeenCalledWith("/api/campaign-templates");
    });

    it("returns empty array when API returns empty data", async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [] }),
      });

      const { result } = renderHook(() => useCampaignTemplates(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toEqual([]);
    });

    it("handles undefined data gracefully", async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      });

      const { result } = renderHook(() => useCampaignTemplates(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toEqual([]);
    });
  });

  describe("Error Handling", () => {
    it("handles API error response", async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        json: () =>
          Promise.resolve({
            error: { code: "FETCH_ERROR", message: "Erro ao buscar templates" },
          }),
      });

      const { result } = renderHook(() => useCampaignTemplates(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBeTruthy();
    });

    it("handles network error", async () => {
      global.fetch = vi.fn().mockRejectedValueOnce(new Error("Network error"));

      const { result } = renderHook(() => useCampaignTemplates(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBeTruthy();
    });
  });

  describe("Caching (AC #2)", () => {
    it("exports the correct query key for cache invalidation", () => {
      expect(TEMPLATES_KEY).toEqual(["campaign-templates"]);
    });
  });

  describe("Template Structure (AC #2)", () => {
    it("returns templates with parsed structure_json", async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: mockTemplates }),
      });

      const { result } = renderHook(() => useCampaignTemplates(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const template = result.current.data?.[0];
      expect(template?.structureJson).toBeDefined();
      expect(template?.structureJson.emails).toHaveLength(2);
      expect(template?.structureJson.delays).toHaveLength(1);
    });

    it("returns emails with correct properties", async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: mockTemplates }),
      });

      const { result } = renderHook(() => useCampaignTemplates(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const email = result.current.data?.[0]?.structureJson.emails[0];
      expect(email?.position).toBe(1);
      expect(email?.context).toBe("Introducao");
      expect(email?.emailMode).toBe("initial");
    });

    it("returns delays with correct properties", async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: mockTemplates }),
      });

      const { result } = renderHook(() => useCampaignTemplates(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const delay = result.current.data?.[0]?.structureJson.delays[0];
      expect(delay?.afterEmail).toBe(1);
      expect(delay?.days).toBe(3);
    });
  });

  describe("Loading State", () => {
    it("shows loading state while fetching", async () => {
      let resolvePromise: (value: unknown) => void;
      const promise = new Promise((resolve) => {
        resolvePromise = resolve;
      });

      global.fetch = vi.fn().mockReturnValueOnce(promise);

      const { result } = renderHook(() => useCampaignTemplates(), {
        wrapper: createWrapper(),
      });

      expect(result.current.isLoading).toBe(true);
      expect(result.current.data).toBeUndefined();

      // Resolve the fetch
      resolvePromise!({
        ok: true,
        json: () => Promise.resolve({ data: mockTemplates }),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
    });
  });
});
