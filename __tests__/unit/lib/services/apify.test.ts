/**
 * Unit tests for Apify Service
 * Story: 6.5.1 - Apify Integration Configuration
 *
 * Tests:
 * - testConnection returns success on 200
 * - testConnection returns error on 401 (invalid token)
 * - testConnection returns error on 429 (rate limit)
 * - Includes latency in result
 * - Uses correct API endpoint with token
 * - URL encodes special characters in token
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ApifyService } from "@/lib/services/apify";
import { ERROR_MESSAGES } from "@/lib/services/base-service";

describe("ApifyService", () => {
  let service: ApifyService;

  beforeEach(() => {
    service = new ApifyService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("testConnection", () => {
    it("returns success on 200 response", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              id: "Wpp1BZ6yGWjySadk3",
              name: "supreme_coder/linkedin-post",
              isPublic: true,
            },
          }),
      });

      const result = await service.testConnection("test-api-token");

      expect(result.success).toBe(true);
      expect(result.message).toBe(ERROR_MESSAGES.SUCCESS);
      expect(result.testedAt).toBeDefined();
      expect(typeof result.latencyMs).toBe("number");
    });

    it("returns error on 401 (invalid token)", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
      });

      const result = await service.testConnection("invalid-token");

      expect(result.success).toBe(false);
      expect(result.message).toContain("inválida");
      expect(result.testedAt).toBeDefined();
    });

    it("returns error on 403 (forbidden)", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
      });

      const result = await service.testConnection("test-token");

      expect(result.success).toBe(false);
      expect(result.message).toContain("Acesso negado");
    });

    it("returns error on 429 (rate limit)", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
      });

      const result = await service.testConnection("test-token");

      expect(result.success).toBe(false);
      expect(result.message).toContain("Limite");
    });

    it("includes latency in successful result", async () => {
      global.fetch = vi.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(
              () =>
                resolve({
                  ok: true,
                  json: () =>
                    Promise.resolve({
                      data: {
                        id: "Wpp1BZ6yGWjySadk3",
                        name: "supreme_coder/linkedin-post",
                        isPublic: true,
                      },
                    }),
                }),
              10
            );
          })
      );

      const result = await service.testConnection("test-token");

      expect(result.success).toBe(true);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it("uses correct API endpoint with token", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              id: "Wpp1BZ6yGWjySadk3",
              name: "supreme_coder/linkedin-post",
              isPublic: true,
            },
          }),
      });
      global.fetch = fetchMock;

      await service.testConnection("my-test-token");

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("api.apify.com"),
        expect.any(Object)
      );
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("Wpp1BZ6yGWjySadk3"),
        expect.any(Object)
      );
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("token=my-test-token"),
        expect.any(Object)
      );
    });

    it("URL encodes special characters in token", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              id: "Wpp1BZ6yGWjySadk3",
              name: "supreme_coder/linkedin-post",
              isPublic: true,
            },
          }),
      });
      global.fetch = fetchMock;

      // Token with special characters that need URL encoding
      await service.testConnection("token+with=special&chars");

      // Verify the URL was called with encoded characters
      const calledUrl = fetchMock.mock.calls[0][0] as string;
      expect(calledUrl).toContain("token%2Bwith%3Dspecial%26chars");
      expect(calledUrl).not.toContain("token+with=special&chars");
    });

    it("handles network errors", async () => {
      global.fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));

      const result = await service.testConnection("test-token");

      expect(result.success).toBe(false);
      expect(result.message).toBeDefined();
    });

    it("handles timeout errors", async () => {
      const abortError = new Error("Aborted");
      abortError.name = "AbortError";
      global.fetch = vi.fn().mockRejectedValue(abortError);

      const result = await service.testConnection("test-token");

      expect(result.success).toBe(false);
      expect(result.message).toContain("Tempo limite");
    });

    it("handles unknown errors gracefully", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("Unknown error"));

      const result = await service.testConnection("test-token");

      expect(result.success).toBe(false);
      expect(result.message).toBeDefined();
    });
  });

  describe("service properties", () => {
    it("has correct service name", () => {
      expect(service.name).toBe("apify");
    });
  });
});
