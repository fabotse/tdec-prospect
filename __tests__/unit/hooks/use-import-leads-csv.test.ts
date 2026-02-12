/**
 * Unit tests for useImportLeadsCsv hook
 * Story 12.2: Import Leads via CSV
 *
 * AC: #6 - Processing and lead creation
 * AC: #7 - Toast with singular/plural counts
 */

import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";

// Mock sonner toast
const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

import { useImportLeadsCsv } from "@/hooks/use-import-leads-csv";

// ==============================================
// HELPERS
// ==============================================

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

const validLeads = [
  { firstName: "João", lastName: "", email: "joao@empresa.com", companyName: null, title: null, linkedinUrl: null, phone: null },
];

// ==============================================
// TESTS
// ==============================================

describe("useImportLeadsCsv", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("should call /api/leads/import-csv with correct params", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { imported: 1, existing: 0, errors: [], leads: [] } }),
    });
    global.fetch = mockFetch;

    const { result } = renderHook(() => useImportLeadsCsv(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({ leads: validLeads, segmentId: null });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockFetch).toHaveBeenCalledWith("/api/leads/import-csv", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leads: validLeads, segmentId: null }),
    });
  });

  it("should show success toast with plural form", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { imported: 5, existing: 0, errors: [], leads: [] } }),
    });

    const { result } = renderHook(() => useImportLeadsCsv(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({ leads: validLeads });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockToastSuccess).toHaveBeenCalledWith("5 leads importados com sucesso");
  });

  it("should show success toast with singular form", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { imported: 1, existing: 0, errors: [], leads: [] } }),
    });

    const { result } = renderHook(() => useImportLeadsCsv(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({ leads: validLeads });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockToastSuccess).toHaveBeenCalledWith("1 lead importado com sucesso");
  });

  it("should show error toast on API error", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: { message: "Erro ao importar" } }),
    });

    const { result } = renderHook(() => useImportLeadsCsv(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({ leads: validLeads });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mockToastError).toHaveBeenCalledWith("Erro ao importar");
  });

  it("should show generic error toast on network error", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("Network failure"));

    const { result } = renderHook(() => useImportLeadsCsv(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({ leads: validLeads });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mockToastError).toHaveBeenCalledWith("Network failure");
  });

  it("should pass segmentId when provided", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { imported: 1, existing: 0, errors: [], leads: [] } }),
    });
    global.fetch = mockFetch;

    const { result } = renderHook(() => useImportLeadsCsv(), { wrapper: createWrapper() });

    const segmentId = "550e8400-e29b-41d4-a716-446655440000";
    await act(async () => {
      result.current.mutate({ leads: validLeads, segmentId });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(callBody.segmentId).toBe(segmentId);
  });
});
