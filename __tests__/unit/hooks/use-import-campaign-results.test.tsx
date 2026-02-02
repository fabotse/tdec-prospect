/**
 * Tests for useImportCampaignResults hook
 * Story: 4.7 - Import Campaign Results
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useImportCampaignResults } from "@/hooks/use-import-campaign-results";
import type { ReactNode } from "react";

// Mock sonner toast
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Get toast mock
import { toast } from "sonner";

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Test wrapper
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

describe("useImportCampaignResults", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it("should successfully import campaign results", async () => {
    const mockResponse = {
      data: {
        matched: 2,
        updated: 2,
        unmatched: [],
        errors: [],
      },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    const { result } = renderHook(() => useImportCampaignResults(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({
        results: [
          { email: "test1@example.com", responseType: "replied" },
          { email: "test2@example.com", responseType: "bounced" },
        ],
      });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockFetch).toHaveBeenCalledWith("/api/leads/import-results", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: expect.any(String),
    });

    expect(toast.success).toHaveBeenCalled();
  });

  it("should show success message with updated count", async () => {
    const mockResponse = {
      data: {
        matched: 3,
        updated: 2,
        unmatched: ["notfound@example.com"],
        errors: [],
      },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    const { result } = renderHook(() => useImportCampaignResults(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({
        results: [
          { email: "test1@example.com", responseType: "replied" },
          { email: "test2@example.com", responseType: "bounced" },
          { email: "notfound@example.com", responseType: "replied" },
        ],
      });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(toast.success).toHaveBeenCalledWith(
      "2 leads atualizados, 1 nao encontrado"
    );
  });

  it("should show error message on failure", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () =>
        Promise.resolve({
          error: { code: "VALIDATION_ERROR", message: "Dados invalidos" },
        }),
    });

    const { result } = renderHook(() => useImportCampaignResults(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({
        results: [{ email: "test@example.com", responseType: "replied" }],
      });
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(toast.error).toHaveBeenCalledWith("Dados invalidos");
  });

  it("should show singular message for single lead", async () => {
    const mockResponse = {
      data: {
        matched: 1,
        updated: 1,
        unmatched: [],
        errors: [],
      },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    const { result } = renderHook(() => useImportCampaignResults(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({
        results: [{ email: "test@example.com", responseType: "replied" }],
      });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(toast.success).toHaveBeenCalledWith("1 lead atualizado");
  });

  it("should include created leads in message", async () => {
    const mockResponse = {
      data: {
        matched: 0,
        updated: 0,
        unmatched: [],
        errors: [],
        created: 2,
      },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    const { result } = renderHook(() => useImportCampaignResults(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({
        results: [
          { email: "new1@example.com", responseType: "replied" },
          { email: "new2@example.com", responseType: "replied" },
        ],
        createMissingLeads: true,
      });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(toast.success).toHaveBeenCalledWith("2 leads criados");
  });

  it("should pass createMissingLeads flag to API", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: {
            matched: 0,
            updated: 0,
            unmatched: [],
            errors: [],
            created: 1,
          },
        }),
    });

    const { result } = renderHook(() => useImportCampaignResults(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({
        results: [{ email: "new@example.com", responseType: "replied" }],
        createMissingLeads: true,
      });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(callBody.createMissingLeads).toBe(true);
  });

  it("should handle network errors", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    const { result } = renderHook(() => useImportCampaignResults(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({
        results: [{ email: "test@example.com", responseType: "replied" }],
      });
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(toast.error).toHaveBeenCalledWith("Network error");
  });
});
