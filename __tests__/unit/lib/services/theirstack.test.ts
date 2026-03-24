/**
 * Unit tests for TheirStackService
 * Story: 15.1 - Integracao theirStack: Configuracao, Teste e Credits
 *
 * Tests:
 * - testConnection returns success on 200
 * - testConnection returns error on 401 (invalid key)
 * - testConnection returns error on 429 (rate limit)
 * - testConnection includes latency
 * - testConnection handles timeout
 * - testConnection handles network error
 * - getCredits returns parsed credits
 * - getCredits applies typeof guards for unexpected types
 * - getCredits handles null fields
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TheirStackService } from "@/lib/services/theirstack";
import { ERROR_MESSAGES } from "@/lib/services/base-service";
import {
  createMockFetch,
  mockJsonResponse,
  mockErrorResponse,
  mockNetworkError,
  restoreFetch,
} from "../../../helpers/mock-fetch";

describe("TheirStackService", () => {
  let service: TheirStackService;

  beforeEach(() => {
    service = new TheirStackService();
  });

  afterEach(() => {
    restoreFetch();
    vi.restoreAllMocks();
  });

  describe("testConnection", () => {
    it("returns success on 200 response", async () => {
      createMockFetch([
        {
          url: /theirstack\.com.*credit-balance/,
          response: mockJsonResponse({
            ui_credits: 50,
            used_ui_credits: 0,
            api_credits: 200,
            used_api_credits: 6,
          }),
        },
      ]);

      const result = await service.testConnection("test-api-key");

      expect(result.success).toBe(true);
      expect(result.message).toBe(ERROR_MESSAGES.SUCCESS);
      expect(result.testedAt).toBeDefined();
      expect(typeof result.latencyMs).toBe("number");
    });

    it("returns error on 401 (invalid key)", async () => {
      createMockFetch([
        {
          url: /theirstack\.com/,
          response: mockErrorResponse(401, "Unauthorized"),
        },
      ]);

      const result = await service.testConnection("invalid-key");

      expect(result.success).toBe(false);
      expect(result.message).toContain("inválida");
    });

    it("returns error on 429 (rate limit)", async () => {
      createMockFetch([
        {
          url: /theirstack\.com/,
          response: mockErrorResponse(429, "Rate limited"),
        },
      ]);

      const result = await service.testConnection("test-key");

      expect(result.success).toBe(false);
      expect(result.message).toContain("Limite");
    });

    it("includes latency in success result", async () => {
      createMockFetch([
        {
          url: /theirstack\.com/,
          response: mockJsonResponse({
            ui_credits: 50,
            used_ui_credits: 0,
            api_credits: 200,
            used_api_credits: 6,
          }),
        },
      ]);

      const result = await service.testConnection("test-key");

      expect(result.latencyMs).toBeDefined();
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it("handles timeout (AbortError)", async () => {
      const mockFetch = vi.fn().mockImplementation(() => {
        const error = new Error("The operation was aborted");
        error.name = "AbortError";
        return Promise.reject(error);
      });
      global.fetch = mockFetch;

      const result = await service.testConnection("test-key");

      expect(result.success).toBe(false);
      expect(result.message).toContain("Tempo limite");
    });

    it("handles network error", async () => {
      createMockFetch([
        {
          url: /theirstack\.com/,
          response: mockNetworkError("Failed to fetch"),
        },
      ]);

      const result = await service.testConnection("test-key");

      expect(result.success).toBe(false);
    });

    it("sends Bearer token in Authorization header", async () => {
      const { calls } = createMockFetch([
        {
          url: /theirstack\.com/,
          response: mockJsonResponse({
            ui_credits: 50,
            used_ui_credits: 0,
            api_credits: 200,
            used_api_credits: 6,
          }),
        },
      ]);

      await service.testConnection("my-secret-key");

      expect(calls().length).toBeGreaterThan(0);
      expect(calls()[0].headers?.Authorization).toBe("Bearer my-secret-key");
    });
  });

  describe("getCredits", () => {
    it("returns parsed credits on success", async () => {
      createMockFetch([
        {
          url: /theirstack\.com.*credit-balance/,
          response: mockJsonResponse({
            ui_credits: 50,
            used_ui_credits: 10,
            api_credits: 200,
            used_api_credits: 6,
          }),
        },
      ]);

      const credits = await service.getCredits("test-key");

      expect(credits).toEqual({
        apiCredits: 200,
        usedApiCredits: 6,
        uiCredits: 50,
        usedUiCredits: 10,
      });
    });

    it("applies typeof guards for non-number fields", async () => {
      createMockFetch([
        {
          url: /theirstack\.com/,
          response: mockJsonResponse({
            ui_credits: "not-a-number",
            used_ui_credits: null,
            api_credits: 200,
            used_api_credits: undefined,
          }),
        },
      ]);

      const credits = await service.getCredits("test-key");

      expect(credits.uiCredits).toBe(0);
      expect(credits.usedUiCredits).toBe(0);
      expect(credits.apiCredits).toBe(200);
      expect(credits.usedApiCredits).toBe(0);
    });

    it("throws on 401 (invalid key)", async () => {
      createMockFetch([
        {
          url: /theirstack\.com/,
          response: mockErrorResponse(401, "Unauthorized"),
        },
      ]);

      await expect(service.getCredits("invalid-key")).rejects.toThrow();
    });

    it("throws on 429 (rate limit)", async () => {
      createMockFetch([
        {
          url: /theirstack\.com/,
          response: mockErrorResponse(429, "Rate limited"),
        },
      ]);

      await expect(service.getCredits("test-key")).rejects.toThrow();
    });

    it("throws on network error", async () => {
      createMockFetch([
        {
          url: /theirstack\.com/,
          response: mockNetworkError("Failed to fetch"),
        },
      ]);

      await expect(service.getCredits("test-key")).rejects.toThrow();
    });
  });
});
