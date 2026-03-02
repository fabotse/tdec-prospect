/**
 * Tests for monitoring-processor.ts
 * Story 13.9: Verificação Inicial ao Ativar Monitoramento — AC #4
 *
 * Tests: logMonitoringUsage, getApiKey, loadToneContext, loadKBContext, processLead, BATCH_SIZE
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createChainBuilder } from "../../../helpers/mock-supabase";

// ==============================================
// MOCKS
// ==============================================

const mockFrom = vi.fn();
const mockSupabase = { from: mockFrom } as unknown;

const mockFetchLinkedInPosts = vi.fn();
vi.mock("@/lib/services/apify", () => ({
  ApifyService: class MockApifyService {
    fetchLinkedInPosts = mockFetchLinkedInPosts;
  },
}));

const mockDecryptApiKey = vi.fn(() => "decrypted-key");
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

import {
  BATCH_SIZE,
  logMonitoringUsage,
  getApiKey,
  loadToneContext,
  loadKBContext,
  processLead,
} from "@/lib/utils/monitoring-processor";
import type { ProcessLeadInput, ToneContext } from "@/lib/utils/monitoring-processor";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ApifyService } from "@/lib/services/apify";

// ==============================================
// HELPERS
// ==============================================

function getClient() {
  return mockSupabase as unknown as SupabaseClient;
}

function createMockLead(overrides: Partial<ProcessLeadInput> = {}): ProcessLeadInput {
  return {
    id: "lead-1",
    linkedin_url: "https://linkedin.com/in/johndoe",
    linkedin_posts_cache: null,
    first_name: "John",
    last_name: "Doe",
    title: "CTO",
    company_name: "TechCorp",
    industry: "Technology",
    ...overrides,
  };
}

const defaultToneContext: ToneContext = {
  toneDescription: "",
  toneStyle: "casual",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockDecryptApiKey.mockReturnValue("decrypted-key");
  mockClassifyPostRelevance.mockResolvedValue({
    isRelevant: true,
    reasoning: "Post relevante",
    promptTokens: 150,
    completionTokens: 50,
  });
  mockGenerateApproachSuggestion.mockResolvedValue({
    suggestion: "Sugestão de abordagem gerada.",
    promptTokens: 450,
    completionTokens: 150,
  });
});

// ==============================================
// TESTS
// ==============================================

describe("BATCH_SIZE", () => {
  it("should be 5", () => {
    expect(BATCH_SIZE).toBe(5);
  });
});

describe("logMonitoringUsage", () => {
  it("should insert usage log into api_usage_logs", async () => {
    const insertChain = createChainBuilder({ data: null, error: null });
    mockFrom.mockImplementation((table: string) => {
      if (table === "api_usage_logs") return insertChain;
      return createChainBuilder();
    });

    await logMonitoringUsage(getClient(), {
      tenantId: "tenant-1",
      serviceName: "apify",
      requestType: "monitoring_posts_fetch",
      leadId: "lead-1",
      postsFetched: 3,
      status: "success",
    });

    expect(mockFrom).toHaveBeenCalledWith("api_usage_logs");
    expect(insertChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: "tenant-1",
        service_name: "apify",
        request_type: "monitoring_posts_fetch",
        lead_id: "lead-1",
        posts_fetched: 3,
        status: "success",
      })
    );
  });

  it("should auto-calculate apify cost when not provided", async () => {
    const insertChain = createChainBuilder({ data: null, error: null });
    mockFrom.mockImplementation((table: string) => {
      if (table === "api_usage_logs") return insertChain;
      return createChainBuilder();
    });

    await logMonitoringUsage(getClient(), {
      tenantId: "tenant-1",
      serviceName: "apify",
      requestType: "monitoring_posts_fetch",
      postsFetched: 1000,
      status: "success",
    });

    expect(insertChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        estimated_cost: 1, // 1000/1000 * $1
      })
    );
  });

  it("should not throw when insert fails", async () => {
    mockFrom.mockImplementation(() => {
      throw new Error("DB connection error");
    });

    await expect(
      logMonitoringUsage(getClient(), {
        tenantId: "tenant-1",
        serviceName: "apify",
        requestType: "test",
        status: "success",
      })
    ).resolves.toBeUndefined();
  });
});

describe("getApiKey", () => {
  it("should return decrypted key when found", async () => {
    const apiConfigsChain = createChainBuilder({
      data: { encrypted_key: "encrypted-value" },
      error: null,
    });
    mockFrom.mockImplementation((table: string) => {
      if (table === "api_configs") return apiConfigsChain;
      return createChainBuilder();
    });

    const result = await getApiKey(getClient(), "tenant-1", "apify");

    expect(result).toBe("decrypted-key");
    expect(mockDecryptApiKey).toHaveBeenCalledWith("encrypted-value");
  });

  it("should return null when no data found", async () => {
    const apiConfigsChain = createChainBuilder({
      data: null,
      error: { message: "Not found" },
    });
    mockFrom.mockImplementation((table: string) => {
      if (table === "api_configs") return apiConfigsChain;
      return createChainBuilder();
    });

    const result = await getApiKey(getClient(), "tenant-1", "apify");
    expect(result).toBeNull();
  });

  it("should return null when decryption fails", async () => {
    const apiConfigsChain = createChainBuilder({
      data: { encrypted_key: "corrupted" },
      error: null,
    });
    mockFrom.mockImplementation((table: string) => {
      if (table === "api_configs") return apiConfigsChain;
      return createChainBuilder();
    });
    mockDecryptApiKey.mockImplementation(() => {
      throw new Error("Decryption failed");
    });

    const result = await getApiKey(getClient(), "tenant-1", "apify");
    expect(result).toBeNull();
  });
});

describe("loadToneContext", () => {
  it("should return tone context when found", async () => {
    const toneChain = createChainBuilder({
      data: {
        content: {
          preset: "formal",
          custom_description: "Tom profissional",
          writing_guidelines: "Use vocabu technical",
        },
      },
      error: null,
    });
    mockFrom.mockImplementation((table: string) => {
      if (table === "knowledge_base") return toneChain;
      return createChainBuilder();
    });

    const result = await loadToneContext(getClient(), "tenant-1");

    expect(result.toneStyle).toBe("formal");
    expect(result.toneDescription).toContain("formal");
    expect(result.toneDescription).toContain("Tom profissional");
    expect(result.toneDescription).toContain("Use vocabu technical");
  });

  it("should return defaults when no tone found", async () => {
    const toneChain = createChainBuilder({ data: null, error: null });
    mockFrom.mockImplementation((table: string) => {
      if (table === "knowledge_base") return toneChain;
      return createChainBuilder();
    });

    const result = await loadToneContext(getClient(), "tenant-1");

    expect(result).toEqual({ toneDescription: "", toneStyle: "casual" });
  });
});

describe("loadKBContext", () => {
  it("should return KB context when company profile exists", async () => {
    const companyChain = createChainBuilder({
      data: {
        content: {
          company_name: "TestCo",
          business_description: "Tech company",
          products_services: "SaaS platform",
          competitive_advantages: "AI-powered",
        },
      },
      error: null,
    });
    const icpChain = createChainBuilder({
      data: {
        content: {
          company_sizes: [],
          industries: ["SaaS"],
          job_titles: ["CTO"],
          geographic_focus: [],
          pain_points: "Scaling issues",
          common_objections: "",
        },
      },
      error: null,
    });
    // First from("knowledge_base") → company, second → ICP
    mockFrom
      .mockReturnValueOnce(companyChain)
      .mockReturnValueOnce(icpChain);

    const result = await loadKBContext(getClient(), "tenant-1");

    expect(result).toEqual({
      companyContext: "Tech company",
      productsServices: "SaaS platform",
      competitiveAdvantages: "AI-powered",
      icpSummary: "Cargos: CTO. Setores: SaaS. Dores: Scaling issues",
    });
  });

  it("should return null when no company profile", async () => {
    const companyChain = createChainBuilder({ data: null, error: null });
    mockFrom.mockReturnValueOnce(companyChain);

    const result = await loadKBContext(getClient(), "tenant-1");
    expect(result).toBeNull();
  });

  it("should return null when company has no description", async () => {
    const companyChain = createChainBuilder({
      data: {
        content: {
          company_name: "TestCo",
          business_description: "",
          products_services: "Test",
          competitive_advantages: "",
        },
      },
      error: null,
    });
    mockFrom.mockReturnValueOnce(companyChain);

    const result = await loadKBContext(getClient(), "tenant-1");
    expect(result).toBeNull();
  });
});

describe("processLead", () => {
  const apifyService = new ApifyService();

  function setupDefaultMocks() {
    const leadsChain = createChainBuilder({ data: null, error: null });
    const insightsChain = createChainBuilder({ data: null, error: null });
    const usageChain = createChainBuilder({ data: null, error: null });

    mockFrom.mockImplementation((table: string) => {
      if (table === "leads") return leadsChain;
      if (table === "lead_insights") return insightsChain;
      if (table === "api_usage_logs") return usageChain;
      return createChainBuilder();
    });

    return { leadsChain, insightsChain, usageChain };
  }

  it("should return error for lead without linkedin_url", async () => {
    setupDefaultMocks();
    const lead = createMockLead({ linkedin_url: null });

    const result = await processLead(
      lead, "apify-key", apifyService, getClient(),
      "tenant-1", null, null, defaultToneContext
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe("Lead sem linkedin_url");
    expect(result.newPostsFound).toBe(0);
  });

  it("should return error when Apify fetch fails", async () => {
    setupDefaultMocks();
    mockFetchLinkedInPosts.mockResolvedValue({
      success: false,
      error: "Apify timeout",
      posts: [],
    });

    const result = await processLead(
      createMockLead(), "apify-key", apifyService, getClient(),
      "tenant-1", null, null, defaultToneContext
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe("Apify timeout");
  });

  it("should process lead successfully with no new posts", async () => {
    const { leadsChain } = setupDefaultMocks();
    mockFetchLinkedInPosts.mockResolvedValue({
      success: true,
      posts: [{ postUrl: "https://linkedin.com/post/1", text: "Old post", publishedAt: "2026-01-01" }],
      fetchedAt: "2026-03-01T00:00:00Z",
      profileUrl: "https://linkedin.com/in/johndoe",
    });

    const lead = createMockLead({
      linkedin_posts_cache: {
        posts: [{ postUrl: "https://linkedin.com/post/1", text: "Old post", publishedAt: "2026-01-01" }],
        fetchedAt: "2026-02-01T00:00:00Z",
        profileUrl: "https://linkedin.com/in/johndoe",
      },
    });

    const result = await processLead(
      lead, "apify-key", apifyService, getClient(),
      "tenant-1", null, null, defaultToneContext
    );

    expect(result.success).toBe(true);
    expect(result.newPostsFound).toBe(0);
    expect(leadsChain.update).toHaveBeenCalled();
  });

  it("should detect new posts and classify relevance", async () => {
    const { insightsChain } = setupDefaultMocks();
    mockFetchLinkedInPosts.mockResolvedValue({
      success: true,
      posts: [
        { postUrl: "https://linkedin.com/post/new1", text: "New AI post", publishedAt: "2026-03-01" },
      ],
      fetchedAt: "2026-03-01T00:00:00Z",
      profileUrl: "https://linkedin.com/in/johndoe",
    });

    const kbContext = {
      companyContext: "Tech company",
      productsServices: "SaaS",
      competitiveAdvantages: "AI",
      icpSummary: "CTOs",
    };

    const result = await processLead(
      createMockLead(), "apify-key", apifyService, getClient(),
      "tenant-1", "openai-key", kbContext, defaultToneContext
    );

    expect(result.success).toBe(true);
    expect(result.newPostsFound).toBe(1);
    expect(result.suggestionsGenerated).toBe(1);
    expect(mockClassifyPostRelevance).toHaveBeenCalledTimes(1);
    expect(mockGenerateApproachSuggestion).toHaveBeenCalledTimes(1);
    expect(insightsChain.insert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          lead_id: "lead-1",
          post_url: "https://linkedin.com/post/new1",
          status: "new",
          suggestion: "Sugestão de abordagem gerada.",
        }),
      ])
    );
  });

  it("should count filtered posts when classification is not relevant", async () => {
    setupDefaultMocks();
    mockFetchLinkedInPosts.mockResolvedValue({
      success: true,
      posts: [
        { postUrl: "https://linkedin.com/post/new1", text: "Irrelevant post", publishedAt: "2026-03-01" },
      ],
      fetchedAt: "2026-03-01T00:00:00Z",
      profileUrl: "https://linkedin.com/in/johndoe",
    });
    mockClassifyPostRelevance.mockResolvedValue({
      isRelevant: false,
      reasoning: "Post nao relevante",
      promptTokens: 100,
      completionTokens: 30,
    });

    const result = await processLead(
      createMockLead(), "apify-key", apifyService, getClient(),
      "tenant-1", "openai-key", null, defaultToneContext
    );

    expect(result.success).toBe(true);
    expect(result.newPostsFound).toBe(1);
    expect(result.postsFiltered).toBe(1);
    expect(result.suggestionsGenerated).toBe(0);
  });

  it("should not generate suggestion without openaiKey", async () => {
    setupDefaultMocks();
    mockFetchLinkedInPosts.mockResolvedValue({
      success: true,
      posts: [
        { postUrl: "https://linkedin.com/post/new1", text: "New post", publishedAt: "2026-03-01" },
      ],
      fetchedAt: "2026-03-01T00:00:00Z",
      profileUrl: "https://linkedin.com/in/johndoe",
    });

    const result = await processLead(
      createMockLead(), "apify-key", apifyService, getClient(),
      "tenant-1", null, null, defaultToneContext
    );

    expect(result.success).toBe(true);
    expect(result.suggestionsGenerated).toBe(0);
    expect(mockGenerateApproachSuggestion).not.toHaveBeenCalled();
  });

  it("should log Apify usage on success", async () => {
    const { usageChain } = setupDefaultMocks();
    mockFetchLinkedInPosts.mockResolvedValue({
      success: true,
      posts: [
        { postUrl: "https://linkedin.com/post/1", text: "Post", publishedAt: "2026-03-01" },
      ],
      fetchedAt: "2026-03-01T00:00:00Z",
      profileUrl: "https://linkedin.com/in/johndoe",
    });

    await processLead(
      createMockLead(), "apify-key", apifyService, getClient(),
      "tenant-1", null, null, defaultToneContext
    );

    // Apify usage logged
    expect(usageChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        service_name: "apify",
        request_type: "monitoring_posts_fetch",
        status: "success",
        posts_fetched: 1,
      })
    );
  });

  it("should process lead with existing cache and detect new posts", async () => {
    setupDefaultMocks();
    mockFetchLinkedInPosts.mockResolvedValue({
      success: true,
      posts: [
        { postUrl: "https://linkedin.com/post/old1", text: "Old", publishedAt: "2026-01-01" },
        { postUrl: "https://linkedin.com/post/new1", text: "New", publishedAt: "2026-03-01" },
      ],
      fetchedAt: "2026-03-01T00:00:00Z",
      profileUrl: "https://linkedin.com/in/johndoe",
    });

    const lead = createMockLead({
      linkedin_posts_cache: {
        posts: [{ postUrl: "https://linkedin.com/post/old1", text: "Old", publishedAt: "2026-01-01" }],
        fetchedAt: "2026-02-01T00:00:00Z",
        profileUrl: "https://linkedin.com/in/johndoe",
      },
    });

    const result = await processLead(
      lead, "apify-key", apifyService, getClient(),
      "tenant-1", null, null, defaultToneContext
    );

    expect(result.success).toBe(true);
    expect(result.newPostsFound).toBe(1);
  });
});
