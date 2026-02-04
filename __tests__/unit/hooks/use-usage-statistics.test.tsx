/**
 * useUsageStatistics Hook Tests
 * Story: 6.5.8 - Apify Cost Tracking
 *
 * AC #2: API Endpoint for Usage Statistics
 * AC #3: Admin Settings Page - Usage Section
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  useUsageStatistics,
  getCurrentMonthRange,
  getLastMonthRange,
  getServiceStatistics,
} from "@/hooks/use-usage-statistics";
import type { UsageStatisticsResponse } from "@/types/api-usage";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Create a wrapper with QueryClientProvider
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

const mockResponse: UsageStatisticsResponse = {
  statistics: [
    {
      serviceName: "apify",
      totalCalls: 150,
      totalPosts: 450,
      totalCost: 0.45,
      avgPostsPerLead: 3.0,
      lastUsage: "2026-02-04T14:30:00Z",
    },
  ],
  period: {
    startDate: "2026-02-01T00:00:00Z",
    endDate: "2026-03-01T00:00:00Z",
  },
};

describe("useUsageStatistics Hook", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("useUsageStatistics (AC #2, #3)", () => {
    it("fetches and returns usage statistics", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const { result } = renderHook(() => useUsageStatistics(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/usage/statistics")
      );
    });

    it("handles empty statistics", async () => {
      const emptyResponse: UsageStatisticsResponse = {
        statistics: [],
        period: {
          startDate: "2026-02-01T00:00:00Z",
          endDate: "2026-03-01T00:00:00Z",
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(emptyResponse),
      });

      const { result } = renderHook(() => useUsageStatistics(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data?.statistics).toEqual([]);
    });

    it("handles fetch error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () =>
          Promise.resolve({
            error: { message: "Erro ao buscar estatísticas de uso" },
          }),
      });

      const { result } = renderHook(() => useUsageStatistics(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toBeInstanceOf(Error);
    });

    it("passes date range parameters correctly", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const startDate = new Date("2026-01-01");
      const endDate = new Date("2026-02-01");

      const { result } = renderHook(
        () => useUsageStatistics({ startDate, endDate }),
        {
          wrapper: createWrapper(),
        }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      const callUrl = mockFetch.mock.calls[0][0] as string;
      expect(callUrl).toContain("startDate=");
      expect(callUrl).toContain("endDate=");
    });

    it("passes serviceName filter parameter", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const { result } = renderHook(
        () => useUsageStatistics({ serviceName: "apify" }),
        {
          wrapper: createWrapper(),
        }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      const callUrl = mockFetch.mock.calls[0][0] as string;
      expect(callUrl).toContain("serviceName=apify");
    });
  });

  describe("Helper Functions", () => {
    describe("getCurrentMonthRange", () => {
      it("returns start and end of current month", () => {
        const range = getCurrentMonthRange();

        expect(range.startDate).toBeInstanceOf(Date);
        expect(range.endDate).toBeInstanceOf(Date);
        expect(range.startDate.getDate()).toBe(1);
        expect(range.endDate.getDate()).toBe(1);
        expect(range.endDate.getMonth()).toBe(
          (range.startDate.getMonth() + 1) % 12
        );
      });
    });

    describe("getLastMonthRange", () => {
      it("returns start and end of last month", () => {
        const range = getLastMonthRange();

        expect(range.startDate).toBeInstanceOf(Date);
        expect(range.endDate).toBeInstanceOf(Date);
        expect(range.startDate.getDate()).toBe(1);
        expect(range.endDate.getDate()).toBe(1);
      });
    });

    describe("getServiceStatistics", () => {
      it("returns statistics for a specific service", () => {
        const result = getServiceStatistics(mockResponse, "apify");

        expect(result).not.toBeNull();
        expect(result?.serviceName).toBe("apify");
        expect(result?.totalCalls).toBe(150);
      });

      it("returns null when service not found", () => {
        const result = getServiceStatistics(mockResponse, "apollo");

        expect(result).toBeNull();
      });

      it("returns null when response is undefined", () => {
        const result = getServiceStatistics(undefined, "apify");

        expect(result).toBeNull();
      });
    });
  });
});
