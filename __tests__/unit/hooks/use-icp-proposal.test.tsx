/**
 * useIcpProposal Tests
 * Story 24.14 - Briefing a partir do ICP
 */

import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useIcpProposal } from "@/hooks/use-icp-proposal";

const createWrapper = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
};

const PROPOSAL = {
  technology: null,
  jobTitles: ["CISO"],
  location: null,
  companySize: null,
  industry: null,
  productSlug: null,
  mode: "guided",
  skipSteps: ["search_companies"],
  icpDefaults: { companySizes: ["201-500"], locations: ["SP"] },
};

function mockFetch(status: number, body: unknown) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  });
}

describe("useIcpProposal (Story 24.14)", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("200 com proposta -> { proposal, isLoaded: true }", async () => {
    mockFetch(200, { data: { proposal: PROPOSAL } });

    const { result } = renderHook(() => useIcpProposal(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoaded).toBe(true));
    expect(result.current.proposal).toEqual(PROPOSAL);
    expect(global.fetch).toHaveBeenCalledWith("/api/agent/briefing/icp-proposal");
  });

  it("200 com proposta null -> { proposal: null, isLoaded: true }", async () => {
    mockFetch(200, { data: { proposal: null } });

    const { result } = renderHook(() => useIcpProposal(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoaded).toBe(true));
    expect(result.current.proposal).toBeNull();
  });

  it("500 -> { proposal: null, isLoaded: false }", async () => {
    mockFetch(500, { error: { message: "boom" } });

    const { result } = renderHook(() => useIcpProposal(), { wrapper: createWrapper() });

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    // Sem retry: o estado final continua nao carregado.
    await new Promise((r) => setTimeout(r, 20));
    expect(result.current).toEqual({ proposal: null, isLoaded: false });
  });

  it("enabled=false -> nao busca", async () => {
    mockFetch(200, { data: { proposal: PROPOSAL } });

    const { result } = renderHook(() => useIcpProposal(false), { wrapper: createWrapper() });

    await new Promise((r) => setTimeout(r, 20));
    expect(global.fetch).not.toHaveBeenCalled();
    expect(result.current).toEqual({ proposal: null, isLoaded: false });
  });
});
