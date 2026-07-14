/**
 * Tests for POST /api/replies/backfill
 * Story 21.2 Task 7.6 (admin gate) + Task 7.5 (backfill idempotente)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ==============================================
// MOCKS
// ==============================================

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({ from: vi.fn() })),
}));

const mockGetProfile = vi.fn();
vi.mock("@/lib/supabase/tenant", () => ({
  getCurrentUserProfile: () => mockGetProfile(),
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

import { POST } from "@/app/api/replies/backfill/route";

// ==============================================
// SETUP
// ==============================================

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");
  mockSweep.mockResolvedValue({ swept: 5, skipped: 0, tenants: 1, errors: [] });
  mockProcess.mockResolvedValue({ created: 5, skipped: 0, errors: [] });
  mockEngagement.mockResolvedValue({ created: 0, skipped: 0, errors: [] });
  mockClassify.mockResolvedValue({ classified: 0, skipped: 0, errors: [] });
});

function profile(role: string, tenantId: string | null = "tenant-1") {
  return { id: "user-1", role, tenant_id: tenantId };
}

// ==============================================
// TESTS
// ==============================================

describe("POST /api/replies/backfill", () => {
  it("retorna 401 sem sessão", async () => {
    mockGetProfile.mockResolvedValue(null);
    const res = await POST();
    expect(res.status).toBe(401);
    expect(mockSweep).not.toHaveBeenCalled();
  });

  it("retorna 403 para não-admin (sdr)", async () => {
    mockGetProfile.mockResolvedValue(profile("sdr"));
    const res = await POST();
    expect(res.status).toBe(403);
    expect(mockSweep).not.toHaveBeenCalled();
  });

  it("admin (gestor): sweep com janela ampla + tenant escopado, depois process", async () => {
    mockGetProfile.mockResolvedValue(profile("gestor"));

    const res = await POST();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ swept: 5, created: 5 });

    expect(mockSweep).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        since: "2026-01-01T00:00:00.000Z",
        tenantId: "tenant-1",
      })
    );
    expect(mockProcess).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ tenantId: "tenant-1" })
    );
    // Story 21.6: engajamento também roda no backfill, escopado ao tenant do admin.
    expect(mockEngagement).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ tenantId: "tenant-1" })
    );
    // Story 21.3: classificação também roda no backfill, escopada ao tenant do admin.
    expect(mockClassify).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ tenantId: "tenant-1" })
    );
  });

  it("inclui contadores de classificação no resumo (Story 21.3)", async () => {
    mockGetProfile.mockResolvedValue(profile("gestor"));
    mockClassify.mockResolvedValue({ classified: 7, skipped: 3, errors: [] });

    const res = await POST();
    const json = await res.json();

    expect(json.classified).toBe(7);
    expect(json.classifySkipped).toBe(3);
  });

  it("inclui contadores de engajamento no resumo (Story 21.6)", async () => {
    mockGetProfile.mockResolvedValue(profile("gestor"));
    mockEngagement.mockResolvedValue({ created: 4, skipped: 2, errors: [] });

    const res = await POST();
    const json = await res.json();

    expect(json.engagementCreated).toBe(4);
    expect(json.engagementSkipped).toBe(2);
  });

  it("admin (diretor) também tem acesso", async () => {
    mockGetProfile.mockResolvedValue(profile("diretor"));
    const res = await POST();
    expect(res.status).toBe(200);
  });

  it("idempotência (Task 7.5): 2ª execução não cria duplicatas (created=0)", async () => {
    mockGetProfile.mockResolvedValue(profile("gestor"));
    // Segunda execução: sweep todo deduplicado (23505) + anti-join filtra tudo.
    mockSweep.mockResolvedValue({ swept: 0, skipped: 5, tenants: 1, errors: [] });
    mockProcess.mockResolvedValue({ created: 0, skipped: 5, errors: [] });

    const res = await POST();
    const json = await res.json();

    expect(json.created).toBe(0);
    expect(json.swept).toBe(0);
    expect(json.skipped).toBe(10);
  });

  it("retorna 400 quando admin não tem tenant_id", async () => {
    mockGetProfile.mockResolvedValue(profile("gestor", null));
    const res = await POST();
    expect(res.status).toBe(400);
    expect(mockSweep).not.toHaveBeenCalled();
  });
});
