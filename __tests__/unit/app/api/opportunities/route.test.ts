/**
 * Tests for GET /api/opportunities
 * Story 21.4: Central de Oportunidades — Página e Cards
 *
 * AC: #2 - DTO enriquecido (lead LEFT embed, campaignName via Map, intent)
 * AC: #3 - Insight do LinkedIn para leads monitorados
 * AC: #4 - Filtros: intent, status, campanha, período
 * AC: #7 - Tenant-scope (defesa em profundidade sobre a RLS)
 * AC: #8 - Auth, paginação, LEFT embed (regressão contra !inner)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockGetCurrentUserProfile = vi.fn();
const mockFrom = vi.fn();

vi.mock("@/lib/supabase/tenant", () => ({
  getCurrentUserProfile: () => mockGetCurrentUserProfile(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({
    from: mockFrom,
  })),
}));

import { GET } from "@/app/api/opportunities/route";

function makeRequest(params: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/opportunities");
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  return new NextRequest(url);
}

const mockProfile = { tenant_id: "tenant-1", id: "user-1" };

function makeMockOpportunityRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "opp-1",
    tenant_id: "tenant-1",
    lead_id: "lead-1",
    campaign_id: "camp-1",
    source: "reply",
    reply_event_id: "evt-1",
    reply_text: "Tenho interesse, pode me ligar",
    reply_subject: "RE: Proposta",
    unibox_url: "https://app.instantly.ai/unibox/1",
    intent: "interessado",
    lt_interest_status: null,
    suggestion: null,
    status: "new",
    meeting_booked_at: null,
    open_count: null,
    click_count: null,
    last_engagement_at: null,
    created_at: "2026-07-13T10:00:00Z",
    updated_at: "2026-07-13T10:00:00Z",
    lead: {
      id: "lead-1",
      first_name: "John",
      last_name: "Doe",
      email: "john@acme.com",
      company_name: "Acme Inc",
      title: "CTO",
      phone: "+5511999999999",
      photo_url: null,
      is_monitored: false,
      linkedin_url: null,
    },
    ...overrides,
  };
}

interface TableResponses {
  opportunities?: { data: unknown; error: unknown; count?: number };
  campaigns?: { data: unknown; error: unknown };
  leadInsights?: { data: unknown; error: unknown };
}

function makeChain(response: { data: unknown; error: unknown; count?: number }) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    then: (resolve: (v: unknown) => unknown) =>
      Promise.resolve(response).then(resolve),
  };
}

function setupTables(responses: TableResponses) {
  const opportunitiesChain = makeChain(
    responses.opportunities ?? { data: [], error: null, count: 0 }
  );
  const campaignsChain = makeChain(responses.campaigns ?? { data: [], error: null });
  const insightsChain = makeChain(responses.leadInsights ?? { data: [], error: null });

  mockFrom.mockImplementation((table: string) => {
    if (table === "opportunities") return opportunitiesChain;
    if (table === "campaigns") return campaignsChain;
    if (table === "lead_insights") return insightsChain;
    return makeChain({ data: null, error: null });
  });

  return { opportunitiesChain, campaignsChain, insightsChain };
}

describe("GET /api/opportunities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
  });

  it("should return 401 when not authenticated", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(null);

    const response = await GET(makeRequest());
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json.error.code).toBe("UNAUTHORIZED");
  });

  it("should return opportunities with lead data and campaign name", async () => {
    setupTables({
      opportunities: { data: [makeMockOpportunityRow()], error: null, count: 1 },
      campaigns: { data: [{ id: "camp-1", name: "Campanha Q3" }], error: null },
    });

    const response = await GET(makeRequest());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data).toHaveLength(1);
    expect(json.data[0].id).toBe("opp-1");
    expect(json.data[0].lead.firstName).toBe("John");
    expect(json.data[0].lead.companyName).toBe("Acme Inc");
    expect(json.data[0].campaignName).toBe("Campanha Q3");
    expect(json.data[0].intent).toBe("interessado");
    expect(json.data[0].replyText).toBe("Tenho interesse, pode me ligar");
    expect(json.meta.total).toBe(1);
    expect(json.meta.page).toBe(1);
    expect(json.meta.limit).toBe(25);
  });

  it("should transform snake_case to camelCase", async () => {
    setupTables({
      opportunities: { data: [makeMockOpportunityRow()], error: null, count: 1 },
    });

    const response = await GET(makeRequest());
    const json = await response.json();

    const opp = json.data[0];
    expect(opp.tenantId).toBe("tenant-1");
    expect(opp.leadId).toBe("lead-1");
    expect(opp.replySubject).toBe("RE: Proposta");
    expect(opp.uniboxUrl).toBe("https://app.instantly.ai/unibox/1");
    expect(opp.createdAt).toBe("2026-07-13T10:00:00Z");
  });

  it("should filter by tenant_id", async () => {
    const { opportunitiesChain } = setupTables({});

    await GET(makeRequest());

    expect(opportunitiesChain.eq).toHaveBeenCalledWith("tenant_id", "tenant-1");
  });

  it("should use LEFT embed (no !inner) so cards without lead survive", async () => {
    // Regressão contra `leads!inner` — lead_id é nullable (00055) e !inner
    // dropa silenciosamente oportunidades sem lead (21.2 AC7).
    const { opportunitiesChain } = setupTables({
      opportunities: {
        data: [makeMockOpportunityRow({ lead_id: null, lead: null })],
        error: null,
        count: 1,
      },
    });

    const response = await GET(makeRequest());
    const json = await response.json();

    const selectArg = opportunitiesChain.select.mock.calls[0][0] as string;
    expect(selectArg).not.toContain("!inner");
    expect(selectArg).toContain("lead:leads");

    expect(response.status).toBe(200);
    expect(json.data).toHaveLength(1);
    expect(json.data[0].lead).toBeNull();
    expect(json.data[0].leadId).toBeNull();
  });

  it("should apply intent filter (CSV)", async () => {
    const { opportunitiesChain } = setupTables({});

    await GET(makeRequest({ intent: "interessado,pediu_info" }));

    expect(opportunitiesChain.in).toHaveBeenCalledWith("intent", [
      "interessado",
      "pediu_info",
    ]);
  });

  it("should apply status filter (CSV)", async () => {
    const { opportunitiesChain } = setupTables({});

    await GET(makeRequest({ status: "new,viewed" }));

    expect(opportunitiesChain.in).toHaveBeenCalledWith("status", ["new", "viewed"]);
  });

  it("should trim whitespace and drop empty segments in CSV filters", async () => {
    const { opportunitiesChain } = setupTables({});

    await GET(makeRequest({ intent: " interessado , pediu_info ,", status: "new, ," }));

    expect(opportunitiesChain.in).toHaveBeenCalledWith("intent", [
      "interessado",
      "pediu_info",
    ]);
    expect(opportunitiesChain.in).toHaveBeenCalledWith("status", ["new"]);
  });

  it("should apply campaign_id filter", async () => {
    const { opportunitiesChain } = setupTables({});

    await GET(makeRequest({ campaign_id: "camp-9" }));

    expect(opportunitiesChain.eq).toHaveBeenCalledWith("campaign_id", "camp-9");
  });

  it("should apply period filter", async () => {
    const { opportunitiesChain } = setupTables({});

    await GET(makeRequest({ period: "7d" }));

    expect(opportunitiesChain.gte).toHaveBeenCalledWith(
      "created_at",
      expect.any(String)
    );
  });

  it("should not apply period filter for 'all'", async () => {
    const { opportunitiesChain } = setupTables({});

    await GET(makeRequest({ period: "all" }));

    expect(opportunitiesChain.gte).not.toHaveBeenCalled();
  });

  it("should order by created_at desc and apply pagination defaults", async () => {
    const { opportunitiesChain } = setupTables({});

    await GET(makeRequest());

    expect(opportunitiesChain.order).toHaveBeenCalledWith("created_at", {
      ascending: false,
    });
    expect(opportunitiesChain.range).toHaveBeenCalledWith(0, 24);
  });

  it("should apply custom pagination", async () => {
    const { opportunitiesChain } = setupTables({});

    await GET(makeRequest({ page: "2", per_page: "10" }));

    expect(opportunitiesChain.range).toHaveBeenCalledWith(10, 19);
  });

  it("should clamp per_page to max 100 and page to min 1", async () => {
    const { opportunitiesChain } = setupTables({});

    await GET(makeRequest({ page: "-5", per_page: "200" }));

    expect(opportunitiesChain.range).toHaveBeenCalledWith(0, 99);
  });

  it("should fall back to defaults on non-numeric page/per_page (no NaN range/meta)", async () => {
    const { opportunitiesChain } = setupTables({
      opportunities: { data: [], error: null, count: 0 },
    });

    const response = await GET(makeRequest({ page: "abc", per_page: "xyz" }));
    const json = await response.json();

    expect(opportunitiesChain.range).toHaveBeenCalledWith(0, 24);
    expect(json.meta.page).toBe(1);
    expect(json.meta.limit).toBe(25);
    expect(Number.isNaN(json.meta.totalPages)).toBe(false);
  });

  it("should calculate totalPages correctly", async () => {
    setupTables({
      opportunities: { data: [], error: null, count: 75 },
    });

    const response = await GET(makeRequest({ per_page: "25" }));
    const json = await response.json();

    expect(json.meta.totalPages).toBe(3);
  });

  it("should return campaignName null when campaign is missing from map", async () => {
    setupTables({
      opportunities: { data: [makeMockOpportunityRow()], error: null, count: 1 },
      campaigns: { data: [], error: null },
    });

    const response = await GET(makeRequest());
    const json = await response.json();

    expect(json.data[0].campaignName).toBeNull();
  });

  it("should scope campaigns lookup by tenant_id", async () => {
    const { campaignsChain } = setupTables({
      opportunities: { data: [makeMockOpportunityRow()], error: null, count: 1 },
      campaigns: { data: [{ id: "camp-1", name: "Campanha Q3" }], error: null },
    });

    await GET(makeRequest());

    expect(campaignsChain.in).toHaveBeenCalledWith("id", ["camp-1"]);
    expect(campaignsChain.eq).toHaveBeenCalledWith("tenant_id", "tenant-1");
  });

  it("should attach latest LinkedIn insight for monitored leads (AC3)", async () => {
    const monitoredRow = makeMockOpportunityRow({
      lead: {
        id: "lead-1",
        first_name: "John",
        last_name: "Doe",
        email: "john@acme.com",
        company_name: "Acme Inc",
        title: "CTO",
        phone: null,
        photo_url: null,
        is_monitored: true,
        linkedin_url: null,
      },
    });
    const { insightsChain } = setupTables({
      opportunities: { data: [monitoredRow], error: null, count: 1 },
      leadInsights: {
        data: [
          {
            lead_id: "lead-1",
            suggestion: "Abordar sobre expansão",
            relevance_reasoning: "Postou sobre crescimento",
            post_url: "https://linkedin.com/post/9",
            post_text: "Crescendo o time",
            post_published_at: "2026-07-10T10:00:00Z",
            created_at: "2026-07-12T10:00:00Z",
          },
          {
            lead_id: "lead-1",
            suggestion: "Insight antigo",
            relevance_reasoning: null,
            post_url: null,
            post_text: null,
            post_published_at: null,
            created_at: "2026-07-01T10:00:00Z",
          },
        ],
        error: null,
      },
    });

    const response = await GET(makeRequest());
    const json = await response.json();

    // Só o mais recente (order created_at desc → primeiro por lead)
    expect(json.data[0].insight.suggestion).toBe("Abordar sobre expansão");
    expect(json.data[0].insight.relevanceReasoning).toBe("Postou sobre crescimento");
    expect(json.data[0].insight.postUrl).toBe("https://linkedin.com/post/9");
    expect(insightsChain.in).toHaveBeenCalledWith("lead_id", ["lead-1"]);
    expect(insightsChain.eq).toHaveBeenCalledWith("tenant_id", "tenant-1");
  });

  it("should not fetch insights for non-monitored leads", async () => {
    const { insightsChain } = setupTables({
      opportunities: { data: [makeMockOpportunityRow()], error: null, count: 1 },
    });

    const response = await GET(makeRequest());
    const json = await response.json();

    expect(json.data[0].insight).toBeNull();
    expect(insightsChain.select).not.toHaveBeenCalled();
  });

  it("should keep responding when insights query fails (contexto secundário)", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const monitoredRow = makeMockOpportunityRow({
      lead: {
        id: "lead-1",
        first_name: "John",
        last_name: null,
        email: null,
        company_name: null,
        title: null,
        phone: null,
        photo_url: null,
        is_monitored: true,
        linkedin_url: null,
      },
    });
    setupTables({
      opportunities: { data: [monitoredRow], error: null, count: 1 },
      leadInsights: { data: null, error: { message: "boom" } },
    });

    const response = await GET(makeRequest());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data[0].insight).toBeNull();
    warnSpy.mockRestore();
  });

  it("should return engagement opportunity fields (source, counts)", async () => {
    const engagementRow = makeMockOpportunityRow({
      source: "engagement",
      reply_event_id: null,
      reply_text: null,
      reply_subject: null,
      unibox_url: null,
      intent: null,
      open_count: 5,
      click_count: 2,
      last_engagement_at: "2026-07-12T08:00:00Z",
    });
    setupTables({
      opportunities: { data: [engagementRow], error: null, count: 1 },
    });

    const response = await GET(makeRequest());
    const json = await response.json();

    expect(json.data[0].source).toBe("engagement");
    expect(json.data[0].openCount).toBe(5);
    expect(json.data[0].clickCount).toBe(2);
    expect(json.data[0].lastEngagementAt).toBe("2026-07-12T08:00:00Z");
    expect(json.data[0].intent).toBeNull();
    expect(json.data[0].replyText).toBeNull();
  });

  it("should return empty data array when no opportunities", async () => {
    setupTables({});

    const response = await GET(makeRequest());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data).toEqual([]);
    expect(json.meta.total).toBe(0);
    expect(json.meta.totalPages).toBe(0);
  });

  it("should return 500 on database error", async () => {
    setupTables({
      opportunities: { data: null, error: { message: "DB error" }, count: 0 },
    });

    const response = await GET(makeRequest());
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.error.code).toBe("INTERNAL_ERROR");
  });
});
