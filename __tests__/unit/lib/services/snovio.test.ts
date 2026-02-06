/**
 * Unit tests for Snov.io Service
 * Story: 2.3 - Integration Connection Testing
 *
 * Tests OAuth 2.0 authentication flow with client_id:client_secret format
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SnovioService } from "@/lib/services/snovio";
import { ERROR_MESSAGES } from "@/lib/services/base-service";
import {
  createMockFetch,
  mockJsonResponse,
  mockErrorResponse,
  restoreFetch,
} from "../../../helpers/mock-fetch";

describe("SnovioService", () => {
  let service: SnovioService;

  beforeEach(() => {
    service = new SnovioService();
  });

  afterEach(() => {
    restoreFetch();
    vi.restoreAllMocks();
  });

  describe("testConnection", () => {
    it("returns success when OAuth flow completes successfully", async () => {
      createMockFetch([
        {
          url: /oauth\/access_token/,
          method: "POST",
          response: mockJsonResponse({
            access_token: "test-access-token",
            token_type: "Bearer",
            expires_in: 3600,
          }),
        },
        {
          url: /snov\.io/,
          response: mockJsonResponse({
            success: true,
            data: { balance: 100 },
          }),
        },
      ]);

      const result = await service.testConnection("client_id:client_secret");

      expect(result.success).toBe(true);
      expect(result.message).toBe(ERROR_MESSAGES.SUCCESS);
      expect(result.testedAt).toBeDefined();
    });

    it("returns error on invalid credentials format", async () => {
      // No colon separator
      const result = await service.testConnection("invalid-format-no-colon");

      expect(result.success).toBe(false);
      expect(result.message).toContain("Formato inválido");
    });

    it("returns error when token exchange fails with 401", async () => {
      createMockFetch([
        { url: /snov\.io/, response: mockErrorResponse(401) },
      ]);

      const result = await service.testConnection("bad_client:bad_secret");

      expect(result.success).toBe(false);
      expect(result.message).toBe(ERROR_MESSAGES.UNAUTHORIZED);
    });

    it("returns error when balance check fails after token exchange", async () => {
      createMockFetch([
        {
          url: /oauth\/access_token/,
          method: "POST",
          response: mockJsonResponse({
            access_token: "test-access-token",
            token_type: "Bearer",
            expires_in: 3600,
          }),
        },
        {
          url: /snov\.io/,
          response: mockErrorResponse(401),
        },
      ]);

      const result = await service.testConnection("client_id:client_secret");

      expect(result.success).toBe(false);
      expect(result.message).toBe(ERROR_MESSAGES.UNAUTHORIZED);
    });

    it("returns error on rate limit (429)", async () => {
      createMockFetch([
        { url: /snov\.io/, response: mockErrorResponse(429) },
      ]);

      const result = await service.testConnection("client_id:client_secret");

      expect(result.success).toBe(false);
      expect(result.message).toBe(ERROR_MESSAGES.RATE_LIMITED);
    });

    it("makes correct OAuth token request", async () => {
      const { mock } = createMockFetch([
        {
          url: /snov\.io/,
          response: mockJsonResponse({
            access_token: "test-token",
            token_type: "Bearer",
            expires_in: 3600,
          }),
        },
      ]);

      await service.testConnection("my_client_id:my_client_secret");

      // First call should be to OAuth endpoint
      expect(mock).toHaveBeenCalledWith(
        expect.stringContaining("oauth/access_token"),
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "application/x-www-form-urlencoded",
          }),
        })
      );
    });

    it("uses access token in balance check", async () => {
      const { calls } = createMockFetch([
        {
          url: /oauth\/access_token/,
          method: "POST",
          response: mockJsonResponse({
            access_token: "generated-access-token",
            token_type: "Bearer",
            expires_in: 3600,
          }),
        },
        {
          url: /snov\.io/,
          response: mockJsonResponse({
            success: true,
            data: { balance: 100 },
          }),
        },
      ]);

      await service.testConnection("client_id:client_secret");

      // Second call should include the access token in URL
      expect(calls()).toHaveLength(2);
      expect(calls()[1].url).toContain("access_token=generated-access-token");
    });

    it("handles empty client_id", async () => {
      const result = await service.testConnection(":client_secret");

      expect(result.success).toBe(false);
      expect(result.message).toContain("Formato inválido");
    });

    it("handles empty client_secret", async () => {
      const result = await service.testConnection("client_id:");

      expect(result.success).toBe(false);
      expect(result.message).toContain("Formato inválido");
    });
  });

  describe("service properties", () => {
    it("has correct service name", () => {
      expect(service.name).toBe("snovio");
    });
  });
});
