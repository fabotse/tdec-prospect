/**
 * useIcebreakerEnrichment Hook Tests
 * Story 6.5.6: Icebreaker UI - Lead Table Integration
 *
 * AC: #2 - Bulk icebreaker generation via selection bar
 * AC: #3 - Single lead generation from detail panel
 * AC: #4 - Loading states during generation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import {
  useIcebreakerEnrichment,
  estimateIcebreakerCost,
} from "@/hooks/use-icebreaker-enrichment";

// Mock sonner toast
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

import { toast } from "sonner";

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Create wrapper with QueryClientProvider
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

// ==============================================
// MOCK RESPONSES
// ==============================================

const mockSuccessResponse = {
  success: true,
  results: [
    {
      leadId: "lead-1",
      success: true,
      icebreaker: "Vi que você postou sobre IA recentemente!",
    },
  ],
  summary: {
    total: 1,
    generated: 1,
    skipped: 0,
    failed: 0,
  },
};

const mockSkippedResponse = {
  success: true,
  results: [
    {
      leadId: "lead-1",
      success: true,
    },
  ],
  summary: {
    total: 1,
    generated: 0,
    skipped: 1,
    failed: 0,
  },
};

const mockFailedResponse = {
  success: true,
  results: [
    {
      leadId: "lead-1",
      success: false,
      error: "Lead sem LinkedIn URL",
    },
  ],
  summary: {
    total: 1,
    generated: 0,
    skipped: 0,
    failed: 1,
  },
};

// ==============================================
// TESTS
// ==============================================

describe("useIcebreakerEnrichment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ==============================================
  // COST ESTIMATION TESTS
  // ==============================================

  describe("estimateIcebreakerCost", () => {
    it("returns '<$0.01' for 1 lead", () => {
      expect(estimateIcebreakerCost(1)).toBe("<$0.01");
    });

    it("returns '<$0.01' for 2 leads", () => {
      expect(estimateIcebreakerCost(2)).toBe("<$0.01");
    });

    it("returns '~$0.04' for 10 leads", () => {
      expect(estimateIcebreakerCost(10)).toBe("~$0.04");
    });

    it("returns '~$0.40' for 100 leads", () => {
      expect(estimateIcebreakerCost(100)).toBe("~$0.40");
    });

    it("returns '~$4.00' for 1000 leads", () => {
      expect(estimateIcebreakerCost(1000)).toBe("~$4.00");
    });
  });

  // ==============================================
  // SINGLE LEAD GENERATION TESTS (AC #3)
  // ==============================================

  describe("generateForLead (AC #3)", () => {
    it("calls API with correct parameters", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockSuccessResponse,
      });

      const { result } = renderHook(() => useIcebreakerEnrichment(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.generateForLead("lead-1");
      });

      expect(mockFetch).toHaveBeenCalledWith("/api/leads/enrich-icebreaker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadIds: ["lead-1"], regenerate: false }),
      });
    });

    it("passes regenerate=true when specified", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockSuccessResponse,
      });

      const { result } = renderHook(() => useIcebreakerEnrichment(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.generateForLead("lead-1", true);
      });

      expect(mockFetch).toHaveBeenCalledWith("/api/leads/enrich-icebreaker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadIds: ["lead-1"], regenerate: true }),
      });
    });

    it("shows success toast when icebreaker generated", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockSuccessResponse,
      });

      const { result } = renderHook(() => useIcebreakerEnrichment(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.generateForLead("lead-1");
      });

      expect(toast.success).toHaveBeenCalledWith("1 icebreakers gerados");
    });

    it("shows info toast when icebreaker was skipped", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockSkippedResponse,
      });

      const { result } = renderHook(() => useIcebreakerEnrichment(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.generateForLead("lead-1");
      });

      expect(toast.info).toHaveBeenCalledWith("1 leads já tinham icebreaker");
    });

    it("shows error toast when generation fails", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockFailedResponse,
      });

      const { result } = renderHook(() => useIcebreakerEnrichment(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.generateForLead("lead-1");
      });

      expect(toast.error).toHaveBeenCalledWith("Falha ao gerar icebreakers: 1 erros");
    });

    it("shows error toast when API returns error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: { message: "API Error" } }),
      });

      const { result } = renderHook(() => useIcebreakerEnrichment(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        try {
          await result.current.generateForLead("lead-1");
        } catch {
          // Expected to throw
        }
      });

      expect(toast.error).toHaveBeenCalledWith("API Error");
    });

    it("sets isGenerating to true during generation", async () => {
      let resolvePromise: () => void;
      const promise = new Promise<void>((resolve) => {
        resolvePromise = resolve;
      });

      mockFetch.mockImplementationOnce(() =>
        promise.then(() => ({
          ok: true,
          json: async () => mockSuccessResponse,
        }))
      );

      const { result } = renderHook(() => useIcebreakerEnrichment(), {
        wrapper: createWrapper(),
      });

      // Start generation
      act(() => {
        result.current.generateForLead("lead-1");
      });

      // Should be generating
      await waitFor(() => {
        expect(result.current.isGenerating).toBe(true);
      });

      // Resolve the promise
      await act(async () => {
        resolvePromise!();
        await promise;
      });

      // Should no longer be generating
      await waitFor(() => {
        expect(result.current.isGenerating).toBe(false);
      });
    });
  });

  // ==============================================
  // BULK GENERATION TESTS (AC #2)
  // ==============================================

  describe("generateForLeads (AC #2)", () => {
    it("processes leads one at a time", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            ...mockSuccessResponse,
            results: [{ leadId: "lead-1", success: true, icebreaker: "Test 1" }],
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            ...mockSuccessResponse,
            results: [{ leadId: "lead-2", success: true, icebreaker: "Test 2" }],
          }),
        });

      const { result } = renderHook(() => useIcebreakerEnrichment(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.generateForLeads(["lead-1", "lead-2"]);
      });

      // Should have made 2 separate API calls
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("calls onProgress callback during bulk generation", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockSuccessResponse,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockSuccessResponse,
        });

      const onProgress = vi.fn();
      const { result } = renderHook(
        () => useIcebreakerEnrichment({ onProgress }),
        { wrapper: createWrapper() }
      );

      await act(async () => {
        await result.current.generateForLeads(["lead-1", "lead-2"]);
      });

      expect(onProgress).toHaveBeenCalledWith(1, 2);
      expect(onProgress).toHaveBeenCalledWith(2, 2);
    });

    it("calls onComplete callback when done", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockSuccessResponse,
      });

      const onComplete = vi.fn();
      const { result } = renderHook(
        () => useIcebreakerEnrichment({ onComplete }),
        { wrapper: createWrapper() }
      );

      await act(async () => {
        await result.current.generateForLeads(["lead-1"]);
      });

      expect(onComplete).toHaveBeenCalled();
      const [results, summary] = onComplete.mock.calls[0];
      expect(results).toHaveLength(1);
      expect(summary.generated).toBe(1);
    });

    it("continues processing after individual failures", async () => {
      mockFetch
        .mockRejectedValueOnce(new Error("Network error"))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockSuccessResponse,
        });

      const { result } = renderHook(() => useIcebreakerEnrichment(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        const response = await result.current.generateForLeads(["lead-1", "lead-2"]);
        expect(response.summary.failed).toBe(1);
        expect(response.summary.generated).toBe(1);
      });

      // Both leads should have been attempted
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("returns combined results and summary", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            success: true,
            results: [{ leadId: "lead-1", success: true, icebreaker: "Test" }],
            summary: { total: 1, generated: 1, skipped: 0, failed: 0 },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            success: true,
            results: [{ leadId: "lead-2", success: false, error: "No LinkedIn" }],
            summary: { total: 1, generated: 0, skipped: 0, failed: 1 },
          }),
        });

      const { result } = renderHook(() => useIcebreakerEnrichment(), {
        wrapper: createWrapper(),
      });

      let response: Awaited<ReturnType<typeof result.current.generateForLeads>>;
      await act(async () => {
        response = await result.current.generateForLeads(["lead-1", "lead-2"]);
      });

      expect(response!.results).toHaveLength(2);
      expect(response!.summary.generated).toBe(1);
      expect(response!.summary.failed).toBe(1);
    });

    it("shows success toast with summary after bulk generation", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockSuccessResponse,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockSuccessResponse,
        });

      const { result } = renderHook(() => useIcebreakerEnrichment(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.generateForLeads(["lead-1", "lead-2"]);
      });

      expect(toast.success).toHaveBeenCalledWith("2 icebreakers gerados com sucesso");
    });
  });

  // ==============================================
  // STORY 9.1: CATEGORY SUPPORT TESTS
  // ==============================================

  describe("Story 9.1: Category support", () => {
    it("passes category in API call for generateForLead", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockSuccessResponse,
      });

      const { result } = renderHook(() => useIcebreakerEnrichment(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.generateForLead("lead-1", false, "cargo");
      });

      expect(mockFetch).toHaveBeenCalledWith("/api/leads/enrich-icebreaker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadIds: ["lead-1"], regenerate: false, category: "cargo" }),
      });
    });

    it("does not include category in body when undefined (uses server default)", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockSuccessResponse,
      });

      const { result } = renderHook(() => useIcebreakerEnrichment(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.generateForLead("lead-1");
      });

      expect(mockFetch).toHaveBeenCalledWith("/api/leads/enrich-icebreaker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadIds: ["lead-1"], regenerate: false }),
      });
    });

    it("passes category in bulk generateForLeads API calls", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockSuccessResponse,
      });

      const { result } = renderHook(() => useIcebreakerEnrichment(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.generateForLeads(["lead-1", "lead-2"], false, "lead");
      });

      // Both calls should include category
      for (const call of mockFetch.mock.calls) {
        const body = JSON.parse(call[1].body);
        expect(body.category).toBe("lead");
      }
    });

    it("shows fallback toast when categoryFallback is true (single lead)", async () => {
      const fallbackResponse = {
        success: true,
        results: [
          {
            leadId: "lead-1",
            success: true,
            icebreaker: "Fallback icebreaker",
            categoryFallback: true,
            originalCategory: "post",
          },
        ],
        summary: { total: 1, generated: 1, skipped: 0, failed: 0 },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => fallbackResponse,
      });

      const { result } = renderHook(() => useIcebreakerEnrichment(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.generateForLead("lead-1", false, "post");
      });

      expect(toast.info).toHaveBeenCalledWith(
        "Lead sem posts — Ice Breaker gerado com foco no perfil"
      );
    });

    it("shows fallback toast for bulk leads with categoryFallback", async () => {
      const fallbackResponse = {
        success: true,
        results: [
          {
            leadId: "lead-1",
            success: true,
            icebreaker: "Fallback icebreaker",
            categoryFallback: true,
            originalCategory: "post",
          },
        ],
        summary: { total: 1, generated: 1, skipped: 0, failed: 0 },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => fallbackResponse,
      });

      const { result } = renderHook(() => useIcebreakerEnrichment(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.generateForLeads(["lead-1"], false, "post");
      });

      expect(toast.info).toHaveBeenCalledWith(
        "Lead sem posts — Ice Breaker gerado com foco no perfil"
      );
    });
  });
});
