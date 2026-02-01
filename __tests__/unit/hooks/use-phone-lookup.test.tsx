/**
 * Unit tests for usePhoneLookup Hook
 * Story: 4.4 - SignalHire Integration Service
 *
 * Tests:
 * - Mutation calls correct API endpoint
 * - Success triggers toast and invalidates queries
 * - Error triggers toast with message
 * - Respects options for toast display
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { usePhoneLookup } from "@/hooks/use-phone-lookup";
import * as sonner from "sonner";

// Mock sonner toast
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Helper to create test wrapper
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
      mutations: {
        retry: false,
      },
    },
  });

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe("usePhoneLookup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("mutation behavior", () => {
    it("calls correct API endpoint", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              phone: "+5511999887766",
              creditsUsed: 1,
              creditsRemaining: 99,
            },
          }),
      });
      global.fetch = fetchMock;

      const { result } = renderHook(() => usePhoneLookup(), {
        wrapper: createWrapper(),
      });

      act(() => {
        result.current.lookupPhone({
          identifier: "https://linkedin.com/in/john-doe",
        });
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(fetchMock).toHaveBeenCalledWith(
        "/api/integrations/signalhire/lookup",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
          }),
          body: expect.stringContaining("linkedin.com/in/john-doe"),
        })
      );
    });

    it("returns phone data on success", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              phone: "+5511999887766",
              creditsUsed: 1,
              creditsRemaining: 99,
            },
          }),
      });

      const { result } = renderHook(() => usePhoneLookup(), {
        wrapper: createWrapper(),
      });

      act(() => {
        result.current.lookupPhone({
          identifier: "test@example.com",
        });
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data?.phone).toBe("+5511999887766");
      expect(result.current.data?.creditsUsed).toBe(1);
      expect(result.current.data?.creditsRemaining).toBe(99);
    });

    it("shows success toast by default", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              phone: "+5511999887766",
              creditsUsed: 1,
              creditsRemaining: 99,
            },
          }),
      });

      const { result } = renderHook(() => usePhoneLookup(), {
        wrapper: createWrapper(),
      });

      act(() => {
        result.current.lookupPhone({
          identifier: "test@example.com",
        });
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(sonner.toast.success).toHaveBeenCalledWith(
        "Telefone encontrado!",
        expect.objectContaining({
          description: expect.stringContaining("+5511999887766"),
        })
      );
    });

    it("shows error toast on failure", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        json: () =>
          Promise.resolve({
            error: {
              code: "SIGNALHIRE_ERROR",
              message: "Contato não encontrado no SignalHire.",
            },
          }),
      });

      const { result } = renderHook(() => usePhoneLookup(), {
        wrapper: createWrapper(),
      });

      act(() => {
        result.current.lookupPhone({
          identifier: "notfound@example.com",
        });
      });

      await waitFor(() => {
        expect(result.current.error).toBeTruthy();
      });

      expect(sonner.toast.error).toHaveBeenCalledWith(
        "Falha na busca",
        expect.objectContaining({
          description: expect.stringContaining("não encontrado"),
        })
      );
    });

    it("does not show toast when disabled", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              phone: "+5511999887766",
              creditsUsed: 1,
              creditsRemaining: 99,
            },
          }),
      });

      const { result } = renderHook(
        () =>
          usePhoneLookup({
            showSuccessToast: false,
            showErrorToast: false,
          }),
        {
          wrapper: createWrapper(),
        }
      );

      act(() => {
        result.current.lookupPhone({
          identifier: "test@example.com",
        });
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(sonner.toast.success).not.toHaveBeenCalled();
    });
  });

  describe("loading state", () => {
    it("sets isLoading during request", async () => {
      let resolvePromise: (value: unknown) => void;
      const fetchPromise = new Promise((resolve) => {
        resolvePromise = resolve;
      });

      global.fetch = vi.fn().mockReturnValue(fetchPromise);

      const { result } = renderHook(() => usePhoneLookup(), {
        wrapper: createWrapper(),
      });

      expect(result.current.isLoading).toBe(false);

      act(() => {
        result.current.lookupPhone({
          identifier: "test@example.com",
        });
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(true);
      });

      act(() => {
        resolvePromise!({
          ok: true,
          json: () =>
            Promise.resolve({
              data: {
                phone: "+5511999887766",
                creditsUsed: 1,
                creditsRemaining: 99,
              },
            }),
        });
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
    });
  });

  describe("reset functionality", () => {
    it("resets mutation state", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              phone: "+5511999887766",
              creditsUsed: 1,
              creditsRemaining: 99,
            },
          }),
      });

      const { result } = renderHook(() => usePhoneLookup(), {
        wrapper: createWrapper(),
      });

      act(() => {
        result.current.lookupPhone({
          identifier: "test@example.com",
        });
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      act(() => {
        result.current.reset();
      });

      // After reset, the mutation state should be cleared
      await waitFor(() => {
        expect(result.current.isSuccess).toBe(false);
      });
      expect(result.current.data).toBeUndefined();
    });
  });
});
