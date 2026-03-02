/**
 * Tests: API Route /api/settings/monitoring
 * Story: 13.8 - Configuracoes de Monitoramento
 *
 * AC: #2 - Dropdown para frequencia
 * AC: #7 - GET config + PATCH frequencia
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import {
  createChainBuilder,
  type ChainBuilder,
} from "../../../../../helpers/mock-supabase";

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

const ADMIN_PROFILE = {
  id: "user-1",
  tenant_id: "tenant-1",
  role: "admin",
};

const NON_ADMIN_PROFILE = {
  id: "user-2",
  tenant_id: "tenant-1",
  role: "member",
};

const MOCK_CONFIG_ROW = {
  id: "config-1",
  tenant_id: "tenant-1",
  frequency: "weekly",
  max_monitored_leads: 100,
  last_run_at: "2026-02-28T10:00:00Z",
  next_run_at: "2026-03-07T10:00:00Z",
  run_status: "idle",
  run_cursor: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-02-28T10:00:00Z",
};

function makePatchRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/settings/monitoring", {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

// ==============================================
// TESTS
// ==============================================

describe("GET /api/settings/monitoring", () => {
  let configChain: ChainBuilder;

  beforeEach(() => {
    vi.clearAllMocks();
    configChain = createChainBuilder({
      data: MOCK_CONFIG_ROW,
      error: null,
    });
    mockFrom.mockImplementation((table: string) => {
      if (table === "monitoring_configs") return configChain;
      return createChainBuilder();
    });
  });

  it("returns 401 when not authenticated", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(null);

    const { GET } = await import(
      "@/app/api/settings/monitoring/route"
    );
    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json.error.code).toBe("UNAUTHORIZED");
  });

  it("returns 403 when user is not admin", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(NON_ADMIN_PROFILE);

    const { GET } = await import(
      "@/app/api/settings/monitoring/route"
    );
    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json.error.code).toBe("FORBIDDEN");
  });

  it("returns config when it exists in DB", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(ADMIN_PROFILE);

    const { GET } = await import(
      "@/app/api/settings/monitoring/route"
    );
    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.exists).toBe(true);
    expect(json.data.config.frequency).toBe("weekly");
    expect(json.data.config.maxMonitoredLeads).toBe(100);
    expect(json.data.config.runStatus).toBe("idle");
    expect(json.data.config.lastRunAt).toBe("2026-02-28T10:00:00Z");
    expect(json.data.config.nextRunAt).toBe("2026-03-07T10:00:00Z");
  });

  it("returns defaults when no config exists (PGRST116)", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(ADMIN_PROFILE);

    const noConfigChain = createChainBuilder({
      data: null,
      error: { code: "PGRST116", message: "No rows found" },
    });
    mockFrom.mockImplementation((table: string) => {
      if (table === "monitoring_configs") return noConfigChain;
      return createChainBuilder();
    });

    const { GET } = await import(
      "@/app/api/settings/monitoring/route"
    );
    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.exists).toBe(false);
    expect(json.data.config.frequency).toBe("weekly");
    expect(json.data.config.maxMonitoredLeads).toBe(100);
    expect(json.data.config.runStatus).toBe("idle");
    expect(json.data.config.lastRunAt).toBeNull();
    expect(json.data.config.nextRunAt).toBeNull();
  });

  it("returns 500 on DB error (non-PGRST116)", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(ADMIN_PROFILE);

    const errorChain = createChainBuilder({
      data: null,
      error: { code: "42501", message: "permission denied" },
    });
    mockFrom.mockImplementation((table: string) => {
      if (table === "monitoring_configs") return errorChain;
      return createChainBuilder();
    });

    const { GET } = await import(
      "@/app/api/settings/monitoring/route"
    );
    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.error.code).toBe("INTERNAL_ERROR");
  });
});

describe("PATCH /api/settings/monitoring", () => {
  let configSelectChain: ChainBuilder;
  let configUpsertChain: ChainBuilder;

  beforeEach(() => {
    vi.clearAllMocks();

    configSelectChain = createChainBuilder({
      data: { last_run_at: "2026-02-28T10:00:00Z" },
      error: null,
    });

    configUpsertChain = createChainBuilder({
      data: {
        ...MOCK_CONFIG_ROW,
        frequency: "biweekly",
        next_run_at: "2026-03-14T10:00:00Z",
      },
      error: null,
    });

    let selectCallCount = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === "monitoring_configs") {
        selectCallCount++;
        // First call = select existing, second call = upsert
        if (selectCallCount === 1) return configSelectChain;
        return configUpsertChain;
      }
      return createChainBuilder();
    });
  });

  it("returns 401 when not authenticated", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(null);

    const { PATCH } = await import(
      "@/app/api/settings/monitoring/route"
    );
    const response = await PATCH(makePatchRequest({ frequency: "weekly" }));
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json.error.code).toBe("UNAUTHORIZED");
  });

  it("returns 403 when user is not admin", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(NON_ADMIN_PROFILE);

    const { PATCH } = await import(
      "@/app/api/settings/monitoring/route"
    );
    const response = await PATCH(makePatchRequest({ frequency: "weekly" }));
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json.error.code).toBe("FORBIDDEN");
  });

  it("returns 400 for invalid frequency value", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(ADMIN_PROFILE);

    const { PATCH } = await import(
      "@/app/api/settings/monitoring/route"
    );
    const response = await PATCH(makePatchRequest({ frequency: "daily" }));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 for invalid JSON body", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(ADMIN_PROFILE);

    const request = new NextRequest(
      "http://localhost/api/settings/monitoring",
      {
        method: "PATCH",
        body: "not-json",
        headers: { "Content-Type": "application/json" },
      }
    );

    const { PATCH } = await import(
      "@/app/api/settings/monitoring/route"
    );
    const response = await PATCH(request);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });

  it("updates frequency to biweekly and recalculates next_run_at", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(ADMIN_PROFILE);

    const { PATCH } = await import(
      "@/app/api/settings/monitoring/route"
    );
    const response = await PATCH(makePatchRequest({ frequency: "biweekly" }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.exists).toBe(true);
    expect(json.data.config.frequency).toBe("biweekly");
  });

  it("updates frequency to weekly (valid value)", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(ADMIN_PROFILE);

    configUpsertChain = createChainBuilder({
      data: {
        ...MOCK_CONFIG_ROW,
        frequency: "weekly",
      },
      error: null,
    });

    let callCount = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === "monitoring_configs") {
        callCount++;
        if (callCount === 1) return configSelectChain;
        return configUpsertChain;
      }
      return createChainBuilder();
    });

    const { PATCH } = await import(
      "@/app/api/settings/monitoring/route"
    );
    const response = await PATCH(makePatchRequest({ frequency: "weekly" }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.config.frequency).toBe("weekly");
  });

  it("uses current date as base when no existing config (new tenant)", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(ADMIN_PROFILE);

    // No existing config
    const noExistingChain = createChainBuilder({
      data: null,
      error: { code: "PGRST116", message: "No rows found" },
    });

    let callCount = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === "monitoring_configs") {
        callCount++;
        if (callCount === 1) return noExistingChain;
        return configUpsertChain;
      }
      return createChainBuilder();
    });

    const { PATCH } = await import(
      "@/app/api/settings/monitoring/route"
    );
    const response = await PATCH(makePatchRequest({ frequency: "biweekly" }));

    expect(response.status).toBe(200);
    // Upsert was called (chain was used)
    expect(configUpsertChain.upsert).toHaveBeenCalled();
  });

  it("returns 500 on upsert DB error", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(ADMIN_PROFILE);

    const errorUpsertChain = createChainBuilder({
      data: null,
      error: { code: "42501", message: "permission denied" },
    });

    let callCount = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === "monitoring_configs") {
        callCount++;
        if (callCount === 1) return configSelectChain;
        return errorUpsertChain;
      }
      return createChainBuilder();
    });

    const { PATCH } = await import(
      "@/app/api/settings/monitoring/route"
    );
    const response = await PATCH(makePatchRequest({ frequency: "weekly" }));
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.error.code).toBe("INTERNAL_ERROR");
  });
});
