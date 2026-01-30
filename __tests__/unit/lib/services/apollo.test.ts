/**
 * Unit tests for Apollo Service
 * Story: 2.3 - Integration Connection Testing
 *
 * Tests:
 * - testConnection returns success on 200
 * - testConnection returns error on 401 (invalid key)
 * - testConnection returns error on 429 (rate limit)
 * - Includes latency in result
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ApolloService } from "@/lib/services/apollo";
import { ERROR_MESSAGES } from "@/lib/services/base-service";

describe("ApolloService", () => {
  let service: ApolloService;

  beforeEach(() => {
    service = new ApolloService();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("testConnection", () => {
    it("returns success on 200 response", async () => {
      vi.useRealTimers();

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            is_logged_in: true,
          }),
      });

      const result = await service.testConnection("test-api-key");

      expect(result.success).toBe(true);
      expect(result.message).toBe(ERROR_MESSAGES.SUCCESS);
      expect(result.testedAt).toBeDefined();
      expect(typeof result.latencyMs).toBe("number");
    });

    it("returns error on 401 (invalid key)", async () => {
      vi.useRealTimers();

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
      });

      const result = await service.testConnection("invalid-api-key");

      expect(result.success).toBe(false);
      expect(result.message).toBe(ERROR_MESSAGES.UNAUTHORIZED);
      expect(result.testedAt).toBeDefined();
    });

    it("returns error on 403 (forbidden)", async () => {
      vi.useRealTimers();

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
      });

      const result = await service.testConnection("test-api-key");

      expect(result.success).toBe(false);
      expect(result.message).toBe(ERROR_MESSAGES.FORBIDDEN);
    });

    it("returns error on 429 (rate limit)", async () => {
      vi.useRealTimers();

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
      });

      const result = await service.testConnection("test-api-key");

      expect(result.success).toBe(false);
      expect(result.message).toBe(ERROR_MESSAGES.RATE_LIMITED);
    });

    it("includes latency in successful result", async () => {
      vi.useRealTimers();

      global.fetch = vi.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(
              () =>
                resolve({
                  ok: true,
                  json: () => Promise.resolve({ is_logged_in: true }),
                }),
              10
            );
          })
      );

      const result = await service.testConnection("test-api-key");

      expect(result.success).toBe(true);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it("uses correct API endpoint", async () => {
      vi.useRealTimers();

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ is_logged_in: true }),
      });
      global.fetch = fetchMock;

      await service.testConnection("test-api-key");

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("api.apollo.io"),
        expect.objectContaining({
          headers: expect.objectContaining({
            "x-api-key": "test-api-key",
          }),
        })
      );
    });

    it("handles network errors", async () => {
      vi.useRealTimers();

      global.fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));

      const result = await service.testConnection("test-api-key");

      expect(result.success).toBe(false);
      expect(result.message).toBe(ERROR_MESSAGES.NETWORK_ERROR);
    });
  });

  describe("service properties", () => {
    it("has correct service name", () => {
      expect(service.name).toBe("apollo");
    });
  });
});
