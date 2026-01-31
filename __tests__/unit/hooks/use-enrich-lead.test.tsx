/**
 * Unit tests for useEnrichLead hooks
 * Story: 3.2.1 - People Enrichment Integration
 *
 * Tests:
 * - useEnrichLead mutation for single lead enrichment
 * - useBulkEnrichLeads mutation for bulk enrichment
 * - Optimistic updates
 * - Error handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEnrichLead, useBulkEnrichLeads } from "@/hooks/use-enrich-lead";
import type { ReactNode } from "react";

// ==============================================
// TEST SETUP
// ==============================================

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

// ==============================================
// MOCKS
// ==============================================

const mockEnrichmentResponse = {
  data: {
    person: {
      id: "apollo-123",
      first_name: "João",
      last_name: "Silva",
      email: "joao@empresa.com",
      email_status: "verified",
      title: "CEO",
      city: "São Paulo",
      state: "SP",
      country: "Brazil",
      linkedin_url: null,
      photo_url: null,
      employment_history: [],
    },
    organization: {
      id: "org-1",
      name: "Empresa SA",
      domain: "empresa.com",
      industry: "Technology",
      estimated_num_employees: 150,
    },
  },
};

const mockBulkResponse = {
  data: [
    {
      id: "apollo-1",
      first_name: "João",
      last_name: "Silva",
      email: "joao@empresa.com",
      email_status: "verified",
      title: "CEO",
      city: "São Paulo",
      state: "SP",
      country: "Brazil",
      linkedin_url: null,
      photo_url: null,
      employment_history: [],
    },
    {
      id: "apollo-2",
      first_name: "Maria",
      last_name: "Santos",
      email: "maria@empresa.com",
      email_status: "verified",
      title: "CTO",
      city: "Rio de Janeiro",
      state: "RJ",
      country: "Brazil",
      linkedin_url: null,
      photo_url: null,
      employment_history: [],
    },
  ],
  meta: { total: 2 },
};

// ==============================================
// TESTS
// ==============================================

describe("useEnrichLead", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("single lead enrichment", () => {
    it("returns initial state", () => {
      const { result } = renderHook(() => useEnrichLead(), {
        wrapper: createWrapper(),
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.isSuccess).toBe(false);
      expect(result.current.data).toBeUndefined();
      expect(result.current.error).toBeNull();
    });

    it("enriches single lead successfully", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockEnrichmentResponse),
      });

      const { result } = renderHook(() => useEnrichLead(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        result.current.enrich({ apolloId: "apollo-123" });
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data?.person?.last_name).toBe("Silva");
    });

    it("handles enrichment error", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        json: () =>
          Promise.resolve({
            error: {
              code: "APOLLO_ERROR",
              message: "Pessoa não encontrada",
            },
          }),
      });

      const { result } = renderHook(() => useEnrichLead(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        result.current.enrich({ apolloId: "nonexistent" });
      });

      await waitFor(() => {
        expect(result.current.error).toBeDefined();
      });

      expect(result.current.error).toContain("não encontrada");
    });

    it("provides enrichAsync for promise-based usage", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockEnrichmentResponse),
      });

      const { result } = renderHook(() => useEnrichLead(), {
        wrapper: createWrapper(),
      });

      let enrichedData;
      await act(async () => {
        enrichedData = await result.current.enrichAsync({ apolloId: "apollo-123" });
      });

      expect(enrichedData?.person?.email).toBe("joao@empresa.com");
    });

    it("passes enrichment options correctly", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockEnrichmentResponse),
      });
      global.fetch = fetchMock;

      const { result } = renderHook(() => useEnrichLead(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        result.current.enrich({
          apolloId: "apollo-123",
          options: {
            revealPersonalEmails: true,
            revealPhoneNumber: true,
            webhookUrl: "https://example.com/webhook",
          },
        });
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(callBody.revealPersonalEmails).toBe(true);
      expect(callBody.revealPhoneNumber).toBe(true);
      expect(callBody.webhookUrl).toBe("https://example.com/webhook");
    });

    it("provides reset function", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockEnrichmentResponse),
      });

      const { result } = renderHook(() => useEnrichLead(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        result.current.enrich({ apolloId: "apollo-123" });
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      act(() => {
        result.current.reset();
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(false);
      });

      expect(result.current.data).toBeUndefined();
    });
  });
});

describe("useBulkEnrichLeads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("bulk lead enrichment", () => {
    it("returns initial state", () => {
      const { result } = renderHook(() => useBulkEnrichLeads(), {
        wrapper: createWrapper(),
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.isSuccess).toBe(false);
      expect(result.current.data).toEqual([]);
      expect(result.current.error).toBeNull();
    });

    it("enriches multiple leads successfully", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockBulkResponse),
      });

      const { result } = renderHook(() => useBulkEnrichLeads(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        result.current.enrichBulk({ apolloIds: ["apollo-1", "apollo-2"] });
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toHaveLength(2);
      expect(result.current.data[0].last_name).toBe("Silva");
      expect(result.current.data[1].last_name).toBe("Santos");
    });

    it("handles bulk enrichment error", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        json: () =>
          Promise.resolve({
            error: {
              code: "VALIDATION_ERROR",
              message: "Máximo de 10 leads por requisição",
            },
          }),
      });

      const { result } = renderHook(() => useBulkEnrichLeads(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        result.current.enrichBulk({
          apolloIds: Array.from({ length: 11 }, (_, i) => `apollo-${i}`),
        });
      });

      await waitFor(() => {
        expect(result.current.error).toBeDefined();
      });

      expect(result.current.error).toContain("10");
    });

    it("provides enrichBulkAsync for promise-based usage", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockBulkResponse),
      });

      const { result } = renderHook(() => useBulkEnrichLeads(), {
        wrapper: createWrapper(),
      });

      let enrichedData;
      await act(async () => {
        enrichedData = await result.current.enrichBulkAsync({
          apolloIds: ["apollo-1", "apollo-2"],
        });
      });

      expect(enrichedData).toHaveLength(2);
    });

    it("passes enrichment options correctly", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockBulkResponse),
      });
      global.fetch = fetchMock;

      const { result } = renderHook(() => useBulkEnrichLeads(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        result.current.enrichBulk({
          apolloIds: ["apollo-1"],
          options: {
            revealPersonalEmails: true,
          },
        });
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(callBody.revealPersonalEmails).toBe(true);
    });

    it("provides reset function", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockBulkResponse),
      });

      const { result } = renderHook(() => useBulkEnrichLeads(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        result.current.enrichBulk({ apolloIds: ["apollo-1"] });
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      act(() => {
        result.current.reset();
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(false);
      });

      expect(result.current.data).toEqual([]);
    });
  });
});
