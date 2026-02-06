/**
 * Unit Tests for /api/instantly/leads
 * Story 7.2: Instantly Integration Service - Gestão de Campanhas
 *
 * AC: #1 - API key from tenant, proxied via API routes
 * AC: #3 - Bulk add leads
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/instantly/leads/route";
import { createChainBuilder } from "../../helpers/mock-supabase";
import { ExternalServiceError } from "@/lib/services/base-service";

// Mock dependencies
const mockGetCurrentUserProfile = vi.fn();
const mockAddLeadsToCampaign = vi.fn();
const mockDecryptApiKey = vi.fn();
const mockFrom = vi.fn();

vi.mock("@/lib/supabase/tenant", () => ({
  getCurrentUserProfile: (...args: unknown[]) => mockGetCurrentUserProfile(...args),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({ from: mockFrom })),
}));

vi.mock("@/lib/crypto/encryption", () => ({
  decryptApiKey: (...args: unknown[]) => mockDecryptApiKey(...args),
}));

vi.mock("@/lib/services/instantly", () => ({
  InstantlyService: vi.fn().mockImplementation(function () {
    return { addLeadsToCampaign: mockAddLeadsToCampaign };
  }),
}));

function createRequest(body: unknown) {
  return new NextRequest("http://localhost/api/instantly/leads", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/instantly/leads", () => {
  const mockProfile = { id: "user-123", tenant_id: "tenant-456", role: "admin" };

  const validBody = {
    campaignId: "camp-123",
    leads: [
      {
        email: "john@acme.com",
        firstName: "John",
        companyName: "Acme",
        title: "CTO",
        icebreaker: "Vi seu post...",
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockImplementation(() => createChainBuilder());
  });

  it("returns 401 when user is not authenticated", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(null);

    const response = await POST(createRequest(validBody));
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Não autenticado");
  });

  it("returns 400 when campaignId is missing", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);

    const response = await POST(
      createRequest({ campaignId: "", leads: [{ email: "a@b.com" }] })
    );

    expect(response.status).toBe(400);
  });

  it("returns 400 when leads is empty", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);

    const response = await POST(
      createRequest({ campaignId: "camp-123", leads: [] })
    );

    expect(response.status).toBe(400);
  });

  it("returns 404 when API key is not configured", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
    mockFrom.mockImplementation(() =>
      createChainBuilder({ data: null, error: null })
    );

    const response = await POST(createRequest(validBody));
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toContain("não configurada");
  });

  it("returns aggregated lead results on success", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
    mockFrom.mockImplementation(() =>
      createChainBuilder({ data: { encrypted_key: "enc-key" }, error: null })
    );
    mockDecryptApiKey.mockReturnValue("api-key");
    mockAddLeadsToCampaign.mockResolvedValue({
      leadsUploaded: 1,
      duplicatedLeads: 0,
      invalidEmails: 0,
      remainingInPlan: 9999,
    });

    const response = await POST(createRequest(validBody));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.leadsUploaded).toBe(1);
    expect(data.remainingInPlan).toBe(9999);
  });

  it("passes correct params to addLeadsToCampaign", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
    mockFrom.mockImplementation(() =>
      createChainBuilder({ data: { encrypted_key: "enc-key" }, error: null })
    );
    mockDecryptApiKey.mockReturnValue("my-key");
    mockAddLeadsToCampaign.mockResolvedValue({
      leadsUploaded: 1,
      duplicatedLeads: 0,
      invalidEmails: 0,
      remainingInPlan: 9999,
    });

    await POST(createRequest(validBody));

    expect(mockAddLeadsToCampaign).toHaveBeenCalledWith({
      apiKey: "my-key",
      campaignId: "camp-123",
      leads: validBody.leads,
    });
  });

  it("returns service error on ExternalServiceError", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
    mockFrom.mockImplementation(() =>
      createChainBuilder({ data: { encrypted_key: "enc-key" }, error: null })
    );
    mockDecryptApiKey.mockReturnValue("key");
    mockAddLeadsToCampaign.mockRejectedValue(
      new ExternalServiceError("instantly", 429, "Limite de requisições atingido.")
    );

    const response = await POST(createRequest(validBody));
    const data = await response.json();

    expect(response.status).toBe(429);
    expect(data.error).toBe("Limite de requisições atingido.");
  });

  it("returns 500 on unexpected error", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
    mockFrom.mockImplementation(() =>
      createChainBuilder({ data: { encrypted_key: "enc-key" }, error: null })
    );
    mockDecryptApiKey.mockReturnValue("key");
    mockAddLeadsToCampaign.mockRejectedValue(new Error("Unexpected"));

    const response = await POST(createRequest(validBody));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Erro interno ao adicionar leads");
  });
});
