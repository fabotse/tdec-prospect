/**
 * Tests for useMeetingPrep (Story 24.23)
 * Patch pontual do cache ["opportunities"] + toast só no regenerar.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { toast } from "sonner";
import { useMeetingPrep } from "@/hooks/use-meeting-prep";
import type { OpportunityCardData } from "@/hooks/use-opportunities";
import type { MeetingPrep } from "@/types/meeting-prep";

const PREP: MeetingPrep = {
  version: 1,
  generatedAt: "2026-11-06T15:30:00.000Z",
  account: {
    status: "none",
    companyName: null,
    companyDomain: null,
    researchedAt: null,
    expired: false,
    facts: [],
    whyNow: null,
  },
  engagement: {
    source: "reply",
    campaignName: null,
    replySubject: null,
    replyText: null,
    repliedAt: null,
    openCount: null,
    clickCount: null,
    lastEngagementAt: null,
    meetingBookedAt: null,
    events: [],
  },
  talkingPoints: [
    { text: "A", origin: "sugestao", refs: [] },
    { text: "B", origin: "sugestao", refs: [] },
    { text: "C", origin: "sugestao", refs: [] },
  ],
  objections: [{ objection: "o", answer: "a", origin: "sugestao", refs: [] }],
  kbRefs: [],
};

function card(id: string): OpportunityCardData {
  return { id, intent: "interessado", status: "viewed" } as unknown as OpportunityCardData;
}

const KEY = ["opportunities", { page: 1, perPage: 25, period: "30d" }];

function setup(fetchResponse: { ok: boolean; json: () => Promise<unknown> }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const initial = { data: [card("opp-1"), card("opp-2")], meta: { total: 2 } };
  queryClient.setQueryData(KEY, initial);
  const fetchMock = vi.fn().mockResolvedValue(fetchResponse);
  vi.stubGlobal("fetch", fetchMock);
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
  const { result } = renderHook(() => useMeetingPrep("opp-1"), { wrapper });
  return { queryClient, initial, fetchMock, result };
}

function okJson(data: unknown) {
  return { ok: true, json: () => Promise.resolve({ data }) };
}

describe("useMeetingPrep", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("saved:true põe meetingPrep só no card alvo", async () => {
    const { queryClient, result, fetchMock } = setup(okJson({ meetingPrep: PREP, saved: true }));
    await act(async () => {
      await result.current.generate();
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/opportunities/opp-1/meeting-prep",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ regenerate: false }) })
    );
    const cache = queryClient.getQueryData<{ data: OpportunityCardData[] }>(KEY)!;
    expect(cache.data[0].meetingPrep).toEqual(PREP);
    expect(cache.data[1].meetingPrep).toBeUndefined();
  });

  it("saved:false não mexe no cache", async () => {
    const { queryClient, result, initial } = setup(okJson({ meetingPrep: PREP, saved: false }));
    await act(async () => {
      await result.current.generate();
    });
    expect(queryClient.getQueryData(KEY)).toBe(initial);
  });

  it("meetingPrep:null não mexe no cache", async () => {
    const { queryClient, result, initial } = setup(okJson({ meetingPrep: null, reason: "llm_error" }));
    let response: unknown;
    await act(async () => {
      response = await result.current.generate();
    });
    expect(response).toEqual({ meetingPrep: null, reason: "llm_error" });
    expect(queryClient.getQueryData(KEY)).toBe(initial);
  });

  it("resposta não-ok: generate() resolve null sem toast", async () => {
    const { result } = setup({
      ok: false,
      json: () => Promise.resolve({ error: { message: "Falhou" } }),
    });
    let response: unknown = "x";
    await act(async () => {
      response = await result.current.generate();
    });
    expect(response).toBeNull();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("resposta não-ok: regenerate() dá toast.error e resolve null", async () => {
    const { result, fetchMock } = setup({
      ok: false,
      json: () => Promise.resolve({ error: { message: "Falhou" } }),
    });
    let response: unknown = "x";
    await act(async () => {
      response = await result.current.regenerate();
    });
    expect(response).toBeNull();
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ regenerate: true });
    expect(toast.error).toHaveBeenCalledWith("Falhou");
  });
});
