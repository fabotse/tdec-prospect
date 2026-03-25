/**
 * useCreateTechLeads Hook Tests
 * Story 15.5: Criacao de Leads e Integracao com Pipeline
 *
 * AC: #2 - Batch create leads via mutation
 * AC: #3 - Source metadata passed to API
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useCreateTechLeads } from "@/hooks/use-create-tech-leads";
import {
  createMockFetch,
  mockJsonResponse,
  mockErrorResponse,
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

const mockLeads = [
  {
    apolloId: "apollo-1",
    firstName: "João",
    lastName: "Silva",
    email: "joao@acme.com",
  },
];

// ==============================================
// TESTS
// ==============================================

describe("useCreateTechLeads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    restoreFetch();
  });

  it("calls POST /api/leads/create-batch with correct payload", async () => {
    const fetchMock = createMockFetch([
      {
        url: /\/api\/leads\/create-batch/,
        method: "POST",
        response: mockJsonResponse({
          data: { created: 1, skipped: 0, duplicateEmails: [] },
          message: "1 leads criados com sucesso",
        }),
      },
    ]);

    const { result } = renderHook(() => useCreateTechLeads(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.createLeads({
        leads: mockLeads,
        source: "theirStack + Apollo",
        sourceTechnology: "React",
      });
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(fetchMock.calls()).toHaveLength(1);
    expect(fetchMock.calls()[0].method).toBe("POST");
    expect(fetchMock.calls()[0].body).toEqual({
      leads: mockLeads,
      source: "theirStack + Apollo",
      sourceTechnology: "React",
    });
  });

  it("returns created and skipped counts on success", async () => {
    createMockFetch([
      {
        url: /\/api\/leads\/create-batch/,
        method: "POST",
        response: mockJsonResponse({
          data: { created: 1, skipped: 0, duplicateEmails: [] },
          message: "1 leads criados com sucesso",
        }),
      },
    ]);

    const { result } = renderHook(() => useCreateTechLeads(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.createLeads({
        leads: mockLeads,
        source: "theirStack + Apollo",
        sourceTechnology: "React",
      });
    });

    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(result.current.data?.created).toBe(1);
    expect(result.current.data?.skipped).toBe(0);
    expect(result.current.data?.duplicateEmails).toEqual([]);
  });

  it("throws error on API failure", async () => {
    createMockFetch([
      {
        url: /\/api\/leads\/create-batch/,
        method: "POST",
        response: mockErrorResponse(500, "Erro ao criar leads"),
      },
    ]);

    const { result } = renderHook(() => useCreateTechLeads(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.createLeads({
        leads: mockLeads,
        source: "theirStack + Apollo",
        sourceTechnology: "React",
      });
    });

    await waitFor(() => expect(result.current.error).toBeTruthy());

    expect(result.current.error?.message).toContain("Erro");
  });
});
