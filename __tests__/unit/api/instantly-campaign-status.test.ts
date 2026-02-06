/**
 * Unit Tests for /api/instantly/campaign/[id]
 * Story 7.2: Instantly Integration Service - Gestão de Campanhas
 *
 * AC: #1 - API key from tenant, proxied via API routes
 * AC: #4 - Get campaign status
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/instantly/campaign/[id]/route";
import { createChainBuilder } from "../../helpers/mock-supabase";
import { ExternalServiceError } from "@/lib/services/base-service";

// Mock dependencies
const mockGetCurrentUserProfile = vi.fn();
const mockGetCampaignStatus = vi.fn();
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
    return { getCampaignStatus: mockGetCampaignStatus };
  }),
}));

describe("GET /api/instantly/campaign/[id]", () => {
  const mockProfile = { id: "user-123", tenant_id: "tenant-456", role: "admin" };

  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockImplementation(() => createChainBuilder());
  });

  it("returns 401 when user is not authenticated", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(null);

    const request = new NextRequest("http://localhost/api/instantly/campaign/camp-123");
    const response = await GET(request, { params: Promise.resolve({ id: "camp-123" }) });
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Não autenticado");
  });

  it("returns 404 when API key is not configured", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
    mockFrom.mockImplementation(() =>
      createChainBuilder({ data: null, error: null })
    );

    const request = new NextRequest("http://localhost/api/instantly/campaign/camp-123");
    const response = await GET(request, { params: Promise.resolve({ id: "camp-123" }) });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toContain("não configurada");
  });

  it("returns campaign status on success", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
    mockFrom.mockImplementation(() =>
      createChainBuilder({ data: { encrypted_key: "enc-key" }, error: null })
    );
    mockDecryptApiKey.mockReturnValue("api-key");
    mockGetCampaignStatus.mockResolvedValue({
      campaignId: "camp-123",
      name: "Minha Campanha",
      status: 1,
      statusLabel: "Ativa",
    });

    const request = new NextRequest("http://localhost/api/instantly/campaign/camp-123");
    const response = await GET(request, { params: Promise.resolve({ id: "camp-123" }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.campaignId).toBe("camp-123");
    expect(data.statusLabel).toBe("Ativa");
  });

  it("passes campaign ID from URL params to service", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
    mockFrom.mockImplementation(() =>
      createChainBuilder({ data: { encrypted_key: "enc-key" }, error: null })
    );
    mockDecryptApiKey.mockReturnValue("api-key");
    mockGetCampaignStatus.mockResolvedValue({
      campaignId: "camp-xyz",
      name: "Test",
      status: 0,
      statusLabel: "Rascunho",
    });

    const request = new NextRequest("http://localhost/api/instantly/campaign/camp-xyz");
    await GET(request, { params: Promise.resolve({ id: "camp-xyz" }) });

    expect(mockGetCampaignStatus).toHaveBeenCalledWith({ apiKey: "api-key", campaignId: "camp-xyz" });
  });

  it("returns service error on ExternalServiceError", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
    mockFrom.mockImplementation(() =>
      createChainBuilder({ data: { encrypted_key: "enc-key" }, error: null })
    );
    mockDecryptApiKey.mockReturnValue("key");
    mockGetCampaignStatus.mockRejectedValue(
      new ExternalServiceError("instantly", 401, "API key inválida ou expirada.")
    );

    const request = new NextRequest("http://localhost/api/instantly/campaign/camp-123");
    const response = await GET(request, { params: Promise.resolve({ id: "camp-123" }) });
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("API key inválida ou expirada.");
  });

  it("returns 500 on unexpected error", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
    mockFrom.mockImplementation(() =>
      createChainBuilder({ data: { encrypted_key: "enc-key" }, error: null })
    );
    mockDecryptApiKey.mockReturnValue("key");
    mockGetCampaignStatus.mockRejectedValue(new Error("Unexpected"));

    const request = new NextRequest("http://localhost/api/instantly/campaign/camp-123");
    const response = await GET(request, { params: Promise.resolve({ id: "camp-123" }) });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Erro interno ao obter status da campanha");
  });
});
