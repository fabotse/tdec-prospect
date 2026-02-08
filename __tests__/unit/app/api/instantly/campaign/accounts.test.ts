/**
 * Unit Tests for POST /api/instantly/campaign/[id]/accounts
 * Story 7.5: Export to Instantly - Fluxo Completo
 *
 * AC: #1 - Sending accounts linked to campaign before activation
 *
 * Tests: success, 401 auth failure, 404 no API key, 400 invalid body
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/instantly/campaign/[id]/accounts/route";
import { createChainBuilder } from "../../../../../helpers/mock-supabase";

// Mock dependencies
const mockGetCurrentUserProfile = vi.fn();
const mockAddAccountsToCampaign = vi.fn();
const mockDecryptApiKey = vi.fn();
const mockFrom = vi.fn();

vi.mock("@/lib/supabase/tenant", () => ({
  getCurrentUserProfile: (...args: unknown[]) =>
    mockGetCurrentUserProfile(...args),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({ from: mockFrom })),
}));

vi.mock("@/lib/crypto/encryption", () => ({
  decryptApiKey: (...args: unknown[]) => mockDecryptApiKey(...args),
}));

vi.mock("@/lib/services/instantly", () => ({
  InstantlyService: vi.fn().mockImplementation(function () {
    return { addAccountsToCampaign: mockAddAccountsToCampaign };
  }),
}));

describe("POST /api/instantly/campaign/[id]/accounts", () => {
  const mockProfile = {
    id: "user-123",
    tenant_id: "tenant-456",
    role: "admin",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockImplementation(() => createChainBuilder());
  });

  function makeRequest(body: unknown) {
    return new NextRequest(
      "http://localhost/api/instantly/campaign/camp-123/accounts",
      {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  it("associates accounts and returns success", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
    mockFrom.mockImplementation(() =>
      createChainBuilder({ data: { encrypted_key: "enc-key" }, error: null })
    );
    mockDecryptApiKey.mockReturnValue("api-key-decrypted");
    mockAddAccountsToCampaign.mockResolvedValue({
      success: true,
      accountsAdded: 2,
    });

    const request = makeRequest({
      accountEmails: ["sender1@example.com", "sender2@example.com"],
    });
    const response = await POST(request, {
      params: Promise.resolve({ id: "camp-123" }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.accountsAdded).toBe(2);
    expect(mockAddAccountsToCampaign).toHaveBeenCalledWith({
      apiKey: "api-key-decrypted",
      campaignId: "camp-123",
      accountEmails: ["sender1@example.com", "sender2@example.com"],
    });
  });

  it("returns 401 when user is not authenticated", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(null);

    const request = makeRequest({ accountEmails: ["a@b.com"] });
    const response = await POST(request, {
      params: Promise.resolve({ id: "camp-123" }),
    });
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Não autenticado");
  });

  it("returns 404 when API key is not configured", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
    mockFrom.mockImplementation(() =>
      createChainBuilder({ data: null, error: null })
    );

    const request = makeRequest({ accountEmails: ["a@b.com"] });
    const response = await POST(request, {
      params: Promise.resolve({ id: "camp-123" }),
    });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toContain("não configurada");
  });

  it("returns 400 when accountEmails is missing or empty", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);

    const request = makeRequest({ accountEmails: [] });
    const response = await POST(request, {
      params: Promise.resolve({ id: "camp-123" }),
    });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("accountEmails");
  });
});
