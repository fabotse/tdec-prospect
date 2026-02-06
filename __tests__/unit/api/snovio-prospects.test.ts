/**
 * Unit Tests for /api/snovio/prospects
 * Story 7.3: Snov.io Integration Service - Gestão de Campanhas
 *
 * AC: #1 - Credentials from tenant, proxied via API routes
 * AC: #3a, #3b - Add prospect(s) to list
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/snovio/prospects/route";
import { createChainBuilder } from "../../helpers/mock-supabase";
import { ExternalServiceError } from "@/lib/services/base-service";

// Mock dependencies
const mockGetCurrentUserProfile = vi.fn();
const mockAddProspectsToList = vi.fn();
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
    return { addProspectsToList: mockAddProspectsToList };
  }),
}));

function createRequest(body: unknown) {
  return new NextRequest("http://localhost/api/snovio/prospects", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/snovio/prospects", () => {
  const mockProfile = { id: "user-123", tenant_id: "tenant-456", role: "admin" };

  const validBody = {
    listId: 12345,
    leads: [
      {
        email: "joao@empresa.com",
        firstName: "João",
        companyName: "Empresa Ltda",
        title: "CTO",
        icebreaker: "Parabéns pelo novo cargo!",
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

  it("returns 400 when listId is missing", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);

    const response = await POST(
      createRequest({ listId: 0, leads: [{ email: "a@b.com" }] })
    );

    expect(response.status).toBe(400);
  });

  it("returns 400 when leads is empty", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);

    const response = await POST(
      createRequest({ listId: 12345, leads: [] })
    );

    expect(response.status).toBe(400);
  });

  it("returns 404 when credentials not configured", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
    mockFrom.mockImplementation(() =>
      createChainBuilder({ data: null, error: null })
    );

    const response = await POST(createRequest(validBody));
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toContain("não configuradas");
  });

  it("returns aggregated results on success", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
    mockFrom.mockImplementation(() =>
      createChainBuilder({ data: { encrypted_key: "enc-key" }, error: null })
    );
    mockDecryptApiKey.mockReturnValue("client_id:client_secret");
    mockAddProspectsToList.mockResolvedValue({
      added: 1,
      updated: 0,
      errors: 0,
      totalProcessed: 1,
    });

    const response = await POST(createRequest(validBody));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.added).toBe(1);
    expect(data.totalProcessed).toBe(1);
  });

  it("passes correct params to addProspectsToList", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
    mockFrom.mockImplementation(() =>
      createChainBuilder({ data: { encrypted_key: "enc-key" }, error: null })
    );
    mockDecryptApiKey.mockReturnValue("my-creds");
    mockAddProspectsToList.mockResolvedValue({
      added: 1, updated: 0, errors: 0, totalProcessed: 1,
    });

    await POST(createRequest(validBody));

    expect(mockAddProspectsToList).toHaveBeenCalledWith({
      credentials: "my-creds",
      listId: 12345,
      leads: validBody.leads,
    });
  });

  it("returns service error on ExternalServiceError", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
    mockFrom.mockImplementation(() =>
      createChainBuilder({ data: { encrypted_key: "enc-key" }, error: null })
    );
    mockDecryptApiKey.mockReturnValue("creds");
    mockAddProspectsToList.mockRejectedValue(
      new ExternalServiceError("snovio", 429, "Limite de requisições atingido.")
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
    mockDecryptApiKey.mockReturnValue("creds");
    mockAddProspectsToList.mockRejectedValue(new Error("Unexpected"));

    const response = await POST(createRequest(validBody));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Erro interno ao adicionar prospects");
  });
});
