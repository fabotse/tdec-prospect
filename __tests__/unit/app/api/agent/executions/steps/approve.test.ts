/**
 * Unit Tests for POST /api/agent/executions/[executionId]/steps/[stepNumber]/approve
 * Story 17.5 - AC: #2, #4
 *
 * Tests: happy path, step not awaiting_approval (409), step not found (404),
 * approvedData merge (leads filtrados)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createChainBuilder } from "../../../../../../helpers/mock-supabase";

// ==============================================
// MOCKS
// ==============================================

const mockGetCurrentUserProfile = vi.fn();

vi.mock("@/lib/supabase/tenant", () => ({
  getCurrentUserProfile: () => mockGetCurrentUserProfile(),
}));

const executionsChain = createChainBuilder({
  data: { id: "exec-001", tenant_id: "tenant-1" },
  error: null,
});

const stepsChain = createChainBuilder({
  data: {
    step_number: 1,
    step_type: "search_companies",
    status: "awaiting_approval",
    output: { companies: [{ name: "Acme" }], totalFound: 1 },
  },
  error: null,
});

const messagesChain = createChainBuilder({ data: { id: "msg-1" }, error: null });
const updateChain = createChainBuilder({ data: null, error: null });

const mockFrom = vi.fn().mockImplementation((table: string) => {
  if (table === "agent_executions") return executionsChain;
  if (table === "agent_steps") {
    // Return stepsChain for select, updateChain for update
    return {
      ...stepsChain,
      update: vi.fn().mockReturnValue(updateChain),
    };
  }
  if (table === "agent_messages") return messagesChain;
  return createChainBuilder();
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({
    from: mockFrom,
  })),
}));

import { POST } from "@/app/api/agent/executions/[executionId]/steps/[stepNumber]/approve/route";

// ==============================================
// HELPERS
// ==============================================

const VALID_UUID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
const mockProfile = { tenant_id: "tenant-1", id: "user-1" };

function createRequest(body?: unknown): NextRequest {
  if (body) {
    return new NextRequest("http://localhost/api/agent/executions/x/steps/1/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }
  return new NextRequest("http://localhost/api/agent/executions/x/steps/1/approve", {
    method: "POST",
  });
}

function createParams(executionId = VALID_UUID, stepNumber = "1") {
  return { params: Promise.resolve({ executionId, stepNumber }) };
}

// ==============================================
// TESTS
// ==============================================

describe("POST /api/agent/executions/[executionId]/steps/[stepNumber]/approve", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);

    // Reset chains
    executionsChain.select = vi.fn().mockReturnValue(executionsChain);
    executionsChain.eq = vi.fn().mockReturnValue(executionsChain);
    executionsChain.single = vi.fn().mockReturnValue(executionsChain);
    executionsChain.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: { id: VALID_UUID, tenant_id: "tenant-1" }, error: null }).then(resolve);

    stepsChain.select = vi.fn().mockReturnValue(stepsChain);
    stepsChain.eq = vi.fn().mockReturnValue(stepsChain);
    stepsChain.single = vi.fn().mockReturnValue(stepsChain);
    stepsChain.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve({
        data: {
          step_number: 1,
          step_type: "search_companies",
          status: "awaiting_approval",
          output: { companies: [{ name: "Acme" }], totalFound: 1 },
        },
        error: null,
      }).then(resolve);

    mockFrom.mockImplementation((table: string) => {
      if (table === "agent_executions") return executionsChain;
      if (table === "agent_steps") return stepsChain;
      if (table === "agent_messages") return messagesChain;
      return createChainBuilder();
    });
  });

  // 9.4 - Happy path
  it("approves step and returns nextStep (9.4)", async () => {
    const res = await POST(createRequest(), createParams());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toEqual({
      stepNumber: 1,
      status: "approved",
      nextStep: 2,
    });
  });

  // Auth
  it("returns 401 when not authenticated", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(null);

    const res = await POST(createRequest(), createParams());
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error.code).toBe("UNAUTHORIZED");
  });

  // Invalid UUID
  it("returns 400 for invalid executionId", async () => {
    const res = await POST(createRequest(), createParams("not-a-uuid"));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error.code).toBe("INVALID_PARAMS");
  });

  // Invalid stepNumber
  it("returns 400 for invalid stepNumber", async () => {
    const res = await POST(createRequest(), createParams(VALID_UUID, "abc"));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error.code).toBe("INVALID_PARAMS");
  });

  // 9.6 - Step not found
  it("returns 404 when step not found (9.6)", async () => {
    stepsChain.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: null, error: null }).then(resolve);

    const res = await POST(createRequest(), createParams());
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error.code).toBe("NOT_FOUND");
  });

  // 9.5 - Step not awaiting_approval -> 409
  it("returns 409 when step is not awaiting_approval (9.5)", async () => {
    stepsChain.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve({
        data: {
          step_number: 1,
          step_type: "search_companies",
          status: "completed",
          output: {},
        },
        error: null,
      }).then(resolve);

    const res = await POST(createRequest(), createParams());
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.error.code).toBe("CONFLICT");
  });

  // 9.7 - approvedData merge (leads filtrados)
  it("merges approvedData.leads into output when provided (9.7)", async () => {
    const approvedLeads = [{ name: "John", email: "john@acme.com" }];

    await POST(
      createRequest({ approvedData: { leads: approvedLeads } }),
      createParams()
    );

    // Verify update was called with merged output containing approvedLeads
    expect(stepsChain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "approved",
        completed_at: expect.any(String),
        output: expect.objectContaining({
          approvedLeads: approvedLeads,
        }),
      })
    );
  });

  // Execution not found / wrong tenant
  it("returns 404 when execution not found or wrong tenant", async () => {
    executionsChain.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: null, error: null }).then(resolve);

    const res = await POST(createRequest(), createParams());
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error.code).toBe("NOT_FOUND");
  });
});
