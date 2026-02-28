/**
 * Tests for POST /api/monitoring/process-batch
 * Story 13.3: Edge Function de Verificação Semanal — AC #12
 *
 * Tests: auth validation, state machine (idle→running→completed),
 * batch processing, post detection, Apify failure graceful, no config fallback.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createChainBuilder } from "../../../../../helpers/mock-supabase";

// ==============================================
// MOCKS
// ==============================================

const mockFrom = vi.fn();

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    from: mockFrom,
  })),
}));

const mockFetchLinkedInPosts = vi.fn();
vi.mock("@/lib/services/apify", () => ({
  ApifyService: class MockApifyService {
    fetchLinkedInPosts = mockFetchLinkedInPosts;
  },
}));

const mockDecryptApiKey = vi.fn(() => "decrypted-apify-key");
vi.mock("@/lib/crypto/encryption", () => ({
  decryptApiKey: (...args: unknown[]) => mockDecryptApiKey(...args),
}));

import { POST } from "@/app/api/monitoring/process-batch/route";

// ==============================================
// ENV SETUP
// ==============================================

const CRON_SECRET = "test-cron-secret-123";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("MONITORING_CRON_SECRET", CRON_SECRET);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");
  mockDecryptApiKey.mockReturnValue("decrypted-apify-key");
});

// ==============================================
// HELPERS
// ==============================================

function createRequest(authHeader?: string): NextRequest {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (authHeader) {
    headers["Authorization"] = authHeader;
  }
  return new NextRequest("http://localhost/api/monitoring/process-batch", {
    method: "POST",
    headers,
  });
}

function createMockConfig(overrides: Record<string, unknown> = {}) {
  return {
    id: "config-1",
    tenant_id: "tenant-1",
    frequency: "weekly",
    max_monitored_leads: 100,
    last_run_at: null,
    next_run_at: "2020-01-01T00:00:00Z", // past date = due
    run_status: "idle",
    run_cursor: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function createMockLead(overrides: Record<string, unknown> = {}) {
  return {
    id: "lead-1",
    linkedin_url: "https://linkedin.com/in/johndoe",
    linkedin_posts_cache: null,
    tenant_id: "tenant-1",
    ...overrides,
  };
}

// ==============================================
// TESTS
// ==============================================

describe("POST /api/monitoring/process-batch", () => {
  // ==============================================
  // AUTH VALIDATION (AC #12 — 6.5)
  // ==============================================

  describe("Auth validation", () => {
    it("should return 401 when no authorization header", async () => {
      const req = createRequest();
      const response = await POST(req);

      expect(response.status).toBe(401);
      const json = await response.json();
      expect(json.error).toBe("Unauthorized");
    });

    it("should return 401 when authorization header is invalid", async () => {
      const req = createRequest("Bearer wrong-secret");
      const response = await POST(req);

      expect(response.status).toBe(401);
      const json = await response.json();
      expect(json.error).toBe("Unauthorized");
    });

    it("should return 401 when bearer prefix is missing", async () => {
      const req = createRequest(CRON_SECRET);
      const response = await POST(req);

      expect(response.status).toBe(401);
    });
  });

  // ==============================================
  // NO CONFIG (AC #12 — 6.6)
  // ==============================================

  describe("No monitoring config", () => {
    it("should return no_config when no configs and no monitored leads", async () => {
      const configChain = createChainBuilder({ data: [], error: null });
      const leadsCountChain = createChainBuilder({
        data: null,
        error: null,
      });
      // Override count property for the thenable response
      leadsCountChain.then = (resolve) =>
        Promise.resolve({ data: null, error: null, count: 0 }).then(
          resolve as (value: unknown) => unknown
        );

      mockFrom.mockImplementation((table: string) => {
        if (table === "monitoring_configs") return configChain;
        if (table === "leads") return leadsCountChain;
        return createChainBuilder();
      });

      const req = createRequest(`Bearer ${CRON_SECRET}`);
      const response = await POST(req);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.status).toBe("no_config");
    });
  });

  // ==============================================
  // NO RUN DUE (AC #12 — 6.3)
  // ==============================================

  describe("No run due", () => {
    it("should return no_run_due when idle and next_run_at is in the future", async () => {
      const futureDate = new Date(
        Date.now() + 7 * 24 * 60 * 60 * 1000
      ).toISOString();
      const configChain = createChainBuilder({
        data: [
          createMockConfig({
            run_status: "idle",
            next_run_at: futureDate,
          }),
        ],
        error: null,
      });

      mockFrom.mockImplementation((table: string) => {
        if (table === "monitoring_configs") return configChain;
        return createChainBuilder();
      });

      const req = createRequest(`Bearer ${CRON_SECRET}`);
      const response = await POST(req);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.status).toBe("no_run_due");
    });
  });

  // ==============================================
  // RUN COMPLETION (AC #12 — 6.3)
  // ==============================================

  describe("Run completion", () => {
    it("should return run_completed when no monitored leads remain", async () => {
      const configData = createMockConfig({
        run_status: "running",
        run_cursor: "lead-99",
      });
      const configChain = createChainBuilder({
        data: [configData],
        error: null,
      });
      const leadsChain = createChainBuilder({ data: [], error: null });

      mockFrom.mockImplementation((table: string) => {
        if (table === "monitoring_configs") return configChain;
        if (table === "leads") return leadsChain;
        return createChainBuilder();
      });

      const req = createRequest(`Bearer ${CRON_SECRET}`);
      const response = await POST(req);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.status).toBe("run_completed");
      expect(json.leadsProcessed).toBe(0);
    });
  });

  // ==============================================
  // NO APIFY KEY (AC #12 — edge case)
  // ==============================================

  describe("No Apify key", () => {
    it("should return no_apify_key when tenant has no Apify config", async () => {
      const configData = createMockConfig({ run_status: "running" });
      const configChain = createChainBuilder({
        data: [configData],
        error: null,
      });
      const leadsData = [createMockLead()];
      const leadsChain = createChainBuilder({
        data: leadsData,
        error: null,
      });
      // api_configs returns null (no apify key)
      const apiConfigChain = createChainBuilder({
        data: null,
        error: { code: "PGRST116" },
      });

      mockFrom.mockImplementation((table: string) => {
        if (table === "monitoring_configs") return configChain;
        if (table === "leads") return leadsChain;
        if (table === "api_configs") return apiConfigChain;
        return createChainBuilder();
      });

      const req = createRequest(`Bearer ${CRON_SECRET}`);
      const response = await POST(req);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.status).toBe("no_apify_key");
    });
  });

  // ==============================================
  // NEW RUN: idle → running (AC #12 — 6.3)
  // ==============================================

  describe("New run (idle → running)", () => {
    it("should start new run and process batch when next_run_at is past", async () => {
      const configData = createMockConfig({
        run_status: "idle",
        next_run_at: "2020-01-01T00:00:00Z",
      });
      const configChain = createChainBuilder({
        data: [configData],
        error: null,
      });
      const leadsData = [
        createMockLead({
          id: "lead-1",
          linkedin_url: "https://linkedin.com/in/john",
        }),
        createMockLead({
          id: "lead-2",
          linkedin_url: "https://linkedin.com/in/jane",
        }),
      ];
      const leadsChain = createChainBuilder({
        data: leadsData,
        error: null,
      });
      const apiConfigChain = createChainBuilder({
        data: { encrypted_key: "enc-key" },
        error: null,
      });

      mockFrom.mockImplementation((table: string) => {
        if (table === "monitoring_configs") return configChain;
        if (table === "leads") return leadsChain;
        if (table === "api_configs") return apiConfigChain;
        return createChainBuilder();
      });

      mockFetchLinkedInPosts.mockResolvedValue({
        success: true,
        posts: [
          {
            postUrl: "https://linkedin.com/posts/new-1",
            text: "New post!",
            publishedAt: "2026-02-20",
            likesCount: 5,
            commentsCount: 1,
          },
        ],
        profileUrl: "https://linkedin.com/in/john",
        fetchedAt: "2026-02-27T10:00:00Z",
      });

      const req = createRequest(`Bearer ${CRON_SECRET}`);
      const response = await POST(req);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.status).toBe("batch_processed");
      expect(json.leadsProcessed).toBe(2);
      expect(json.newPostsFound).toBe(2); // both leads have null cache → all posts are new
      expect(json.cursor).toBe("lead-2");
    });
  });

  // ==============================================
  // POST DETECTION (AC #12 — 6.4)
  // ==============================================

  describe("Post detection", () => {
    it("should detect new posts when cache has different URLs", async () => {
      const cachedPosts = {
        posts: [
          {
            postUrl: "https://linkedin.com/posts/old-1",
            text: "Old",
            publishedAt: "2026-01-01",
            likesCount: 1,
            commentsCount: 0,
          },
        ],
        fetchedAt: "2026-01-01T00:00:00Z",
        profileUrl: "https://linkedin.com/in/john",
      };

      const configData = createMockConfig({ run_status: "running" });
      const configChain = createChainBuilder({
        data: [configData],
        error: null,
      });
      const leadsData = [
        createMockLead({
          id: "lead-1",
          linkedin_posts_cache: cachedPosts,
        }),
      ];
      const leadsChain = createChainBuilder({
        data: leadsData,
        error: null,
      });
      const apiConfigChain = createChainBuilder({
        data: { encrypted_key: "enc" },
        error: null,
      });

      mockFrom.mockImplementation((table: string) => {
        if (table === "monitoring_configs") return configChain;
        if (table === "leads") return leadsChain;
        if (table === "api_configs") return apiConfigChain;
        return createChainBuilder();
      });

      mockFetchLinkedInPosts.mockResolvedValue({
        success: true,
        posts: [
          {
            postUrl: "https://linkedin.com/posts/old-1",
            text: "Old",
            publishedAt: "2026-01-01",
            likesCount: 1,
            commentsCount: 0,
          },
          {
            postUrl: "https://linkedin.com/posts/new-1",
            text: "New!",
            publishedAt: "2026-02-27",
            likesCount: 10,
            commentsCount: 3,
          },
        ],
        profileUrl: "https://linkedin.com/in/john",
        fetchedAt: "2026-02-27T10:00:00Z",
      });

      const req = createRequest(`Bearer ${CRON_SECRET}`);
      const response = await POST(req);
      const json = await response.json();

      expect(json.status).toBe("batch_processed");
      expect(json.newPostsFound).toBe(1);
      expect(json.leadsProcessed).toBe(1);
    });

    it("should find zero new posts when all posts already cached", async () => {
      const cachedPosts = {
        posts: [
          {
            postUrl: "https://linkedin.com/posts/1",
            text: "Post",
            publishedAt: "2026-01-01",
            likesCount: 1,
            commentsCount: 0,
          },
        ],
        fetchedAt: "2026-01-01T00:00:00Z",
        profileUrl: "https://linkedin.com/in/john",
      };

      const configData = createMockConfig({ run_status: "running" });
      const configChain = createChainBuilder({
        data: [configData],
        error: null,
      });
      const leadsData = [
        createMockLead({
          id: "lead-1",
          linkedin_posts_cache: cachedPosts,
        }),
      ];
      const leadsChain = createChainBuilder({
        data: leadsData,
        error: null,
      });
      const apiConfigChain = createChainBuilder({
        data: { encrypted_key: "enc" },
        error: null,
      });

      mockFrom.mockImplementation((table: string) => {
        if (table === "monitoring_configs") return configChain;
        if (table === "leads") return leadsChain;
        if (table === "api_configs") return apiConfigChain;
        return createChainBuilder();
      });

      mockFetchLinkedInPosts.mockResolvedValue({
        success: true,
        posts: [
          {
            postUrl: "https://linkedin.com/posts/1",
            text: "Post",
            publishedAt: "2026-01-01",
            likesCount: 1,
            commentsCount: 0,
          },
        ],
        profileUrl: "https://linkedin.com/in/john",
        fetchedAt: "2026-02-27T10:00:00Z",
      });

      const req = createRequest(`Bearer ${CRON_SECRET}`);
      const response = await POST(req);
      const json = await response.json();

      expect(json.status).toBe("batch_processed");
      expect(json.newPostsFound).toBe(0);
    });

    it("should treat null cache as empty — all posts are new", async () => {
      const configData = createMockConfig({ run_status: "running" });
      const configChain = createChainBuilder({
        data: [configData],
        error: null,
      });
      const leadsData = [
        createMockLead({ id: "lead-1", linkedin_posts_cache: null }),
      ];
      const leadsChain = createChainBuilder({
        data: leadsData,
        error: null,
      });
      const apiConfigChain = createChainBuilder({
        data: { encrypted_key: "enc" },
        error: null,
      });

      mockFrom.mockImplementation((table: string) => {
        if (table === "monitoring_configs") return configChain;
        if (table === "leads") return leadsChain;
        if (table === "api_configs") return apiConfigChain;
        return createChainBuilder();
      });

      mockFetchLinkedInPosts.mockResolvedValue({
        success: true,
        posts: [
          {
            postUrl: "https://linkedin.com/posts/1",
            text: "Post 1",
            publishedAt: "2026-02-27",
            likesCount: 5,
            commentsCount: 1,
          },
          {
            postUrl: "https://linkedin.com/posts/2",
            text: "Post 2",
            publishedAt: "2026-02-26",
            likesCount: 3,
            commentsCount: 0,
          },
        ],
        profileUrl: "https://linkedin.com/in/john",
        fetchedAt: "2026-02-27T10:00:00Z",
      });

      const req = createRequest(`Bearer ${CRON_SECRET}`);
      const response = await POST(req);
      const json = await response.json();

      expect(json.status).toBe("batch_processed");
      expect(json.newPostsFound).toBe(2);
    });
  });

  // ==============================================
  // APIFY FAILURE GRACEFUL (AC #12 — 6.3)
  // ==============================================

  describe("Apify failure graceful", () => {
    it("should continue processing other leads when Apify fails for one", async () => {
      const configData = createMockConfig({ run_status: "running" });
      const configChain = createChainBuilder({
        data: [configData],
        error: null,
      });
      const leadsData = [
        createMockLead({
          id: "lead-1",
          linkedin_url: "https://linkedin.com/in/john",
        }),
        createMockLead({
          id: "lead-2",
          linkedin_url: "https://linkedin.com/in/jane",
        }),
      ];
      const leadsChain = createChainBuilder({
        data: leadsData,
        error: null,
      });
      const apiConfigChain = createChainBuilder({
        data: { encrypted_key: "enc" },
        error: null,
      });

      mockFrom.mockImplementation((table: string) => {
        if (table === "monitoring_configs") return configChain;
        if (table === "leads") return leadsChain;
        if (table === "api_configs") return apiConfigChain;
        return createChainBuilder();
      });

      // First lead fails, second succeeds
      mockFetchLinkedInPosts
        .mockResolvedValueOnce({
          success: false,
          posts: [],
          error: "Apify actor timeout",
          profileUrl: "https://linkedin.com/in/john",
          fetchedAt: "2026-02-27T10:00:00Z",
        })
        .mockResolvedValueOnce({
          success: true,
          posts: [
            {
              postUrl: "https://linkedin.com/posts/new-1",
              text: "New!",
              publishedAt: "2026-02-27",
              likesCount: 5,
              commentsCount: 1,
            },
          ],
          profileUrl: "https://linkedin.com/in/jane",
          fetchedAt: "2026-02-27T10:00:00Z",
        });

      const req = createRequest(`Bearer ${CRON_SECRET}`);
      const response = await POST(req);
      const json = await response.json();

      expect(json.status).toBe("batch_processed");
      expect(json.leadsProcessed).toBe(2);
      expect(json.newPostsFound).toBe(1);
      expect(json.errors).toHaveLength(1);
      expect(json.errors[0].leadId).toBe("lead-1");
    });

    it("should handle lead without linkedin_url gracefully", async () => {
      const configData = createMockConfig({ run_status: "running" });
      const configChain = createChainBuilder({
        data: [configData],
        error: null,
      });
      const leadsData = [
        createMockLead({ id: "lead-1", linkedin_url: null }),
      ];
      const leadsChain = createChainBuilder({
        data: leadsData,
        error: null,
      });
      const apiConfigChain = createChainBuilder({
        data: { encrypted_key: "enc" },
        error: null,
      });

      mockFrom.mockImplementation((table: string) => {
        if (table === "monitoring_configs") return configChain;
        if (table === "leads") return leadsChain;
        if (table === "api_configs") return apiConfigChain;
        return createChainBuilder();
      });

      const req = createRequest(`Bearer ${CRON_SECRET}`);
      const response = await POST(req);
      const json = await response.json();

      expect(json.status).toBe("batch_processed");
      expect(json.errors).toHaveLength(1);
      expect(json.errors[0].error).toBe("Lead sem linkedin_url");
      expect(mockFetchLinkedInPosts).not.toHaveBeenCalled();
    });
  });

  // ==============================================
  // INTERNAL ERROR (try-catch handler)
  // ==============================================

  describe("Internal error handling", () => {
    it("should return 500 with error message on unexpected exception", async () => {
      mockFrom.mockImplementation(() => {
        throw new Error("Supabase connection failed");
      });

      const req = createRequest(`Bearer ${CRON_SECRET}`);
      const response = await POST(req);
      const json = await response.json();

      expect(response.status).toBe(500);
      expect(json.error).toBe("Supabase connection failed");
    });
  });
});
