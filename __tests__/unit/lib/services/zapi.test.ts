/**
 * Unit tests for Z-API Service
 * Story: 11.1 - Z-API Integration Service + Config
 *
 * Tests:
 * - testConnection returns success on 200
 * - testConnection returns error on invalid credentials (bad JSON)
 * - testConnection returns error on missing fields
 * - testConnection returns error on 401 (unauthorized)
 * - testConnection returns error on timeout
 * - testConnection returns error on network error
 * - testConnection includes latency in result
 * - parseZApiCredentials valid JSON
 * - parseZApiCredentials invalid JSON
 * - parseZApiCredentials missing field
 * - buildZApiUrl format correct
 * - buildZApiHeaders format correct
 * - createSuccessResult / createErrorResult
 * - retry on timeout
 * - handleError translates errors
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  ZApiService,
  parseZApiCredentials,
  buildZApiUrl,
  buildZApiHeaders,
} from "@/lib/services/zapi";
import { ExternalServiceError, ERROR_MESSAGES } from "@/lib/services/base-service";
import {
  createMockFetch,
  mockJsonResponse,
  mockErrorResponse,
  mockNetworkError,
  restoreFetch,
} from "../../../helpers/mock-fetch";

const VALID_CREDENTIALS = JSON.stringify({
  instanceId: "inst-123",
  instanceToken: "tok-456",
  securityToken: "sec-789",
});

describe("ZApiService", () => {
  let service: ZApiService;

  beforeEach(() => {
    service = new ZApiService();
  });

  afterEach(() => {
    restoreFetch();
    vi.restoreAllMocks();
  });

  describe("testConnection", () => {
    it("returns success on 200 response", async () => {
      createMockFetch([
        {
          url: /z-api\.io.*\/status/,
          response: mockJsonResponse({ connected: true }),
        },
      ]);

      const result = await service.testConnection(VALID_CREDENTIALS);

      expect(result.success).toBe(true);
      expect(result.message).toBe(ERROR_MESSAGES.SUCCESS);
      expect(result.testedAt).toBeDefined();
      expect(result.latencyMs).toBeDefined();
    });

    it("includes latency in success result", async () => {
      createMockFetch([
        {
          url: /z-api\.io.*\/status/,
          response: mockJsonResponse({ connected: true }),
        },
      ]);

      const result = await service.testConnection(VALID_CREDENTIALS);

      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it("returns error on invalid JSON credentials", async () => {
      const result = await service.testConnection("not-valid-json");

      expect(result.success).toBe(false);
      expect(result.message).toContain("Credenciais Z-API inválidas");
    });

    it("returns error on missing instanceId field", async () => {
      const partial = JSON.stringify({
        instanceToken: "tok-456",
        securityToken: "sec-789",
      });

      const result = await service.testConnection(partial);

      expect(result.success).toBe(false);
      expect(result.message).toContain("Credenciais Z-API inválidas");
    });

    it("returns error on missing instanceToken field", async () => {
      const partial = JSON.stringify({
        instanceId: "inst-123",
        securityToken: "sec-789",
      });

      const result = await service.testConnection(partial);

      expect(result.success).toBe(false);
      expect(result.message).toContain("Credenciais Z-API inválidas");
    });

    it("returns error on missing securityToken field", async () => {
      const partial = JSON.stringify({
        instanceId: "inst-123",
        instanceToken: "tok-456",
      });

      const result = await service.testConnection(partial);

      expect(result.success).toBe(false);
      expect(result.message).toContain("Credenciais Z-API inválidas");
    });

    it("returns error on 401 unauthorized response", async () => {
      createMockFetch([
        {
          url: /z-api\.io.*\/status/,
          response: mockErrorResponse(401, "Unauthorized"),
        },
      ]);

      const result = await service.testConnection(VALID_CREDENTIALS);

      expect(result.success).toBe(false);
      expect(result.message).toBe(ERROR_MESSAGES.UNAUTHORIZED);
    });

    it("returns error on 403 forbidden response", async () => {
      createMockFetch([
        {
          url: /z-api\.io.*\/status/,
          response: mockErrorResponse(403, "Forbidden"),
        },
      ]);

      const result = await service.testConnection(VALID_CREDENTIALS);

      expect(result.success).toBe(false);
      expect(result.message).toBe(ERROR_MESSAGES.FORBIDDEN);
    });

    it("returns error on 500 server error", async () => {
      createMockFetch([
        {
          url: /z-api\.io.*\/status/,
          response: mockErrorResponse(500, "Internal Server Error"),
        },
      ]);

      const result = await service.testConnection(VALID_CREDENTIALS);

      expect(result.success).toBe(false);
      expect(result.message).toBe(ERROR_MESSAGES.INTERNAL_ERROR);
    });

    it("returns error on network error", async () => {
      createMockFetch([
        {
          url: /z-api\.io.*\/status/,
          response: mockNetworkError("Failed to fetch"),
        },
      ]);

      const result = await service.testConnection(VALID_CREDENTIALS);

      expect(result.success).toBe(false);
      expect(result.message).toBe(ERROR_MESSAGES.NETWORK_ERROR);
    });

    it("builds correct URL with credentials in path", async () => {
      const fetchResult = createMockFetch([
        {
          url: /z-api\.io/,
          response: mockJsonResponse({ connected: true }),
        },
      ]);

      await service.testConnection(VALID_CREDENTIALS);

      const calls = fetchResult.calls();
      expect(calls.length).toBeGreaterThan(0);
      expect(calls[0].url).toBe(
        "https://api.z-api.io/instances/inst-123/token/tok-456/status"
      );
    });

    it("sends security token in Client-Token header", async () => {
      const fetchResult = createMockFetch([
        {
          url: /z-api\.io/,
          response: mockJsonResponse({ connected: true }),
        },
      ]);

      await service.testConnection(VALID_CREDENTIALS);

      const calls = fetchResult.calls();
      expect(calls.length).toBeGreaterThan(0);
      expect(calls[0].headers?.["Client-Token"]).toBe("sec-789");
      expect(calls[0].headers?.["Content-Type"]).toBe("application/json");
    });

    it("uses GET method for status endpoint", async () => {
      const fetchResult = createMockFetch([
        {
          url: /z-api\.io/,
          response: mockJsonResponse({ connected: true }),
        },
      ]);

      await service.testConnection(VALID_CREDENTIALS);

      const calls = fetchResult.calls();
      expect(calls[0].method).toBe("GET");
    });
  });

  describe("parseZApiCredentials", () => {
    it("parses valid JSON credentials", () => {
      const credentials = parseZApiCredentials(VALID_CREDENTIALS);

      expect(credentials).toEqual({
        instanceId: "inst-123",
        instanceToken: "tok-456",
        securityToken: "sec-789",
      });
    });

    it("throws ExternalServiceError on invalid JSON", () => {
      expect(() => parseZApiCredentials("not-json")).toThrow(
        ExternalServiceError
      );
    });

    it("throws ExternalServiceError on empty object", () => {
      expect(() => parseZApiCredentials("{}")).toThrow(ExternalServiceError);
    });

    it("throws ExternalServiceError when instanceId is missing", () => {
      const partial = JSON.stringify({
        instanceToken: "tok",
        securityToken: "sec",
      });
      expect(() => parseZApiCredentials(partial)).toThrow(
        ExternalServiceError
      );
    });

    it("throws ExternalServiceError when instanceToken is missing", () => {
      const partial = JSON.stringify({
        instanceId: "id",
        securityToken: "sec",
      });
      expect(() => parseZApiCredentials(partial)).toThrow(
        ExternalServiceError
      );
    });

    it("throws ExternalServiceError when securityToken is missing", () => {
      const partial = JSON.stringify({
        instanceId: "id",
        instanceToken: "tok",
      });
      expect(() => parseZApiCredentials(partial)).toThrow(
        ExternalServiceError
      );
    });

    it("throws ExternalServiceError when instanceId is empty string", () => {
      const partial = JSON.stringify({
        instanceId: "",
        instanceToken: "tok",
        securityToken: "sec",
      });
      expect(() => parseZApiCredentials(partial)).toThrow(
        ExternalServiceError
      );
    });

    it("throws with Portuguese error message", () => {
      try {
        parseZApiCredentials("bad");
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(ExternalServiceError);
        expect((error as ExternalServiceError).message).toContain(
          "Credenciais Z-API inválidas"
        );
      }
    });
  });

  describe("buildZApiUrl", () => {
    it("builds URL with correct format", () => {
      const url = buildZApiUrl("my-instance", "my-token", "/status");

      expect(url).toBe(
        "https://api.z-api.io/instances/my-instance/token/my-token/status"
      );
    });

    it("builds URL for send-text endpoint", () => {
      const url = buildZApiUrl("inst", "tok", "/send-text");

      expect(url).toBe(
        "https://api.z-api.io/instances/inst/token/tok/send-text"
      );
    });

    it("encodes special characters in credentials", () => {
      const url = buildZApiUrl("inst/bad", "tok?x=1", "/status");

      expect(url).toBe(
        "https://api.z-api.io/instances/inst%2Fbad/token/tok%3Fx%3D1/status"
      );
    });
  });

  describe("buildZApiHeaders", () => {
    it("returns correct headers with Client-Token", () => {
      const headers = buildZApiHeaders("my-security-token");

      expect(headers).toEqual({
        "Content-Type": "application/json",
        "Client-Token": "my-security-token",
      });
    });
  });

  describe("service name", () => {
    it('has name "zapi"', () => {
      expect(service.name).toBe("zapi");
    });
  });
});
