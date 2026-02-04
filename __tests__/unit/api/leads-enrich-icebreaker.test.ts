/**
 * Unit Tests for POST /api/leads/enrich-icebreaker
 * Story 6.5.5: Icebreaker Enrichment API
 *
 * AC #1: API Endpoint Structure (auth, validation, tenant isolation)
 * AC #2: Icebreaker Generation Flow
 * AC #3: Response Structure
 * AC #4: Parallel Processing with Rate Limiting
 * AC #5: Missing LinkedIn Posts Handling
 * AC #6: Regeneration Support
 * AC #7: Error Messages in Portuguese
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/leads/enrich-icebreaker/route";

// Use vi.hoisted for mocks that need to be used in vi.mock factories
const {
  mockGetCurrentUserProfile,
  mockFrom,
  mockRenderPrompt,
  mockGenerateText,
  mockFetchLinkedInPosts,
  mockDecryptApiKey,
} = vi.hoisted(() => ({
  mockGetCurrentUserProfile: vi.fn(),
  mockFrom: vi.fn(),
  mockRenderPrompt: vi.fn(),
  mockGenerateText: vi.fn(),
  mockFetchLinkedInPosts: vi.fn(),
  mockDecryptApiKey: vi.fn(),
}));

// Mock getCurrentUserProfile
vi.mock("@/lib/supabase/tenant", () => ({
  getCurrentUserProfile: () => mockGetCurrentUserProfile(),
}));

// Mock createClient for database operations
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve({ from: mockFrom })),
}));

// Mock decryptApiKey
vi.mock("@/lib/crypto/encryption", () => ({
  decryptApiKey: (encrypted: string) => mockDecryptApiKey(encrypted),
}));

// Mock ApifyService
vi.mock("@/lib/services/apify", () => ({
  ApifyService: class MockApifyService {
    fetchLinkedInPosts = mockFetchLinkedInPosts;
  },
}));

// Mock PromptManager
vi.mock("@/lib/ai/prompt-manager", () => ({
  PromptManager: vi.fn().mockImplementation(() => ({
    renderPrompt: mockRenderPrompt,
  })),
  promptManager: {
    renderPrompt: mockRenderPrompt,
  },
}));

// Mock createAIProvider
vi.mock("@/lib/ai/providers", () => ({
  createAIProvider: vi.fn(() => ({
    generateText: mockGenerateText,
  })),
}));

describe("POST /api/leads/enrich-icebreaker", () => {
  const tenantId = "tenant-123";
  const userId = "user-456";
  const leadId = "550e8400-e29b-41d4-a716-446655440001";
  const leadId2 = "550e8400-e29b-41d4-a716-446655440002";

  const mockLead = {
    id: leadId,
    tenant_id: tenantId,
    first_name: "Joao",
    last_name: "Silva",
    email: "joao@example.com",
    linkedin_url: "https://linkedin.com/in/joaosilva",
    title: "CTO",
    company_name: "TechCorp",
    industry: "Tecnologia",
    icebreaker: null,
    icebreaker_generated_at: null,
    linkedin_posts_cache: null,
  };

  const mockPosts = [
    {
      postUrl: "https://linkedin.com/posts/1",
      text: "Excited about AI in sales!",
      publishedAt: "2026-01-15T10:00:00Z",
      likesCount: 50,
      commentsCount: 10,
    },
    {
      postUrl: "https://linkedin.com/posts/2",
      text: "Just launched a new product.",
      publishedAt: "2026-01-10T10:00:00Z",
      likesCount: 30,
      commentsCount: 5,
    },
  ];

  const createRequest = (body: unknown) => {
    return new NextRequest("http://localhost/api/leads/enrich-icebreaker", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    });
  };

  // Helper to setup basic mocks
  function setupBasicMocks(options?: { leads?: typeof mockLead[] }) {
    mockGetCurrentUserProfile.mockResolvedValue({
      tenant_id: tenantId,
      user_id: userId,
      role: "user",
    });

    mockDecryptApiKey.mockImplementation((encrypted: string) => `decrypted-${encrypted}`);

    const leadsToReturn = options?.leads ?? [mockLead];

    mockFrom.mockImplementation((table: string) => {
      if (table === "api_configs") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { encrypted_key: "encrypted-key" },
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      if (table === "leads") {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: leadsToReturn,
                error: null,
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              error: null,
            }),
          }),
        };
      }
      if (table === "knowledge_base") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { content: { company_name: "TestCorp", preset: "casual" } },
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      return {};
    });

    mockFetchLinkedInPosts.mockResolvedValue({
      success: true,
      posts: mockPosts,
      profileUrl: mockLead.linkedin_url,
      fetchedAt: new Date().toISOString(),
    });

    mockRenderPrompt.mockResolvedValue({
      content: "Generate icebreaker for {{firstName}}",
      modelPreference: "gpt-4o-mini",
      metadata: { temperature: 0.7, maxTokens: 200 },
      source: "default",
    });

    mockGenerateText.mockResolvedValue({
      text: "Great icebreaker text here!",
      model: "gpt-4o-mini",
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    setupBasicMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ==============================================
  // AC #1: Validation Tests (Task 6.1, 6.2)
  // ==============================================

  describe("Validation (AC #1)", () => {
    it("accepts valid request with single leadId", async () => {
      const request = createRequest({ leadIds: [leadId] });
      const response = await POST(request);

      expect(response.status).toBe(200);
    });

    it("accepts valid request with multiple leadIds", async () => {
      const leadsData = [mockLead, { ...mockLead, id: leadId2 }];
      setupBasicMocks({ leads: leadsData });

      const request = createRequest({ leadIds: [leadId, leadId2] });
      const response = await POST(request);

      expect(response.status).toBe(200);
    });

    it("rejects empty leadIds array", async () => {
      const request = createRequest({ leadIds: [] });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.code).toBe("VALIDATION_ERROR");
      expect(data.error.message).toContain("Pelo menos um lead");
    });

    it("rejects invalid UUID format", async () => {
      const request = createRequest({ leadIds: ["invalid-uuid"] });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.code).toBe("VALIDATION_ERROR");
      expect(data.error.message).toContain("ID de lead invalido");
    });

    it("rejects more than 50 leads", async () => {
      const manyIds = Array.from({ length: 51 }, (_, i) =>
        `550e8400-e29b-41d4-a716-4466554400${String(i).padStart(2, "0")}`
      );
      const request = createRequest({ leadIds: manyIds });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.code).toBe("VALIDATION_ERROR");
      expect(data.error.message).toContain("Maximo de 50 leads");
    });

    it("accepts regenerate flag", async () => {
      const request = createRequest({ leadIds: [leadId], regenerate: true });
      const response = await POST(request);

      expect(response.status).toBe(200);
    });
  });

  // ==============================================
  // AC #1: Authentication Tests (Task 6.3)
  // ==============================================

  describe("Authentication (AC #1)", () => {
    it("returns 401 if user is not authenticated", async () => {
      mockGetCurrentUserProfile.mockResolvedValue(null);

      const request = createRequest({ leadIds: [leadId] });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error.code).toBe("UNAUTHORIZED");
      expect(data.error.message).toBe("Nao autenticado");
    });

    it("returns 403 if user has no tenant", async () => {
      mockGetCurrentUserProfile.mockResolvedValue({
        user_id: userId,
        tenant_id: null,
      });

      const request = createRequest({ leadIds: [leadId] });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error.code).toBe("FORBIDDEN");
      expect(data.error.message).toBe("Tenant nao encontrado");
    });
  });

  // ==============================================
  // AC #1: Tenant Isolation Tests (Task 6.4)
  // ==============================================

  describe("Tenant Isolation (AC #1)", () => {
    it("only returns leads belonging to user tenant", async () => {
      // Mock returns empty because lead doesn't belong to tenant
      setupBasicMocks({ leads: [] });

      const request = createRequest({ leadIds: [leadId] });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error.message).toBe("Lead nao encontrado");
    });
  });

  // ==============================================
  // AC #2: Lead without LinkedIn URL (Task 6.5)
  // ==============================================

  describe("Lead without LinkedIn URL (AC #2)", () => {
    it("returns error for lead without linkedin_url", async () => {
      const leadWithoutLinkedIn = { ...mockLead, linkedin_url: null };
      setupBasicMocks({ leads: [leadWithoutLinkedIn] });

      const request = createRequest({ leadIds: [leadId] });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.results[0].success).toBe(false);
      expect(data.results[0].error).toBe("Lead sem LinkedIn URL");
    });
  });

  // ==============================================
  // AC #5: Lead with no posts (Task 6.6)
  // ==============================================

  describe("Lead with no posts (AC #5)", () => {
    it("returns specific error for lead with no public posts", async () => {
      mockFetchLinkedInPosts.mockResolvedValue({
        success: true,
        posts: [],
        profileUrl: mockLead.linkedin_url,
        fetchedAt: new Date().toISOString(),
      });

      const request = createRequest({ leadIds: [leadId] });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.results[0].success).toBe(false);
      expect(data.results[0].error).toBe("Nenhum post encontrado");
    });
  });

  // ==============================================
  // AC #2: Successful Icebreaker Generation (Task 6.7)
  // ==============================================

  describe("Successful Icebreaker Generation (AC #2)", () => {
    it("generates icebreaker successfully", async () => {
      const request = createRequest({ leadIds: [leadId] });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.results[0].success).toBe(true);
      expect(data.results[0].icebreaker).toBe("Great icebreaker text here!");
    });

    it("calls ApifyService with correct parameters", async () => {
      const request = createRequest({ leadIds: [leadId] });
      await POST(request);

      expect(mockFetchLinkedInPosts).toHaveBeenCalledWith(
        expect.any(String),
        mockLead.linkedin_url,
        3
      );
    });

    it("calls PromptManager with correct variables", async () => {
      const request = createRequest({ leadIds: [leadId] });
      await POST(request);

      expect(mockRenderPrompt).toHaveBeenCalledWith(
        "icebreaker_premium_generation",
        expect.objectContaining({
          firstName: mockLead.first_name,
          lastName: mockLead.last_name,
          title: mockLead.title,
          companyName: mockLead.company_name,
        }),
        { tenantId }
      );
    });
  });

  // ==============================================
  // AC #6: Regeneration Support (Task 6.8, 6.9)
  // ==============================================

  describe("Regeneration Support (AC #6)", () => {
    it("skips lead with existing icebreaker when regenerate=false", async () => {
      const leadWithIcebreaker = {
        ...mockLead,
        icebreaker: "Existing icebreaker",
        icebreaker_generated_at: "2026-01-01T00:00:00Z",
      };
      setupBasicMocks({ leads: [leadWithIcebreaker] });

      const request = createRequest({ leadIds: [leadId], regenerate: false });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.results[0].success).toBe(true);
      expect(data.results[0].icebreaker).toBe("Existing icebreaker");
      expect(mockFetchLinkedInPosts).not.toHaveBeenCalled();
    });

    it("regenerates icebreaker when regenerate=true", async () => {
      const leadWithIcebreaker = {
        ...mockLead,
        icebreaker: "Old icebreaker",
        icebreaker_generated_at: "2026-01-01T00:00:00Z",
      };
      setupBasicMocks({ leads: [leadWithIcebreaker] });

      const request = createRequest({ leadIds: [leadId], regenerate: true });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.results[0].success).toBe(true);
      expect(data.results[0].icebreaker).toBe("Great icebreaker text here!");
      expect(mockFetchLinkedInPosts).toHaveBeenCalled();
    });
  });

  // ==============================================
  // AC #4: Parallel Processing (Task 6.10)
  // ==============================================

  describe("Parallel Processing (AC #4)", () => {
    it("processes multiple leads and aggregates results", async () => {
      const lead2 = { ...mockLead, id: leadId2, first_name: "Maria" };
      setupBasicMocks({ leads: [mockLead, lead2] });

      const request = createRequest({ leadIds: [leadId, leadId2] });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.results).toHaveLength(2);
      expect(data.summary.total).toBe(2);
      expect(data.summary.generated).toBe(2);
    });

    it("continues processing when one lead fails", async () => {
      const leadWithoutUrl = { ...mockLead, id: leadId2, linkedin_url: null };
      setupBasicMocks({ leads: [mockLead, leadWithoutUrl] });

      const request = createRequest({ leadIds: [leadId, leadId2] });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.results).toHaveLength(2);

      const successResult = data.results.find((r: { leadId: string }) => r.leadId === leadId);
      const failResult = data.results.find((r: { leadId: string }) => r.leadId === leadId2);

      expect(successResult.success).toBe(true);
      expect(failResult.success).toBe(false);
      expect(failResult.error).toBe("Lead sem LinkedIn URL");
    });
  });

  // ==============================================
  // AC #3: Response Structure
  // ==============================================

  describe("Response Structure (AC #3)", () => {
    it("returns correct response structure", async () => {
      const request = createRequest({ leadIds: [leadId] });
      const response = await POST(request);
      const data = await response.json();

      expect(data).toHaveProperty("success");
      expect(data).toHaveProperty("results");
      expect(data).toHaveProperty("summary");
      expect(data.summary).toHaveProperty("total");
      expect(data.summary).toHaveProperty("generated");
      expect(data.summary).toHaveProperty("skipped");
      expect(data.summary).toHaveProperty("failed");
    });

    it("includes leadId in each result", async () => {
      const request = createRequest({ leadIds: [leadId] });
      const response = await POST(request);
      const data = await response.json();

      expect(data.results[0].leadId).toBe(leadId);
    });
  });

  // ==============================================
  // AC #7: Error Messages in Portuguese
  // ==============================================

  describe("Error Messages in Portuguese (AC #7)", () => {
    it("returns Portuguese message for unauthorized", async () => {
      mockGetCurrentUserProfile.mockResolvedValue(null);

      const request = createRequest({ leadIds: [leadId] });
      const response = await POST(request);
      const data = await response.json();

      expect(data.error.message).toBe("Nao autenticado");
    });

    it("returns Portuguese message for missing Apify API key", async () => {
      mockFrom.mockImplementation((table: string) => {
        if (table === "api_configs") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: null,
                    error: new Error("Not found"),
                  }),
                }),
              }),
            }),
          };
        }
        return {};
      });

      const request = createRequest({ leadIds: [leadId] });
      const response = await POST(request);
      const data = await response.json();

      expect(data.error.message).toContain("API key do Apify nao configurada");
    });
  });

  // ==============================================
  // API Key Configuration Errors
  // ==============================================

  describe("API Key Configuration", () => {
    it("returns error when Apify API key not configured", async () => {
      // Reset mock to return null for apify
      mockFrom.mockImplementation((table: string) => {
        if (table === "api_configs") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: null,
                    error: new Error("Not found"),
                  }),
                }),
              }),
            }),
          };
        }
        return {};
      });

      const request = createRequest({ leadIds: [leadId] });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.code).toBe("API_KEY_ERROR");
    });

    it("returns error when OpenAI API key not configured", async () => {
      // Mock returns apify key but not openai key
      let apifyCallCount = 0;
      mockFrom.mockImplementation((table: string) => {
        if (table === "api_configs") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockImplementation((field: string, value: string) => {
                  // First call is for apify, second for openai
                  if (value === "apify") {
                    apifyCallCount++;
                    return {
                      single: vi.fn().mockResolvedValue({
                        data: { encrypted_key: "apify-key" },
                        error: null,
                      }),
                    };
                  }
                  // openai returns null
                  return {
                    single: vi.fn().mockResolvedValue({
                      data: null,
                      error: new Error("Not found"),
                    }),
                  };
                }),
              }),
            }),
          };
        }
        return {};
      });

      const request = createRequest({ leadIds: [leadId] });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.code).toBe("API_KEY_ERROR");
      expect(data.error.message).toContain("OpenAI");
    });
  });

  // ==============================================
  // Batch Processing Verification (AC #4)
  // ==============================================

  describe("Batch Processing Verification (AC #4)", () => {
    it("processes 7 leads in batches of 5 (2 batches)", async () => {
      // Create 7 mock leads to verify batching behavior
      const sevenLeads = Array.from({ length: 7 }, (_, i) => ({
        ...mockLead,
        id: `550e8400-e29b-41d4-a716-44665544000${i}`,
        first_name: `Lead${i}`,
      }));
      const sevenLeadIds = sevenLeads.map((l) => l.id);

      setupBasicMocks({ leads: sevenLeads });

      const request = createRequest({ leadIds: sevenLeadIds });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.results).toHaveLength(7);
      expect(data.summary.total).toBe(7);
      // All 7 should be generated successfully
      expect(data.summary.generated).toBe(7);
      expect(data.summary.failed).toBe(0);
    });

    it("correctly tracks skipped count for existing icebreakers", async () => {
      const leadWithIcebreaker = {
        ...mockLead,
        icebreaker: "Existing icebreaker",
        icebreaker_generated_at: "2026-01-01T00:00:00Z",
      };
      setupBasicMocks({ leads: [leadWithIcebreaker] });

      const request = createRequest({ leadIds: [leadId], regenerate: false });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.summary.skipped).toBe(1);
      expect(data.summary.generated).toBe(0);
      expect(data.results[0].skipped).toBe(true);
    });
  });
});
