/**
 * Unit Tests for POST /api/agent/executions/[executionId]/steps/[stepNumber]/fetch-leads
 * Story 17.12 - AC: #2, #3
 *
 * Tests: pagination, dedup, validation, auth, cost update
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/agent/executions/[executionId]/steps/[stepNumber]/fetch-leads/route";
import { createChainBuilder } from "../../../helpers/mock-supabase";

// ==============================================
// MOCKS
// ==============================================

const mockGetCurrentUserProfile = vi.fn();

vi.mock("@/lib/supabase/tenant", () => ({
  getCurrentUserProfile: () => mockGetCurrentUserProfile(),
}));

const mockFrom = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({
    from: mockFrom,
  })),
}));

const mockSearchPeople = vi.fn();

vi.mock("@/lib/services/apollo", () => ({
  ApolloService: class MockApolloService {
    searchPeople = mockSearchPeople;
    constructor() {}
  },
}));

vi.mock("@/lib/agent/steps/search-leads-step", () => ({
  mapLeadRowToSearchLeadResult: (lead: Record<string, unknown>) => ({
    name: [lead.first_name, lead.last_name].filter(Boolean).join(" "),
    title: lead.title ?? null,
    companyName: lead.company_name ?? null,
    email: lead.email ?? null,
    linkedinUrl: lead.linkedin_url ?? null,
    apolloId: lead.apollo_id ?? null,
  }),
}));

// ==============================================
// HELPERS
// ==============================================

const mockProfile = {
  id: "user-123",
  tenant_id: "tenant-456",
  role: "user",
};

const EXEC_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
const STEP_NUM = "2";

function createRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest(
    `http://localhost/api/agent/executions/${EXEC_ID}/steps/${STEP_NUM}/fetch-leads`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

function createParams(executionId = EXEC_ID, stepNumber = STEP_NUM) {
  return { params: Promise.resolve({ executionId, stepNumber }) };
}

function makeLead(id: number, email: string | null = `lead${id}@test.com`) {
  return {
    id: `lead-${id}`,
    tenant_id: "tenant-456",
    apollo_id: `apollo-${id}`,
    first_name: `Lead`,
    last_name: `${id}`,
    email,
    phone: null,
    company_name: `Company ${id}`,
    company_size: null,
    industry: null,
    location: null,
    title: "CTO",
    linkedin_url: null,
    photo_url: null,
    status: "novo",
    has_email: !!email,
    has_direct_phone: "No",
    created_at: "2026-03-30T10:00:00Z",
    updated_at: "2026-03-30T10:00:00Z",
    icebreaker: null,
    icebreaker_generated_at: null,
    linkedin_posts_cache: null,
    is_monitored: false,
  };
}

function makePageResponse(leads: ReturnType<typeof makeLead>[], page: number, totalPages: number, totalEntries: number) {
  return {
    leads,
    pagination: { totalEntries, page, perPage: 25, totalPages },
  };
}

const baseStepOutput = {
  leads: [
    { name: "Lead 1", title: "CTO", companyName: "Company 1", email: "lead1@test.com", linkedinUrl: null, apolloId: "apollo-1" },
  ],
  totalFound: 500,
  jobTitles: ["CTO"],
  domainsSearched: [],
  searchFilters: { titles: ["CTO"], perPage: 25, page: 1 },
};

function setupDefaultMocks() {
  mockGetCurrentUserProfile.mockResolvedValue(mockProfile);

  const executionChain = createChainBuilder({
    data: { id: EXEC_ID, tenant_id: "tenant-456" },
    error: null,
  });

  const updateChain = createChainBuilder({ data: null, error: null });

  mockFrom.mockImplementation((table: string) => {
    if (table === "agent_executions") return executionChain;
    if (table === "agent_steps") {
      // Return different chains for select vs update
      const chain = createChainBuilder({
        data: {
          step_number: 2,
          step_type: "search_leads",
          status: "awaiting_approval",
          output: baseStepOutput,
          cost: { apollo_search: 25 },
        },
        error: null,
      });
      // Override update to return updateChain
      chain.update = vi.fn().mockReturnValue(updateChain);
      return chain;
    }
    return createChainBuilder();
  });
}

// ==============================================
// TESTS
// ==============================================

describe("POST /api/agent/executions/[executionId]/steps/[stepNumber]/fetch-leads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  // --- 200: pagination with 4 pages ---
  it("200 — fetches 100 leads with pagination (4 pages of 25)", async () => {
    // 4 pages of 25 leads each
    for (let page = 1; page <= 4; page++) {
      const leads = Array.from({ length: 25 }, (_, i) => makeLead((page - 1) * 25 + i + 1));
      mockSearchPeople.mockResolvedValueOnce(makePageResponse(leads, page, 20, 500));
    }

    const request = createRequest({ desiredCount: 100 });
    const response = await POST(request, createParams());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.leads).toHaveLength(100);
    expect(json.data.totalFetched).toBe(100);
    expect(json.data.totalFound).toBe(500);
    expect(mockSearchPeople).toHaveBeenCalledTimes(4);
    // Verify pages were called in order
    expect(mockSearchPeople).toHaveBeenNthCalledWith(1, expect.objectContaining({ page: 1 }));
    expect(mockSearchPeople).toHaveBeenNthCalledWith(2, expect.objectContaining({ page: 2 }));
    expect(mockSearchPeople).toHaveBeenNthCalledWith(3, expect.objectContaining({ page: 3 }));
    expect(mockSearchPeople).toHaveBeenNthCalledWith(4, expect.objectContaining({ page: 4 }));
  });

  // --- 200: stops when totalPages reached ---
  it("200 — stops when totalPages is reached before desiredCount", async () => {
    // Only 2 pages available (50 leads total)
    for (let page = 1; page <= 2; page++) {
      const leads = Array.from({ length: 25 }, (_, i) => makeLead((page - 1) * 25 + i + 1));
      mockSearchPeople.mockResolvedValueOnce(makePageResponse(leads, page, 2, 50));
    }

    const request = createRequest({ desiredCount: 100 });
    const response = await POST(request, createParams());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.leads).toHaveLength(50);
    expect(mockSearchPeople).toHaveBeenCalledTimes(2);
  });

  // --- 200: dedup by email ---
  it("200 — deduplicates leads by email (case-insensitive)", async () => {
    const page1Leads = [makeLead(1, "DUP@test.com"), makeLead(2, "unique@test.com")];
    const page2Leads = [makeLead(3, "dup@test.com"), makeLead(4, "another@test.com")];

    mockSearchPeople
      .mockResolvedValueOnce(makePageResponse(page1Leads, 1, 2, 50))
      .mockResolvedValueOnce(makePageResponse(page2Leads, 2, 2, 50));

    const request = createRequest({ desiredCount: 50 });
    const response = await POST(request, createParams());
    const json = await response.json();

    expect(response.status).toBe(200);
    // Lead 3 (dup@test.com) should be deduplicated with Lead 1 (DUP@test.com)
    expect(json.data.leads).toHaveLength(3);
    const emails = json.data.leads.map((l: Record<string, unknown>) => l.email);
    expect(emails).toContain("DUP@test.com");
    expect(emails).toContain("unique@test.com");
    expect(emails).toContain("another@test.com");
  });

  // --- 200: leads without email/apolloId are kept (not silently dropped) ---
  it("200 — keeps leads without email and apolloId (treated as unique)", async () => {
    const leadsWithNoKey = [
      makeLead(1, null),  // email=null, apolloId=apollo-1 → dedup by apolloId
      makeLead(2, null),  // email=null, apolloId=apollo-2 → unique
    ];
    // Override apolloId to null for lead 2 to test the no-key path
    leadsWithNoKey[1].apollo_id = null;

    mockSearchPeople.mockResolvedValueOnce(makePageResponse(leadsWithNoKey, 1, 1, 2));

    const request = createRequest({ desiredCount: 25 });
    const response = await POST(request, createParams());
    const json = await response.json();

    expect(response.status).toBe(200);
    // Both leads should be kept — lead without email/apolloId is treated as unique
    expect(json.data.leads).toHaveLength(2);
  });

  // --- 400: desiredCount < 1 ---
  it("400 — rejects desiredCount < 1", async () => {
    const request = createRequest({ desiredCount: 0 });
    const response = await POST(request, createParams());

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });

  // --- 400: desiredCount > 500 ---
  it("400 — rejects desiredCount > 500", async () => {
    const request = createRequest({ desiredCount: 501 });
    const response = await POST(request, createParams());

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });

  // --- 400: step not awaiting_approval ---
  it("400 — rejects when step is not awaiting_approval", async () => {
    // Override step mock with different status
    const executionChain = createChainBuilder({
      data: { id: EXEC_ID, tenant_id: "tenant-456" },
      error: null,
    });

    const stepChain = createChainBuilder({
      data: {
        step_number: 2,
        step_type: "search_leads",
        status: "completed",
        output: baseStepOutput,
        cost: { apollo_search: 25 },
      },
      error: null,
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === "agent_executions") return executionChain;
      if (table === "agent_steps") return stepChain;
      return createChainBuilder();
    });

    const request = createRequest({ desiredCount: 100 });
    const response = await POST(request, createParams());

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error.code).toBe("CONFLICT");
  });

  // --- 400: step has no searchFilters ---
  it("400 — rejects when step has no searchFilters in output", async () => {
    const executionChain = createChainBuilder({
      data: { id: EXEC_ID, tenant_id: "tenant-456" },
      error: null,
    });

    const stepChain = createChainBuilder({
      data: {
        step_number: 2,
        step_type: "search_leads",
        status: "awaiting_approval",
        output: { leads: [], totalFound: 0 },
        cost: {},
      },
      error: null,
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === "agent_executions") return executionChain;
      if (table === "agent_steps") return stepChain;
      return createChainBuilder();
    });

    const request = createRequest({ desiredCount: 100 });
    const response = await POST(request, createParams());

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error.code).toBe("MISSING_FILTERS");
  });

  // --- 401: unauthenticated ---
  it("401 — rejects when not authenticated", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(null);

    const request = createRequest({ desiredCount: 100 });
    const response = await POST(request, createParams());

    expect(response.status).toBe(401);
    const json = await response.json();
    expect(json.error.code).toBe("UNAUTHORIZED");
  });

  // --- Cost update ---
  it("updates cost correctly in step record", async () => {
    const leads = Array.from({ length: 25 }, (_, i) => makeLead(i + 1));
    mockSearchPeople.mockResolvedValueOnce(makePageResponse(leads, 1, 20, 500));

    const request = createRequest({ desiredCount: 25 });
    const response = await POST(request, createParams());

    expect(response.status).toBe(200);
    const json = await response.json();
    // Initial cost was 25 (1 lead in baseStepOutput). Fetched 25 new leads = 24 net new.
    // Cost = 25 (existing) + 24 * 1 = 49
    expect(json.data.cost.apollo_search).toBe(49);
  });
});
