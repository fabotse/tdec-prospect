/**
 * Unit Tests for GET /api/agent/executions/[executionId]/plan
 * Story 16.5 - AC: #1, #2, #3
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/agent/executions/[executionId]/plan/route";
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

// ==============================================
// HELPERS
// ==============================================

const mockProfile = {
  id: "user-123",
  tenant_id: "tenant-456",
  role: "user",
};

const EXEC_ID = "exec-001";

const mockBriefing = {
  technology: "Netskope",
  jobTitles: ["CTO"],
  location: "Sao Paulo",
  companySize: null,
  industry: null,
  productSlug: null,
  mode: "guided",
  skipSteps: [],
};

function createRequest(): NextRequest {
  return new NextRequest(
    `http://localhost/api/agent/executions/${EXEC_ID}/plan`,
    { method: "GET" }
  );
}

function createParams() {
  return { params: Promise.resolve({ executionId: EXEC_ID }) };
}

// ==============================================
// TESTS
// ==============================================

describe("GET /api/agent/executions/[executionId]/plan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deve retornar 401 quando nao autenticado", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(null);

    const response = await GET(createRequest(), createParams());
    expect(response.status).toBe(401);

    const json = await response.json();
    expect(json.error.code).toBe("UNAUTHORIZED");
  });

  it("deve retornar 404 quando execucao nao encontrada", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);

    const chain = createChainBuilder({ data: null, error: null });
    mockFrom.mockReturnValue(chain);

    const response = await GET(createRequest(), createParams());
    expect(response.status).toBe(404);

    const json = await response.json();
    expect(json.error.code).toBe("NOT_FOUND");
  });

  it("deve retornar 400 quando briefing esta vazio", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);

    const chain = createChainBuilder({
      data: { id: EXEC_ID, briefing: null, status: "pending" },
      error: null,
    });
    mockFrom.mockReturnValue(chain);

    const response = await GET(createRequest(), createParams());
    expect(response.status).toBe(400);

    const json = await response.json();
    expect(json.error.code).toBe("INVALID_BRIEFING");
  });

  it("deve retornar 400 quando briefing nao tem technology NEM jobTitles", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);

    const chain = createChainBuilder({
      data: {
        id: EXEC_ID,
        briefing: { ...mockBriefing, technology: null, jobTitles: [] },
        status: "pending",
      },
      error: null,
    });
    mockFrom.mockReturnValue(chain);

    const response = await GET(createRequest(), createParams());
    expect(response.status).toBe(400);
  });

  it("deve retornar 200 quando briefing tem jobTitles sem technology (direct entry - Story 17.10)", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);

    const directEntryBriefing = {
      ...mockBriefing,
      technology: null,
      jobTitles: ["CTO"],
      skipSteps: ["search_companies"],
    };

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return createChainBuilder({
          data: { id: EXEC_ID, briefing: directEntryBriefing, status: "pending" },
          error: null,
        });
      }
      return createChainBuilder({ data: [], error: null });
    });

    const response = await GET(createRequest(), createParams());
    expect(response.status).toBe(200);

    const json = await response.json();
    expect(json.data.totalActiveSteps).toBe(4); // 5 - 1 skipped
  });

  it("deve retornar 200 com plan, costEstimate e totalActiveSteps", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);

    // First call: agent_executions (select), second: cost_models (select), third: cost_models (insert+select)
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // agent_executions
        return createChainBuilder({
          data: { id: EXEC_ID, briefing: mockBriefing, status: "pending" },
          error: null,
        });
      }
      // cost_models — return empty first (triggers lazy seed), then return defaults
      return createChainBuilder({
        data: [],
        error: null,
      });
    });

    const response = await GET(createRequest(), createParams());
    expect(response.status).toBe(200);

    const json = await response.json();
    expect(json.data).toBeDefined();
    expect(json.data.steps).toHaveLength(5);
    expect(json.data.costEstimate).toBeDefined();
    expect(json.data.costEstimate.currency).toBe("BRL");
    expect(json.data.totalActiveSteps).toBe(5);
  });

  it("deve retornar totalActiveSteps menor quando ha skipSteps", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);

    const briefingWithSkips = {
      ...mockBriefing,
      skipSteps: ["search_companies", "export"],
    };

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return createChainBuilder({
          data: { id: EXEC_ID, briefing: briefingWithSkips, status: "pending" },
          error: null,
        });
      }
      return createChainBuilder({ data: [], error: null });
    });

    const response = await GET(createRequest(), createParams());
    expect(response.status).toBe(200);

    const json = await response.json();
    expect(json.data.totalActiveSteps).toBe(3);
  });

  it("deve retornar 200 com briefing contendo importedLeads sem technology nem jobTitles (AC: 17.11#3)", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);

    const briefingWithImportedLeads = {
      technology: null,
      jobTitles: [],
      location: null,
      companySize: null,
      industry: null,
      productSlug: null,
      mode: "guided",
      skipSteps: ["search_companies", "search_leads"],
      importedLeads: [
        { name: "Joao", title: "CTO", companyName: "Acme", email: "joao@acme.com", linkedinUrl: null, apolloId: null },
      ],
    };

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return createChainBuilder({
          data: { id: EXEC_ID, briefing: briefingWithImportedLeads, status: "pending" },
          error: null,
        });
      }
      return createChainBuilder({ data: [], error: null });
    });

    const response = await GET(createRequest(), createParams());
    expect(response.status).toBe(200);
  });
});
