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

const mockClassifyPostRelevance = vi.fn();
const mockCalculateClassificationCost = vi.fn(() => 0.00005);
vi.mock("@/lib/utils/relevance-classifier", () => ({
  classifyPostRelevance: (...args: unknown[]) =>
    mockClassifyPostRelevance(...args),
  calculateClassificationCost: (...args: unknown[]) =>
    mockCalculateClassificationCost(...args),
}));

const mockGenerateApproachSuggestion = vi.fn();
const mockCalculateSuggestionCost = vi.fn(() => 0.000195);
vi.mock("@/lib/utils/approach-suggestion", () => ({
  generateApproachSuggestion: (...args: unknown[]) =>
    mockGenerateApproachSuggestion(...args),
  calculateSuggestionCost: (...args: unknown[]) =>
    mockCalculateSuggestionCost(...args),
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
  // Default: all posts classified as relevant (Story 13.4)
  mockClassifyPostRelevance.mockResolvedValue({
    isRelevant: true,
    reasoning: "Post relevante",
    promptTokens: 150,
    completionTokens: 50,
  });
  // Default: suggestion generation succeeds (Story 13.5)
  mockGenerateApproachSuggestion.mockResolvedValue({
    suggestion: "Sugestão de abordagem gerada.",
    promptTokens: 450,
    completionTokens: 150,
  });
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
    first_name: "John",
    last_name: "Doe",
    title: "CTO",
    company_name: "TechCorp",
    industry: "Technology",
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
  // RELEVANCE FILTER (Story 13.4)
  // ==============================================

  describe("Relevance filter (Story 13.4)", () => {
    it("should filter out non-relevant posts — not inserted in lead_insights", async () => {
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

      const insertedInsights: unknown[] = [];
      const insightsChain = createChainBuilder({ data: null, error: null });
      const origInsert = insightsChain.insert;
      insightsChain.insert = vi.fn((data) => {
        insertedInsights.push(data);
        return origInsert(data);
      });

      mockFrom.mockImplementation((table: string) => {
        if (table === "monitoring_configs") return configChain;
        if (table === "leads") return leadsChain;
        if (table === "api_configs") return apiConfigChain;
        if (table === "lead_insights") return insightsChain;
        return createChainBuilder();
      });

      mockFetchLinkedInPosts.mockResolvedValue({
        success: true,
        posts: [
          {
            postUrl: "https://linkedin.com/posts/1",
            text: "Relevant post",
            publishedAt: "2026-02-27",
            likesCount: 5,
            commentsCount: 1,
          },
          {
            postUrl: "https://linkedin.com/posts/2",
            text: "Irrelevant post",
            publishedAt: "2026-02-26",
            likesCount: 3,
            commentsCount: 0,
          },
        ],
        profileUrl: "https://linkedin.com/in/john",
        fetchedAt: "2026-02-27T10:00:00Z",
      });

      // First post relevant, second not
      mockClassifyPostRelevance
        .mockResolvedValueOnce({
          isRelevant: true,
          reasoning: "Post sobre tecnologia",
          promptTokens: 150,
          completionTokens: 50,
        })
        .mockResolvedValueOnce({
          isRelevant: false,
          reasoning: "Post genérico",
          promptTokens: 150,
          completionTokens: 50,
        });

      const req = createRequest(`Bearer ${CRON_SECRET}`);
      const response = await POST(req);
      const json = await response.json();

      expect(json.status).toBe("batch_processed");
      expect(json.newPostsFound).toBe(2); // total new posts (before filter)
      expect(json.postsFiltered).toBe(1);

      // Only 1 insight should be inserted (relevant one)
      expect(insertedInsights).toHaveLength(1);
      const inserted = insertedInsights[0] as Array<Record<string, unknown>>;
      expect(inserted).toHaveLength(1);
      expect(inserted[0].post_url).toBe("https://linkedin.com/posts/1");
    });

    it("should include relevance_reasoning in inserted insights", async () => {
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

      const insertedInsights: unknown[] = [];
      const insightsChain = createChainBuilder({ data: null, error: null });
      const origInsert = insightsChain.insert;
      insightsChain.insert = vi.fn((data) => {
        insertedInsights.push(data);
        return origInsert(data);
      });

      mockFrom.mockImplementation((table: string) => {
        if (table === "monitoring_configs") return configChain;
        if (table === "leads") return leadsChain;
        if (table === "api_configs") return apiConfigChain;
        if (table === "lead_insights") return insightsChain;
        return createChainBuilder();
      });

      mockFetchLinkedInPosts.mockResolvedValue({
        success: true,
        posts: [
          {
            postUrl: "https://linkedin.com/posts/1",
            text: "Post about AI",
            publishedAt: "2026-02-27",
            likesCount: 5,
            commentsCount: 1,
          },
        ],
        profileUrl: "https://linkedin.com/in/john",
        fetchedAt: "2026-02-27T10:00:00Z",
      });

      mockClassifyPostRelevance.mockResolvedValue({
        isRelevant: true,
        reasoning: "Post sobre IA em vendas B2B",
        promptTokens: 150,
        completionTokens: 50,
      });

      const req = createRequest(`Bearer ${CRON_SECRET}`);
      await POST(req);

      expect(insertedInsights).toHaveLength(1);
      const inserted = insertedInsights[0] as Array<Record<string, unknown>>;
      expect(inserted[0].relevance_reasoning).toBe(
        "Post sobre IA em vendas B2B"
      );
    });

    it("should return postsFiltered in MonitoringBatchResult", async () => {
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
          {
            postUrl: "https://linkedin.com/posts/3",
            text: "Post 3",
            publishedAt: "2026-02-25",
            likesCount: 1,
            commentsCount: 0,
          },
        ],
        profileUrl: "https://linkedin.com/in/john",
        fetchedAt: "2026-02-27T10:00:00Z",
      });

      // 1 relevant, 2 filtered
      mockClassifyPostRelevance
        .mockResolvedValueOnce({
          isRelevant: true,
          reasoning: "Relevante",
          promptTokens: 150,
          completionTokens: 50,
        })
        .mockResolvedValueOnce({
          isRelevant: false,
          reasoning: "Genérico",
          promptTokens: 150,
          completionTokens: 50,
        })
        .mockResolvedValueOnce({
          isRelevant: false,
          reasoning: "Off-topic",
          promptTokens: 150,
          completionTokens: 50,
        });

      const req = createRequest(`Bearer ${CRON_SECRET}`);
      const response = await POST(req);
      const json = await response.json();

      expect(json.postsFiltered).toBe(2);
      expect(json.newPostsFound).toBe(3); // total new posts (before filter)
    });

    it("should pass all posts when no KB configured (fallback)", async () => {
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
        // company_profiles and icp_definitions return null → KB not configured
        return createChainBuilder();
      });

      mockFetchLinkedInPosts.mockResolvedValue({
        success: true,
        posts: [
          {
            postUrl: "https://linkedin.com/posts/1",
            text: "Post",
            publishedAt: "2026-02-27",
            likesCount: 5,
            commentsCount: 1,
          },
        ],
        profileUrl: "https://linkedin.com/in/john",
        fetchedAt: "2026-02-27T10:00:00Z",
      });

      // classifyPostRelevance receives kbContext=null → fallback relevant
      mockClassifyPostRelevance.mockResolvedValue({
        isRelevant: true,
        reasoning: "KB não configurado — post aceito por padrão",
        promptTokens: 0,
        completionTokens: 0,
      });

      const req = createRequest(`Bearer ${CRON_SECRET}`);
      const response = await POST(req);
      const json = await response.json();

      expect(json.newPostsFound).toBe(1);
      expect(json.postsFiltered).toBe(0);
    });

    it("should pass all posts when no OpenAI key configured (fallback)", async () => {
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
      // Apify key found, OpenAI key NOT found
      const apifyConfigChain = createChainBuilder({
        data: { encrypted_key: "enc" },
        error: null,
      });
      const openaiConfigChain = createChainBuilder({
        data: null,
        error: { code: "PGRST116" },
      });

      let apiConfigCallCount = 0;
      mockFrom.mockImplementation((table: string) => {
        if (table === "monitoring_configs") return configChain;
        if (table === "leads") return leadsChain;
        if (table === "api_configs") {
          apiConfigCallCount++;
          // First call = getApiKey("apify"), second = getApiKey("openai")
          return apiConfigCallCount === 1
            ? apifyConfigChain
            : openaiConfigChain;
        }
        return createChainBuilder();
      });

      mockFetchLinkedInPosts.mockResolvedValue({
        success: true,
        posts: [
          {
            postUrl: "https://linkedin.com/posts/1",
            text: "Post",
            publishedAt: "2026-02-27",
            likesCount: 5,
            commentsCount: 1,
          },
        ],
        profileUrl: "https://linkedin.com/in/john",
        fetchedAt: "2026-02-27T10:00:00Z",
      });

      // classifyPostRelevance receives openaiKey=null → fallback relevant
      mockClassifyPostRelevance.mockResolvedValue({
        isRelevant: true,
        reasoning: "OpenAI key não configurada — post aceito por padrão",
        promptTokens: 0,
        completionTokens: 0,
      });

      const req = createRequest(`Bearer ${CRON_SECRET}`);
      const response = await POST(req);
      const json = await response.json();

      expect(json.newPostsFound).toBe(1);
      expect(json.postsFiltered).toBe(0);

      // Verify openaiKey=null was passed to classifyPostRelevance (4th arg)
      const callArgs = mockClassifyPostRelevance.mock.calls[0];
      expect(callArgs[3]).toBeNull(); // openaiKey must be null
    });
  });

  // ==============================================
  // SUGGESTION GENERATION (Story 13.5)
  // ==============================================

  describe("Suggestion generation (Story 13.5)", () => {
    function setupBatchWithNewPosts() {
      const configData = createMockConfig({ run_status: "running" });
      const configChain = createChainBuilder({
        data: [configData],
        error: null,
      });
      const leadsData = [
        createMockLead({
          id: "lead-1",
          linkedin_posts_cache: null,
          first_name: "João",
          last_name: "Silva",
          title: "CTO",
          company_name: "TechCorp",
          industry: "Tecnologia",
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
      // KB Context: company_profiles + icp_definitions
      const companyChain = createChainBuilder({
        data: {
          description: "Empresa de automação B2B",
          products_services: "CRM, automação",
          competitive_advantages: "IA integrada",
        },
        error: null,
      });
      const icpChain = createChainBuilder({
        data: { summary: "CTOs de startups" },
        error: null,
      });
      // Tone context
      const toneChain = createChainBuilder({
        data: { preset: "casual", description: "Tom casual", writing_guidelines: null },
        error: null,
      });

      const insertedInsights: unknown[] = [];
      const insightsChain = createChainBuilder({ data: null, error: null });
      const origInsert = insightsChain.insert;
      insightsChain.insert = vi.fn((data) => {
        insertedInsights.push(data);
        return origInsert(data);
      });

      mockFrom.mockImplementation((table: string) => {
        if (table === "monitoring_configs") return configChain;
        if (table === "leads") return leadsChain;
        if (table === "api_configs") return apiConfigChain;
        if (table === "lead_insights") return insightsChain;
        if (table === "company_profiles") return companyChain;
        if (table === "icp_definitions") return icpChain;
        if (table === "tone_of_voice") return toneChain;
        return createChainBuilder();
      });

      mockFetchLinkedInPosts.mockResolvedValue({
        success: true,
        posts: [
          {
            postUrl: "https://linkedin.com/posts/1",
            text: "Post sobre IA em vendas B2B",
            publishedAt: "2026-02-27",
            likesCount: 10,
            commentsCount: 3,
          },
        ],
        profileUrl: "https://linkedin.com/in/john",
        fetchedAt: "2026-02-27T10:00:00Z",
      });

      return { insertedInsights };
    }

    it("gera sugestão para posts relevantes e inclui no insight", async () => {
      const { insertedInsights } = setupBatchWithNewPosts();

      mockClassifyPostRelevance.mockResolvedValue({
        isRelevant: true,
        reasoning: "Post sobre IA",
        promptTokens: 150,
        completionTokens: 50,
      });

      mockGenerateApproachSuggestion.mockResolvedValue({
        suggestion: "O lead postou sobre IA — conectar com produto de automação.",
        promptTokens: 450,
        completionTokens: 150,
      });

      const req = createRequest(`Bearer ${CRON_SECRET}`);
      const response = await POST(req);
      const json = await response.json();

      expect(json.status).toBe("batch_processed");
      expect(json.suggestionsGenerated).toBe(1);

      // Verify suggestion is included in inserted insight
      expect(insertedInsights).toHaveLength(1);
      const inserted = insertedInsights[0] as Array<Record<string, unknown>>;
      expect(inserted[0].suggestion).toBe(
        "O lead postou sobre IA — conectar com produto de automação."
      );
    });

    it("salva insight sem sugestão quando geração falha", async () => {
      const { insertedInsights } = setupBatchWithNewPosts();

      mockClassifyPostRelevance.mockResolvedValue({
        isRelevant: true,
        reasoning: "Post relevante",
        promptTokens: 150,
        completionTokens: 50,
      });

      mockGenerateApproachSuggestion.mockResolvedValue({
        suggestion: null,
        promptTokens: 0,
        completionTokens: 0,
        error: "OpenAI API error: 429",
      });

      const req = createRequest(`Bearer ${CRON_SECRET}`);
      const response = await POST(req);
      const json = await response.json();

      expect(json.status).toBe("batch_processed");
      expect(json.suggestionsGenerated).toBe(0);

      // Insight is still inserted, but with suggestion=null
      expect(insertedInsights).toHaveLength(1);
      const inserted = insertedInsights[0] as Array<Record<string, unknown>>;
      expect(inserted[0].suggestion).toBeNull();
      expect(inserted[0].relevance_reasoning).toBe("Post relevante");
    });

    it("retorna suggestionsGenerated no resultado do batch", async () => {
      setupBatchWithNewPosts();

      mockClassifyPostRelevance.mockResolvedValue({
        isRelevant: true,
        reasoning: "Relevante",
        promptTokens: 150,
        completionTokens: 50,
      });

      mockGenerateApproachSuggestion.mockResolvedValue({
        suggestion: "Sugestão gerada",
        promptTokens: 450,
        completionTokens: 150,
      });

      const req = createRequest(`Bearer ${CRON_SECRET}`);
      const response = await POST(req);
      const json = await response.json();

      expect(json).toHaveProperty("suggestionsGenerated");
      expect(json.suggestionsGenerated).toBe(1);
    });

    it("não tenta gerar sugestão quando openaiKey é null (fallback)", async () => {
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
      // Apify key found, OpenAI key NOT found
      const apifyConfigChain = createChainBuilder({
        data: { encrypted_key: "enc" },
        error: null,
      });
      const openaiConfigChain = createChainBuilder({
        data: null,
        error: { code: "PGRST116" },
      });

      let apiConfigCallCount = 0;
      mockFrom.mockImplementation((table: string) => {
        if (table === "monitoring_configs") return configChain;
        if (table === "leads") return leadsChain;
        if (table === "api_configs") {
          apiConfigCallCount++;
          return apiConfigCallCount === 1
            ? apifyConfigChain
            : openaiConfigChain;
        }
        return createChainBuilder();
      });

      mockFetchLinkedInPosts.mockResolvedValue({
        success: true,
        posts: [
          {
            postUrl: "https://linkedin.com/posts/1",
            text: "Post relevante",
            publishedAt: "2026-02-27",
            likesCount: 5,
            commentsCount: 1,
          },
        ],
        profileUrl: "https://linkedin.com/in/john",
        fetchedAt: "2026-02-27T10:00:00Z",
      });

      // Classified as relevant via fallback (no OpenAI key)
      mockClassifyPostRelevance.mockResolvedValue({
        isRelevant: true,
        reasoning: "OpenAI key não configurada — post aceito por padrão",
        promptTokens: 0,
        completionTokens: 0,
      });

      const req = createRequest(`Bearer ${CRON_SECRET}`);
      const response = await POST(req);
      const json = await response.json();

      expect(json.suggestionsGenerated).toBe(0);
      // generateApproachSuggestion should NOT be called when openaiKey is null
      expect(mockGenerateApproachSuggestion).not.toHaveBeenCalled();
    });

    it("não tenta gerar sugestão quando kbContext é null (fallback)", async () => {
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
        // company_profiles returns null → KB not configured
        return createChainBuilder();
      });

      mockFetchLinkedInPosts.mockResolvedValue({
        success: true,
        posts: [
          {
            postUrl: "https://linkedin.com/posts/1",
            text: "Post",
            publishedAt: "2026-02-27",
            likesCount: 5,
            commentsCount: 1,
          },
        ],
        profileUrl: "https://linkedin.com/in/john",
        fetchedAt: "2026-02-27T10:00:00Z",
      });

      // Classified as relevant via fallback (no KB)
      mockClassifyPostRelevance.mockResolvedValue({
        isRelevant: true,
        reasoning: "KB não configurado — post aceito por padrão",
        promptTokens: 0,
        completionTokens: 0,
      });

      const req = createRequest(`Bearer ${CRON_SECRET}`);
      const response = await POST(req);
      const json = await response.json();

      expect(json.suggestionsGenerated).toBe(0);
      // generateApproachSuggestion should NOT be called when kbContext is null
      expect(mockGenerateApproachSuggestion).not.toHaveBeenCalled();
    });

    it("loga custo de geração em api_usage_logs", async () => {
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
      const companyChain = createChainBuilder({
        data: {
          description: "Empresa B2B",
          products_services: "CRM",
          competitive_advantages: "IA",
        },
        error: null,
      });
      const icpChain = createChainBuilder({
        data: { summary: "CTOs" },
        error: null,
      });
      const toneChain = createChainBuilder({
        data: { preset: "casual", description: "Tom casual", writing_guidelines: null },
        error: null,
      });

      const loggedUsage: unknown[] = [];
      const usageChain = createChainBuilder({ data: null, error: null });
      const origInsert = usageChain.insert;
      usageChain.insert = vi.fn((data) => {
        loggedUsage.push(data);
        return origInsert(data);
      });

      mockFrom.mockImplementation((table: string) => {
        if (table === "monitoring_configs") return configChain;
        if (table === "leads") return leadsChain;
        if (table === "api_configs") return apiConfigChain;
        if (table === "api_usage_logs") return usageChain;
        if (table === "company_profiles") return companyChain;
        if (table === "icp_definitions") return icpChain;
        if (table === "tone_of_voice") return toneChain;
        return createChainBuilder();
      });

      mockFetchLinkedInPosts.mockResolvedValue({
        success: true,
        posts: [
          {
            postUrl: "https://linkedin.com/posts/1",
            text: "Post sobre IA",
            publishedAt: "2026-02-27",
            likesCount: 5,
            commentsCount: 1,
          },
        ],
        profileUrl: "https://linkedin.com/in/john",
        fetchedAt: "2026-02-27T10:00:00Z",
      });

      mockClassifyPostRelevance.mockResolvedValue({
        isRelevant: true,
        reasoning: "Relevante",
        promptTokens: 150,
        completionTokens: 50,
      });

      mockGenerateApproachSuggestion.mockResolvedValue({
        suggestion: "Sugestão gerada",
        promptTokens: 450,
        completionTokens: 150,
      });

      const req = createRequest(`Bearer ${CRON_SECRET}`);
      await POST(req);

      // Find suggestion cost log entry
      const suggestionLog = loggedUsage.find(
        (entry) =>
          (entry as Record<string, unknown>).request_type ===
          "monitoring_approach_suggestion"
      );
      expect(suggestionLog).toBeDefined();
      expect((suggestionLog as Record<string, unknown>).service_name).toBe(
        "openai"
      );
    });

    it("passa toneContext correto ao generateApproachSuggestion", async () => {
      setupBatchWithNewPosts();

      mockClassifyPostRelevance.mockResolvedValue({
        isRelevant: true,
        reasoning: "Relevante",
        promptTokens: 150,
        completionTokens: 50,
      });

      mockGenerateApproachSuggestion.mockResolvedValue({
        suggestion: "Sugestão",
        promptTokens: 450,
        completionTokens: 150,
      });

      const req = createRequest(`Bearer ${CRON_SECRET}`);
      await POST(req);

      expect(mockGenerateApproachSuggestion).toHaveBeenCalledOnce();
      const callArgs = mockGenerateApproachSuggestion.mock.calls[0];

      // 4th arg is kbContext (KBContextForSuggestion) which includes tone
      const kbContext = callArgs[3] as Record<string, string>;
      expect(kbContext.toneDescription).toContain("casual");
      expect(kbContext.toneStyle).toBe("casual");
      // Also verify KB fields are present
      expect(kbContext.companyContext).toBe("Empresa de automação B2B");
      expect(kbContext.productsServices).toBe("CRM, automação");
    });

    it("usa toneContext default quando tone_of_voice não existe", async () => {
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
      const companyChain = createChainBuilder({
        data: {
          description: "Empresa B2B",
          products_services: "CRM",
          competitive_advantages: "IA",
        },
        error: null,
      });
      const icpChain = createChainBuilder({
        data: { summary: "CTOs" },
        error: null,
      });
      // tone_of_voice returns null → default fallback
      const toneChain = createChainBuilder({
        data: null,
        error: { code: "PGRST116" },
      });

      mockFrom.mockImplementation((table: string) => {
        if (table === "monitoring_configs") return configChain;
        if (table === "leads") return leadsChain;
        if (table === "api_configs") return apiConfigChain;
        if (table === "company_profiles") return companyChain;
        if (table === "icp_definitions") return icpChain;
        if (table === "tone_of_voice") return toneChain;
        return createChainBuilder();
      });

      mockFetchLinkedInPosts.mockResolvedValue({
        success: true,
        posts: [
          {
            postUrl: "https://linkedin.com/posts/1",
            text: "Post sobre IA",
            publishedAt: "2026-02-27",
            likesCount: 5,
            commentsCount: 1,
          },
        ],
        profileUrl: "https://linkedin.com/in/john",
        fetchedAt: "2026-02-27T10:00:00Z",
      });

      mockClassifyPostRelevance.mockResolvedValue({
        isRelevant: true,
        reasoning: "Relevante",
        promptTokens: 150,
        completionTokens: 50,
      });

      mockGenerateApproachSuggestion.mockResolvedValue({
        suggestion: "Sugestão com tone default",
        promptTokens: 450,
        completionTokens: 150,
      });

      const req = createRequest(`Bearer ${CRON_SECRET}`);
      await POST(req);

      expect(mockGenerateApproachSuggestion).toHaveBeenCalledOnce();
      const callArgs = mockGenerateApproachSuggestion.mock.calls[0];
      const kbContext = callArgs[3] as Record<string, string>;

      // Default fallback: toneDescription="" and toneStyle="casual"
      expect(kbContext.toneDescription).toBe("");
      expect(kbContext.toneStyle).toBe("casual");
    });

    it("loga falha quando geração de sugestão falha (sem tokens)", async () => {
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
      const companyChain = createChainBuilder({
        data: {
          description: "Empresa B2B",
          products_services: "CRM",
          competitive_advantages: "IA",
        },
        error: null,
      });
      const icpChain = createChainBuilder({
        data: { summary: "CTOs" },
        error: null,
      });
      const toneChain = createChainBuilder({
        data: { preset: "casual", description: "Tom casual", writing_guidelines: null },
        error: null,
      });

      const loggedUsage: unknown[] = [];
      const usageChain = createChainBuilder({ data: null, error: null });
      const origInsert = usageChain.insert;
      usageChain.insert = vi.fn((data) => {
        loggedUsage.push(data);
        return origInsert(data);
      });

      mockFrom.mockImplementation((table: string) => {
        if (table === "monitoring_configs") return configChain;
        if (table === "leads") return leadsChain;
        if (table === "api_configs") return apiConfigChain;
        if (table === "api_usage_logs") return usageChain;
        if (table === "company_profiles") return companyChain;
        if (table === "icp_definitions") return icpChain;
        if (table === "tone_of_voice") return toneChain;
        return createChainBuilder();
      });

      mockFetchLinkedInPosts.mockResolvedValue({
        success: true,
        posts: [
          {
            postUrl: "https://linkedin.com/posts/1",
            text: "Post sobre IA",
            publishedAt: "2026-02-27",
            likesCount: 5,
            commentsCount: 1,
          },
        ],
        profileUrl: "https://linkedin.com/in/john",
        fetchedAt: "2026-02-27T10:00:00Z",
      });

      mockClassifyPostRelevance.mockResolvedValue({
        isRelevant: true,
        reasoning: "Relevante",
        promptTokens: 150,
        completionTokens: 50,
      });

      // Suggestion fails with error — 0 tokens (timeout/HTTP error)
      mockGenerateApproachSuggestion.mockResolvedValue({
        suggestion: null,
        promptTokens: 0,
        completionTokens: 0,
        error: "OpenAI API error: 429",
      });

      const req = createRequest(`Bearer ${CRON_SECRET}`);
      await POST(req);

      // Find suggestion failure log entry
      const failureLog = loggedUsage.find(
        (entry) =>
          (entry as Record<string, unknown>).request_type ===
            "monitoring_approach_suggestion" &&
          (entry as Record<string, unknown>).status === "failed"
      );
      expect(failureLog).toBeDefined();
      expect(
        (failureLog as Record<string, unknown>).error_message
      ).toBe("OpenAI API error: 429");
      expect(
        (failureLog as Record<string, unknown>).estimated_cost
      ).toBe(0);
    });

    it("inclui dados do lead na geração (first_name, title, company_name)", async () => {
      setupBatchWithNewPosts();

      mockClassifyPostRelevance.mockResolvedValue({
        isRelevant: true,
        reasoning: "Relevante",
        promptTokens: 150,
        completionTokens: 50,
      });

      mockGenerateApproachSuggestion.mockResolvedValue({
        suggestion: "Sugestão",
        promptTokens: 450,
        completionTokens: 150,
      });

      const req = createRequest(`Bearer ${CRON_SECRET}`);
      await POST(req);

      expect(mockGenerateApproachSuggestion).toHaveBeenCalledOnce();
      const callArgs = mockGenerateApproachSuggestion.mock.calls[0];

      // 3rd arg is leadContext
      const leadContext = callArgs[2] as Record<string, string>;
      expect(leadContext.leadName).toBe("João Silva");
      expect(leadContext.leadTitle).toBe("CTO");
      expect(leadContext.leadCompany).toBe("TechCorp");
      expect(leadContext.leadIndustry).toBe("Tecnologia");
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
