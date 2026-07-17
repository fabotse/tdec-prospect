/**
 * Tests for useLeadSequenceAction hook
 * Story 21.9: Controle Manual de Sequência por Lead (AC#5)
 *
 * Padrão dos testes de use-opportunities: QueryClientProvider wrapper,
 * fetch mockado, toast mockado, invalidation da query de tracking.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import { toast } from "sonner";
import {
  useLeadSequenceAction,
  SEQUENCE_STOP_REASON_LABELS,
} from "@/hooks/use-lead-sequence-action";
import { LEAD_TRACKING_QUERY_KEY } from "@/hooks/use-lead-tracking";

const CAMPAIGN_ID = "camp-123";

function createClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function createWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client }, children);
  };
}

describe("useLeadSequenceAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("stop: POSTs to the sequence-actions route with action/leadEmail/reason", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({ success: true, action: "stop", localSynced: true }),
    } as Response);

    const client = createClient();
    const { result } = renderHook(() => useLeadSequenceAction(CAMPAIGN_ID), {
      wrapper: createWrapper(client),
    });

    result.current.mutate({
      action: "stop",
      leadEmail: "lead@example.com",
      reason: "responded_other_channel",
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      `/api/campaigns/${CAMPAIGN_ID}/leads/sequence-actions`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          action: "stop",
          leadEmail: "lead@example.com",
          reason: "responded_other_channel",
        }),
      })
    );
  });

  it("stop: success toast comunica 'solicitado' (202 assíncrono) e invalida o tracking", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({ success: true, action: "stop", localSynced: true }),
    } as Response);

    const client = createClient();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");

    const { result } = renderHook(() => useLeadSequenceAction(CAMPAIGN_ID), {
      wrapper: createWrapper(client),
    });

    result.current.mutate({
      action: "stop",
      leadEmail: "lead@example.com",
      reason: "do_not_contact",
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(toast.success).toHaveBeenCalledWith(
      expect.stringContaining("Sequência interrompida")
    );
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: LEAD_TRACKING_QUERY_KEY(CAMPAIGN_ID),
    });
  });

  it("remove: success toast própria e invalidation do tracking", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({ success: true, action: "remove", localSynced: true }),
    } as Response);

    const client = createClient();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");

    const { result } = renderHook(() => useLeadSequenceAction(CAMPAIGN_ID), {
      wrapper: createWrapper(client),
    });

    result.current.mutate({ action: "remove", leadEmail: "lead@example.com" });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(toast.success).toHaveBeenCalledWith("Lead removido do Instantly");
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: LEAD_TRACKING_QUERY_KEY(CAMPAIGN_ID),
    });
  });

  it("error: surfaces the API userMessage via toast.error, sem invalidation", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: false,
      json: () =>
        Promise.resolve({ error: "Campanha ainda não exportada para o Instantly" }),
    } as Response);

    const client = createClient();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");

    const { result } = renderHook(() => useLeadSequenceAction(CAMPAIGN_ID), {
      wrapper: createWrapper(client),
    });

    result.current.mutate({
      action: "stop",
      leadEmail: "lead@example.com",
      reason: "responded_other_channel",
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(toast.error).toHaveBeenCalledWith(
      "Campanha ainda não exportada para o Instantly"
    );
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it("error: fallback PT-BR quando a API não devolve mensagem", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({}),
    } as Response);

    const client = createClient();
    const { result } = renderHook(() => useLeadSequenceAction(CAMPAIGN_ID), {
      wrapper: createWrapper(client),
    });

    result.current.mutate({ action: "remove", leadEmail: "lead@example.com" });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(toast.error).toHaveBeenCalledWith(
      "Erro ao executar ação de sequência"
    );
  });
});

describe("SEQUENCE_STOP_REASON_LABELS", () => {
  it("has PT-BR labels for both stop reasons", () => {
    expect(SEQUENCE_STOP_REASON_LABELS.responded_other_channel).toBe(
      "Respondeu por outro canal"
    );
    expect(SEQUENCE_STOP_REASON_LABELS.do_not_contact).toBe(
      "Não contactar mais"
    );
  });
});
