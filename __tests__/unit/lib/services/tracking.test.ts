/**
 * Unit tests for TrackingService
 * Story 10.3: Instantly Analytics Service (Polling)
 *
 * AC: #1 — getCampaignAnalytics
 * AC: #2 — syncAnalytics (getCampaignAnalytics + getDailyAnalytics)
 * AC: #3 — getLeadTracking with pagination
 * AC: #4 — Error handling (timeout, network, 401, 429)
 * AC: #5 — Error when campaign not exported
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { TrackingService, mapToCampaignAnalytics, mapToLeadTracking } from "@/lib/services/tracking";
import { ExternalServiceError, ERROR_MESSAGES } from "@/lib/services/base-service";
import {
  createMockFetch,
  mockJsonResponse,
  mockErrorResponse,
  mockNetworkError,
  restoreFetch,
} from "../../../helpers/mock-fetch";
import {
  createMockInstantlyAnalyticsResponse,
  createMockInstantlyLeadEntry,
} from "../../../helpers/mock-data";

const ANALYTICS_URL = /api\.instantly\.ai\/api\/v2\/campaigns\/analytics\?/;
const DAILY_ANALYTICS_URL = /api\.instantly\.ai\/api\/v2\/campaigns\/analytics\/daily/;
const LEADS_LIST_URL = /api\.instantly\.ai\/api\/v2\/leads\/list/;

const TEST_API_KEY = "test-api-key-123";
const TEST_EXTERNAL_ID = "instantly-campaign-uuid-abc";

describe("TrackingService", () => {
  let service: TrackingService;

  beforeEach(() => {
    service = new TrackingService();
  });

  afterEach(() => {
    restoreFetch();
    vi.restoreAllMocks();
  });

  // ==============================================
  // mapToCampaignAnalytics (pure function)
  // ==============================================

  describe("mapToCampaignAnalytics", () => {
    it("maps Instantly response to CampaignAnalytics with unique counts", () => {
      const response = createMockInstantlyAnalyticsResponse();
      const result = mapToCampaignAnalytics(response, "local-campaign-1");

      expect(result.campaignId).toBe("local-campaign-1");
      expect(result.totalSent).toBe(1200);
      expect(result.totalOpens).toBe(180); // open_count_unique
      expect(result.totalClicks).toBe(45); // link_click_count_unique
      expect(result.totalReplies).toBe(25); // reply_count_unique
      expect(result.totalBounces).toBe(8);
      expect(result.openRate).toBeCloseTo(180 / 1200, 4);
      expect(result.clickRate).toBeCloseTo(45 / 1200, 4);
      expect(result.replyRate).toBeCloseTo(25 / 1200, 4);
      expect(result.bounceRate).toBeCloseTo(8 / 1200, 4);
      expect(result.lastSyncAt).toBeDefined();
    });

    it("returns zero rates when emails_sent_count is 0", () => {
      const response = createMockInstantlyAnalyticsResponse({ emails_sent_count: 0 });
      const result = mapToCampaignAnalytics(response, "c1");

      expect(result.openRate).toBe(0);
      expect(result.clickRate).toBe(0);
      expect(result.replyRate).toBe(0);
      expect(result.bounceRate).toBe(0);
    });
  });

  // ==============================================
  // mapToLeadTracking (pure function)
  // ==============================================

  describe("mapToLeadTracking", () => {
    it("maps Instantly lead entry to LeadTracking", () => {
      const entry = createMockInstantlyLeadEntry();
      const result = mapToLeadTracking(entry, "local-campaign-1");

      expect(result.leadEmail).toBe("joao@empresa.com");
      expect(result.campaignId).toBe("local-campaign-1");
      expect(result.openCount).toBe(5);
      expect(result.clickCount).toBe(2);
      expect(result.hasReplied).toBe(false);
      expect(result.lastOpenAt).toBe("2026-02-08T14:30:00.000Z");
      expect(result.events).toEqual([]);
    });

    it("handles null/missing fields with defaults", () => {
      const result = mapToLeadTracking(
        { email: "test@x.com", timestamp_last_open: null },
        "c1"
      );

      expect(result.openCount).toBe(0);
      expect(result.clickCount).toBe(0);
      expect(result.hasReplied).toBe(false);
      expect(result.lastOpenAt).toBeNull();
    });

    it("sets hasReplied true when reply_count > 0", () => {
      const entry = createMockInstantlyLeadEntry({ email_reply_count: 3 });
      const result = mapToLeadTracking(entry, "c1");

      expect(result.hasReplied).toBe(true);
    });
  });

  // ==============================================
  // Task 6.1: getCampaignAnalytics — success
  // ==============================================

  describe("getCampaignAnalytics", () => {
    it("fetches analytics and returns CampaignAnalytics (6.1)", async () => {
      const apiResponse = createMockInstantlyAnalyticsResponse();

      const { calls } = createMockFetch([
        { url: ANALYTICS_URL, response: mockJsonResponse([apiResponse]) },
      ]);

      const result = await service.getCampaignAnalytics({
        apiKey: TEST_API_KEY,
        externalCampaignId: TEST_EXTERNAL_ID,
      });

      expect(result.totalSent).toBe(1200);
      expect(result.totalOpens).toBe(180);
      expect(result.campaignId).toBe(TEST_EXTERNAL_ID);

      // Verify URL and headers
      const call = calls()[0];
      expect(call.url).toContain("exclude_total_leads_count=true");
      expect(call.url).toContain(`id=${TEST_EXTERNAL_ID}`);
      expect(call.headers?.Authorization).toBe(`Bearer ${TEST_API_KEY}`);
    });

    // Task 6.2: campaign without external_campaign_id
    it("throws error when externalCampaignId is empty (6.2)", async () => {
      await expect(
        service.getCampaignAnalytics({
          apiKey: TEST_API_KEY,
          externalCampaignId: "",
        })
      ).rejects.toThrow("Esta campanha ainda não foi exportada");
    });

    it("throws error when analytics response is empty array", async () => {
      createMockFetch([
        { url: ANALYTICS_URL, response: mockJsonResponse([]) },
      ]);

      await expect(
        service.getCampaignAnalytics({
          apiKey: TEST_API_KEY,
          externalCampaignId: TEST_EXTERNAL_ID,
        })
      ).rejects.toThrow("Nenhum dado de analytics encontrado");
    });
  });

  // ==============================================
  // Task 6.3: getDailyAnalytics
  // ==============================================

  describe("getDailyAnalytics", () => {
    it("fetches daily analytics and returns array (6.3)", async () => {
      const dailyData = [
        { date: "2026-02-01", sent: 50, contacted: 45, opened: 12, unique_opened: 8, replies: 3, unique_replies: 3, clicks: 5, unique_clicks: 4 },
        { date: "2026-02-02", sent: 48, contacted: 42, opened: 15, unique_opened: 10, replies: 2, unique_replies: 2, clicks: 3, unique_clicks: 3 },
      ];

      const { calls } = createMockFetch([
        { url: DAILY_ANALYTICS_URL, response: mockJsonResponse(dailyData) },
      ]);

      const result = await service.getDailyAnalytics({
        apiKey: TEST_API_KEY,
        externalCampaignId: TEST_EXTERNAL_ID,
      });

      expect(result).toHaveLength(2);
      expect(result[0].date).toBe("2026-02-01");
      expect(result[0].unique_opened).toBe(8);

      const call = calls()[0];
      expect(call.url).toContain(`campaign_id=${TEST_EXTERNAL_ID}`);
    });

    it("includes date range query params when provided", async () => {
      const { calls } = createMockFetch([
        { url: DAILY_ANALYTICS_URL, response: mockJsonResponse([]) },
      ]);

      await service.getDailyAnalytics({
        apiKey: TEST_API_KEY,
        externalCampaignId: TEST_EXTERNAL_ID,
        startDate: "2026-02-01",
        endDate: "2026-02-10",
      });

      const call = calls()[0];
      expect(call.url).toContain("start_date=2026-02-01");
      expect(call.url).toContain("end_date=2026-02-10");
    });

    it("throws error when externalCampaignId is empty", async () => {
      await expect(
        service.getDailyAnalytics({
          apiKey: TEST_API_KEY,
          externalCampaignId: "",
        })
      ).rejects.toThrow("Esta campanha ainda não foi exportada");
    });
  });

  // ==============================================
  // Task 6.4: syncAnalytics
  // ==============================================

  describe("syncAnalytics", () => {
    it("orchestrates analytics + daily, returns SyncResult (6.4)", async () => {
      const apiResponse = createMockInstantlyAnalyticsResponse();
      const dailyData = [
        { date: "2026-02-01", sent: 50, contacted: 45, opened: 12, unique_opened: 8, replies: 3, unique_replies: 3, clicks: 5, unique_clicks: 4 },
      ];

      createMockFetch([
        { url: ANALYTICS_URL, response: mockJsonResponse([apiResponse]) },
        { url: DAILY_ANALYTICS_URL, response: mockJsonResponse(dailyData) },
      ]);

      const result = await service.syncAnalytics({
        apiKey: TEST_API_KEY,
        externalCampaignId: TEST_EXTERNAL_ID,
      });

      expect(result.source).toBe("polling");
      expect(result.lastSyncAt).toBeDefined();
      expect(result.analytics.totalSent).toBe(1200);
      expect(result.dailyAnalytics).toHaveLength(1);
      expect(result.campaignId).toBe(TEST_EXTERNAL_ID);
    });
  });

  // ==============================================
  // Task 6.5: getLeadTracking — success
  // ==============================================

  describe("getLeadTracking", () => {
    it("fetches leads and returns LeadTracking[] (6.5)", async () => {
      const lead1 = createMockInstantlyLeadEntry({ email: "a@x.com", email_open_count: 3 });
      const lead2 = createMockInstantlyLeadEntry({ email: "b@x.com", email_open_count: 1 });

      const { calls } = createMockFetch([
        {
          url: LEADS_LIST_URL,
          method: "POST",
          response: mockJsonResponse({ items: [lead1, lead2], next_starting_after: undefined }),
        },
      ]);

      const result = await service.getLeadTracking({
        apiKey: TEST_API_KEY,
        externalCampaignId: TEST_EXTERNAL_ID,
      });

      expect(result).toHaveLength(2);
      expect(result[0].leadEmail).toBe("a@x.com");
      expect(result[0].openCount).toBe(3);
      expect(result[1].leadEmail).toBe("b@x.com");

      const call = calls()[0];
      expect(call.method).toBe("POST");
      expect(call.body).toEqual({ campaign: TEST_EXTERNAL_ID, limit: 100 });
    });

    // Task 6.6: pagination with cursor
    it("paginates through multiple pages (6.6)", async () => {
      const page1Lead = createMockInstantlyLeadEntry({ email: "a@x.com" });
      const page2Lead = createMockInstantlyLeadEntry({ email: "b@x.com" });

      let callCount = 0;

      createMockFetch([
        {
          url: LEADS_LIST_URL,
          method: "POST",
          response: {
            ok: true,
            status: 200,
            json: () => {
              callCount++;
              if (callCount === 1) {
                return Promise.resolve({
                  items: [page1Lead],
                  next_starting_after: "cursor-page-2",
                });
              }
              return Promise.resolve({
                items: [page2Lead],
                next_starting_after: undefined,
              });
            },
            text: () => Promise.resolve(""),
          },
        },
      ]);

      const result = await service.getLeadTracking({
        apiKey: TEST_API_KEY,
        externalCampaignId: TEST_EXTERNAL_ID,
      });

      expect(result).toHaveLength(2);
      expect(result[0].leadEmail).toBe("a@x.com");
      expect(result[1].leadEmail).toBe("b@x.com");
    });

    it("throws error when externalCampaignId is empty", async () => {
      await expect(
        service.getLeadTracking({
          apiKey: TEST_API_KEY,
          externalCampaignId: "",
        })
      ).rejects.toThrow("Esta campanha ainda não foi exportada");
    });
  });

  // ==============================================
  // Task 6.7-6.10: Error handling
  // ==============================================

  describe("error handling", () => {
    // 6.7: Network error → Portuguese message
    it("translates network errors to Portuguese (6.7)", async () => {
      createMockFetch([
        { url: ANALYTICS_URL, response: mockNetworkError("Failed to fetch") },
      ]);

      try {
        await service.getCampaignAnalytics({
          apiKey: TEST_API_KEY,
          externalCampaignId: TEST_EXTERNAL_ID,
        });
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(ExternalServiceError);
        const err = error as ExternalServiceError;
        expect(err.userMessage).toBe(ERROR_MESSAGES.NETWORK_ERROR);
      }
    });

    // 6.8: Timeout → retry 1x via base-service
    it("retries once on timeout and succeeds on second attempt (6.8)", async () => {
      const apiResponse = createMockInstantlyAnalyticsResponse();
      const abortError = new Error("The operation was aborted");
      abortError.name = "AbortError";

      // Set up base mock for successful response (used on retry)
      createMockFetch([
        { url: ANALYTICS_URL, response: mockJsonResponse([apiResponse]) },
      ]);

      // Wrap to inject AbortError on first call (simulates timeout at fetch level)
      const baseMock = global.fetch;
      let callCount = 0;
      global.fetch = ((...args: Parameters<typeof fetch>) => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(abortError);
        }
        return baseMock(...args);
      }) as typeof fetch;

      const result = await service.getCampaignAnalytics({
        apiKey: TEST_API_KEY,
        externalCampaignId: TEST_EXTERNAL_ID,
      });

      expect(callCount).toBe(2);
      expect(result.totalSent).toBe(1200);
      expect(result.totalOpens).toBe(180);
    });

    // 6.9: 401 → "API key inválida ou expirada."
    it("translates 401 to Portuguese message (6.9)", async () => {
      createMockFetch([
        { url: ANALYTICS_URL, response: mockErrorResponse(401, "Unauthorized") },
      ]);

      try {
        await service.getCampaignAnalytics({
          apiKey: "invalid-key",
          externalCampaignId: TEST_EXTERNAL_ID,
        });
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(ExternalServiceError);
        const err = error as ExternalServiceError;
        expect(err.statusCode).toBe(401);
        expect(err.userMessage).toBe(ERROR_MESSAGES.UNAUTHORIZED);
      }
    });

    // 6.10: 429 → "Limite de requisições atingido."
    it("translates 429 to Portuguese message (6.10)", async () => {
      createMockFetch([
        { url: ANALYTICS_URL, response: mockErrorResponse(429, "Rate Limited") },
      ]);

      try {
        await service.getCampaignAnalytics({
          apiKey: TEST_API_KEY,
          externalCampaignId: TEST_EXTERNAL_ID,
        });
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(ExternalServiceError);
        const err = error as ExternalServiceError;
        expect(err.statusCode).toBe(429);
        expect(err.userMessage).toBe(ERROR_MESSAGES.RATE_LIMITED);
      }
    });

    it("translates 500 to generic Portuguese error", async () => {
      createMockFetch([
        { url: ANALYTICS_URL, response: mockErrorResponse(500, "Server Error") },
      ]);

      try {
        await service.getCampaignAnalytics({
          apiKey: TEST_API_KEY,
          externalCampaignId: TEST_EXTERNAL_ID,
        });
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(ExternalServiceError);
        const err = error as ExternalServiceError;
        expect(err.statusCode).toBe(500);
      }
    });
  });

  // ==============================================
  // testConnection stub
  // ==============================================

  describe("testConnection", () => {
    it("throws 501 directing to InstantlyService", async () => {
      await expect(service.testConnection("key")).rejects.toThrow(
        "Use InstantlyService.testConnection"
      );
    });
  });
});
