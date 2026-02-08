/**
 * Unit Tests for /api/instantly/campaign/[id]/activate
 * Story 7.2: Instantly Integration Service - Gestão de Campanhas
 *
 * AC: #1 - API key from tenant, proxied via API routes
 * AC: #4 - Activate campaign
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/instantly/campaign/[id]/activate/route";
import { createChainBuilder } from "../../helpers/mock-supabase";
import { ExternalServiceError } from "@/lib/services/base-service";

// Mock dependencies
const mockGetCurrentUserProfile = vi.fn();
const mockActivateCampaign = vi.fn();
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
    return { activateCampaign: mockActivateCampaign };
  }),
}));

describe("POST /api/instantly/campaign/[id]/activate", () => {
  const mockProfile = { id: "user-123", tenant_id: "tenant-456", role: "admin" };

  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockImplementation(() => createChainBuilder());
  });

  it("returns 401 when user is not authenticated", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(null);

    const request = new NextRequest("http://localhost/api/instantly/campaign/camp-123/activate", {
      method: "POST",
    });
    const response = await POST(request, { params: Promise.resolve({ id: "camp-123" }) });
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Não autenticado");
  });

  it("returns 404 when API key is not configured", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
    mockFrom.mockImplementation(() =>
      createChainBuilder({ data: null, error: null })
    );

    const request = new NextRequest("http://localhost/api/instantly/campaign/camp-123/activate", {
      method: "POST",
    });
    const response = await POST(request, { params: Promise.resolve({ id: "camp-123" }) });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toContain("não configurada");
  });

  it("activates campaign and returns success", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
    mockFrom.mockImplementation(() =>
      createChainBuilder({ data: { encrypted_key: "enc-key" }, error: null })
    );
    mockDecryptApiKey.mockReturnValue("api-key");
    mockActivateCampaign.mockResolvedValue({ success: true });

    const request = new NextRequest("http://localhost/api/instantly/campaign/camp-123/activate", {
      method: "POST",
    });
    const response = await POST(request, { params: Promise.resolve({ id: "camp-123" }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
  });

  it("passes campaign ID from URL params to service", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
    mockFrom.mockImplementation(() =>
      createChainBuilder({ data: { encrypted_key: "enc-key" }, error: null })
    );
    mockDecryptApiKey.mockReturnValue("api-key");
    mockActivateCampaign.mockResolvedValue({ success: true });

    const request = new NextRequest("http://localhost/api/instantly/campaign/camp-xyz/activate", {
      method: "POST",
    });
    await POST(request, { params: Promise.resolve({ id: "camp-xyz" }) });

    expect(mockActivateCampaign).toHaveBeenCalledWith({ apiKey: "api-key", campaignId: "camp-xyz" });
  });

  it("returns service error on ExternalServiceError", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
    mockFrom.mockImplementation(() =>
      createChainBuilder({ data: { encrypted_key: "enc-key" }, error: null })
    );
    mockDecryptApiKey.mockReturnValue("key");
    mockActivateCampaign.mockRejectedValue(
      new ExternalServiceError("instantly", 429, "Limite de requisições atingido.")
    );

    const request = new NextRequest("http://localhost/api/instantly/campaign/camp-123/activate", {
      method: "POST",
    });
    const response = await POST(request, { params: Promise.resolve({ id: "camp-123" }) });
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
    mockActivateCampaign.mockRejectedValue(new Error("Unexpected"));

    const request = new NextRequest("http://localhost/api/instantly/campaign/camp-123/activate", {
      method: "POST",
    });
    const response = await POST(request, { params: Promise.resolve({ id: "camp-123" }) });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Erro interno ao ativar campanha: Unexpected");
  });
});
