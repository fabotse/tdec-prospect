/**
 * Tests for Lead Bulk Monitoring Toggle API Route
 * Story 13.2: Toggle de Monitoramento na Tabela de Leads
 *
 * AC: #8 - API bulk PATCH /api/leads/bulk-monitor
 * AC: #3 - Validação LinkedIn (filtro)
 * AC: #4 - Limite 100/tenant
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockGetUser = vi.fn();
const mockFrom = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  })),
}));

import { PATCH } from "@/app/api/leads/bulk-monitor/route";

const UUID_1 = "550e8400-e29b-41d4-a716-446655440001";
const UUID_2 = "550e8400-e29b-41d4-a716-446655440002";
const UUID_3 = "550e8400-e29b-41d4-a716-446655440003";

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/leads/bulk-monitor", {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("PATCH /api/leads/bulk-monitor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
  });

  it("should return 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const response = await PATCH(makeRequest({ leadIds: [UUID_1], isMonitored: true }));
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json.error.code).toBe("UNAUTHORIZED");
  });

  it("should return 400 for malformed JSON body", async () => {
    const request = new NextRequest("http://localhost/api/leads/bulk-monitor", {
      method: "PATCH",
      body: "bad-json{",
      headers: { "Content-Type": "application/json" },
    });

    const response = await PATCH(request);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });

  it("should return 400 for empty leadIds array", async () => {
    const response = await PATCH(makeRequest({ leadIds: [], isMonitored: true }));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });

  it("should return 400 for invalid UUIDs", async () => {
    const response = await PATCH(makeRequest({ leadIds: ["not-uuid"], isMonitored: true }));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });

  it("should return 400 for missing isMonitored", async () => {
    const response = await PATCH(makeRequest({ leadIds: [UUID_1] }));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });

  // AC #8 + #3: Bulk enable — filter leads without LinkedIn
  it("should enable monitoring filtering out leads without LinkedIn", async () => {
    // Query leads to check linkedin + is_monitored
    const mockIn = vi.fn().mockResolvedValue({
      data: [
        { id: UUID_1, linkedin_url: "https://linkedin.com/in/1", is_monitored: false },
        { id: UUID_2, linkedin_url: null, is_monitored: false }, // No LinkedIn — skipped
        { id: UUID_3, linkedin_url: "https://linkedin.com/in/3", is_monitored: false },
      ],
      error: null,
    });
    const mockLeadSelect = vi.fn().mockReturnValue({ in: mockIn });

    // Count check
    const mockCountEq = vi.fn().mockResolvedValue({ count: 50, error: null });
    const mockCountSelect = vi.fn().mockReturnValue({ eq: mockCountEq });

    // Config
    const mockConfigSingle = vi.fn().mockResolvedValue({
      data: { max_monitored_leads: 100 },
      error: null,
    });
    const mockConfigSelect = vi.fn().mockReturnValue({ single: mockConfigSingle });

    // Update
    const mockUpdateIn = vi.fn().mockResolvedValue({ error: null, count: 2 });
    const mockUpdate = vi.fn().mockReturnValue({ in: mockUpdateIn });

    let leadCallIndex = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === "monitoring_configs") return { select: mockConfigSelect };
      leadCallIndex++;
      if (leadCallIndex === 1) return { select: mockLeadSelect };
      if (leadCallIndex === 2) return { select: mockCountSelect };
      return { update: mockUpdate };
    });

    const response = await PATCH(makeRequest({ leadIds: [UUID_1, UUID_2, UUID_3], isMonitored: true }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.updated).toBe(2);
    expect(json.data.skippedNoLinkedin).toEqual([UUID_2]);
    expect(json.data.limitExceeded).toBe(false);
  });

  // AC #4: Bulk limit exceeded
  it("should return 409 when bulk would exceed monitoring limit", async () => {
    // All leads have linkedin, none monitored yet
    const mockIn = vi.fn().mockResolvedValue({
      data: [
        { id: UUID_1, linkedin_url: "https://linkedin.com/in/1", is_monitored: false },
        { id: UUID_2, linkedin_url: "https://linkedin.com/in/2", is_monitored: false },
      ],
      error: null,
    });
    const mockLeadSelect = vi.fn().mockReturnValue({ in: mockIn });

    // Count: already 99
    const mockCountEq = vi.fn().mockResolvedValue({ count: 99, error: null });
    const mockCountSelect = vi.fn().mockReturnValue({ eq: mockCountEq });

    // Config: max 100
    const mockConfigSingle = vi.fn().mockResolvedValue({
      data: { max_monitored_leads: 100 },
      error: null,
    });
    const mockConfigSelect = vi.fn().mockReturnValue({ single: mockConfigSingle });

    let leadCallIndex = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === "monitoring_configs") return { select: mockConfigSelect };
      leadCallIndex++;
      if (leadCallIndex === 1) return { select: mockLeadSelect };
      return { select: mockCountSelect };
    });

    const response = await PATCH(makeRequest({ leadIds: [UUID_1, UUID_2], isMonitored: true }));
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json.error.code).toBe("LIMIT_EXCEEDED");
  });

  // AC #8: Bulk disable — no LinkedIn/limit validation
  it("should disable monitoring in bulk without validation", async () => {
    const mockUpdateIn = vi.fn().mockResolvedValue({ error: null, count: 3 });
    const mockUpdate = vi.fn().mockReturnValue({ in: mockUpdateIn });
    mockFrom.mockReturnValue({ update: mockUpdate });

    const response = await PATCH(makeRequest({ leadIds: [UUID_1, UUID_2, UUID_3], isMonitored: false }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.updated).toBe(3);
    expect(json.data.skippedNoLinkedin).toEqual([]);
    expect(json.data.limitExceeded).toBe(false);
  });

  // Error: database error on update
  it("should return 500 on database error", async () => {
    const mockUpdateIn = vi.fn().mockResolvedValue({
      error: { message: "DB error" },
      count: null,
    });
    const mockUpdate = vi.fn().mockReturnValue({ in: mockUpdateIn });
    mockFrom.mockReturnValue({ update: mockUpdate });

    const response = await PATCH(makeRequest({ leadIds: [UUID_1], isMonitored: false }));
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.error.code).toBe("INTERNAL_ERROR");
  });

  // H2 fix: Bulk enable with mix of already-monitored + new leads near limit
  it("should allow bulk enable when already-monitored leads are excluded from count", async () => {
    // 98 leads already monitored. Bulk-enable 3 leads: 1 already monitored + 2 new.
    // Without fix: 98 + 3 = 101 > 100 → 409 (wrong)
    // With fix: 98 + 2 = 100 ≤ 100 → 200 (correct)

    const mockIn = vi.fn().mockResolvedValue({
      data: [
        { id: UUID_1, linkedin_url: "https://linkedin.com/in/1", is_monitored: true }, // already monitored
        { id: UUID_2, linkedin_url: "https://linkedin.com/in/2", is_monitored: false }, // new
        { id: UUID_3, linkedin_url: "https://linkedin.com/in/3", is_monitored: false }, // new
      ],
      error: null,
    });
    const mockLeadSelect = vi.fn().mockReturnValue({ in: mockIn });

    // Count: 98 currently monitored
    const mockCountEq = vi.fn().mockResolvedValue({ count: 98, error: null });
    const mockCountSelect = vi.fn().mockReturnValue({ eq: mockCountEq });

    // Config: max 100
    const mockConfigSingle = vi.fn().mockResolvedValue({
      data: { max_monitored_leads: 100 },
      error: null,
    });
    const mockConfigSelect = vi.fn().mockReturnValue({ single: mockConfigSingle });

    // Update — succeeds for all 3 eligible (even if 1 is already monitored, it's a no-op)
    const mockUpdateIn = vi.fn().mockResolvedValue({ error: null, count: 3 });
    const mockUpdate = vi.fn().mockReturnValue({ in: mockUpdateIn });

    let leadCallIndex = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === "monitoring_configs") return { select: mockConfigSelect };
      leadCallIndex++;
      if (leadCallIndex === 1) return { select: mockLeadSelect };
      if (leadCallIndex === 2) return { select: mockCountSelect };
      return { update: mockUpdate };
    });

    const response = await PATCH(makeRequest({ leadIds: [UUID_1, UUID_2, UUID_3], isMonitored: true }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.updated).toBe(3);
    expect(json.data.skippedNoLinkedin).toEqual([]);
  });

  // AC #4: Config fallback when monitoring_configs not found
  it("should use fallback limit of 100 when config not found", async () => {
    const mockIn = vi.fn().mockResolvedValue({
      data: [{ id: UUID_1, linkedin_url: "https://linkedin.com/in/1", is_monitored: false }],
      error: null,
    });
    const mockLeadSelect = vi.fn().mockReturnValue({ in: mockIn });

    const mockCountEq = vi.fn().mockResolvedValue({ count: 99, error: null });
    const mockCountSelect = vi.fn().mockReturnValue({ eq: mockCountEq });

    // No config
    const mockConfigSingle = vi.fn().mockResolvedValue({ data: null, error: { code: "PGRST116" } });
    const mockConfigSelect = vi.fn().mockReturnValue({ single: mockConfigSingle });

    // Update
    const mockUpdateIn = vi.fn().mockResolvedValue({ error: null, count: 1 });
    const mockUpdate = vi.fn().mockReturnValue({ in: mockUpdateIn });

    let leadCallIndex = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === "monitoring_configs") return { select: mockConfigSelect };
      leadCallIndex++;
      if (leadCallIndex === 1) return { select: mockLeadSelect };
      if (leadCallIndex === 2) return { select: mockCountSelect };
      return { update: mockUpdate };
    });

    const response = await PATCH(makeRequest({ leadIds: [UUID_1], isMonitored: true }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.updated).toBe(1);
  });
});
