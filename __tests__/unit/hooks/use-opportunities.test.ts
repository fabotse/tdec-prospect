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
  useOpportunitySuggestion,
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

// ==============================================
// Story 21.5 — useOpportunitySuggestion (AC #1, #2, #5)
// ==============================================

describe("useOpportunitySuggestion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("generate() chama a rota com regenerate=false (geração automática ao abrir)", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: { suggestion: "Rascunho", cached: false } }),
    } as Response);

    const { result } = renderHook(() => useOpportunitySuggestion("opp-1"), {
      wrapper: createWrapper(),
    });

    await result.current.generate();

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/opportunities/opp-1/suggestion",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ regenerate: false }),
      })
    );
  });

  it("regenerate() chama a rota com regenerate=true (bypassa o cache — AC2)", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: { suggestion: "Novo rascunho" } }),
    } as Response);

    const { result } = renderHook(() => useOpportunitySuggestion("opp-1"), {
      wrapper: createWrapper(),
    });

    const returned = await result.current.regenerate();

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/opportunities/opp-1/suggestion",
      expect.objectContaining({ body: JSON.stringify({ regenerate: true }) })
    );
    expect(returned?.suggestion).toBe("Novo rascunho");
  });

  it("atualiza o cache de ['opportunities'] pontualmente, sem refetch (defer 21.4: churn)", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const serverFilters = {
      intent: undefined,
      status: undefined,
      campaignId: undefined,
      period: undefined,
      page: undefined,
      perPage: undefined,
    };
    queryClient.setQueryData(["opportunities", serverFilters], {
      data: [makeOpportunity({ id: "opp-1" }), makeOpportunity({ id: "opp-2" })],
      meta: { total: 2, page: 1, limit: 25, totalPages: 1 },
    });

    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: { suggestion: "Rascunho da opp-1" } }),
    } as Response);

    const { result } = renderHook(() => useOpportunitySuggestion("opp-1"), {
      wrapper: createWrapper(queryClient),
    });

    await result.current.generate();

    const cached = queryClient.getQueryData(["opportunities", serverFilters]) as {
      data: OpportunityCardData[];
    };
    expect(cached.data[0].suggestion).toBe("Rascunho da opp-1");
    // Só a oportunidade alvo é tocada
    expect(cached.data[1].suggestion).toBeNull();
  });

  it("suggestion null (fail-open) não sobrescreve o cache com null", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const serverFilters = {
      intent: undefined,
      status: undefined,
      campaignId: undefined,
      period: undefined,
      page: undefined,
      perPage: undefined,
    };
    queryClient.setQueryData(["opportunities", serverFilters], {
      data: [makeOpportunity({ id: "opp-1", suggestion: "Rascunho anterior" })],
      meta: { total: 1, page: 1, limit: 25, totalPages: 1 },
    });

    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: { suggestion: null } }),
    } as Response);

    const { result } = renderHook(() => useOpportunitySuggestion("opp-1"), {
      wrapper: createWrapper(queryClient),
    });

    await result.current.generate();

    const cached = queryClient.getQueryData(["opportunities", serverFilters]) as {
      data: OpportunityCardData[];
    };
    expect(cached.data[0].suggestion).toBe("Rascunho anterior");
  });

  it("erro no regenerate explícito → toast de erro (AC2)", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ error: { message: "Erro ao gerar rascunho" } }),
    } as Response);

    const { result } = renderHook(() => useOpportunitySuggestion("opp-1"), {
      wrapper: createWrapper(),
    });

    await result.current.regenerate();

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Erro ao gerar rascunho");
    });
  });

  it("erro na geração automática (passiva) NÃO dá toast — o card degrada em silêncio (AC5)", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ error: { message: "Erro ao gerar rascunho" } }),
    } as Response);

    const { result } = renderHook(() => useOpportunitySuggestion("opp-1"), {
      wrapper: createWrapper(),
    });

    await result.current.generate();

    await waitFor(() => {
      expect(result.current.error).toBe("Erro ao gerar rascunho");
    });
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("generate() não rejeita em erro — o card nunca quebra (AC5)", async () => {
    vi.spyOn(global, "fetch").mockRejectedValueOnce(new Error("network down"));

    const { result } = renderHook(() => useOpportunitySuggestion("opp-1"), {
      wrapper: createWrapper(),
    });

    await expect(result.current.generate()).resolves.toBeNull();
  });
});

describe("useUpdateOpportunityStatus — copy de meeting_booked (Story 21.5)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("meeting_booked tem toast próprio quando o lead FOI promovido", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: {}, meta: { leadPromoted: true } }),
    } as Response);

    const { result } = renderHook(() => useUpdateOpportunityStatus(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({ opportunityId: "opp-1", status: "meeting_booked" });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(toast.success).toHaveBeenCalledWith(
      "Reunião marcada — lead promovido a oportunidade"
    );
  });

  it("NÃO afirma a promoção quando ela não ocorreu (oportunidade sem lead / update falhou)", async () => {
    // `lead_id` é nullable (00055:28) e a 21.2 cria cards sem lead; a promoção
    // também é secundária no servidor (erro só loga). Afirmar no toast que o lead
    // foi promovido seria mentir sobre um efeito que o usuário não vê nesta tela.
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: {}, meta: { leadPromoted: false } }),
    } as Response);

    const { result } = renderHook(() => useUpdateOpportunityStatus(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({ opportunityId: "opp-1", status: "meeting_booked" });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(toast.success).toHaveBeenCalledWith("Reunião marcada");
  });

  it("resposta sem `meta` (rota antiga) degrada para o toast genérico, nunca mente", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: {} }),
    } as Response);

    const { result } = renderHook(() => useUpdateOpportunityStatus(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({ opportunityId: "opp-1", status: "meeting_booked" });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(toast.success).toHaveBeenCalledWith("Reunião marcada");
  });
});
