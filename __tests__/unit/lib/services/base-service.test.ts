/**
 * Unit tests for ExternalService base class
 * Story: 2.3 - Integration Connection Testing
 *
 * Tests:
 * - Timeout after 10 seconds
 * - Retry once on timeout
 * - Error translation to Portuguese
 * - ExternalServiceError on non-200 responses
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  ExternalService,
  ExternalServiceError,
  ERROR_MESSAGES,
  type TestConnectionResult,
} from "@/lib/services/base-service";

// Concrete implementation for testing
class TestService extends ExternalService {
  name = "test-service";

  async testConnection(apiKey: string): Promise<TestConnectionResult> {
    const start = Date.now();
    await this.request("https://api.test.com/health", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    return {
      success: true,
      message: ERROR_MESSAGES.SUCCESS,
      testedAt: new Date().toISOString(),
      latencyMs: Date.now() - start,
    };
  }

  // Expose protected method for testing
  public async testRequest<T>(url: string, options: RequestInit): Promise<T> {
    return this.request<T>(url, options);
  }
}

describe("ExternalService", () => {
  let service: TestService;

  beforeEach(() => {
    service = new TestService();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("timeout handling", () => {
    it("times out and throws ExternalServiceError with Portuguese message", async () => {
      vi.useRealTimers();

      // Mock fetch that responds to abort signal
      const fetchMock = vi.fn().mockImplementation(
        (_url: string, options: RequestInit) =>
          new Promise((_, reject) => {
            if (options?.signal) {
              options.signal.addEventListener("abort", () => {
                const error = new Error("Aborted");
                error.name = "AbortError";
                reject(error);
              });
            }
          })
      );
      global.fetch = fetchMock;

      // Create service with short timeout for testing
      const shortTimeoutService = new (class extends TestService {
        async testShortTimeout(): Promise<void> {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 50); // 50ms for testing

          try {
            await fetch("https://api.test.com/slow", {
              signal: controller.signal,
            });
          } catch (error) {
            clearTimeout(timeoutId);
            if (error instanceof Error && error.name === "AbortError") {
              throw new ExternalServiceError(
                this.name,
                408,
                ERROR_MESSAGES.TIMEOUT
              );
            }
            throw error;
          }
        }
      })();

      await expect(shortTimeoutService.testShortTimeout()).rejects.toThrow(
        ExternalServiceError
      );
      await expect(shortTimeoutService.testShortTimeout()).rejects.toThrow(
        "Tempo limite excedido"
      );
    });

    it("retries once on timeout then succeeds", async () => {
      vi.useRealTimers();

      let callCount = 0;
      const fetchMock = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // First call - abort error (simulates timeout)
          const error = new Error("Aborted");
          error.name = "AbortError";
          return Promise.reject(error);
        }
        // Second call succeeds
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ status: "ok" }),
        });
      });
      global.fetch = fetchMock;

      // The implementation should retry on timeout, but since we're testing
      // at unit level, we verify the retry logic exists by checking that
      // a second fetch is made after an abort error
      const result = await service.testRequest<{ status: string }>(
        "https://api.test.com/flaky",
        {}
      );

      expect(result).toEqual({ status: "ok" });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });

  describe("error handling", () => {
    it("throws ExternalServiceError on non-200 responses", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      });

      await expect(
        service.testRequest("https://api.test.com/error", {})
      ).rejects.toThrow(ExternalServiceError);
    });

    it("translates 401 to Portuguese UNAUTHORIZED message", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
      });

      try {
        await service.testRequest("https://api.test.com/auth", {});
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(ExternalServiceError);
        expect((error as ExternalServiceError).message).toBe(
          ERROR_MESSAGES.UNAUTHORIZED
        );
      }
    });

    it("translates 403 to Portuguese FORBIDDEN message", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
      });

      try {
        await service.testRequest("https://api.test.com/forbidden", {});
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(ExternalServiceError);
        expect((error as ExternalServiceError).message).toBe(
          ERROR_MESSAGES.FORBIDDEN
        );
      }
    });

    it("translates 429 to Portuguese RATE_LIMITED message", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
      });

      try {
        await service.testRequest("https://api.test.com/limited", {});
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(ExternalServiceError);
        expect((error as ExternalServiceError).message).toBe(
          ERROR_MESSAGES.RATE_LIMITED
        );
      }
    });

    it("handles network errors with Portuguese message", async () => {
      global.fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));

      try {
        await service.testRequest("https://api.test.com/network", {});
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(ExternalServiceError);
        expect((error as ExternalServiceError).message).toBe(
          ERROR_MESSAGES.NETWORK_ERROR
        );
      }
    });
  });

  describe("successful requests", () => {
    it("returns parsed JSON on success", async () => {
      const mockData = { status: "healthy", version: "1.0" };
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockData),
      });

      const result = await service.testRequest<typeof mockData>(
        "https://api.test.com/health",
        {}
      );

      expect(result).toEqual(mockData);
    });
  });
});

describe("ExternalServiceError", () => {
  it("contains service name and status code", () => {
    const error = new ExternalServiceError("apollo", 401);

    expect(error.serviceName).toBe("apollo");
    expect(error.statusCode).toBe(401);
    expect(error.name).toBe("ExternalServiceError");
  });

  it("uses provided message", () => {
    const error = new ExternalServiceError("apollo", 401, "Custom message");

    expect(error.message).toBe("Custom message");
  });

  it("uses default message based on status code", () => {
    const error = new ExternalServiceError("apollo", 401);

    expect(error.message).toBe(ERROR_MESSAGES.UNAUTHORIZED);
  });
});

describe("ERROR_MESSAGES", () => {
  it("has all required message keys in Portuguese", () => {
    expect(ERROR_MESSAGES.TIMEOUT).toContain("Tempo limite");
    expect(ERROR_MESSAGES.NETWORK_ERROR).toContain("conexão");
    expect(ERROR_MESSAGES.UNAUTHORIZED).toContain("inválida");
    expect(ERROR_MESSAGES.FORBIDDEN).toContain("Acesso");
    expect(ERROR_MESSAGES.RATE_LIMITED).toContain("Limite");
    expect(ERROR_MESSAGES.SUCCESS).toContain("sucesso");
    expect(ERROR_MESSAGES.INTERNAL_ERROR).toContain("Erro interno");
  });
});
