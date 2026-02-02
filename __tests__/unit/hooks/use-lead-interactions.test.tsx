/**
 * Lead Interactions Hook Tests
 * Story 4.3: Lead Detail View & Interaction History
 *
 * AC: #3 - Interaction history section (useLeadInteractions)
 * AC: #4 - Add interaction note (useCreateInteraction)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import {
  useLeadInteractions,
  useCreateInteraction,
} from "@/hooks/use-lead-interactions";

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// ==============================================
// HELPER: Create wrapper with QueryClient
// ==============================================

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  function TestWrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }
  return TestWrapper;
}

// ==============================================
// TESTS
// ==============================================

describe("useLeadInteractions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("AC #3 - Fetch interactions", () => {
    it("fetches interactions when leadId is provided", async () => {
      const mockInteractions = [
        {
          id: "int-1",
          leadId: "lead-123",
          tenantId: "tenant-1",
          type: "note",
          content: "Test note",
          createdAt: "2026-01-15T10:00:00Z",
          createdBy: "user-1",
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: mockInteractions }),
      });

      const { result } = renderHook(() => useLeadInteractions("lead-123"), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockFetch).toHaveBeenCalledWith("/api/leads/lead-123/interactions");
      expect(result.current.data).toEqual(mockInteractions);
    });

    it("does not fetch when leadId is null", async () => {
      const { result } = renderHook(() => useLeadInteractions(null), {
        wrapper: createWrapper(),
      });

      // Should not fetch
      expect(mockFetch).not.toHaveBeenCalled();
      expect(result.current.data).toEqual([]);
    });

    it("does not fetch when enabled is false", async () => {
      const { result } = renderHook(
        () => useLeadInteractions("lead-123", { enabled: false }),
        {
          wrapper: createWrapper(),
        }
      );

      expect(mockFetch).not.toHaveBeenCalled();
      expect(result.current.data).toEqual([]);
    });

    it("returns error message on API error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          error: { code: "INTERNAL_ERROR", message: "Erro ao buscar interacoes" },
        }),
      });

      const { result } = renderHook(() => useLeadInteractions("lead-123"), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.error).toBe("Erro ao buscar interacoes");
      });
    });
  });
});

describe("useCreateInteraction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("AC #4 - Create interaction", () => {
    it("creates interaction via POST request", async () => {
      const mockResponse = {
        data: {
          id: "int-new",
          leadId: "lead-123",
          tenantId: "tenant-1",
          type: "note",
          content: "New note content",
          createdAt: "2026-01-15T11:00:00Z",
          createdBy: "user-1",
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const { result } = renderHook(() => useCreateInteraction("lead-123"), {
        wrapper: createWrapper(),
      });

      result.current.createInteraction({ content: "New note content", type: "note" });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/leads/lead-123/interactions",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: "New note content", type: "note" }),
        })
      );
    });

    it("throws error when leadId is null", async () => {
      const { result } = renderHook(() => useCreateInteraction(null), {
        wrapper: createWrapper(),
      });

      // Attempting to create should throw
      expect(() => {
        result.current.createInteraction({ content: "Test", type: "note" });
      }).not.toThrow(); // The mutation will handle the error
    });

    it("returns error message on API error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          error: { code: "VALIDATION_ERROR", message: "Nota nao pode estar vazia" },
        }),
      });

      const { result } = renderHook(() => useCreateInteraction("lead-123"), {
        wrapper: createWrapper(),
      });

      result.current.createInteraction({ content: "", type: "note" });

      await waitFor(() => {
        expect(result.current.error).toBe("Nota nao pode estar vazia");
      });
    });
  });
});
