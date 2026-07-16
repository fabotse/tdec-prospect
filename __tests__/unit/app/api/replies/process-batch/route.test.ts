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

const mockClassify = vi.fn();
vi.mock("@/lib/utils/reply-classifier", () => ({
  classifyPendingReplies: (...args: unknown[]) => mockClassify(...args),
}));

const mockNotify = vi.fn();
vi.mock("@/lib/utils/notification-processor", () => ({
  notifyNewOpportunities: (...args: unknown[]) => mockNotify(...args),
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
  mockClassify.mockResolvedValue({ classified: 0, skipped: 0, errors: [] });
  mockNotify.mockResolvedValue({
    inAppCreated: 0,
    whatsappSent: 0,
    whatsappGrouped: 0,
    suppressed: 0,
    skipped: 0,
    errors: [],
  });
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
      classified: 0,
      classifySkipped: 0,
      notified: 0,
      whatsappSent: 0,
      whatsappGrouped: 0,
      errors: [],
    });
    expect(mockSweep).toHaveBeenCalledTimes(1);
    expect(mockProcess).toHaveBeenCalledTimes(1);
    expect(mockEngagement).toHaveBeenCalledTimes(1);
    expect(mockClassify).toHaveBeenCalledTimes(1);
    expect(mockNotify).toHaveBeenCalledTimes(1);
  });

  it("Story 21.7: notify roda POR ÚLTIMO (depois do classify) e inclui contadores", async () => {
    mockNotify.mockResolvedValue({
      inAppCreated: 5,
      whatsappSent: 2,
      whatsappGrouped: 1,
      suppressed: 0,
      skipped: 0,
      errors: [{ scope: "whatsapp", tenantId: "t1", error: "z-api down" }],
    });

    const res = await POST(createRequest(`Bearer ${CRON_SECRET}`));
    const json = await res.json();

    expect(json.notified).toBe(5);
    expect(json.whatsappSent).toBe(2);
    expect(json.whatsappGrouped).toBe(1);
    // notify.errors já carregam scope próprio.
    expect(json.errors).toContainEqual({ scope: "whatsapp", tenantId: "t1", error: "z-api down" });
    // Ordem: classify invocado antes do notify (o WhatsApp por intent depende do intent setado).
    expect(mockClassify.mock.invocationCallOrder[0]).toBeLessThan(
      mockNotify.mock.invocationCallOrder[0]
    );
  });

  it("inclui contadores de classificação no resumo (Story 21.3)", async () => {
    mockClassify.mockResolvedValue({ classified: 4, skipped: 2, errors: [] });

    const res = await POST(createRequest(`Bearer ${CRON_SECRET}`));
    const json = await res.json();

    expect(json.classified).toBe(4);
    expect(json.classifySkipped).toBe(2);
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
    mockClassify.mockResolvedValue({
      classified: 0,
      skipped: 0,
      errors: [{ tenantId: "t1", opportunityId: "o1", error: "openai down" }],
    });

    const res = await POST(createRequest(`Bearer ${CRON_SECRET}`));
    const json = await res.json();

    expect(json.errors).toEqual([
      { scope: "sweep", tenantId: "t1", error: "api down" },
      { scope: "process", eventId: "e1", error: "db error" },
      { scope: "engagement", tenantId: "t1", error: "tracking down" },
      { scope: "classify", tenantId: "t1", opportunityId: "o1", error: "openai down" },
    ]);
  });

  it("retorna 500 quando env do Supabase está ausente", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    const res = await POST(createRequest(`Bearer ${CRON_SECRET}`));
    expect(res.status).toBe(500);
    expect(mockSweep).not.toHaveBeenCalled();
  });
});
