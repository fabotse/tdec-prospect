/**
 * Tests for Monitored Count API Route
 * Story 13.2: Toggle de Monitoramento na Tabela de Leads
 *
 * AC: #6 - Contador "X/100 leads monitorados"
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetUser = vi.fn();
const mockFrom = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  })),
}));

import { GET } from "@/app/api/leads/monitored-count/route";

describe("GET /api/leads/monitored-count", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
  });

  it("should return 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json.error.code).toBe("UNAUTHORIZED");
  });

  it("should return current count and max from config", async () => {
    // Count query
    const mockCountEq = vi.fn().mockResolvedValue({ count: 42, error: null });
    const mockCountSelect = vi.fn().mockReturnValue({ eq: mockCountEq });

    // Config query
    const mockConfigSingle = vi.fn().mockResolvedValue({
      data: { max_monitored_leads: 100 },
      error: null,
    });
    const mockConfigSelect = vi.fn().mockReturnValue({ single: mockConfigSingle });

    mockFrom.mockImplementation((table: string) => {
      if (table === "monitoring_configs") return { select: mockConfigSelect };
      return { select: mockCountSelect };
    });

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data).toEqual({ current: 42, max: 100 });
  });

  it("should use fallback max of 100 when config not found", async () => {
    const mockCountEq = vi.fn().mockResolvedValue({ count: 10, error: null });
    const mockCountSelect = vi.fn().mockReturnValue({ eq: mockCountEq });

    const mockConfigSingle = vi.fn().mockResolvedValue({ data: null, error: { code: "PGRST116" } });
    const mockConfigSelect = vi.fn().mockReturnValue({ single: mockConfigSingle });

    mockFrom.mockImplementation((table: string) => {
      if (table === "monitoring_configs") return { select: mockConfigSelect };
      return { select: mockCountSelect };
    });

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data).toEqual({ current: 10, max: 100 });
  });

  it("should return 0 when count is null", async () => {
    const mockCountEq = vi.fn().mockResolvedValue({ count: null, error: null });
    const mockCountSelect = vi.fn().mockReturnValue({ eq: mockCountEq });

    const mockConfigSingle = vi.fn().mockResolvedValue({
      data: { max_monitored_leads: 50 },
      error: null,
    });
    const mockConfigSelect = vi.fn().mockReturnValue({ single: mockConfigSingle });

    mockFrom.mockImplementation((table: string) => {
      if (table === "monitoring_configs") return { select: mockConfigSelect };
      return { select: mockCountSelect };
    });

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data).toEqual({ current: 0, max: 50 });
  });
});
