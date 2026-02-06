/**
 * Unit Tests for /api/snovio/campaigns
 * Story 7.3: Snov.io Integration Service - Gestão de Campanhas
 *
 * AC: #1 - Credentials from tenant, proxied via API routes
 * AC: #4 - List user campaigns
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "@/app/api/snovio/campaigns/route";
import { createChainBuilder } from "../../helpers/mock-supabase";
import { ExternalServiceError } from "@/lib/services/base-service";

// Mock dependencies
const mockGetCurrentUserProfile = vi.fn();
const mockGetUserCampaigns = vi.fn();
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

vi.mock("@/lib/services/snovio", () => ({
  SnovioService: vi.fn().mockImplementation(function () {
    return { getUserCampaigns: mockGetUserCampaigns };
  }),
}));

describe("GET /api/snovio/campaigns", () => {
  const mockProfile = { id: "user-123", tenant_id: "tenant-456", role: "admin" };

  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockImplementation(() => createChainBuilder());
  });

  it("returns 401 when user is not authenticated", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(null);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Não autenticado");
  });

  it("returns 404 when credentials not configured", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
    mockFrom.mockImplementation(() =>
      createChainBuilder({ data: null, error: null })
    );

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toContain("não configuradas");
  });

  it("returns campaigns on success", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
    mockFrom.mockImplementation(() =>
      createChainBuilder({ data: { encrypted_key: "enc-key" }, error: null })
    );
    mockDecryptApiKey.mockReturnValue("client_id:client_secret");
    mockGetUserCampaigns.mockResolvedValue({
      campaigns: [
        { id: 1, title: "Campaign A", status: "active" },
        { id: 2, title: "Campaign B", status: "paused" },
      ],
    });

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.campaigns).toHaveLength(2);
    expect(data.campaigns[0].title).toBe("Campaign A");
  });

  it("passes correct credentials to getUserCampaigns", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
    mockFrom.mockImplementation(() =>
      createChainBuilder({ data: { encrypted_key: "enc-key" }, error: null })
    );
    mockDecryptApiKey.mockReturnValue("my-creds");
    mockGetUserCampaigns.mockResolvedValue({ campaigns: [] });

    await GET();

    expect(mockGetUserCampaigns).toHaveBeenCalledWith({
      credentials: "my-creds",
    });
  });

  it("returns service error on ExternalServiceError", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
    mockFrom.mockImplementation(() =>
      createChainBuilder({ data: { encrypted_key: "enc-key" }, error: null })
    );
    mockDecryptApiKey.mockReturnValue("creds");
    mockGetUserCampaigns.mockRejectedValue(
      new ExternalServiceError("snovio", 401, "API key inválida ou expirada.")
    );

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("API key inválida ou expirada.");
  });

  it("returns 500 on unexpected error", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
    mockFrom.mockImplementation(() =>
      createChainBuilder({ data: { encrypted_key: "enc-key" }, error: null })
    );
    mockDecryptApiKey.mockReturnValue("creds");
    mockGetUserCampaigns.mockRejectedValue(new Error("Unexpected"));

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Erro interno ao listar campanhas");
  });
});
