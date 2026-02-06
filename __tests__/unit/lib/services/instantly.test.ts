/**
 * Unit tests for Instantly Service
 * Story: 2.3 - Integration Connection Testing
 *
 * Tests V2 API with Bearer token authentication
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { InstantlyService } from "@/lib/services/instantly";
import { ERROR_MESSAGES } from "@/lib/services/base-service";
import {
  createMockFetch,
  mockJsonResponse,
  mockErrorResponse,
  restoreFetch,
} from "../../../helpers/mock-fetch";

describe("InstantlyService", () => {
  let service: InstantlyService;

  beforeEach(() => {
    service = new InstantlyService();
  });

  afterEach(() => {
    restoreFetch();
    vi.restoreAllMocks();
  });

  describe("testConnection", () => {
    it("returns success on 200 response", async () => {
      createMockFetch([
        {
          url: /instantly\.ai/,
          response: mockJsonResponse({
            items: [{ email: "user@example.com" }],
            total_count: 1,
          }),
        },
      ]);

      const result = await service.testConnection("test-api-key");

      expect(result.success).toBe(true);
      expect(result.message).toBe(ERROR_MESSAGES.SUCCESS);
      expect(result.testedAt).toBeDefined();
    });

    it("returns error on 401", async () => {
      createMockFetch([
        { url: /instantly\.ai/, response: mockErrorResponse(401) },
      ]);

      const result = await service.testConnection("invalid-key");

      expect(result.success).toBe(false);
      expect(result.message).toBe(ERROR_MESSAGES.UNAUTHORIZED);
    });

    it("returns error on 403", async () => {
      createMockFetch([
        { url: /instantly\.ai/, response: mockErrorResponse(403) },
      ]);

      const result = await service.testConnection("insufficient-scopes-key");

      expect(result.success).toBe(false);
      expect(result.message).toBe(ERROR_MESSAGES.FORBIDDEN);
    });

    it("returns error on 429", async () => {
      createMockFetch([
        { url: /instantly\.ai/, response: mockErrorResponse(429) },
      ]);

      const result = await service.testConnection("test-key");

      expect(result.success).toBe(false);
      expect(result.message).toBe(ERROR_MESSAGES.RATE_LIMITED);
    });

    it("uses V2 API endpoint with Bearer token", async () => {
      const { mock } = createMockFetch([
        {
          url: /instantly\.ai/,
          response: mockJsonResponse({ items: [], total_count: 0 }),
        },
      ]);

      await service.testConnection("test-api-key");

      // Should call V2 accounts endpoint
      expect(mock).toHaveBeenCalledWith(
        expect.stringContaining("/api/v2/accounts"),
        expect.any(Object)
      );

      // Should use Bearer token in Authorization header
      expect(mock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer test-api-key",
          }),
        })
      );
    });

    it("calls correct domain", async () => {
      const { mock } = createMockFetch([
        {
          url: /instantly\.ai/,
          response: mockJsonResponse({ items: [], total_count: 0 }),
        },
      ]);

      await service.testConnection("test-api-key");

      expect(mock).toHaveBeenCalledWith(
        expect.stringContaining("api.instantly.ai"),
        expect.any(Object)
      );
    });

    it("handles empty response body", async () => {
      createMockFetch([
        {
          url: /instantly\.ai/,
          response: mockJsonResponse({ items: [], total_count: 0 }),
        },
      ]);

      const result = await service.testConnection("test-api-key");

      expect(result.success).toBe(true);
    });
  });

  describe("service properties", () => {
    it("has correct service name", () => {
      expect(service.name).toBe("instantly");
    });
  });
});
