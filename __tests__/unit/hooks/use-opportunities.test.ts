/**
 * Tests for useOpportunities hooks
 * Story 21.4: Central de Oportunidades — Página e Cards
 *
 * AC: #1 (badge count), #4 (filtros/busca), #5 (mutation invalida lista + badge)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

// Mock toast
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import { toast } from "sonner";
import {
  useOpportunities,
  useNewOpportunitiesCount,
  useUpdateOpportunityStatus,
  filterOpportunitiesBySearch,
} from "@/hooks/use-opportunities";
import type { OpportunityCardData } from "@/hooks/use-opportunities";

function createWrapper(queryClient?: QueryClient) {
  const client =
    queryClient ??
    new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client }, children);
  };
}

function makeOpportunity(
  overrides: Partial<OpportunityCardData> = {}
): OpportunityCardData {
  return {
    id: "opp-1",
    tenantId: "t1",
    leadId: "lead-1",
    campaignId: "camp-1",
    source: "reply",
    replyEventId: "evt-1",
    replyText: "Tenho interesse",
    replySubject: "RE: Proposta",
    uniboxUrl: null,
    intent: "interessado",
    ltInterestStatus: null,
    suggestion: null,
    status: "new",
    meetingBookedAt: null,
    openCount: null,
    clickCount: null,
    lastEngagementAt: null,
    createdAt: "2026-07-13T10:00:00Z",
    updatedAt: "2026-07-13T10:00:00Z",
    lead: {
      id: "lead-1",
      firstName: "John",
      lastName: "Doe",
      email: "john@acme.com",
      companyName: "Acme Inc",
      title: "CTO",
      phone: null,
      photoUrl: null,
      isMonitored: false,
      linkedinUrl: null,
    },
    campaignName: "Campanha Q3",
    insight: null,
    ...overrides,
  };
}

const mockResponse = {
  data: [makeOpportunity()],
  meta: { total: 1, page: 1, limit: 25, totalPages: 1 },
};

describe("useOpportunities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("should fetch opportunities successfully", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    } as Response);

    const { result } = renderHook(() => useOpportunities(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.opportunities).toHaveLength(1);
    expect(result.current.opportunities[0].id).toBe("opp-1");
    expect(result.current.meta?.total).toBe(1);
    expect(result.current.error).toBeNull();
  });

  it("should handle fetch error", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ error: { message: "Erro de teste" } }),
    } as Response);

    const { result } = renderHook(() => useOpportunities(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBe("Erro de teste");
    expect(result.current.opportunities).toEqual([]);
  });

  it("should pass server filters as query params", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    } as Response);

    const { result } = renderHook(
      () =>
        useOpportunities({
          intent: "interessado,pediu_info",
          status: "new",
          campaignId: "camp-1",
          period: "7d",
          page: 2,
          perPage: 10,
        }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).toContain("intent=interessado%2Cpediu_info");
    expect(calledUrl).toContain("status=new");
    expect(calledUrl).toContain("campaign_id=camp-1");
    expect(calledUrl).toContain("period=7d");
    expect(calledUrl).toContain("page=2");
    expect(calledUrl).toContain("per_page=10");
  });

  it("should NOT send search to the API (busca é client-side)", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    } as Response);

    const { result } = renderHook(() => useOpportunities({ search: "john" }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).not.toContain("search");
  });
});

describe("filterOpportunitiesBySearch", () => {
  const opportunities = [
    makeOpportunity({ id: "a" }),
    makeOpportunity({
      id: "b",
      lead: {
        id: "lead-2",
        firstName: "Maria",
        lastName: "Silva",
        email: "maria@globex.com",
        companyName: "Globex",
        title: null,
        phone: null,
        photoUrl: null,
        isMonitored: false,
        linkedinUrl: null,
      },
    }),
    makeOpportunity({ id: "c", lead: null }),
  ];

  it("should return all when search is empty/undefined", () => {
    expect(filterOpportunitiesBySearch(opportunities, undefined)).toHaveLength(3);
    expect(filterOpportunitiesBySearch(opportunities, "")).toHaveLength(3);
    expect(filterOpportunitiesBySearch(opportunities, "   ")).toHaveLength(3);
  });

  it("should match by lead name (case-insensitive)", () => {
    const result = filterOpportunitiesBySearch(opportunities, "john doe");
    expect(result.map((o) => o.id)).toEqual(["a"]);
  });

  it("should match by email", () => {
    const result = filterOpportunitiesBySearch(opportunities, "maria@globex");
    expect(result.map((o) => o.id)).toEqual(["b"]);
  });

  it("should match by company name", () => {
    const result = filterOpportunitiesBySearch(opportunities, "acme");
    expect(result.map((o) => o.id)).toEqual(["a"]);
  });

  it("should exclude opportunities without lead (nothing to match)", () => {
    const result = filterOpportunitiesBySearch(opportunities, "qualquercoisa");
    expect(result).toHaveLength(0);
  });
});

describe("useNewOpportunitiesCount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("should fetch new opportunities count", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: { count: 4 } }),
    } as Response);

    const { result } = renderHook(() => useNewOpportunitiesCount(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.data).toBe(4);
    });
  });

  it("should handle fetch error", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({}),
    } as Response);

    const { result } = renderHook(() => useNewOpportunitiesCount(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });
});

describe("useUpdateOpportunityStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("should send PATCH request with correct body", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: {} }),
    } as Response);

    const { result } = renderHook(() => useUpdateOpportunityStatus(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({ opportunityId: "opp-123", status: "viewed", silent: true });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(fetchSpy).toHaveBeenCalledWith("/api/opportunities/opp-123", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "viewed" }),
    });
  });

  it("should invalidate opportunities list AND new-count (AC5: badge decrementa)", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: {} }),
    } as Response);

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useUpdateOpportunityStatus(), {
      wrapper: createWrapper(queryClient),
    });

    result.current.mutate({ opportunityId: "opp-1", status: "viewed", silent: true });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["opportunities"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["opportunities-new-count"] });
  });

  it("should NOT show success toast when silent (transição passiva new→viewed)", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: {} }),
    } as Response);

    const { result } = renderHook(() => useUpdateOpportunityStatus(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({ opportunityId: "opp-1", status: "viewed", silent: true });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(toast.success).not.toHaveBeenCalled();
  });

  it("should show success toast when not silent", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: {} }),
    } as Response);

    const { result } = renderHook(() => useUpdateOpportunityStatus(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({ opportunityId: "opp-1", status: "contacted" });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(toast.success).toHaveBeenCalledWith("Oportunidade marcada como contatada");
  });

  it("should show error toast on failure of an explicit action", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ error: { message: "Erro ao atualizar" } }),
    } as Response);

    const { result } = renderHook(() => useUpdateOpportunityStatus(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({ opportunityId: "opp-1", status: "contacted" });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(toast.error).toHaveBeenCalledWith("Erro ao atualizar");
  });

  it("should NOT show error toast on failure of a silent transition (new→viewed)", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ error: { message: "Erro ao atualizar" } }),
    } as Response);

    const { result } = renderHook(() => useUpdateOpportunityStatus(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({ opportunityId: "opp-1", status: "viewed", silent: true });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(toast.error).not.toHaveBeenCalled();
  });
});
