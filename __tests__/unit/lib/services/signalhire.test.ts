/**
 * Unit tests for SignalHire Service
 * Story: 2.3 - Integration Connection Testing
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SignalHireService } from "@/lib/services/signalhire";
import { ERROR_MESSAGES } from "@/lib/services/base-service";

describe("SignalHireService", () => {
  let service: SignalHireService;

  beforeEach(() => {
    service = new SignalHireService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("testConnection", () => {
    it("returns success on 200 response", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ credits: 100 }),
      });

      const result = await service.testConnection("test-api-key");

      expect(result.success).toBe(true);
      expect(result.message).toBe(ERROR_MESSAGES.SUCCESS);
      expect(result.testedAt).toBeDefined();
    });

    it("returns error on 401", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
      });

      const result = await service.testConnection("invalid-key");

      expect(result.success).toBe(false);
      expect(result.message).toBe(ERROR_MESSAGES.UNAUTHORIZED);
    });

    it("returns error on 429", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
      });

      const result = await service.testConnection("test-key");

      expect(result.success).toBe(false);
      expect(result.message).toBe(ERROR_MESSAGES.RATE_LIMITED);
    });

    it("uses correct API endpoint and header", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ credits: 100 }),
      });
      global.fetch = fetchMock;

      await service.testConnection("test-api-key");

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("signalhire.com"),
        expect.objectContaining({
          headers: expect.objectContaining({
            apikey: "test-api-key",
          }),
        })
      );
    });
  });

  describe("service properties", () => {
    it("has correct service name", () => {
      expect(service.name).toBe("signalhire");
    });
  });
});
