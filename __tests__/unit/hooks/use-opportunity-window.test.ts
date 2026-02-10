/**
 * Unit Tests for useOpportunityWindow hooks
 * Story 10.6: Janela de Oportunidade — Engine + Config
 *
 * AC: #2 — useOpportunityConfig fetch + defaults
 * AC: #3 — useSaveOpportunityConfig mutation
 * AC: #6 — useOpportunityLeads encapsulation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import {
  useOpportunityConfig,
  useSaveOpportunityConfig,
  useOpportunityLeads,
  OPPORTUNITY_CONFIG_QUERY_KEY,
} from "@/hooks/use-opportunity-window";
import {
  createMockOpportunityConfig,
  createMockLeadTracking,
} from "../../helpers/mock-data";
import { DEFAULT_MIN_OPENS, DEFAULT_PERIOD_DAYS } from "@/lib/services/opportunity-engine";

global.fetch = vi.fn();

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("useOpportunityConfig (AC: #2)", () => {
  const campaignId = "campaign-uuid-001";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("busca config do servidor e retorna dados", async () => {
    const mockConfig = createMockOpportunityConfig({ campaignId });

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: mockConfig }),
    } as Response);

    const { result } = renderHook(
      () => useOpportunityConfig(campaignId),
      { wrapper: createWrapper() }
    );

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(mockConfig);
    expect(fetch).toHaveBeenCalledWith(
      `/api/campaigns/${campaignId}/opportunity-config`
    );
  });

  it("retorna defaults quando API retorna null", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: null }),
    } as Response);

    const { result } = renderHook(
      () => useOpportunityConfig(campaignId),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.minOpens).toBe(DEFAULT_MIN_OPENS);
    expect(result.current.data?.periodDays).toBe(DEFAULT_PERIOD_DAYS);
    expect(result.current.data?.campaignId).toBe(campaignId);
  });

  it("nao faz fetch quando enabled=false", () => {
    renderHook(
      () => useOpportunityConfig(campaignId, { enabled: false }),
      { wrapper: createWrapper() }
    );

    expect(fetch).not.toHaveBeenCalled();
  });

  it("nao faz fetch quando campaignId e vazio", () => {
    renderHook(
      () => useOpportunityConfig(""),
      { wrapper: createWrapper() }
    );

    expect(fetch).not.toHaveBeenCalled();
  });

  it("lanca erro quando API falha", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "Erro ao buscar configuracao" }),
    } as Response);

    const { result } = renderHook(
      () => useOpportunityConfig(campaignId),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error?.message).toBe("Erro ao buscar configuracao");
  });
});

describe("useSaveOpportunityConfig (AC: #3)", () => {
  const campaignId = "campaign-uuid-001";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("envia PUT com config e invalida cache no sucesso", async () => {
    const savedConfig = createMockOpportunityConfig({
      campaignId,
      minOpens: 5,
      periodDays: 14,
    });

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: savedConfig }),
    } as Response);

    const { result } = renderHook(
      () => useSaveOpportunityConfig(campaignId),
      { wrapper: createWrapper() }
    );

    await act(async () => {
      result.current.mutate({ minOpens: 5, periodDays: 14 });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetch).toHaveBeenCalledWith(
      `/api/campaigns/${campaignId}/opportunity-config`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ minOpens: 5, periodDays: 14 }),
      }
    );
  });

  it("lanca erro quando PUT falha", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "Erro ao salvar configuracao" }),
    } as Response);

    const { result } = renderHook(
      () => useSaveOpportunityConfig(campaignId),
      { wrapper: createWrapper() }
    );

    await act(async () => {
      result.current.mutate({ minOpens: 1, periodDays: 1 });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error?.message).toBe("Erro ao salvar configuracao");
  });
});

describe("useOpportunityLeads (AC: #6)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-10T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("retorna leads qualificados com base na config", () => {
    const leads = [
      createMockLeadTracking({ openCount: 5, lastOpenAt: "2026-02-09T10:00:00.000Z" }),
      createMockLeadTracking({ openCount: 1, lastOpenAt: "2026-02-09T10:00:00.000Z" }),
    ];
    const config = createMockOpportunityConfig({ minOpens: 3, periodDays: 7 });

    const { result } = renderHook(
      () => useOpportunityLeads(leads, config),
      { wrapper: createWrapper() }
    );

    expect(result.current).toHaveLength(1);
    expect(result.current[0].isInOpportunityWindow).toBe(true);
  });

  it("retorna array vazio quando leads e undefined", () => {
    const config = createMockOpportunityConfig();

    const { result } = renderHook(
      () => useOpportunityLeads(undefined, config),
      { wrapper: createWrapper() }
    );

    expect(result.current).toHaveLength(0);
  });

  it("retorna array vazio quando config e null", () => {
    const leads = [createMockLeadTracking()];

    const { result } = renderHook(
      () => useOpportunityLeads(leads, null),
      { wrapper: createWrapper() }
    );

    expect(result.current).toHaveLength(0);
  });
});

describe("OPPORTUNITY_CONFIG_QUERY_KEY", () => {
  it("gera query key correta", () => {
    expect(OPPORTUNITY_CONFIG_QUERY_KEY("campaign-123")).toEqual([
      "opportunity-config",
      "campaign-123",
    ]);
  });
});
