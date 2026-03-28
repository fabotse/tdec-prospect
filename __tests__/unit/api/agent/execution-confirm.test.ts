/**
 * Unit Tests for POST /api/agent/executions/[executionId]/confirm
 * Story 16.5 - AC: #4
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/agent/executions/[executionId]/confirm/route";
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

const mockExecution = {
  id: EXEC_ID,
  briefing: mockBriefing,
  status: "pending",
};

function createRequest(): NextRequest {
  return new NextRequest(
    `http://localhost/api/agent/executions/${EXEC_ID}/confirm`,
    { method: "POST" }
  );
}

function createParams() {
  return { params: Promise.resolve({ executionId: EXEC_ID }) };
}

// ==============================================
// TESTS
// ==============================================

describe("POST /api/agent/executions/[executionId]/confirm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deve retornar 401 quando nao autenticado", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(null);

    const response = await POST(createRequest(), createParams());
    expect(response.status).toBe(401);

    const json = await response.json();
    expect(json.error.code).toBe("UNAUTHORIZED");
  });

  it("deve retornar 404 quando execucao nao encontrada", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);

    const chain = createChainBuilder({ data: null, error: null });
    mockFrom.mockReturnValue(chain);

    const response = await POST(createRequest(), createParams());
    expect(response.status).toBe(404);

    const json = await response.json();
    expect(json.error.code).toBe("NOT_FOUND");
  });

  it("deve retornar 400 quando briefing esta ausente", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);

    const chain = createChainBuilder({
      data: { ...mockExecution, briefing: null },
      error: null,
    });
    mockFrom.mockReturnValue(chain);

    const response = await POST(createRequest(), createParams());
    expect(response.status).toBe(400);

    const json = await response.json();
    expect(json.error.code).toBe("INVALID_BRIEFING");
  });

  it("deve retornar 400 quando briefing nao tem technology NEM jobTitles", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);

    const chain = createChainBuilder({
      data: { ...mockExecution, briefing: { ...mockBriefing, technology: null, jobTitles: [] } },
      error: null,
    });
    mockFrom.mockReturnValue(chain);

    const response = await POST(createRequest(), createParams());
    expect(response.status).toBe(400);

    const json = await response.json();
    expect(json.error.code).toBe("INVALID_BRIEFING");
  });

  it("deve retornar 200 quando briefing tem jobTitles sem technology (direct entry - Story 17.10)", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);

    const directEntryBriefing = {
      ...mockBriefing,
      technology: null,
      jobTitles: ["CTO"],
      skipSteps: ["search_companies"],
    };
    const executionDirectEntry = { ...mockExecution, briefing: directEntryBriefing };

    let callCount = 0;
    mockFrom.mockImplementation((table: string) => {
      callCount++;
      if (callCount === 1) {
        return createChainBuilder({ data: executionDirectEntry, error: null });
      }
      if (table === "cost_models") {
        return createChainBuilder({ data: [], error: null });
      }
      if (table === "agent_steps") {
        return createChainBuilder({ data: null, error: null });
      }
      if (table === "agent_executions") {
        return createChainBuilder({ data: executionDirectEntry, error: null });
      }
      return createChainBuilder({ data: null, error: null });
    });

    const response = await POST(createRequest(), createParams());
    expect(response.status).toBe(200);
  });

  it("deve retornar 400 quando execucao ja confirmada (status != pending)", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);

    const chain = createChainBuilder({
      data: { ...mockExecution, status: "running" },
      error: null,
    });
    mockFrom.mockReturnValue(chain);

    const response = await POST(createRequest(), createParams());
    expect(response.status).toBe(400);

    const json = await response.json();
    expect(json.error.code).toBe("ALREADY_CONFIRMED");
  });

  it("deve retornar 200 e criar steps + atualizar execucao no sucesso", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);

    const updatedExecution = {
      ...mockExecution,
      cost_estimate: { steps: {}, total: 7.30, currency: "BRL" },
      total_steps: 5,
    };

    let callCount = 0;
    mockFrom.mockImplementation((table: string) => {
      callCount++;
      if (callCount === 1) {
        // agent_executions select
        return createChainBuilder({ data: mockExecution, error: null });
      }
      if (table === "cost_models") {
        // cost_models query (empty → will use defaults)
        return createChainBuilder({ data: [], error: null });
      }
      if (table === "agent_steps") {
        // insert steps
        return createChainBuilder({ data: null, error: null });
      }
      if (table === "agent_executions") {
        // update execution
        return createChainBuilder({ data: updatedExecution, error: null });
      }
      return createChainBuilder({ data: null, error: null });
    });

    const response = await POST(createRequest(), createParams());
    expect(response.status).toBe(200);

    const json = await response.json();
    expect(json.data).toBeDefined();
  });

  it("deve retornar 500 quando insert de steps falha", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);

    let callCount = 0;
    mockFrom.mockImplementation((table: string) => {
      callCount++;
      if (callCount === 1) {
        return createChainBuilder({ data: mockExecution, error: null });
      }
      if (table === "cost_models") {
        return createChainBuilder({ data: [], error: null });
      }
      if (table === "agent_steps") {
        return createChainBuilder({ data: null, error: { message: "Insert failed" } });
      }
      return createChainBuilder({ data: null, error: null });
    });

    const response = await POST(createRequest(), createParams());
    expect(response.status).toBe(500);
  });

  it("cria ALL steps no DB (incluindo skipped como pending) — Story 17.10", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);

    const briefingWithSkips = {
      ...mockBriefing,
      skipSteps: ["search_companies", "export"],
    };
    const executionWithSkips = { ...mockExecution, briefing: briefingWithSkips };

    const insertChain = createChainBuilder({ data: null, error: null });
    let callCount = 0;
    mockFrom.mockImplementation((table: string) => {
      callCount++;
      if (callCount === 1) {
        return createChainBuilder({ data: executionWithSkips, error: null });
      }
      if (table === "cost_models") {
        return createChainBuilder({ data: [], error: null });
      }
      if (table === "agent_steps") {
        return insertChain;
      }
      if (table === "agent_executions") {
        return createChainBuilder({ data: executionWithSkips, error: null });
      }
      return createChainBuilder({ data: null, error: null });
    });

    const response = await POST(createRequest(), createParams());
    expect(response.status).toBe(200);

    // Story 17.10: ALL 5 steps inserted (orchestrator handles skipping at execution time)
    expect(insertChain.insert).toHaveBeenCalled();
    const insertedSteps = insertChain.insert.mock.calls[0][0];
    expect(insertedSteps).toHaveLength(5);
    // All inserted as "pending" — orchestrator's shouldSkip marks them as skipped
    expect(insertedSteps.every((s: { status: string }) => s.status === "pending")).toBe(true);
  });

  it("deve retornar 200 com briefing contendo importedLeads (AC: 17.11#3)", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);

    const executionWithImportedLeads = {
      id: EXEC_ID,
      briefing: {
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
      },
      status: "pending",
    };

    const insertChain = createChainBuilder({ data: null, error: null });
    let callCount = 0;
    mockFrom.mockImplementation((table: string) => {
      callCount++;
      if (callCount === 1) {
        return createChainBuilder({ data: executionWithImportedLeads, error: null });
      }
      if (table === "cost_models") {
        return createChainBuilder({ data: [], error: null });
      }
      if (table === "agent_steps") {
        return insertChain;
      }
      if (table === "agent_executions") {
        return createChainBuilder({ data: executionWithImportedLeads, error: null });
      }
      return createChainBuilder({ data: null, error: null });
    });

    const response = await POST(createRequest(), createParams());
    expect(response.status).toBe(200);
  });
});
