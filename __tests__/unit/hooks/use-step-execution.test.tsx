/**
 * Unit Tests for useStepExecution
 * Story 17.1 - AC: #1, #2
 *
 * Tests: happy path, HTTP error, network error
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useStepExecution } from "@/hooks/use-step-execution";

// ==============================================
// MOCKS
// ==============================================

const mockToastError = vi.fn();

vi.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

// ==============================================
// TESTS
// ==============================================

describe("useStepExecution (AC #1, #2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("executeStep (7.1)", () => {
    it("calls POST with correct URL and returns result on success", async () => {
      const mockResult = { data: { success: true, data: { companies: [] } } };
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResult),
      });

      const { result } = renderHook(() => useStepExecution());

      let response: unknown;
      await act(async () => {
        response = await result.current.executeStep("exec-001", 1);
      });

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/agent/executions/exec-001/steps/1/execute",
        { method: "POST" }
      );
      expect(response).toEqual(mockResult.data);
    });
  });

  describe("HTTP error (7.2)", () => {
    it("throws on non-ok response", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({
          error: { code: "STEP_ERROR", message: "Step failed" },
        }),
      });

      const { result } = renderHook(() => useStepExecution());

      await act(async () => {
        await expect(
          result.current.executeStep("exec-001", 1)
        ).rejects.toThrow("Step failed");
      });
    });
  });

  describe("network error (7.3)", () => {
    it("shows toast on network failure", async () => {
      mockFetch.mockRejectedValue(new TypeError("Failed to fetch"));

      const { result } = renderHook(() => useStepExecution());

      await act(async () => {
        await expect(
          result.current.executeStep("exec-001", 1)
        ).rejects.toThrow();
      });

      expect(mockToastError).toHaveBeenCalledWith("Erro de conexao");
    });
  });

  describe("loading state", () => {
    it("tracks isExecuting state", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: { success: true, data: {} } }),
      });

      const { result } = renderHook(() => useStepExecution());

      expect(result.current.isExecuting).toBe(false);

      await act(async () => {
        await result.current.executeStep("exec-001", 1);
      });

      expect(result.current.isExecuting).toBe(false);
    });
  });
});
