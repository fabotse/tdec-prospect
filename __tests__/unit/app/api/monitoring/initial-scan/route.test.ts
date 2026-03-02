/**
 * Tests for POST /api/monitoring/initial-scan
 * Story 13.9: Verificação Inicial ao Ativar Monitoramento — AC #11
 *
 * Tests: auth, validation, Apify key check, batching, aggregated response, errors
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createChainBuilder } from "../../../../../helpers/mock-supabase";

// ==============================================
// MOCKS
// ==============================================

const mockGetCurrentUserProfile = vi.fn();
vi.mock("@/lib/supabase/tenant", () => ({
  getCurrentUserProfile: (...args: unknown[]) => mockGetCurrentUserProfile(...args),
}));

const mockFrom = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
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

import { POST } from "@/app/api/monitoring/initial-scan/route";

// ==============================================
// CONSTANTS — Valid UUID v4 format
// ==============================================

const TENANT_ID = "a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5";
const USER_ID = "b2c3d4e5-f6a7-4b8c-9d0e-f1a2b3c4d5e6";

// Helper to generate deterministic valid UUID v4
function uuid(n: number): string {
  const hex = n.toString(16).padStart(12, "0");
  return `550e8400-e29b-41d4-a716-${hex}`;
}

const LEAD_ID_1 = uuid(1);
const LEAD_ID_2 = uuid(2);

// ==============================================
// HELPERS
// ==============================================

function createRequest(body?: unknown): NextRequest {
  return new NextRequest("http://localhost/api/monitoring/initial-scan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function mockAuthenticatedUser() {
  mockGetCurrentUserProfile.mockResolvedValue({
    id: USER_ID,
    tenant_id: TENANT_ID,
    role: "admin",
  });
}

function createMockLead(id: string, linkedinUrl: string | null = "https://linkedin.com/in/test") {
  return {
    id,
    linkedin_url: linkedinUrl,
    linkedin_posts_cache: null,
    first_name: "John",
    last_name: "Doe",
    title: "CTO",
    company_name: "TechCorp",
    industry: "Technology",
  };
}

function setupDefaultApifyResponse() {
  mockFetchLinkedInPosts.mockResolvedValue({
    success: true,
    posts: [
      { postUrl: "https://linkedin.com/post/1", text: "New post about AI", publishedAt: "2026-03-01" },
    ],
    fetchedAt: "2026-03-01T00:00:00Z",
    profileUrl: "https://linkedin.com/in/test",
  });
}

function setupFullMocks(leads: ReturnType<typeof createMockLead>[]) {
  const apifyConfigChain = createChainBuilder({
    data: { encrypted_key: "enc-apify" },
    error: null,
  });
  const openaiConfigChain = createChainBuilder({
    data: { encrypted_key: "enc-openai" },
    error: null,
  });
  const leadsQueryChain = createChainBuilder({
    data: leads,
    error: null,
  });
  const companyChain = createChainBuilder({
    data: {
      content: {
        business_description: "Tech company",
        products_services: "SaaS",
        competitive_advantages: "AI",
      },
    },
    error: null,
  });
  const icpChain = createChainBuilder({
    data: {
      content: {
        job_titles: ["CTO"],
        industries: [],
        pain_points: "",
      },
    },
    error: null,
  });
  const toneChain = createChainBuilder({ data: null, error: null });
  const insightsChain = createChainBuilder({ data: null, error: null });
  const usageChain = createChainBuilder({ data: null, error: null });

  let apiConfigCallCount = 0;
  let kbCallCount = 0;
  mockFrom.mockImplementation((table: string) => {
    if (table === "api_configs") {
      apiConfigCallCount++;
      return apiConfigCallCount === 1 ? apifyConfigChain : openaiConfigChain;
    }
    if (table === "leads") return leadsQueryChain;
    if (table === "knowledge_base") {
      kbCallCount++;
      if (kbCallCount === 1) return companyChain;
      if (kbCallCount === 2) return icpChain;
      return toneChain;
    }
    if (table === "lead_insights") return insightsChain;
    if (table === "api_usage_logs") return usageChain;
    return createChainBuilder();
  });

  return { leadsQueryChain, insightsChain, usageChain };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDecryptApiKey.mockReturnValue("decrypted-apify-key");
  mockClassifyPostRelevance.mockResolvedValue({
    isRelevant: true,
    reasoning: "Post relevante",
    promptTokens: 150,
    completionTokens: 50,
  });
  mockGenerateApproachSuggestion.mockResolvedValue({
    suggestion: "Sugestão gerada.",
    promptTokens: 450,
    completionTokens: 150,
  });
});

// ==============================================
// TESTS
// ==============================================

describe("POST /api/monitoring/initial-scan", () => {
  // ==============================================
  // AUTH VALIDATION (AC #1)
  // ==============================================

  describe("Auth validation", () => {
    it("should return 401 when user is not authenticated", async () => {
      mockGetCurrentUserProfile.mockResolvedValue(null);

      const req = createRequest({ leadIds: [LEAD_ID_1] });
      const response = await POST(req);

      expect(response.status).toBe(401);
      const json = await response.json();
      expect(json.error.code).toBe("UNAUTHORIZED");
    });
  });

  // ==============================================
  // BODY VALIDATION (AC #2)
  // ==============================================

  describe("Body validation", () => {
    beforeEach(() => {
      mockAuthenticatedUser();
    });

    it("should return 400 for invalid JSON body", async () => {
      const req = new NextRequest("http://localhost/api/monitoring/initial-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not-json",
      });
      const response = await POST(req);

      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error.code).toBe("VALIDATION_ERROR");
    });

    it("should return 400 when leadIds is empty", async () => {
      const req = createRequest({ leadIds: [] });
      const response = await POST(req);

      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error.code).toBe("VALIDATION_ERROR");
    });

    it("should return 400 when leadIds contains invalid UUIDs", async () => {
      const req = createRequest({ leadIds: ["not-a-uuid"] });
      const response = await POST(req);

      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error.code).toBe("VALIDATION_ERROR");
    });

    it("should return 400 when leadIds exceeds 100", async () => {
      const ids = Array.from({ length: 101 }, (_, i) => uuid(i + 1));
      const req = createRequest({ leadIds: ids });
      const response = await POST(req);

      expect(response.status).toBe(400);
    });
  });

  // ==============================================
  // TENANT VALIDATION
  // ==============================================

  describe("Tenant validation", () => {
    it("should return 400 when tenant_id not found in profile", async () => {
      mockGetCurrentUserProfile.mockResolvedValue({
        id: USER_ID,
        tenant_id: null,
        role: "admin",
      });

      const req = createRequest({ leadIds: [LEAD_ID_1] });
      const response = await POST(req);

      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error.code).toBe("TENANT_ERROR");
    });
  });

  // ==============================================
  // APIFY KEY CHECK (AC #10)
  // ==============================================

  describe("Apify key check", () => {
    it("should return 400 with APIFY_KEY_MISSING when no Apify key configured", async () => {
      mockAuthenticatedUser();
      const apiConfigsChain = createChainBuilder({ data: null, error: { message: "Not found" } });
      mockFrom.mockImplementation((table: string) => {
        if (table === "api_configs") return apiConfigsChain;
        return createChainBuilder();
      });

      const req = createRequest({ leadIds: [LEAD_ID_1] });
      const response = await POST(req);

      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error.code).toBe("APIFY_KEY_MISSING");
      expect(json.error.message).toBe("Chave da Apify não configurada");
    });
  });

  // ==============================================
  // SUCCESSFUL PROCESSING (AC #3, #5)
  // ==============================================

  describe("Successful processing", () => {
    beforeEach(() => {
      mockAuthenticatedUser();
      setupDefaultApifyResponse();
    });

    it("should return empty result when no matching leads found", async () => {
      setupFullMocks([]);

      const req = createRequest({ leadIds: [LEAD_ID_1] });
      const response = await POST(req);

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.totalProcessed).toBe(0);
      expect(json.totalLeads).toBe(0);
    });

    it("should process leads and return aggregated result (AC #5)", async () => {
      const leads = [createMockLead(LEAD_ID_1), createMockLead(LEAD_ID_2)];
      setupFullMocks(leads);

      const req = createRequest({ leadIds: [LEAD_ID_1, LEAD_ID_2] });
      const response = await POST(req);

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.totalProcessed).toBe(2);
      expect(json.totalLeads).toBe(2);
      expect(json.newPostsFound).toBe(2);
      expect(json.insightsGenerated).toBe(2);
      expect(json.errors).toEqual([]);
    });

    it("should process in batches of BATCH_SIZE (AC #3)", async () => {
      const leads = Array.from({ length: 7 }, (_, i) =>
        createMockLead(uuid(i + 1))
      );
      setupFullMocks(leads);

      const req = createRequest({
        leadIds: leads.map((l) => l.id),
      });
      const response = await POST(req);

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.totalProcessed).toBe(7);
      expect(json.totalLeads).toBe(7);
    });

    it("should include errors for failed leads without blocking others", async () => {
      const leads = [createMockLead(LEAD_ID_1), createMockLead(LEAD_ID_2)];
      setupFullMocks(leads);

      mockFetchLinkedInPosts
        .mockResolvedValueOnce({
          success: false,
          error: "Apify timeout",
          posts: [],
        })
        .mockResolvedValueOnce({
          success: true,
          posts: [{ postUrl: "https://linkedin.com/post/1", text: "Post", publishedAt: "2026-03-01" }],
          fetchedAt: "2026-03-01T00:00:00Z",
          profileUrl: "https://linkedin.com/in/test",
        });

      const req = createRequest({ leadIds: [LEAD_ID_1, LEAD_ID_2] });
      const response = await POST(req);

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.totalProcessed).toBe(2);
      expect(json.errors.length).toBe(1);
      expect(json.errors[0]).toEqual(
        expect.objectContaining({ leadId: LEAD_ID_1, error: "Apify timeout" })
      );
    });

    it("should log initial-scan usage (AC #9)", async () => {
      const leads = [createMockLead(LEAD_ID_1)];
      const { usageChain } = setupFullMocks(leads);

      const req = createRequest({ leadIds: [LEAD_ID_1] });
      await POST(req);

      expect(usageChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          request_type: "monitoring_initial_scan",
          metadata: expect.objectContaining({
            source: "initial-scan",
          }),
        })
      );
    });
  });

  // ==============================================
  // ERROR HANDLING
  // ==============================================

  describe("Error handling", () => {
    it("should return 500 with sanitized error on unexpected errors", async () => {
      mockAuthenticatedUser();
      // mockFrom throws after validation passes (getApiKey call)
      mockFrom.mockImplementation(() => {
        throw new Error("Unexpected DB error");
      });

      const req = createRequest({ leadIds: [LEAD_ID_1] });
      const response = await POST(req);

      expect(response.status).toBe(500);
      const json = await response.json();
      expect(json.error.code).toBe("INTERNAL_ERROR");
      expect(json.error.message).toBe("Erro interno ao processar scan");
    });
  });
});
