/**
 * Tests for POST /api/replies/process-batch
 * Story 21.2 Task 7.6 — Cron do loop de resposta (auth por secret)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ==============================================
// MOCKS
// ==============================================

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({ from: vi.fn() })),
}));

const mockSweep = vi.fn();
vi.mock("@/lib/utils/reply-sweep", () => ({
  sweepReplies: (...args: unknown[]) => mockSweep(...args),
}));

const mockProcess = vi.fn();
vi.mock("@/lib/utils/reply-processor", () => ({
  processReplies: (...args: unknown[]) => mockProcess(...args),
}));

const mockEngagement = vi.fn();
vi.mock("@/lib/utils/engagement-processor", () => ({
  processEngagement: (...args: unknown[]) => mockEngagement(...args),
}));

import { POST } from "@/app/api/replies/process-batch/route";

// ==============================================
// SETUP
// ==============================================

const CRON_SECRET = "test-replies-secret-123";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("REPLIES_CRON_SECRET", CRON_SECRET);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");
  mockSweep.mockResolvedValue({ swept: 2, skipped: 1, tenants: 1, errors: [] });
  mockProcess.mockResolvedValue({ created: 2, skipped: 0, errors: [] });
  mockEngagement.mockResolvedValue({ created: 0, skipped: 0, errors: [] });
});

function createRequest(authHeader?: string): NextRequest {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (authHeader) headers["Authorization"] = authHeader;
  return new NextRequest("http://localhost/api/replies/process-batch", {
    method: "POST",
    headers,
  });
}

// ==============================================
// TESTS
// ==============================================

describe("POST /api/replies/process-batch", () => {
  it("retorna 401 sem authorization header", async () => {
    const res = await POST(createRequest());
    expect(res.status).toBe(401);
    expect(mockSweep).not.toHaveBeenCalled();
  });

  it("retorna 401 com secret errado", async () => {
    const res = await POST(createRequest("Bearer wrong-secret"));
    expect(res.status).toBe(401);
    expect(mockSweep).not.toHaveBeenCalled();
  });

  it("fail-closed: 401 quando REPLIES_CRON_SECRET não está configurado", async () => {
    vi.stubEnv("REPLIES_CRON_SECRET", "");
    // Sem o guard, "Bearer undefined" passaria — deve ser rejeitado.
    const res = await POST(createRequest("Bearer undefined"));
    expect(res.status).toBe(401);
    expect(mockSweep).not.toHaveBeenCalled();
  });

  it("happy path: sweep + process + engagement e retorna resumo", async () => {
    const res = await POST(createRequest(`Bearer ${CRON_SECRET}`));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({
      swept: 2,
      created: 2,
      skipped: 1,
      engagementCreated: 0,
      engagementSkipped: 0,
      errors: [],
    });
    expect(mockSweep).toHaveBeenCalledTimes(1);
    expect(mockProcess).toHaveBeenCalledTimes(1);
    expect(mockEngagement).toHaveBeenCalledTimes(1);
  });

  it("inclui contadores de engajamento no resumo (Story 21.6)", async () => {
    mockEngagement.mockResolvedValue({ created: 3, skipped: 5, errors: [] });

    const res = await POST(createRequest(`Bearer ${CRON_SECRET}`));
    const json = await res.json();

    expect(json.engagementCreated).toBe(3);
    expect(json.engagementSkipped).toBe(5);
  });

  it("agrega erros de sweep, process e engagement com scope", async () => {
    mockSweep.mockResolvedValue({
      swept: 0,
      skipped: 0,
      tenants: 1,
      errors: [{ tenantId: "t1", error: "api down" }],
    });
    mockProcess.mockResolvedValue({
      created: 0,
      skipped: 0,
      errors: [{ eventId: "e1", error: "db error" }],
    });
    mockEngagement.mockResolvedValue({
      created: 0,
      skipped: 0,
      errors: [{ tenantId: "t1", error: "tracking down" }],
    });

    const res = await POST(createRequest(`Bearer ${CRON_SECRET}`));
    const json = await res.json();

    expect(json.errors).toEqual([
      { scope: "sweep", tenantId: "t1", error: "api down" },
      { scope: "process", eventId: "e1", error: "db error" },
      { scope: "engagement", tenantId: "t1", error: "tracking down" },
    ]);
  });

  it("retorna 500 quando env do Supabase está ausente", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    const res = await POST(createRequest(`Bearer ${CRON_SECRET}`));
    expect(res.status).toBe(500);
    expect(mockSweep).not.toHaveBeenCalled();
  });
});
