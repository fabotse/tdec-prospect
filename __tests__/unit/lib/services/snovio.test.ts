/**
 * Unit tests for Snov.io Service
 * Story: 2.3 - Integration Connection Testing
 * Story 7.3: Snov.io Integration Service - Gestão de Campanhas
 *
 * Tests OAuth 2.0 authentication flow with client_id:client_secret format
 * Tests: createProspectList, addProspectToList, addProspectsToList,
 *        getUserCampaigns, getUserLists, token caching
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SnovioService, RATE_LIMIT_DELAY_MS } from "@/lib/services/snovio";
import { ERROR_MESSAGES, ExternalServiceError } from "@/lib/services/base-service";
import {
  createMockFetch,
  mockJsonResponse,
  mockErrorResponse,
  mockNetworkError,
  restoreFetch,
} from "../../../helpers/mock-fetch";

// Helper: standard token response for mocking OAuth
function tokenRoute() {
  return {
    url: /oauth\/access_token/,
    method: "POST" as const,
    response: mockJsonResponse({
      access_token: "test-access-token",
      token_type: "Bearer",
      expires_in: 3600,
    }),
  };
}

describe("SnovioService", () => {
  let service: SnovioService;

  beforeEach(() => {
    service = new SnovioService();
  });

  afterEach(() => {
    restoreFetch();
    vi.restoreAllMocks();
  });

  // ==============================================
  // CONSTANTS (Story 7.3)
  // ==============================================

  describe("RATE_LIMIT_DELAY_MS", () => {
    it("should be 1100ms (60 req/min safe margin)", () => {
      expect(RATE_LIMIT_DELAY_MS).toBe(1100);
    });
  });

  // ==============================================
  // testConnection (Story 2.3 — existing tests)
  // ==============================================

  describe("testConnection", () => {
    it("returns success when OAuth flow completes successfully", async () => {
      createMockFetch([
        tokenRoute(),
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
        tokenRoute(),
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
        tokenRoute(),
        {
          url: /snov\.io/,
          response: mockJsonResponse({
            success: true,
            data: { balance: 100 },
          }),
        },
      ]);

      await service.testConnection("client_id:client_secret");

      expect(calls()).toHaveLength(2);
      expect(calls()[1].url).toContain("access_token=test-access-token");
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

  // ==============================================
  // Token Management (Story 7.3 AC: #1)
  // ==============================================

  describe("token management", () => {
    it("caches token and reuses on second call", async () => {
      const { mock } = createMockFetch([
        tokenRoute(),
        {
          url: /add-list/,
          method: "POST",
          response: mockJsonResponse({ success: true, id: 1, name: "List" }),
        },
      ]);

      // First call — gets token
      await service.createProspectList({ credentials: "id:secret", name: "List 1" });
      const firstTokenCalls = mock.mock.calls.filter(
        (c: [string]) => typeof c[0] === "string" && c[0].includes("oauth")
      );
      expect(firstTokenCalls).toHaveLength(1);

      // Second call — should reuse cached token (no new OAuth call)
      await service.createProspectList({ credentials: "id:secret", name: "List 2" });
      const secondTokenCalls = mock.mock.calls.filter(
        (c: [string]) => typeof c[0] === "string" && c[0].includes("oauth")
      );
      expect(secondTokenCalls).toHaveLength(1); // Still 1 — cache hit
    });

    it("refreshes token when expired (near expiry < 5 min)", async () => {
      const { mock } = createMockFetch([
        tokenRoute(),
        {
          url: /add-list/,
          method: "POST",
          response: mockJsonResponse({ success: true, id: 1, name: "List" }),
        },
      ]);

      // First call — gets token
      await service.createProspectList({ credentials: "id:secret", name: "List" });

      // Simulate token near expiry by advancing time
      vi.useFakeTimers();
      vi.advanceTimersByTime(56 * 60 * 1000); // 56 minutes — only 4 min left (< 5 min margin)

      // This should trigger a new token request
      await service.createProspectList({ credentials: "id:secret", name: "List 2" });

      const tokenCalls = mock.mock.calls.filter(
        (c: [string]) => typeof c[0] === "string" && c[0].includes("oauth")
      );
      expect(tokenCalls).toHaveLength(2); // Refreshed

      vi.useRealTimers();
    });

    it("throws on invalid credentials format", async () => {
      await expect(
        service.createProspectList({ credentials: "no-colon", name: "Test" })
      ).rejects.toThrow(ExternalServiceError);
    });

    it("retries with fresh token on 401 (withTokenRetry)", async () => {
      let addListCallCount = 0;
      createMockFetch([
        tokenRoute(),
        {
          url: /add-list/,
          method: "POST",
          response: {
            get ok() {
              addListCallCount++;
              return addListCallCount > 1;
            },
            get status() {
              return addListCallCount > 1 ? 200 : 401;
            },
            json: () =>
              Promise.resolve({ success: true, id: 99, name: "Retry OK" }),
            text: () => Promise.resolve(""),
          },
        },
      ]);

      const result = await service.createProspectList({
        credentials: "id:secret",
        name: "Retry OK",
      });

      expect(result.listId).toBe(99);
      expect(result.name).toBe("Retry OK");
    });

    it("invalidates cache when credentials change", async () => {
      const { mock } = createMockFetch([
        tokenRoute(),
        {
          url: /add-list/,
          method: "POST",
          response: mockJsonResponse({ success: true, id: 1, name: "Test" }),
        },
      ]);

      // First call with credentials A
      await service.createProspectList({ credentials: "idA:secretA", name: "A" });

      // Second call with different credentials B — should get new token
      await service.createProspectList({ credentials: "idB:secretB", name: "B" });

      const tokenCalls = mock.mock.calls.filter(
        (c: [string]) => typeof c[0] === "string" && c[0].includes("oauth")
      );
      expect(tokenCalls).toHaveLength(2); // Different credentials → new token
    });
  });

  // ==============================================
  // createProspectList (Story 7.3 AC: #2)
  // ==============================================

  describe("createProspectList", () => {
    it("creates list and returns listId and name", async () => {
      createMockFetch([
        tokenRoute(),
        {
          url: /add-list/,
          method: "POST",
          response: mockJsonResponse({ success: true, id: 12345, name: "Prospects Q1" }),
        },
      ]);

      const result = await service.createProspectList({
        credentials: "id:secret",
        name: "Prospects Q1",
      });

      expect(result.listId).toBe(12345);
      expect(result.name).toBe("Prospects Q1");
    });

    it("sends access_token and name in request body", async () => {
      const { calls } = createMockFetch([
        tokenRoute(),
        {
          url: /add-list/,
          method: "POST",
          response: mockJsonResponse({ success: true, id: 1, name: "Test" }),
        },
      ]);

      await service.createProspectList({ credentials: "id:secret", name: "Test" });

      const addListCall = calls().find((c) => c.url.includes("add-list"));
      const body = addListCall?.body as Record<string, unknown>;
      expect(body.access_token).toBe("test-access-token");
      expect(body.name).toBe("Test");
    });

    it("sends POST to correct endpoint", async () => {
      const { mock } = createMockFetch([
        tokenRoute(),
        {
          url: /add-list/,
          method: "POST",
          response: mockJsonResponse({ success: true, id: 1, name: "Test" }),
        },
      ]);

      await service.createProspectList({ credentials: "id:secret", name: "Test" });

      expect(mock).toHaveBeenCalledWith(
        "https://api.snov.io/v1/add-list",
        expect.objectContaining({ method: "POST" })
      );
    });

    it("throws ExternalServiceError on 401", async () => {
      createMockFetch([
        tokenRoute(),
        {
          url: /add-list/,
          method: "POST",
          response: mockErrorResponse(401),
        },
      ]);

      await expect(
        service.createProspectList({ credentials: "id:secret", name: "Test" })
      ).rejects.toThrow(ExternalServiceError);
    });

    it("throws ExternalServiceError on 429", async () => {
      createMockFetch([
        tokenRoute(),
        {
          url: /add-list/,
          method: "POST",
          response: mockErrorResponse(429),
        },
      ]);

      await expect(
        service.createProspectList({ credentials: "id:secret", name: "Test" })
      ).rejects.toThrow(ExternalServiceError);
    });

    it("throws ExternalServiceError on 500", async () => {
      createMockFetch([
        tokenRoute(),
        {
          url: /add-list/,
          method: "POST",
          response: mockErrorResponse(500),
        },
      ]);

      await expect(
        service.createProspectList({ credentials: "id:secret", name: "Test" })
      ).rejects.toThrow(ExternalServiceError);
    });
  });

  // ==============================================
  // addProspectToList (Story 7.3 AC: #3a)
  // ==============================================

  describe("addProspectToList", () => {
    const prospectRoute = {
      url: /add-prospect-to-list/,
      method: "POST" as const,
      response: mockJsonResponse({ success: true, added: true, updated: false }),
    };

    it("adds prospect with correct field mapping (camelCase + position + customFields)", async () => {
      const { calls } = createMockFetch([tokenRoute(), prospectRoute]);

      await service.addProspectToList({
        credentials: "id:secret",
        listId: 12345,
        lead: {
          email: "joao@empresa.com",
          firstName: "João",
          lastName: "Silva",
          companyName: "Empresa Ltda",
          title: "CTO",
          phone: "+5511999999999",
          icebreaker: "Parabéns pelo novo cargo!",
        },
      });

      const addCall = calls().find((c) => c.url.includes("add-prospect-to-list"));
      const body = addCall?.body as Record<string, unknown>;

      // Native fields in camelCase
      expect(body.email).toBe("joao@empresa.com");
      expect(body.firstName).toBe("João");
      expect(body.lastName).toBe("Silva");
      expect(body.companyName).toBe("Empresa Ltda");

      // title → position (NOT title!)
      expect(body.position).toBe("CTO");
      expect(body).not.toHaveProperty("title");

      // phone → phones array
      expect(body.phones).toEqual(["+5511999999999"]);

      // icebreaker → customFields bracket notation
      expect(body["customFields[ice_breaker]"]).toBe("Parabéns pelo novo cargo!");

      // Required fields
      expect(body.access_token).toBe("test-access-token");
      expect(body.listId).toBe(12345);
      expect(body.updateContact).toBe(true);
    });

    it("returns success, added, updated from response", async () => {
      createMockFetch([tokenRoute(), prospectRoute]);

      const result = await service.addProspectToList({
        credentials: "id:secret",
        listId: 12345,
        lead: { email: "a@b.com" },
      });

      expect(result.success).toBe(true);
      expect(result.added).toBe(true);
      expect(result.updated).toBe(false);
    });

    it("omits optional fields when lead has minimal data", async () => {
      const { calls } = createMockFetch([tokenRoute(), prospectRoute]);

      await service.addProspectToList({
        credentials: "id:secret",
        listId: 12345,
        lead: { email: "min@test.com" },
      });

      const addCall = calls().find((c) => c.url.includes("add-prospect-to-list"));
      const body = addCall?.body as Record<string, unknown>;

      expect(body.email).toBe("min@test.com");
      expect(body.firstName).toBeUndefined();
      expect(body.lastName).toBeUndefined();
      expect(body.companyName).toBeUndefined();
      expect(body.position).toBeUndefined();
      expect(body.phones).toBeUndefined();
      expect(body["customFields[ice_breaker]"]).toBeUndefined();
    });

    it("omits customFields when lead has no icebreaker", async () => {
      const { calls } = createMockFetch([tokenRoute(), prospectRoute]);

      await service.addProspectToList({
        credentials: "id:secret",
        listId: 12345,
        lead: { email: "a@b.com", firstName: "Test", title: "CEO" },
      });

      const addCall = calls().find((c) => c.url.includes("add-prospect-to-list"));
      const body = addCall?.body as Record<string, unknown>;

      expect(body.position).toBe("CEO");
      expect(body["customFields[ice_breaker]"]).toBeUndefined();
    });

    it("sends POST to correct endpoint", async () => {
      const { mock } = createMockFetch([tokenRoute(), prospectRoute]);

      await service.addProspectToList({
        credentials: "id:secret",
        listId: 12345,
        lead: { email: "a@b.com" },
      });

      expect(mock).toHaveBeenCalledWith(
        "https://api.snov.io/v1/add-prospect-to-list",
        expect.objectContaining({ method: "POST" })
      );
    });

    it("throws ExternalServiceError on 401", async () => {
      createMockFetch([
        tokenRoute(),
        {
          url: /add-prospect-to-list/,
          method: "POST",
          response: mockErrorResponse(401),
        },
      ]);

      await expect(
        service.addProspectToList({
          credentials: "id:secret",
          listId: 12345,
          lead: { email: "a@b.com" },
        })
      ).rejects.toThrow(ExternalServiceError);
    });

    it("throws ExternalServiceError on 500", async () => {
      createMockFetch([
        tokenRoute(),
        {
          url: /add-prospect-to-list/,
          method: "POST",
          response: mockErrorResponse(500),
        },
      ]);

      await expect(
        service.addProspectToList({
          credentials: "id:secret",
          listId: 12345,
          lead: { email: "a@b.com" },
        })
      ).rejects.toThrow(ExternalServiceError);
    });
  });

  // ==============================================
  // addProspectsToList (Story 7.3 AC: #3b)
  // ==============================================

  describe("addProspectsToList", () => {
    const batchProspectRoute = {
      url: /add-prospect-to-list/,
      method: "POST" as const,
      response: mockJsonResponse({ success: true, added: true, updated: false }),
    };

    it("processes multiple prospects sequentially", async () => {
      vi.useFakeTimers();

      const { mock } = createMockFetch([tokenRoute(), batchProspectRoute]);

      const promise = service.addProspectsToList({
        credentials: "id:secret",
        listId: 12345,
        leads: [
          { email: "a@b.com", firstName: "A" },
          { email: "c@d.com", firstName: "C" },
          { email: "e@f.com", firstName: "E" },
        ],
      });

      // Advance past delays (2 delays for 3 prospects)
      await vi.advanceTimersByTimeAsync(3000);
      const result = await promise;

      expect(result.added).toBe(3);
      expect(result.updated).toBe(0);
      expect(result.errors).toBe(0);
      expect(result.totalProcessed).toBe(3);

      // 1 token call + 3 prospect calls
      const prospectCalls = mock.mock.calls.filter(
        (c: [string]) => typeof c[0] === "string" && c[0].includes("add-prospect-to-list")
      );
      expect(prospectCalls).toHaveLength(3);

      vi.useRealTimers();
    });

    it("applies 1100ms rate limit delay between requests", async () => {
      vi.useFakeTimers();
      const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");

      createMockFetch([tokenRoute(), batchProspectRoute]);

      const promise = service.addProspectsToList({
        credentials: "id:secret",
        listId: 12345,
        leads: [
          { email: "a@b.com" },
          { email: "c@d.com" },
        ],
      });

      await vi.advanceTimersByTimeAsync(2500);
      await promise;

      const delayCalls = setTimeoutSpy.mock.calls.filter(
        ([, ms]) => ms === 1100
      );
      expect(delayCalls.length).toBeGreaterThanOrEqual(1);

      setTimeoutSpy.mockRestore();
      vi.useRealTimers();
    });

    it("filters leads without email", async () => {
      createMockFetch([tokenRoute(), batchProspectRoute]);

      const result = await service.addProspectsToList({
        credentials: "id:secret",
        listId: 12345,
        leads: [
          { email: "valid@test.com", firstName: "Valid" },
          { email: "", firstName: "NoEmail" },
        ],
      });

      expect(result.totalProcessed).toBe(1);
      expect(result.added).toBe(1);
    });

    it("returns zero counts when all leads filtered (no email)", async () => {
      const result = await service.addProspectsToList({
        credentials: "id:secret",
        listId: 12345,
        leads: [
          { email: "", firstName: "A" },
          { email: "", firstName: "B" },
        ],
      });

      expect(result.added).toBe(0);
      expect(result.updated).toBe(0);
      expect(result.errors).toBe(0);
      expect(result.totalProcessed).toBe(0);
    });

    it("counts updated prospects correctly", async () => {
      createMockFetch([
        tokenRoute(),
        {
          url: /add-prospect-to-list/,
          method: "POST",
          response: mockJsonResponse({ success: true, added: false, updated: true }),
        },
      ]);

      const result = await service.addProspectsToList({
        credentials: "id:secret",
        listId: 12345,
        leads: [{ email: "existing@test.com" }],
      });

      expect(result.added).toBe(0);
      expect(result.updated).toBe(1);
      expect(result.totalProcessed).toBe(1);
    });

    it("continues on non-fatal error (429) and counts it", async () => {
      vi.useFakeTimers();

      let callCount = 0;
      createMockFetch([
        tokenRoute(),
        {
          url: /add-prospect-to-list/,
          method: "POST",
          response: {
            get ok() {
              callCount++;
              return callCount !== 2; // 2nd call fails
            },
            get status() {
              return callCount === 2 ? 429 : 200;
            },
            json: () =>
              Promise.resolve({ success: true, added: true, updated: false }),
            text: () => Promise.resolve(""),
          },
        },
      ]);

      const promise = service.addProspectsToList({
        credentials: "id:secret",
        listId: 12345,
        leads: [
          { email: "a@b.com" },
          { email: "c@d.com" },
          { email: "e@f.com" },
        ],
      });

      await vi.advanceTimersByTimeAsync(5000);
      const result = await promise;

      expect(result.added).toBe(2);
      expect(result.errors).toBe(1);
      expect(result.totalProcessed).toBe(3);

      vi.useRealTimers();
    });

    it("stops on fatal 401 error and reports partial results", async () => {
      vi.useFakeTimers();

      let callCount = 0;
      createMockFetch([
        tokenRoute(),
        {
          url: /add-prospect-to-list/,
          method: "POST",
          response: {
            get ok() {
              callCount++;
              return callCount <= 2; // First 2 succeed, 3rd fails with 401
            },
            get status() {
              return callCount <= 2 ? 200 : 401;
            },
            json: () =>
              Promise.resolve({ success: true, added: true, updated: false }),
            text: () => Promise.resolve(""),
          },
        },
      ]);

      let caughtError: unknown;
      const promise = service.addProspectsToList({
        credentials: "id:secret",
        listId: 12345,
        leads: [
          { email: "a@b.com" },
          { email: "c@d.com" },
          { email: "e@f.com" },
          { email: "g@h.com" },
          { email: "i@j.com" },
        ],
      }).catch((e: unknown) => {
        caughtError = e;
      });

      await vi.advanceTimersByTimeAsync(10000);
      await promise;

      expect(caughtError).toBeInstanceOf(ExternalServiceError);
      const serviceError = caughtError as ExternalServiceError;
      expect(serviceError.statusCode).toBe(401);

      const details = serviceError.details as {
        partialResults: { added: number; updated: number; errors: number; totalProcessed: number };
        processedBeforeFailure: number;
        totalLeads: number;
      };
      expect(details.partialResults.added).toBe(2);
      expect(details.partialResults.totalProcessed).toBe(2);
      expect(details.processedBeforeFailure).toBe(2);
      expect(details.totalLeads).toBe(5);

      vi.useRealTimers();
    });

    it("stops on fatal network error and reports partial results", async () => {
      createMockFetch([
        tokenRoute(),
        {
          url: /add-prospect-to-list/,
          method: "POST",
          response: mockNetworkError("Failed to fetch"),
        },
      ]);

      let caughtError: unknown;
      try {
        await service.addProspectsToList({
          credentials: "id:secret",
          listId: 12345,
          leads: [{ email: "a@b.com" }],
        });
      } catch (e) {
        caughtError = e;
      }

      expect(caughtError).toBeInstanceOf(ExternalServiceError);
      const serviceError = caughtError as ExternalServiceError;
      expect(serviceError.statusCode).toBe(0);

      const details = serviceError.details as {
        partialResults: { added: number; updated: number; errors: number; totalProcessed: number };
        processedBeforeFailure: number;
        totalLeads: number;
      };
      expect(details.partialResults.added).toBe(0);
      expect(details.partialResults.totalProcessed).toBe(0);
      expect(details.processedBeforeFailure).toBe(0);
      expect(details.totalLeads).toBe(1);
    });
  });

  // ==============================================
  // getUserCampaigns (Story 7.3 AC: #4)
  // ==============================================

  describe("getUserCampaigns", () => {
    it("returns list of campaigns with id, title, status", async () => {
      createMockFetch([
        tokenRoute(),
        {
          url: /get-user-campaigns/,
          method: "GET",
          response: mockJsonResponse({
            success: true,
            data: [
              { id: 1, title: "Drip Campaign Q1", status: "active" },
              { id: 2, title: "Outreach Q2", status: "paused" },
            ],
          }),
        },
      ]);

      const result = await service.getUserCampaigns({ credentials: "id:secret" });

      expect(result.campaigns).toHaveLength(2);
      expect(result.campaigns[0].id).toBe(1);
      expect(result.campaigns[0].title).toBe("Drip Campaign Q1");
      expect(result.campaigns[0].status).toBe("active");
      expect(result.campaigns[1].status).toBe("paused");
    });

    it("sends access_token as query parameter", async () => {
      const { calls } = createMockFetch([
        tokenRoute(),
        {
          url: /get-user-campaigns/,
          method: "GET",
          response: mockJsonResponse({ success: true, data: [] }),
        },
      ]);

      await service.getUserCampaigns({ credentials: "id:secret" });

      const campaignCall = calls().find((c) => c.url.includes("get-user-campaigns"));
      expect(campaignCall?.url).toContain("access_token=test-access-token");
    });

    it("returns empty array when no campaigns exist", async () => {
      createMockFetch([
        tokenRoute(),
        {
          url: /get-user-campaigns/,
          method: "GET",
          response: mockJsonResponse({ success: true, data: [] }),
        },
      ]);

      const result = await service.getUserCampaigns({ credentials: "id:secret" });
      expect(result.campaigns).toHaveLength(0);
    });

    it("throws ExternalServiceError on 401", async () => {
      createMockFetch([
        tokenRoute(),
        {
          url: /get-user-campaigns/,
          method: "GET",
          response: mockErrorResponse(401),
        },
      ]);

      await expect(
        service.getUserCampaigns({ credentials: "id:secret" })
      ).rejects.toThrow(ExternalServiceError);
    });

    it("throws ExternalServiceError on 500", async () => {
      createMockFetch([
        tokenRoute(),
        {
          url: /get-user-campaigns/,
          method: "GET",
          response: mockErrorResponse(500),
        },
      ]);

      await expect(
        service.getUserCampaigns({ credentials: "id:secret" })
      ).rejects.toThrow(ExternalServiceError);
    });
  });

  // ==============================================
  // getUserLists (Story 7.3 AC: #5)
  // ==============================================

  describe("getUserLists", () => {
    it("returns list of prospect lists with id, name, contacts", async () => {
      createMockFetch([
        tokenRoute(),
        {
          url: /get-user-lists/,
          method: "GET",
          response: mockJsonResponse({
            success: true,
            data: [
              { id: 1, name: "Prospects Q1", contacts: 150 },
              { id: 2, name: "Hot Leads", contacts: 42 },
            ],
          }),
        },
      ]);

      const result = await service.getUserLists({ credentials: "id:secret" });

      expect(result.lists).toHaveLength(2);
      expect(result.lists[0].id).toBe(1);
      expect(result.lists[0].name).toBe("Prospects Q1");
      expect(result.lists[0].contacts).toBe(150);
    });

    it("sends Bearer token in Authorization header", async () => {
      const { calls } = createMockFetch([
        tokenRoute(),
        {
          url: /get-user-lists/,
          method: "GET",
          response: mockJsonResponse({ success: true, data: [] }),
        },
      ]);

      await service.getUserLists({ credentials: "id:secret" });

      const listCall = calls().find((c) => c.url.includes("get-user-lists"));
      expect(listCall?.headers?.Authorization).toBe("Bearer test-access-token");
    });

    it("returns empty array when no lists exist", async () => {
      createMockFetch([
        tokenRoute(),
        {
          url: /get-user-lists/,
          method: "GET",
          response: mockJsonResponse({ success: true, data: [] }),
        },
      ]);

      const result = await service.getUserLists({ credentials: "id:secret" });
      expect(result.lists).toHaveLength(0);
    });

    it("throws ExternalServiceError on 401", async () => {
      createMockFetch([
        tokenRoute(),
        {
          url: /get-user-lists/,
          method: "GET",
          response: mockErrorResponse(401),
        },
      ]);

      await expect(
        service.getUserLists({ credentials: "id:secret" })
      ).rejects.toThrow(ExternalServiceError);
    });

    it("throws ExternalServiceError on 500", async () => {
      createMockFetch([
        tokenRoute(),
        {
          url: /get-user-lists/,
          method: "GET",
          response: mockErrorResponse(500),
        },
      ]);

      await expect(
        service.getUserLists({ credentials: "id:secret" })
      ).rejects.toThrow(ExternalServiceError);
    });
  });
});
