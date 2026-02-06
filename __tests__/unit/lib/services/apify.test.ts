/**
 * Unit tests for Apify Service
 * Story: 6.5.1 - Apify Integration Configuration
 * Story: 6.5.2 - Apify LinkedIn Posts Service
 *
 * Tests:
 * - testConnection returns success on 200
 * - testConnection returns error on 401 (invalid token)
 * - testConnection returns error on 429 (rate limit)
 * - Includes latency in result
 * - Uses correct API endpoint with token
 * - URL encodes special characters in token
 * - fetchLinkedInPosts success case
 * - fetchLinkedInPosts empty results case
 * - fetchLinkedInPosts error handling (invalid profile, no posts, timeout, actor failure)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ApifyService, APIFY_ERROR_MESSAGES } from "@/lib/services/apify";
import { ERROR_MESSAGES } from "@/lib/services/base-service";
import type { ApifyLinkedInPostInput } from "@/types/apify";
import {
  createMockFetch,
  mockJsonResponse,
  mockErrorResponse,
  mockNetworkError,
  restoreFetch,
} from "../../../helpers/mock-fetch";

// Shared mock object - must be defined before vi.mock for proper hoisting
const apifyMocks = {
  actorCall: vi.fn(),
  listItems: vi.fn(),
};

// Mock ApifyClient with controlled mock functions
vi.mock("apify-client", () => {
  return {
    ApifyClient: class MockApifyClient {
      actor() {
        return {
          call: apifyMocks.actorCall,
        };
      }
      dataset() {
        return {
          listItems: apifyMocks.listItems,
        };
      }
    },
  };
});

describe("ApifyService", () => {
  let service: ApifyService;

  beforeEach(() => {
    service = new ApifyService();
  });

  afterEach(() => {
    restoreFetch();
    vi.restoreAllMocks();
  });

  describe("testConnection", () => {
    const actorData = {
      id: "Wpp1BZ6yGWjySadk3",
      name: "supreme_coder/linkedin-post",
      isPublic: true,
    };

    it("returns success on 200 response", async () => {
      createMockFetch([
        { url: /apify\.com/, response: mockJsonResponse({ data: actorData }) },
      ]);

      const result = await service.testConnection("test-api-token");

      expect(result.success).toBe(true);
      expect(result.message).toBe(ERROR_MESSAGES.SUCCESS);
      expect(result.testedAt).toBeDefined();
      expect(typeof result.latencyMs).toBe("number");
    });

    it("returns error on 401 (invalid token)", async () => {
      createMockFetch([
        { url: /apify\.com/, response: mockErrorResponse(401) },
      ]);

      const result = await service.testConnection("invalid-token");

      expect(result.success).toBe(false);
      expect(result.message).toContain("inválida");
      expect(result.testedAt).toBeDefined();
    });

    it("returns error on 403 (forbidden)", async () => {
      createMockFetch([
        { url: /apify\.com/, response: mockErrorResponse(403) },
      ]);

      const result = await service.testConnection("test-token");

      expect(result.success).toBe(false);
      expect(result.message).toContain("Acesso negado");
    });

    it("returns error on 429 (rate limit)", async () => {
      createMockFetch([
        { url: /apify\.com/, response: mockErrorResponse(429) },
      ]);

      const result = await service.testConnection("test-token");

      expect(result.success).toBe(false);
      expect(result.message).toContain("Limite");
    });

    it("includes latency in successful result", async () => {
      createMockFetch([
        { url: /apify\.com/, response: mockJsonResponse({ data: actorData }) },
      ]);

      const result = await service.testConnection("test-token");

      expect(result.success).toBe(true);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it("uses correct API endpoint with token", async () => {
      const { mock } = createMockFetch([
        { url: /apify\.com/, response: mockJsonResponse({ data: actorData }) },
      ]);

      await service.testConnection("my-test-token");

      expect(mock).toHaveBeenCalledWith(
        expect.stringContaining("api.apify.com"),
        expect.any(Object)
      );
      expect(mock).toHaveBeenCalledWith(
        expect.stringContaining("Wpp1BZ6yGWjySadk3"),
        expect.any(Object)
      );
      expect(mock).toHaveBeenCalledWith(
        expect.stringContaining("token=my-test-token"),
        expect.any(Object)
      );
    });

    it("URL encodes special characters in token", async () => {
      const { calls } = createMockFetch([
        { url: /apify\.com/, response: mockJsonResponse({ data: actorData }) },
      ]);

      // Token with special characters that need URL encoding
      await service.testConnection("token+with=special&chars");

      // Verify the URL was called with encoded characters
      expect(calls()[0].url).toContain("token%2Bwith%3Dspecial%26chars");
      expect(calls()[0].url).not.toContain("token+with=special&chars");
    });

    it("handles network errors", async () => {
      createMockFetch([
        { url: /apify\.com/, response: mockNetworkError("Failed to fetch") },
      ]);

      const result = await service.testConnection("test-token");

      expect(result.success).toBe(false);
      expect(result.message).toBeDefined();
    });

    it("handles timeout errors", async () => {
      // AbortError needs specific error name — keep direct mock for this edge case
      const abortError = new Error("Aborted");
      abortError.name = "AbortError";
      global.fetch = vi.fn().mockRejectedValue(abortError);

      const result = await service.testConnection("test-token");

      expect(result.success).toBe(false);
      expect(result.message).toContain("Tempo limite");
    });

    it("handles unknown errors gracefully", async () => {
      // Generic Error (not TypeError) — keep direct mock for this edge case
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

  describe("fetchLinkedInPosts", () => {
    const validLinkedInUrl = "https://www.linkedin.com/in/john-doe/";
    const validApiKey = "apify_test_token_123";

    const mockPostData = [
      {
        postUrl: "https://www.linkedin.com/feed/update/urn:li:activity:123",
        text: "Excited to share my new project!",
        publishedAt: "2026-01-15T10:30:00.000Z",
        likesCount: 42,
        commentsCount: 5,
        repostsCount: 3,
        authorName: "John Doe",
        authorHeadline: "CEO at Example Corp",
      },
      {
        postUrl: "https://www.linkedin.com/feed/update/urn:li:activity:456",
        text: "Great insights from the conference.",
        publishedAt: "2026-01-10T14:00:00.000Z",
        likesCount: 28,
        commentsCount: 3,
      },
    ];

    let linkedInService: ApifyService;

    beforeEach(() => {
      // Reset module-level mocks before each test
      apifyMocks.actorCall.mockReset();
      apifyMocks.listItems.mockReset();

      // Create fresh service instance
      linkedInService = new ApifyService();
    });

    describe("success cases", () => {
      it("returns posts on successful actor run (AC #1, #2, #3)", async () => {
        apifyMocks.actorCall.mockResolvedValue({
          id: "run-123",
          status: "SUCCEEDED",
          defaultDatasetId: "dataset-123",
        });
        apifyMocks.listItems.mockResolvedValue({ items: mockPostData });

        const result = await linkedInService.fetchLinkedInPosts(validApiKey, validLinkedInUrl);

        expect(result.success).toBe(true);
        expect(result.posts).toHaveLength(2);
        expect(result.posts[0].postUrl).toBe(mockPostData[0].postUrl);
        expect(result.posts[0].text).toBe(mockPostData[0].text);
        expect(result.posts[0].likesCount).toBe(42);
        expect(result.profileUrl).toBe(validLinkedInUrl);
        expect(result.fetchedAt).toBeDefined();
        expect(result.error).toBeUndefined();
      });

      it("uses correct actor parameters (AC #2)", async () => {
        apifyMocks.actorCall.mockResolvedValue({
          id: "run-123",
          status: "SUCCEEDED",
          defaultDatasetId: "dataset-123",
        });
        apifyMocks.listItems.mockResolvedValue({ items: [] });

        await linkedInService.fetchLinkedInPosts(validApiKey, validLinkedInUrl, 5);

        expect(apifyMocks.actorCall).toHaveBeenCalledWith(
          expect.objectContaining({
            urls: [validLinkedInUrl],
            limitPerSource: 5,
            deepScrape: true,
            rawData: false,
          } as ApifyLinkedInPostInput),
          expect.objectContaining({
            waitSecs: 60,
          })
        );
      });

      it("uses default limit of 3 posts (AC #2)", async () => {
        apifyMocks.actorCall.mockResolvedValue({
          id: "run-123",
          status: "SUCCEEDED",
          defaultDatasetId: "dataset-123",
        });
        apifyMocks.listItems.mockResolvedValue({ items: [] });

        await linkedInService.fetchLinkedInPosts(validApiKey, validLinkedInUrl);

        expect(apifyMocks.actorCall).toHaveBeenCalledWith(
          expect.objectContaining({
            limitPerSource: 3,
          }),
          expect.any(Object)
        );
      });

      it("returns empty array for profile with no posts (AC #3)", async () => {
        apifyMocks.actorCall.mockResolvedValue({
          id: "run-123",
          status: "SUCCEEDED",
          defaultDatasetId: "dataset-123",
        });
        apifyMocks.listItems.mockResolvedValue({ items: [] });

        const result = await linkedInService.fetchLinkedInPosts(validApiKey, validLinkedInUrl);

        expect(result.success).toBe(true);
        expect(result.posts).toEqual([]);
        expect(result.error).toBeUndefined();
      });

      it("parses all required post fields (AC #3)", async () => {
        apifyMocks.actorCall.mockResolvedValue({
          id: "run-123",
          status: "SUCCEEDED",
          defaultDatasetId: "dataset-123",
        });
        apifyMocks.listItems.mockResolvedValue({ items: [mockPostData[0]] });

        const result = await linkedInService.fetchLinkedInPosts(validApiKey, validLinkedInUrl);

        const post = result.posts[0];
        expect(post).toMatchObject({
          postUrl: expect.any(String),
          text: expect.any(String),
          publishedAt: expect.any(String),
          likesCount: expect.any(Number),
          commentsCount: expect.any(Number),
        });
      });

      it("handles optional post fields with defaults (AC #3)", async () => {
        apifyMocks.actorCall.mockResolvedValue({
          id: "run-123",
          status: "SUCCEEDED",
          defaultDatasetId: "dataset-123",
        });
        apifyMocks.listItems.mockResolvedValue({
          items: [
            {
              postUrl: "https://linkedin.com/post/1",
              text: "Post without optional fields",
              publishedAt: "2026-01-20T00:00:00.000Z",
              // Missing likesCount, commentsCount, repostsCount, etc.
            },
          ],
        });

        const result = await linkedInService.fetchLinkedInPosts(validApiKey, validLinkedInUrl);

        expect(result.success).toBe(true);
        expect(result.posts[0].likesCount).toBe(0);
        expect(result.posts[0].commentsCount).toBe(0);
        expect(result.posts[0].repostsCount).toBeUndefined();
      });

      it("handles malformed numeric fields without NaN (AC #3)", async () => {
        apifyMocks.actorCall.mockResolvedValue({
          id: "run-123",
          status: "SUCCEEDED",
          defaultDatasetId: "dataset-123",
        });
        apifyMocks.listItems.mockResolvedValue({
          items: [
            {
              postUrl: "https://linkedin.com/post/1",
              text: "Post with invalid numeric fields",
              publishedAt: "2026-01-20T00:00:00.000Z",
              likesCount: "not-a-number",
              commentsCount: undefined,
              repostsCount: "abc",
            },
          ],
        });

        const result = await linkedInService.fetchLinkedInPosts(validApiKey, validLinkedInUrl);

        expect(result.success).toBe(true);
        expect(result.posts[0].likesCount).toBe(0);
        expect(result.posts[0].commentsCount).toBe(0);
        expect(result.posts[0].repostsCount).toBe(0);
        expect(Number.isNaN(result.posts[0].likesCount)).toBe(false);
      });
    });

    describe("URL validation (AC #4)", () => {
      it("returns error for invalid URL format", async () => {
        const result = await linkedInService.fetchLinkedInPosts(validApiKey, "not-a-valid-url");

        expect(result.success).toBe(false);
        expect(result.error).toBe(APIFY_ERROR_MESSAGES.INVALID_URL);
        expect(result.posts).toEqual([]);
      });

      it("returns error for non-LinkedIn URL", async () => {
        const result = await linkedInService.fetchLinkedInPosts(
          validApiKey,
          "https://twitter.com/johndoe"
        );

        expect(result.success).toBe(false);
        expect(result.error).toBe(APIFY_ERROR_MESSAGES.INVALID_URL);
      });

      it("accepts LinkedIn profile URL with /in/ path", async () => {
        apifyMocks.actorCall.mockResolvedValue({
          id: "run-123",
          status: "SUCCEEDED",
          defaultDatasetId: "dataset-123",
        });
        apifyMocks.listItems.mockResolvedValue({ items: [] });

        const result = await linkedInService.fetchLinkedInPosts(
          validApiKey,
          "https://www.linkedin.com/in/jane-doe/"
        );

        expect(result.success).toBe(true);
      });

      it("accepts LinkedIn company URL with /company/ path", async () => {
        apifyMocks.actorCall.mockResolvedValue({
          id: "run-123",
          status: "SUCCEEDED",
          defaultDatasetId: "dataset-123",
        });
        apifyMocks.listItems.mockResolvedValue({ items: [] });

        const result = await linkedInService.fetchLinkedInPosts(
          validApiKey,
          "https://www.linkedin.com/company/example-corp/"
        );

        expect(result.success).toBe(true);
      });

      it("rejects LinkedIn URL with empty profile name", async () => {
        const result = await linkedInService.fetchLinkedInPosts(
          validApiKey,
          "https://www.linkedin.com/in/"
        );

        expect(result.success).toBe(false);
        expect(result.error).toBe(APIFY_ERROR_MESSAGES.INVALID_URL);
      });

      it("rejects LinkedIn URL with invalid path structure", async () => {
        const result = await linkedInService.fetchLinkedInPosts(
          validApiKey,
          "https://www.linkedin.com/some/path/in/other"
        );

        expect(result.success).toBe(false);
        expect(result.error).toBe(APIFY_ERROR_MESSAGES.INVALID_URL);
      });
    });

    describe("error handling (AC #4)", () => {
      it("returns Portuguese error for actor failure", async () => {
        apifyMocks.actorCall.mockResolvedValue({
          id: "run-123",
          status: "FAILED",
          defaultDatasetId: "dataset-123",
        });

        const result = await linkedInService.fetchLinkedInPosts(validApiKey, validLinkedInUrl);

        expect(result.success).toBe(false);
        expect(result.error).toBe(APIFY_ERROR_MESSAGES.ACTOR_FAILURE);
      });

      it("returns Portuguese error for actor timeout (still running)", async () => {
        apifyMocks.actorCall.mockResolvedValue({
          id: "run-123",
          status: "RUNNING",
          defaultDatasetId: "dataset-123",
        });

        const result = await linkedInService.fetchLinkedInPosts(validApiKey, validLinkedInUrl);

        expect(result.success).toBe(false);
        expect(result.error).toBe(APIFY_ERROR_MESSAGES.ACTOR_TIMEOUT);
      });

      it("returns Portuguese error for aborted actor run", async () => {
        apifyMocks.actorCall.mockResolvedValue({
          id: "run-123",
          status: "ABORTED",
          defaultDatasetId: "dataset-123",
        });

        const result = await linkedInService.fetchLinkedInPosts(validApiKey, validLinkedInUrl);

        expect(result.success).toBe(false);
        expect(result.error).toBe(APIFY_ERROR_MESSAGES.ACTOR_FAILURE);
      });

      it("returns Portuguese error for profile not found", async () => {
        apifyMocks.actorCall.mockRejectedValue(new Error("Profile not found - 404"));

        const result = await linkedInService.fetchLinkedInPosts(validApiKey, validLinkedInUrl);

        expect(result.success).toBe(false);
        expect(result.error).toBe(APIFY_ERROR_MESSAGES.PROFILE_NOT_FOUND);
      });

      it("returns Portuguese error for timeout exception", async () => {
        apifyMocks.actorCall.mockRejectedValue(new Error("Request timed out"));

        const result = await linkedInService.fetchLinkedInPosts(validApiKey, validLinkedInUrl);

        expect(result.success).toBe(false);
        expect(result.error).toBe(APIFY_ERROR_MESSAGES.ACTOR_TIMEOUT);
      });

      it("returns Portuguese error for rate limiting (429)", async () => {
        apifyMocks.actorCall.mockRejectedValue(new Error("Rate limit exceeded - 429"));

        const result = await linkedInService.fetchLinkedInPosts(validApiKey, validLinkedInUrl);

        expect(result.success).toBe(false);
        expect(result.error).toBe(ERROR_MESSAGES.RATE_LIMITED);
      });

      it("returns Portuguese error for unauthorized (401)", async () => {
        apifyMocks.actorCall.mockRejectedValue(new Error("Unauthorized - 401"));

        const result = await linkedInService.fetchLinkedInPosts(validApiKey, validLinkedInUrl);

        expect(result.success).toBe(false);
        expect(result.error).toBe(ERROR_MESSAGES.UNAUTHORIZED);
      });

      it("returns generic Portuguese error for unknown errors", async () => {
        apifyMocks.actorCall.mockRejectedValue(new Error("Something unexpected happened"));

        const result = await linkedInService.fetchLinkedInPosts(validApiKey, validLinkedInUrl);

        expect(result.success).toBe(false);
        expect(result.error).toBe(APIFY_ERROR_MESSAGES.GENERIC_ERROR);
      });

      it("returns Portuguese error for no public posts", async () => {
        apifyMocks.actorCall.mockRejectedValue(new Error("No public posts available"));

        const result = await linkedInService.fetchLinkedInPosts(validApiKey, validLinkedInUrl);

        expect(result.success).toBe(false);
        expect(result.error).toBe(APIFY_ERROR_MESSAGES.NO_PUBLIC_POSTS);
      });

      it("returns Portuguese error for private profile", async () => {
        apifyMocks.actorCall.mockRejectedValue(new Error("Private profile - cannot access"));

        const result = await linkedInService.fetchLinkedInPosts(validApiKey, validLinkedInUrl);

        expect(result.success).toBe(false);
        expect(result.error).toBe(APIFY_ERROR_MESSAGES.NO_PUBLIC_POSTS);
      });

      it("returns error for empty apiKey", async () => {
        const result = await linkedInService.fetchLinkedInPosts("", validLinkedInUrl);

        expect(result.success).toBe(false);
        expect(result.error).toBe(APIFY_ERROR_MESSAGES.INVALID_API_KEY);
        expect(apifyMocks.actorCall).not.toHaveBeenCalled();
      });

      it("returns error for whitespace-only apiKey", async () => {
        const result = await linkedInService.fetchLinkedInPosts("   ", validLinkedInUrl);

        expect(result.success).toBe(false);
        expect(result.error).toBe(APIFY_ERROR_MESSAGES.INVALID_API_KEY);
        expect(apifyMocks.actorCall).not.toHaveBeenCalled();
      });
    });

    describe("response structure (AC #3, #5)", () => {
      it("always includes profileUrl and fetchedAt", async () => {
        apifyMocks.actorCall.mockResolvedValue({
          id: "run-123",
          status: "SUCCEEDED",
          defaultDatasetId: "dataset-123",
        });
        apifyMocks.listItems.mockResolvedValue({ items: [] });

        const result = await linkedInService.fetchLinkedInPosts(validApiKey, validLinkedInUrl);

        expect(result.profileUrl).toBe(validLinkedInUrl);
        expect(result.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      });

      it("includes error field only on failure", async () => {
        apifyMocks.actorCall.mockResolvedValue({
          id: "run-123",
          status: "SUCCEEDED",
          defaultDatasetId: "dataset-123",
        });
        apifyMocks.listItems.mockResolvedValue({ items: mockPostData });

        const successResult = await linkedInService.fetchLinkedInPosts(validApiKey, validLinkedInUrl);
        expect(successResult.error).toBeUndefined();

        apifyMocks.actorCall.mockResolvedValue({
          id: "run-456",
          status: "FAILED",
          defaultDatasetId: "dataset-456",
        });

        const failResult = await linkedInService.fetchLinkedInPosts(validApiKey, validLinkedInUrl);
        expect(failResult.error).toBeDefined();
      });

      it("filters out empty posts from results", async () => {
        apifyMocks.actorCall.mockResolvedValue({
          id: "run-123",
          status: "SUCCEEDED",
          defaultDatasetId: "dataset-123",
        });
        apifyMocks.listItems.mockResolvedValue({
          items: [
            mockPostData[0],
            { postUrl: "", text: "" }, // Should be filtered out
            { postUrl: null, text: null }, // Should be filtered out
            mockPostData[1],
          ],
        });

        const result = await linkedInService.fetchLinkedInPosts(validApiKey, validLinkedInUrl);

        expect(result.posts).toHaveLength(2);
      });
    });
  });
});
