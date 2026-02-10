/**
 * Unit tests for Integration Server Actions
 * Story: 11.1 - Z-API Integration Service + Config
 *
 * Tests Z-API specific behavior:
 * - saveApiConfig with zapi stores JSON key_suffix
 * - getApiConfigs returns JSON maskedKey for zapi
 * - testApiConnection works for zapi
 * - key_suffix stores JSON of per-field suffixes for zapi
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createMockSupabaseClient,
  mockTableResponse,
} from "../../helpers/mock-supabase";

// Mock supabase client
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

// Mock tenant helper
vi.mock("@/lib/supabase/tenant", () => ({
  getCurrentUserProfile: vi.fn(),
}));

// Mock encryption
vi.mock("@/lib/crypto/encryption", () => ({
  encryptApiKey: vi.fn((key: string) => `encrypted:${key}`),
  maskApiKey: vi.fn((key: string, n: number) => `••••••••${key.slice(-n)}`),
  decryptApiKey: vi.fn((encrypted: string) => encrypted.replace("encrypted:", "")),
}));

// Mock services
vi.mock("@/lib/services", () => ({
  testConnection: vi.fn(),
  ERROR_MESSAGES: {
    INTERNAL_ERROR: "Erro interno. Tente novamente.",
  },
}));

import { createClient } from "@/lib/supabase/server";
import { getCurrentUserProfile } from "@/lib/supabase/tenant";
import {
  saveApiConfig,
  getApiConfigs,
  testApiConnection,
} from "@/actions/integrations";
import { testConnection as testServiceConnection } from "@/lib/services";

const mockAdminProfile = {
  id: "user-123",
  tenant_id: "tenant-456",
  role: "admin" as const,
  full_name: "Admin User",
  created_at: "2026-01-01",
  updated_at: "2026-01-01",
};

describe("integration actions — Z-API support (Story 11.1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUserProfile).mockResolvedValue(mockAdminProfile);
  });

  describe("saveApiConfig with zapi", () => {
    it("should store JSON key_suffix with per-field suffixes for zapi", async () => {
      const mockClient = createMockSupabaseClient();
      const chain = mockTableResponse(mockClient, "api_configs", {
        data: { service_name: "zapi", updated_at: "2026-02-10T12:00:00Z" },
      });
      vi.mocked(createClient).mockResolvedValue(mockClient as never);

      const zapiJson = JSON.stringify({
        instanceId: "inst-1234",
        instanceToken: "tok-5678",
        securityToken: "sec-9012",
      });

      const result = await saveApiConfig("zapi", zapiJson);

      expect(result.success).toBe(true);

      // Verify upsert was called with JSON key_suffix
      expect(chain.upsert).toHaveBeenCalled();
      const upsertArg = chain.upsert.mock.calls[0][0];
      expect(upsertArg.service_name).toBe("zapi");

      // key_suffix should be JSON with last 4 chars of each field
      const keySuffix = JSON.parse(upsertArg.key_suffix);
      expect(keySuffix).toEqual({
        instanceId: "1234",
        instanceToken: "5678",
        securityToken: "9012",
      });
    });

    it("should return JSON maskedKey with per-field masks for zapi", async () => {
      const mockClient = createMockSupabaseClient();
      mockTableResponse(mockClient, "api_configs", {
        data: { service_name: "zapi", updated_at: "2026-02-10T12:00:00Z" },
      });
      vi.mocked(createClient).mockResolvedValue(mockClient as never);

      const zapiJson = JSON.stringify({
        instanceId: "inst-ABCD",
        instanceToken: "tok-EFGH",
        securityToken: "sec-IJKL",
      });

      const result = await saveApiConfig("zapi", zapiJson);

      expect(result.success).toBe(true);
      if (result.success) {
        const maskedKey = JSON.parse(result.data.maskedKey);
        expect(maskedKey.instanceId).toContain("ABCD");
        expect(maskedKey.instanceToken).toContain("EFGH");
        expect(maskedKey.securityToken).toContain("IJKL");
      }
    });

    it("should validate zapi as valid serviceName in schema", async () => {
      const mockClient = createMockSupabaseClient();
      mockTableResponse(mockClient, "api_configs", {
        data: { service_name: "zapi", updated_at: "2026-02-10T12:00:00Z" },
      });
      vi.mocked(createClient).mockResolvedValue(mockClient as never);

      const zapiJson = JSON.stringify({
        instanceId: "id-12345678",
        instanceToken: "tok-12345678",
        securityToken: "sec-12345678",
      });

      const result = await saveApiConfig("zapi", zapiJson);

      // Should not fail validation — "zapi" is a valid SERVICE_NAMES entry
      expect(result.success).toBe(true);
    });

    it("should reject zapi credentials with empty/whitespace-only field values", async () => {
      const zapiJson = JSON.stringify({
        instanceId: "   ",
        instanceToken: "tok-5678",
        securityToken: "sec-9012",
      });

      const result = await saveApiConfig("zapi", zapiJson);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("credenciais Z-API");
      }
    });
  });

  describe("getApiConfigs with zapi", () => {
    it("should return JSON maskedKey for zapi when key_suffix is JSON", async () => {
      const zapiSuffix = JSON.stringify({
        instanceId: "ABCD",
        instanceToken: "EFGH",
        securityToken: "IJKL",
      });

      const mockClient = createMockSupabaseClient();
      mockTableResponse(mockClient, "api_configs", {
        data: [
          { service_name: "zapi", key_suffix: zapiSuffix, updated_at: "2026-02-10T12:00:00Z" },
        ],
      });
      vi.mocked(createClient).mockResolvedValue(mockClient as never);

      const result = await getApiConfigs();

      expect(result.success).toBe(true);
      if (result.success) {
        const zapiConfig = result.data.find((c) => c.serviceName === "zapi");
        expect(zapiConfig).toBeDefined();
        expect(zapiConfig!.isConfigured).toBe(true);

        const maskedKey = JSON.parse(zapiConfig!.maskedKey!);
        expect(maskedKey.instanceId).toBe("••••••••ABCD");
        expect(maskedKey.instanceToken).toBe("••••••••EFGH");
        expect(maskedKey.securityToken).toBe("••••••••IJKL");
      }
    });
  });

  describe("testApiConnection with zapi", () => {
    it("should test connection for zapi service", async () => {
      const zapiJson = JSON.stringify({
        instanceId: "inst-123",
        instanceToken: "tok-456",
        securityToken: "sec-789",
      });

      const mockClient = createMockSupabaseClient();
      mockTableResponse(mockClient, "api_configs", {
        data: { encrypted_key: `encrypted:${zapiJson}` },
      });
      vi.mocked(createClient).mockResolvedValue(mockClient as never);

      vi.mocked(testServiceConnection).mockResolvedValue({
        success: true,
        message: "Conexão estabelecida com sucesso",
        testedAt: "2026-02-10T12:00:00Z",
        latencyMs: 150,
      });

      const result = await testApiConnection("zapi");

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.success).toBe(true);
      }
      expect(testServiceConnection).toHaveBeenCalledWith("zapi", zapiJson);
    });
  });
});
