/**
 * Unit Tests for POST /api/agent/executions/[executionId]/steps/[stepNumber]/reject
 * Story 17.5 - AC: #5
 *
 * Tests: happy path, step not awaiting_approval (409), message with reason
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
  },
  error: null,
});

const messagesChain = createChainBuilder({ data: { id: "msg-1" }, error: null });

const mockFrom = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({
    from: mockFrom,
  })),
}));

import { POST } from "@/app/api/agent/executions/[executionId]/steps/[stepNumber]/reject/route";

// ==============================================
// HELPERS
// ==============================================

const VALID_UUID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
const mockProfile = { tenant_id: "tenant-1", id: "user-1" };

function createRequest(body?: unknown): NextRequest {
  if (body) {
    return new NextRequest("http://localhost/api/agent/executions/x/steps/1/reject", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }
  return new NextRequest("http://localhost/api/agent/executions/x/steps/1/reject", {
    method: "POST",
  });
}

function createParams(executionId = VALID_UUID, stepNumber = "1") {
  return { params: Promise.resolve({ executionId, stepNumber }) };
}

// ==============================================
// TESTS
// ==============================================

describe("POST /api/agent/executions/[executionId]/steps/[stepNumber]/reject", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);

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

  // 9.8 - Happy path
  it("rejects step, inserts message, status remains awaiting_approval (9.8)", async () => {
    const res = await POST(createRequest(), createParams());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toEqual({
      stepNumber: 1,
      status: "awaiting_approval",
      message: "Aguardando ajustes",
    });

    // Message inserted
    expect(messagesChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        execution_id: VALID_UUID,
        role: "agent",
        content: expect.stringContaining("Busca de Empresas"),
      })
    );
  });

  // 9.8 - With reason
  it("includes reason in message when provided", async () => {
    await POST(
      createRequest({ reason: "Muitas empresas irrelevantes" }),
      createParams()
    );

    expect(messagesChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining("Muitas empresas irrelevantes"),
      })
    );
  });

  // Auth
  it("returns 401 when not authenticated", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(null);

    const res = await POST(createRequest(), createParams());
    expect(res.status).toBe(401);
  });

  // 9.9 - Step not awaiting_approval -> 409
  it("returns 409 when step is not awaiting_approval (9.9)", async () => {
    stepsChain.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve({
        data: {
          step_number: 1,
          step_type: "search_companies",
          status: "completed",
        },
        error: null,
      }).then(resolve);

    const res = await POST(createRequest(), createParams());
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.error.code).toBe("CONFLICT");
  });

  // Invalid params
  it("returns 400 for invalid executionId", async () => {
    const res = await POST(createRequest(), createParams("not-uuid"));
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid stepNumber", async () => {
    const res = await POST(createRequest(), createParams(VALID_UUID, "-1"));
    expect(res.status).toBe(400);
  });

  // Step not found
  it("returns 404 when step not found", async () => {
    stepsChain.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: null, error: null }).then(resolve);

    const res = await POST(createRequest(), createParams());
    expect(res.status).toBe(404);
  });
});
