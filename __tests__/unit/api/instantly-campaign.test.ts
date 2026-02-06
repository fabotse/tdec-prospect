/**
 * Unit Tests for /api/instantly/campaign
 * Story 7.2: Instantly Integration Service - Gestão de Campanhas
 *
 * AC: #1 - API key from tenant, proxied via API routes
 * AC: #2 - Create campaign
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/instantly/campaign/route";
import { createChainBuilder } from "../../helpers/mock-supabase";
import { ExternalServiceError } from "@/lib/services/base-service";

// Mock dependencies
const mockGetCurrentUserProfile = vi.fn();
const mockCreateCampaign = vi.fn();
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
    return { createCampaign: mockCreateCampaign };
  }),
}));

function createRequest(body: unknown) {
  return new NextRequest("http://localhost/api/instantly/campaign", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/instantly/campaign", () => {
  const mockProfile = { id: "user-123", tenant_id: "tenant-456", role: "admin" };

  const validBody = {
    name: "Campanha Teste",
    sequences: [{ subject: "Assunto 1", body: "Corpo 1", delayDays: 0 }],
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

  it("returns 400 when name is missing", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);

    const response = await POST(
      createRequest({ name: "", sequences: [{ subject: "S", body: "B", delayDays: 0 }] })
    );

    expect(response.status).toBe(400);
  });

  it("returns 400 when sequences is empty", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);

    const response = await POST(createRequest({ name: "Test", sequences: [] }));

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

  it("returns 201 with campaign data on success", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
    mockFrom.mockImplementation(() =>
      createChainBuilder({ data: { encrypted_key: "enc-key" }, error: null })
    );
    mockDecryptApiKey.mockReturnValue("decrypted-key");
    mockCreateCampaign.mockResolvedValue({
      campaignId: "camp-123",
      name: "Campanha Teste",
      status: 0,
    });

    const response = await POST(createRequest(validBody));
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.campaignId).toBe("camp-123");
    expect(data.name).toBe("Campanha Teste");
    expect(data.status).toBe(0);
  });

  it("passes correct params to createCampaign", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
    mockFrom.mockImplementation(() =>
      createChainBuilder({ data: { encrypted_key: "enc-key" }, error: null })
    );
    mockDecryptApiKey.mockReturnValue("my-api-key");
    mockCreateCampaign.mockResolvedValue({
      campaignId: "camp-123",
      name: "Test",
      status: 0,
    });

    await POST(createRequest(validBody));

    expect(mockCreateCampaign).toHaveBeenCalledWith({
      apiKey: "my-api-key",
      name: "Campanha Teste",
      sequences: validBody.sequences,
    });
  });

  it("returns 400 when sequence entry is missing subject", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);

    const response = await POST(
      createRequest({ name: "Test", sequences: [{ subject: "", body: "B", delayDays: 0 }] })
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("subject");
  });

  it("returns 400 when sequence entry is missing body", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);

    const response = await POST(
      createRequest({ name: "Test", sequences: [{ subject: "S", body: "", delayDays: 0 }] })
    );

    expect(response.status).toBe(400);
  });

  it("returns 500 on unexpected error", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
    mockFrom.mockImplementation(() =>
      createChainBuilder({ data: { encrypted_key: "enc-key" }, error: null })
    );
    mockDecryptApiKey.mockReturnValue("key");
    mockCreateCampaign.mockRejectedValue(new Error("Unexpected"));

    const response = await POST(createRequest(validBody));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Erro interno ao criar campanha");
  });

  it("returns service error message on ExternalServiceError", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
    mockFrom.mockImplementation(() =>
      createChainBuilder({ data: { encrypted_key: "enc-key" }, error: null })
    );
    mockDecryptApiKey.mockReturnValue("key");
    mockCreateCampaign.mockRejectedValue(
      new ExternalServiceError("instantly", 401, "API key inválida ou expirada.")
    );

    const response = await POST(createRequest(validBody));
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("API key inválida ou expirada.");
  });
});
