/**
 * Unit Tests for /api/snovio/lists
 * Story 7.3: Snov.io Integration Service - Gestão de Campanhas
 *
 * AC: #1 - Credentials from tenant, proxied via API routes
 * AC: #2 - Create prospect list
 * AC: #5 - List existing lists
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST, GET } from "@/app/api/snovio/lists/route";
import { createChainBuilder } from "../../helpers/mock-supabase";
import { ExternalServiceError } from "@/lib/services/base-service";

// Mock dependencies
const mockGetCurrentUserProfile = vi.fn();
const mockCreateProspectList = vi.fn();
const mockGetUserLists = vi.fn();
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
    return {
      createProspectList: mockCreateProspectList,
      getUserLists: mockGetUserLists,
    };
  }),
}));

function createPostRequest(body: unknown) {
  return new NextRequest("http://localhost/api/snovio/lists", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function createGetRequest() {
  return new NextRequest("http://localhost/api/snovio/lists", {
    method: "GET",
  });
}

describe("/api/snovio/lists", () => {
  const mockProfile = { id: "user-123", tenant_id: "tenant-456", role: "admin" };

  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockImplementation(() => createChainBuilder());
  });

  // ==============================================
  // POST — Create list (AC: #2)
  // ==============================================

  describe("POST", () => {
    it("returns 401 when user is not authenticated", async () => {
      mockGetCurrentUserProfile.mockResolvedValue(null);

      const response = await POST(createPostRequest({ name: "Test" }));
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe("Não autenticado");
    });

    it("returns 400 when name is missing", async () => {
      mockGetCurrentUserProfile.mockResolvedValue(mockProfile);

      const response = await POST(createPostRequest({ name: "" }));

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain("obrigatório");
    });

    it("returns 404 when credentials not configured", async () => {
      mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
      mockFrom.mockImplementation(() =>
        createChainBuilder({ data: null, error: null })
      );

      const response = await POST(createPostRequest({ name: "Test" }));
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toContain("não configuradas");
    });

    it("returns 201 with list data on success", async () => {
      mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
      mockFrom.mockImplementation(() =>
        createChainBuilder({ data: { encrypted_key: "enc-key" }, error: null })
      );
      mockDecryptApiKey.mockReturnValue("client_id:client_secret");
      mockCreateProspectList.mockResolvedValue({ listId: 12345, name: "Prospects Q1" });

      const response = await POST(createPostRequest({ name: "Prospects Q1" }));
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.listId).toBe(12345);
      expect(data.name).toBe("Prospects Q1");
    });

    it("passes correct params to createProspectList", async () => {
      mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
      mockFrom.mockImplementation(() =>
        createChainBuilder({ data: { encrypted_key: "enc-key" }, error: null })
      );
      mockDecryptApiKey.mockReturnValue("my-creds");
      mockCreateProspectList.mockResolvedValue({ listId: 1, name: "Test" });

      await POST(createPostRequest({ name: "Test" }));

      expect(mockCreateProspectList).toHaveBeenCalledWith({
        credentials: "my-creds",
        name: "Test",
      });
    });

    it("returns service error on ExternalServiceError", async () => {
      mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
      mockFrom.mockImplementation(() =>
        createChainBuilder({ data: { encrypted_key: "enc-key" }, error: null })
      );
      mockDecryptApiKey.mockReturnValue("creds");
      mockCreateProspectList.mockRejectedValue(
        new ExternalServiceError("snovio", 401, "API key inválida ou expirada.")
      );

      const response = await POST(createPostRequest({ name: "Test" }));
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
      mockCreateProspectList.mockRejectedValue(new Error("Unexpected"));

      const response = await POST(createPostRequest({ name: "Test" }));
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe("Erro interno ao criar lista");
    });
  });

  // ==============================================
  // GET — List lists (AC: #5)
  // ==============================================

  describe("GET", () => {
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

    it("returns lists on success", async () => {
      mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
      mockFrom.mockImplementation(() =>
        createChainBuilder({ data: { encrypted_key: "enc-key" }, error: null })
      );
      mockDecryptApiKey.mockReturnValue("creds");
      mockGetUserLists.mockResolvedValue({
        lists: [
          { id: 1, name: "Lista A", contacts: 100 },
          { id: 2, name: "Lista B", contacts: 50 },
        ],
      });

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.lists).toHaveLength(2);
      expect(data.lists[0].name).toBe("Lista A");
    });

    it("returns service error on ExternalServiceError", async () => {
      mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
      mockFrom.mockImplementation(() =>
        createChainBuilder({ data: { encrypted_key: "enc-key" }, error: null })
      );
      mockDecryptApiKey.mockReturnValue("creds");
      mockGetUserLists.mockRejectedValue(
        new ExternalServiceError("snovio", 429, "Limite de requisições atingido.")
      );

      const response = await GET();
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
      mockGetUserLists.mockRejectedValue(new Error("Unexpected"));

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe("Erro interno ao listar listas");
    });
  });
});
