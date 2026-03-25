/**
 * useContactSearch Hook Tests
 * Story: 15.4 - Apollo Bridge: Busca de Contatos nas Empresas
 *
 * AC: #2 - Search contacts via Apollo API with domain + title filters
 * AC: #5 - Error handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useContactSearch } from "@/hooks/use-contact-search";
import type { ContactSearchApiResponse } from "@/hooks/use-contact-search";
import {
  createMockFetch,
  mockJsonResponse,
  restoreFetch,
} from "../../helpers/mock-fetch";

// ==============================================
// HELPERS
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

const mockApiResponse: ContactSearchApiResponse = {
  data: [
    {
      id: "lead-1",
      tenantId: "tenant-1",
      apolloId: "apollo-1",
      firstName: "João",
      lastName: "Sil***a",
      email: null,
      phone: null,
      companyName: "Acme Corp",
      companySize: null,
      industry: null,
      location: null,
      title: "CTO",
      linkedinUrl: null,
      photoUrl: null,
      status: "novo",
      hasEmail: true,
      hasDirectPhone: "Yes",
      createdAt: "2026-03-25T00:00:00Z",
      updatedAt: "2026-03-25T00:00:00Z",
      icebreaker: null,
      icebreakerGeneratedAt: null,
      linkedinPostsCache: null,
      isMonitored: false,
    },
  ],
  meta: {
    total: 1,
    page: 1,
    limit: 25,
    totalPages: 1,
  },
};

// ==============================================
// TESTS
// ==============================================

describe("useContactSearch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    restoreFetch();
  });

  it("returns initial state", () => {
    const { result } = renderHook(() => useContactSearch(), {
      wrapper: createWrapper(),
    });

    expect(result.current.data).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(typeof result.current.search).toBe("function");
    expect(typeof result.current.reset).toBe("function");
  });

  it("calls POST /api/integrations/apollo with domains and titles", async () => {
    const { calls } = createMockFetch([
      {
        url: "/api/integrations/apollo",
        method: "POST",
        response: mockJsonResponse(mockApiResponse),
      },
    ]);

    const { result } = renderHook(() => useContactSearch(), {
      wrapper: createWrapper(),
    });

    act(() => {
      result.current.search({
        domains: ["acme.com", "beta.io"],
        titles: ["CTO", "CISO"],
      });
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(result.current.data).not.toBeNull();
    });

    expect(calls()).toHaveLength(1);
    expect(calls()[0].url).toBe("/api/integrations/apollo");
    expect(calls()[0].method).toBe("POST");
    expect(calls()[0].body).toEqual({
      domains: ["acme.com", "beta.io"],
      titles: ["CTO", "CISO"],
    });
  });

  it("transforms API response to ContactSearchResult", async () => {
    createMockFetch([
      {
        url: "/api/integrations/apollo",
        method: "POST",
        response: mockJsonResponse(mockApiResponse),
      },
    ]);

    const { result } = renderHook(() => useContactSearch(), {
      wrapper: createWrapper(),
    });

    act(() => {
      result.current.search({ domains: ["acme.com"], titles: ["CTO"] });
    });

    await waitFor(() => {
      expect(result.current.data).not.toBeNull();
    });

    expect(result.current.data!.contacts).toHaveLength(1);
    expect(result.current.data!.contacts[0].firstName).toBe("João");
    expect(result.current.data!.contacts[0].title).toBe("CTO");
    expect(result.current.data!.contacts[0].hasEmail).toBe(true);
    expect(result.current.data!.total).toBe(1);
    expect(result.current.data!.page).toBe(1);
    expect(result.current.data!.totalPages).toBe(1);
  });

  it("sets isLoading during search", async () => {
    let resolveFetch!: (value: unknown) => void;
    const deferredResponse = new Promise((resolve) => {
      resolveFetch = resolve;
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => deferredResponse)
    );

    const { result } = renderHook(() => useContactSearch(), {
      wrapper: createWrapper(),
    });

    act(() => {
      result.current.search({ domains: ["acme.com"], titles: ["CTO"] });
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(true);
    });

    await act(async () => {
      resolveFetch(mockJsonResponse(mockApiResponse));
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    vi.unstubAllGlobals();
  });

  it("handles API error with Portuguese message", async () => {
    createMockFetch([
      {
        url: "/api/integrations/apollo",
        method: "POST",
        response: {
          ok: false,
          status: 500,
          json: () =>
            Promise.resolve({
              error: {
                code: "APOLLO_ERROR",
                message: "Erro ao conectar com Apollo API",
              },
            }),
          text: () => Promise.resolve(""),
        },
      },
    ]);

    const { result } = renderHook(() => useContactSearch(), {
      wrapper: createWrapper(),
    });

    act(() => {
      result.current.search({ domains: ["acme.com"], titles: ["CTO"] });
    });

    await waitFor(() => {
      expect(result.current.error).not.toBeNull();
    });

    expect(result.current.error!.message).toBe(
      "Erro ao conectar com Apollo API"
    );
  });

  it("falls back to generic error when API returns no message", async () => {
    createMockFetch([
      {
        url: "/api/integrations/apollo",
        method: "POST",
        response: {
          ok: false,
          status: 500,
          json: () => Promise.reject(new Error("parse error")),
          text: () => Promise.resolve(""),
        },
      },
    ]);

    const { result } = renderHook(() => useContactSearch(), {
      wrapper: createWrapper(),
    });

    act(() => {
      result.current.search({ domains: ["acme.com"], titles: ["CTO"] });
    });

    await waitFor(() => {
      expect(result.current.error).not.toBeNull();
    });

    expect(result.current.error!.message).toBe(
      "Erro ao buscar contatos via Apollo"
    );
  });

  it("resets state when reset is called", async () => {
    createMockFetch([
      {
        url: "/api/integrations/apollo",
        method: "POST",
        response: mockJsonResponse(mockApiResponse),
      },
    ]);

    const { result } = renderHook(() => useContactSearch(), {
      wrapper: createWrapper(),
    });

    act(() => {
      result.current.search({ domains: ["acme.com"], titles: ["CTO"] });
    });

    await waitFor(() => {
      expect(result.current.data).not.toBeNull();
    });

    act(() => {
      result.current.reset();
    });

    await waitFor(() => {
      expect(result.current.data).toBeNull();
    });
    expect(result.current.error).toBeNull();
  });
});
