/**
 * Unit Tests for PUT /api/campaigns/[campaignId]/export-status
 * Story 7.5: Export to Instantly - Fluxo Completo
 *
 * AC: #5 - Persist export link (externalCampaignId, platform, timestamp, status)
 *
 * Tests: success update, success clear, 401 auth, 400 invalid UUID,
 *        400 invalid body, 500 DB error
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { PUT } from "@/app/api/campaigns/[campaignId]/export-status/route";

// Mock dependencies
const mockGetUser = vi.fn();
const mockUpdateExportStatus = vi.fn();
const mockClearExportStatus = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
  })),
}));

vi.mock("@/lib/services/campaign-export-repository", () => ({
  updateExportStatus: (...args: unknown[]) => mockUpdateExportStatus(...args),
  clearExportStatus: (...args: unknown[]) => mockClearExportStatus(...args),
}));

describe("PUT /api/campaigns/[campaignId]/export-status", () => {
  const validCampaignId = "550e8400-e29b-41d4-a716-446655440000";
  const mockUser = { id: "user-123", email: "user@example.com" };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: mockUser }, error: null });
  });

  function makeRequest(body: unknown) {
    return new NextRequest(
      `http://localhost/api/campaigns/${validCampaignId}/export-status`,
      {
        method: "PUT",
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  it("updates export status and returns success", async () => {
    mockUpdateExportStatus.mockResolvedValue({ error: null });

    const body = {
      externalCampaignId: "ext-camp-456",
      exportPlatform: "instantly",
      exportedAt: "2026-02-06T12:00:00Z",
      exportStatus: "success",
    };

    const request = makeRequest(body);
    const response = await PUT(request, {
      params: Promise.resolve({ campaignId: validCampaignId }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockUpdateExportStatus).toHaveBeenCalledWith(
      expect.anything(),
      validCampaignId,
      body
    );
  });

  it("clears export status when clear: true", async () => {
    mockClearExportStatus.mockResolvedValue({ error: null });

    const request = makeRequest({ clear: true });
    const response = await PUT(request, {
      params: Promise.resolve({ campaignId: validCampaignId }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockClearExportStatus).toHaveBeenCalledWith(
      expect.anything(),
      validCampaignId
    );
    expect(mockUpdateExportStatus).not.toHaveBeenCalled();
  });

  it("returns 401 when user is not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    const request = makeRequest({ exportStatus: "success" });
    const response = await PUT(request, {
      params: Promise.resolve({ campaignId: validCampaignId }),
    });
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Não autenticado");
  });

  it("returns 400 when campaignId is not a valid UUID", async () => {
    const request = new NextRequest(
      "http://localhost/api/campaigns/not-a-uuid/export-status",
      {
        method: "PUT",
        body: JSON.stringify({ exportStatus: "success" }),
        headers: { "Content-Type": "application/json" },
      }
    );

    const response = await PUT(request, {
      params: Promise.resolve({ campaignId: "not-a-uuid" }),
    });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("inválido");
  });

  it("returns 400 when body has invalid data", async () => {
    const request = makeRequest({
      exportPlatform: "unsupported_platform",
    });

    const response = await PUT(request, {
      params: Promise.resolve({ campaignId: validCampaignId }),
    });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("inválido");
  });

  it("returns 500 when database update fails", async () => {
    mockUpdateExportStatus.mockResolvedValue({
      error: { message: "DB connection lost" },
    });

    const request = makeRequest({ exportStatus: "success" });
    const response = await PUT(request, {
      params: Promise.resolve({ campaignId: validCampaignId }),
    });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toContain("Erro");
  });
});
