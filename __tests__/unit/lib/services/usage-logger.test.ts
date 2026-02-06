/**
 * Unit tests for Usage Logger Service
 * Story: 6.5.8 - Apify Cost Tracking
 *
 * Tests:
 * - logApiUsage creates DB record
 * - logApiUsage handles errors gracefully
 * - Cost calculation for Apify
 * - Helper functions (logApifySuccess, logApifyFailure)
 * - getUsageStatistics aggregates data correctly
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { logApiUsage, logApifySuccess, logApifyFailure, getUsageStatistics } from "@/lib/services/usage-logger";

// Mock Supabase
const mockInsert = vi.fn();
const mockSelect = vi.fn();
const mockFrom = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() =>
    Promise.resolve({
      from: mockFrom,
    })
  ),
}));

describe("Usage Logger Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default successful insert mock
    mockFrom.mockReturnValue({
      insert: mockInsert.mockReturnValue({
        error: null,
      }),
      select: mockSelect,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==============================================
  // TASK 9.1: Test usage logger function
  // ==============================================

  describe("logApiUsage (AC #1, #5)", () => {
    it("creates a usage log record successfully", async () => {
      mockInsert.mockReturnValue({ error: null });

      await logApiUsage({
        tenantId: "tenant-123",
        serviceName: "apify",
        requestType: "icebreaker_generation",
        leadId: "lead-456",
        postsFetched: 3,
        status: "success",
        durationMs: 1500,
        metadata: { linkedinProfileUrl: "https://linkedin.com/in/john" },
      });

      expect(mockFrom).toHaveBeenCalledWith("api_usage_logs");
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id: "tenant-123",
          service_name: "apify",
          request_type: "icebreaker_generation",
          lead_id: "lead-456",
          posts_fetched: 3,
          status: "success",
          duration_ms: 1500,
        })
      );
    });

    it("calculates cost automatically for Apify (AC #5)", async () => {
      mockInsert.mockReturnValue({ error: null });

      await logApiUsage({
        tenantId: "tenant-123",
        serviceName: "apify",
        requestType: "icebreaker_generation",
        postsFetched: 3,
        status: "success",
      });

      // 3 posts * 0.001 = 0.003
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          estimated_cost: 0.003,
        })
      );
    });

    it("handles database errors gracefully (AC #3.4)", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      mockInsert.mockReturnValue({ error: { message: "DB Error" } });

      // Should not throw
      await expect(
        logApiUsage({
          tenantId: "tenant-123",
          serviceName: "apify",
          requestType: "icebreaker_generation",
          status: "success",
        })
      ).resolves.toBeUndefined();

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it("handles unexpected errors gracefully", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      mockFrom.mockImplementation(() => {
        throw new Error("Unexpected error");
      });

      // Should not throw
      await expect(
        logApiUsage({
          tenantId: "tenant-123",
          serviceName: "apify",
          requestType: "icebreaker_generation",
          status: "success",
        })
      ).resolves.toBeUndefined();

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it("logs failed API calls with error message", async () => {
      mockInsert.mockReturnValue({ error: null });

      await logApiUsage({
        tenantId: "tenant-123",
        serviceName: "apify",
        requestType: "icebreaker_generation",
        status: "failed",
        errorMessage: "API timeout",
      });

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "failed",
          error_message: "API timeout",
        })
      );
    });
  });

  // ==============================================
  // Helper Functions
  // ==============================================

  describe("logApifySuccess", () => {
    it("logs successful Apify call with correct parameters", async () => {
      mockInsert.mockReturnValue({ error: null });

      await logApifySuccess({
        tenantId: "tenant-123",
        leadId: "lead-456",
        postsFetched: 5,
        durationMs: 2000,
        metadata: { linkedinProfileUrl: "https://linkedin.com/in/test" },
      });

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          service_name: "apify",
          request_type: "icebreaker_generation",
          status: "success",
          posts_fetched: 5,
          estimated_cost: 0.005, // 5 * 0.001
        })
      );
    });
  });

  describe("logApifyFailure", () => {
    it("logs failed Apify call with error message", async () => {
      mockInsert.mockReturnValue({ error: null });

      await logApifyFailure({
        tenantId: "tenant-123",
        leadId: "lead-456",
        errorMessage: "Profile not found",
        durationMs: 500,
      });

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          service_name: "apify",
          request_type: "icebreaker_generation",
          status: "failed",
          error_message: "Profile not found",
        })
      );
    });
  });

  // ==============================================
  // TASK 9.2: getUsageStatistics
  // ==============================================

  describe("getUsageStatistics (AC #2)", () => {
    it("returns aggregated statistics", async () => {
      const mockData = [
        { service_name: "apify", posts_fetched: 3, estimated_cost: "0.003", created_at: "2026-02-04T10:00:00Z" },
        { service_name: "apify", posts_fetched: 5, estimated_cost: "0.005", created_at: "2026-02-03T10:00:00Z" },
        { service_name: "apify", posts_fetched: 2, estimated_cost: "0.002", created_at: "2026-02-02T10:00:00Z" },
      ];

      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              gte: vi.fn().mockReturnValue({
                lt: vi.fn().mockReturnValue({
                  order: vi.fn().mockResolvedValue({ data: mockData, error: null }),
                }),
              }),
            }),
          }),
        }),
      });

      const result = await getUsageStatistics({
        tenantId: "tenant-123",
        startDate: new Date("2026-02-01"),
        endDate: new Date("2026-03-01"),
      });

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(
        expect.objectContaining({
          serviceName: "apify",
          totalCalls: 3,
          totalPosts: 10, // 3 + 5 + 2
          totalCost: 0.01, // 0.003 + 0.005 + 0.002
          avgPostsPerLead: 10 / 3,
          lastUsage: "2026-02-04T10:00:00Z",
        })
      );
    });

    it("returns empty array when no data", async () => {
      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              gte: vi.fn().mockReturnValue({
                lt: vi.fn().mockReturnValue({
                  order: vi.fn().mockResolvedValue({ data: [], error: null }),
                }),
              }),
            }),
          }),
        }),
      });

      const result = await getUsageStatistics({
        tenantId: "tenant-123",
        startDate: new Date("2026-02-01"),
        endDate: new Date("2026-03-01"),
      });

      expect(result).toEqual([]);
    });

    it("handles query errors gracefully", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              gte: vi.fn().mockReturnValue({
                lt: vi.fn().mockReturnValue({
                  order: vi.fn().mockResolvedValue({ data: null, error: { message: "Query error" } }),
                }),
              }),
            }),
          }),
        }),
      });

      const result = await getUsageStatistics({
        tenantId: "tenant-123",
        startDate: new Date("2026-02-01"),
        endDate: new Date("2026-03-01"),
      });

      expect(result).toEqual([]);
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  // ==============================================
  // TASK 9.5: Cost calculation precision
  // ==============================================

  describe("Cost Calculation Precision (AC #5)", () => {
    it("calculates cost correctly for small number of posts", async () => {
      mockInsert.mockReturnValue({ error: null });

      await logApiUsage({
        tenantId: "tenant-123",
        serviceName: "apify",
        requestType: "icebreaker_generation",
        postsFetched: 1,
        status: "success",
      });

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          estimated_cost: 0.001, // 1 * 0.001
        })
      );
    });

    it("calculates cost correctly for larger number of posts", async () => {
      mockInsert.mockReturnValue({ error: null });

      await logApiUsage({
        tenantId: "tenant-123",
        serviceName: "apify",
        requestType: "icebreaker_generation",
        postsFetched: 1000,
        status: "success",
      });

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          estimated_cost: 1.0, // 1000 * 0.001 = $1.00
        })
      );
    });

    it("uses provided cost when specified", async () => {
      mockInsert.mockReturnValue({ error: null });

      await logApiUsage({
        tenantId: "tenant-123",
        serviceName: "apify",
        requestType: "icebreaker_generation",
        postsFetched: 3,
        estimatedCost: 0.05, // Override automatic calculation
        status: "success",
      });

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          estimated_cost: 0.05, // Uses provided value, not calculated
        })
      );
    });
  });
});
