/**
 * Tests for Lead Monitoring Toggle API Route
 * Story 13.2: Toggle de Monitoramento na Tabela de Leads
 *
 * AC: #7 - API individual PATCH /api/leads/[leadId]/monitor
 * AC: #3 - Validação LinkedIn
 * AC: #4 - Limite 100/tenant
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Mock dependencies
const mockGetUser = vi.fn();
const mockFrom = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  })),
}));

import { PATCH } from "@/app/api/leads/[leadId]/monitor/route";

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/leads/monitor", {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function makeParams(leadId: string) {
  return { params: Promise.resolve({ leadId }) };
}

describe("PATCH /api/leads/[leadId]/monitor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
  });

  // AC #7: Unauthorized
  it("should return 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const response = await PATCH(makeRequest({ isMonitored: true }), makeParams(VALID_UUID));
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json.error.code).toBe("UNAUTHORIZED");
  });

  // Validation: invalid UUID
  it("should return 400 for invalid UUID", async () => {
    const response = await PATCH(makeRequest({ isMonitored: true }), makeParams("not-a-uuid"));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });

  // Validation: invalid body
  it("should return 400 for invalid body", async () => {
    const response = await PATCH(makeRequest({ isMonitored: "yes" }), makeParams(VALID_UUID));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });

  // Validation: malformed JSON
  it("should return 400 for malformed JSON body", async () => {
    const request = new NextRequest("http://localhost/api/leads/monitor", {
      method: "PATCH",
      body: "not-json{{{",
      headers: { "Content-Type": "application/json" },
    });

    const response = await PATCH(request, makeParams(VALID_UUID));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });

  // M1 fix: Lead not found returns 404
  it("should return 404 when lead does not exist and enabling monitoring", async () => {
    const mockSingle = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "PGRST116" },
    });
    const mockEq = vi.fn().mockReturnValue({ single: mockSingle });
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
    mockFrom.mockReturnValue({ select: mockSelect });

    const response = await PATCH(makeRequest({ isMonitored: true }), makeParams(VALID_UUID));
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.error.code).toBe("NOT_FOUND");
  });

  // AC #3: Lead sem LinkedIn não pode ser monitorado
  it("should return 400 when lead has no linkedin_url and enabling monitoring", async () => {
    const mockSingle = vi.fn().mockResolvedValue({
      data: { linkedin_url: null, is_monitored: false },
      error: null,
    });
    const mockEq = vi.fn().mockReturnValue({ single: mockSingle });
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
    mockFrom.mockReturnValue({ select: mockSelect });

    const response = await PATCH(makeRequest({ isMonitored: true }), makeParams(VALID_UUID));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.message).toContain("LinkedIn");
  });

  // AC #4: Limite de leads monitorados atingido
  it("should return 409 when monitoring limit reached", async () => {
    // linkedin check — has linkedin, NOT yet monitored
    const mockLinkedinSingle = vi.fn().mockResolvedValue({
      data: { linkedin_url: "https://linkedin.com/in/test", is_monitored: false },
      error: null,
    });
    const mockLinkedinEq = vi.fn().mockReturnValue({ single: mockLinkedinSingle });
    const mockLinkedinSelect = vi.fn().mockReturnValue({ eq: mockLinkedinEq });

    // count check — limit reached (100/100)
    const mockCountEq = vi.fn().mockResolvedValue({ count: 100, error: null });
    const mockCountSelect = vi.fn().mockReturnValue({ eq: mockCountEq });

    // config — max 100
    const mockConfigSingle = vi.fn().mockResolvedValue({
      data: { max_monitored_leads: 100 },
      error: null,
    });
    const mockConfigSelect = vi.fn().mockReturnValue({ single: mockConfigSingle });

    let callIndex = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === "monitoring_configs") {
        return { select: mockConfigSelect };
      }
      callIndex++;
      if (callIndex === 1) return { select: mockLinkedinSelect };
      return { select: mockCountSelect };
    });

    const response = await PATCH(makeRequest({ isMonitored: true }), makeParams(VALID_UUID));
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json.error.code).toBe("LIMIT_EXCEEDED");
  });

  // AC #7: Toggle com sucesso — ativar monitoramento
  it("should enable monitoring successfully", async () => {
    const leadRow = { id: VALID_UUID, is_monitored: true };

    // linkedin check — NOT yet monitored
    const mockLinkedinSingle = vi.fn().mockResolvedValue({
      data: { linkedin_url: "https://linkedin.com/in/test", is_monitored: false },
      error: null,
    });
    const mockLinkedinEq = vi.fn().mockReturnValue({ single: mockLinkedinSingle });
    const mockLinkedinSelect = vi.fn().mockReturnValue({ eq: mockLinkedinEq });

    // count check
    const mockCountEq = vi.fn().mockResolvedValue({ count: 50, error: null });
    const mockCountSelect = vi.fn().mockReturnValue({ eq: mockCountEq });

    // config check
    const mockConfigSingle = vi.fn().mockResolvedValue({
      data: { max_monitored_leads: 100 },
      error: null,
    });
    const mockConfigSelect = vi.fn().mockReturnValue({ single: mockConfigSingle });

    // update
    const mockUpdateSingle = vi.fn().mockResolvedValue({ data: leadRow, error: null });
    const mockUpdateSelect = vi.fn().mockReturnValue({ single: mockUpdateSingle });
    const mockUpdateEq = vi.fn().mockReturnValue({ select: mockUpdateSelect });
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockUpdateEq });

    let callIndex = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === "monitoring_configs") {
        return { select: mockConfigSelect };
      }
      callIndex++;
      if (callIndex === 1) return { select: mockLinkedinSelect };
      if (callIndex === 2) return { select: mockCountSelect };
      return { update: mockUpdate };
    });

    const response = await PATCH(makeRequest({ isMonitored: true }), makeParams(VALID_UUID));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data).toEqual(leadRow);
  });

  // AC #7: Toggle com sucesso — desativar monitoramento (sem validação LinkedIn/limite)
  it("should disable monitoring without linkedin/limit validation", async () => {
    const leadRow = { id: VALID_UUID, is_monitored: false };

    const mockUpdateSingle = vi.fn().mockResolvedValue({ data: leadRow, error: null });
    const mockUpdateSelect = vi.fn().mockReturnValue({ single: mockUpdateSingle });
    const mockUpdateEq = vi.fn().mockReturnValue({ select: mockUpdateSelect });
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockUpdateEq });
    mockFrom.mockReturnValue({ update: mockUpdate });

    const response = await PATCH(makeRequest({ isMonitored: false }), makeParams(VALID_UUID));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data).toEqual(leadRow);
    // Should NOT query linkedin_url or count when disabling
    expect(mockFrom).not.toHaveBeenCalledWith("monitoring_configs");
  });

  // Error: lead not found
  it("should return 404 when lead not found", async () => {
    const mockUpdateSingle = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "PGRST116", message: "not found" },
    });
    const mockUpdateSelect = vi.fn().mockReturnValue({ single: mockUpdateSingle });
    const mockUpdateEq = vi.fn().mockReturnValue({ select: mockUpdateSelect });
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockUpdateEq });
    mockFrom.mockReturnValue({ update: mockUpdate });

    const response = await PATCH(makeRequest({ isMonitored: false }), makeParams(VALID_UUID));
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.error.code).toBe("NOT_FOUND");
  });

  // Error: database error
  it("should return 500 on database error", async () => {
    const mockUpdateSingle = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "OTHER", message: "db error" },
    });
    const mockUpdateSelect = vi.fn().mockReturnValue({ single: mockUpdateSingle });
    const mockUpdateEq = vi.fn().mockReturnValue({ select: mockUpdateSelect });
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockUpdateEq });
    mockFrom.mockReturnValue({ update: mockUpdate });

    const response = await PATCH(makeRequest({ isMonitored: false }), makeParams(VALID_UUID));
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.error.code).toBe("INTERNAL_ERROR");
  });

  // H1 fix: Re-enable already-monitored lead at limit should succeed (no-op)
  it("should succeed when re-enabling already monitored lead at the limit", async () => {
    const leadRow = { id: VALID_UUID, is_monitored: true };

    // linkedin check — has linkedin, ALREADY monitored
    const mockLinkedinSingle = vi.fn().mockResolvedValue({
      data: { linkedin_url: "https://linkedin.com/in/test", is_monitored: true },
      error: null,
    });
    const mockLinkedinEq = vi.fn().mockReturnValue({ single: mockLinkedinSingle });
    const mockLinkedinSelect = vi.fn().mockReturnValue({ eq: mockLinkedinEq });

    // update — success (no-op but still updates updated_at)
    const mockUpdateSingle = vi.fn().mockResolvedValue({ data: leadRow, error: null });
    const mockUpdateSelect = vi.fn().mockReturnValue({ single: mockUpdateSingle });
    const mockUpdateEq = vi.fn().mockReturnValue({ select: mockUpdateSelect });
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockUpdateEq });

    let callIndex = 0;
    mockFrom.mockImplementation(() => {
      callIndex++;
      if (callIndex === 1) return { select: mockLinkedinSelect };
      return { update: mockUpdate };
    });

    const response = await PATCH(makeRequest({ isMonitored: true }), makeParams(VALID_UUID));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data).toEqual(leadRow);
    // Should NOT have queried monitoring_configs or count (skipped limit check)
    expect(mockFrom).not.toHaveBeenCalledWith("monitoring_configs");
  });

  // AC #4: Config fallback when no monitoring_configs exists
  it("should use fallback limit of 100 when monitoring_configs not found", async () => {
    // linkedin check — has linkedin, NOT yet monitored
    const mockLinkedinSingle = vi.fn().mockResolvedValue({
      data: { linkedin_url: "https://linkedin.com/in/test", is_monitored: false },
      error: null,
    });
    const mockLinkedinEq = vi.fn().mockReturnValue({ single: mockLinkedinSingle });
    const mockLinkedinSelect = vi.fn().mockReturnValue({ eq: mockLinkedinEq });

    // count check — 99 (under limit)
    const mockCountEq = vi.fn().mockResolvedValue({ count: 99, error: null });
    const mockCountSelect = vi.fn().mockReturnValue({ eq: mockCountEq });

    // config — not found
    const mockConfigSingle = vi.fn().mockResolvedValue({ data: null, error: { code: "PGRST116" } });
    const mockConfigSelect = vi.fn().mockReturnValue({ single: mockConfigSingle });

    // update — success
    const leadRow = { id: VALID_UUID, is_monitored: true };
    const mockUpdateSingle = vi.fn().mockResolvedValue({ data: leadRow, error: null });
    const mockUpdateSelect = vi.fn().mockReturnValue({ single: mockUpdateSingle });
    const mockUpdateEq = vi.fn().mockReturnValue({ select: mockUpdateSelect });
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockUpdateEq });

    let callIndex = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === "monitoring_configs") {
        return { select: mockConfigSelect };
      }
      callIndex++;
      if (callIndex === 1) return { select: mockLinkedinSelect };
      if (callIndex === 2) return { select: mockCountSelect };
      return { update: mockUpdate };
    });

    const response = await PATCH(makeRequest({ isMonitored: true }), makeParams(VALID_UUID));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data).toEqual(leadRow);
  });
});
