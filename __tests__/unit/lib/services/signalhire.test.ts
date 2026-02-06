/**
 * Unit tests for SignalHire Service
 * Story: 2.3 - Integration Connection Testing
 * Story: 4.4 - SignalHire Integration Service
 * Story: 4.4.2 - SignalHire Callback Architecture
 *
 * Tests:
 * - testConnection returns success on 200
 * - testConnection returns error on various status codes
 * - lookupPhone creates DB record and sends request (Story 4.4.2)
 * - getLookupStatus returns status from database (Story 4.4.2)
 * - handleError translates errors to Portuguese (Story 4.4)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SignalHireService } from "@/lib/services/signalhire";
import { ERROR_MESSAGES } from "@/lib/services/base-service";

// Mock data for database operations
const mockLookupRow: {
  id: string;
  tenant_id: string;
  lead_id: string | null;
  identifier: string;
  request_id: string;
  status: string;
  phone: string | null;
  raw_response: unknown;
  error_message: string | null;
  created_at: string;
  updated_at: string;
} = {
  id: "lookup-uuid-123",
  tenant_id: "tenant-123",
  lead_id: null,
  identifier: "https://linkedin.com/in/john-doe",
  request_id: "req-123",
  status: "pending",
  phone: null,
  raw_response: null,
  error_message: null,
  created_at: "2026-02-01T00:00:00Z",
  updated_at: "2026-02-01T00:00:00Z",
};

// Mock Supabase with more complete chain
const mockSupabaseFrom = vi.fn();
const mockSupabaseSelect = vi.fn();
const mockSupabaseInsert = vi.fn();
const mockSupabaseUpdate = vi.fn();
const mockSupabaseEq = vi.fn();
const mockSupabaseSingle = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() =>
    Promise.resolve({
      from: mockSupabaseFrom,
    })
  ),
}));

// Mock encryption
vi.mock("@/lib/crypto/encryption", () => ({
  decryptApiKey: vi.fn(() => "decrypted-api-key"),
}));

// Setup Supabase mock chain
function setupSupabaseMock(options: {
  apiKeyExists?: boolean;
  insertSuccess?: boolean;
  updateSuccess?: boolean;
  selectData?: typeof mockLookupRow | null;
}) {
  const {
    apiKeyExists = true,
    insertSuccess = true,
    updateSuccess = true,
    selectData = mockLookupRow,
  } = options;

  mockSupabaseFrom.mockImplementation((table: string) => {
    if (table === "api_configs") {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              single: () =>
                Promise.resolve({
                  data: apiKeyExists ? { encrypted_key: "enc-key" } : null,
                  error: apiKeyExists ? null : { message: "Not found" },
                }),
            }),
          }),
        }),
      };
    }

    if (table === "signalhire_lookups") {
      return {
        insert: () => ({
          select: () => ({
            single: () =>
              Promise.resolve({
                data: insertSuccess ? mockLookupRow : null,
                error: insertSuccess ? null : { message: "Insert failed" },
              }),
          }),
        }),
        update: () => ({
          eq: () =>
            Promise.resolve({
              data: updateSuccess ? [mockLookupRow] : null,
              error: updateSuccess ? null : { message: "Update failed" },
            }),
        }),
        select: () => ({
          eq: () => ({
            eq: () => ({
              single: () =>
                Promise.resolve({
                  data: selectData,
                  error: selectData ? null : { message: "Not found" },
                }),
            }),
          }),
        }),
      };
    }

    return {
      select: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
    };
  });
}

describe("SignalHireService", () => {
  let service: SignalHireService;

  beforeEach(() => {
    service = new SignalHireService();
    vi.stubEnv("SIGNALHIRE_CALLBACK_URL", "https://test.supabase.co/functions/v1/signalhire-callback");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  // ==============================================
  // TEST CONNECTION (Story 2.3)
  // ==============================================

  describe("testConnection", () => {
    it("returns success on 200 response", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ credits: 100 }),
      });

      const result = await service.testConnection("test-api-key");

      expect(result.success).toBe(true);
      expect(result.message).toBe(ERROR_MESSAGES.SUCCESS);
      expect(result.testedAt).toBeDefined();
    });

    it("returns error on 401", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
      });

      const result = await service.testConnection("invalid-key");

      expect(result.success).toBe(false);
      expect(result.message).toContain("inválida");
    });

    it("returns error on 429 (rate limit)", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
      });

      const result = await service.testConnection("test-key");

      expect(result.success).toBe(false);
      expect(result.message).toContain("Limite");
    });

    it("uses correct API endpoint and header", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ credits: 100 }),
      });
      global.fetch = fetchMock;

      await service.testConnection("test-api-key");

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("signalhire.com"),
        expect.objectContaining({
          headers: expect.objectContaining({
            apikey: "test-api-key",
          }),
        })
      );
    });

    it("includes latency in successful result", async () => {
      global.fetch = vi.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(
              () =>
                resolve({
                  ok: true,
                  json: () => Promise.resolve({ credits: 100 }),
                }),
              10
            );
          })
      );

      const result = await service.testConnection("test-api-key");

      expect(result.success).toBe(true);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });
  });

  // ==============================================
  // LOOKUP PHONE - NEW ARCHITECTURE (Story 4.4.2)
  // ==============================================

  describe("lookupPhone (Story 4.4.2)", () => {
    let serviceWithTenant: SignalHireService;

    beforeEach(() => {
      serviceWithTenant = new SignalHireService("tenant-123");
      setupSupabaseMock({ apiKeyExists: true, insertSuccess: true });
    });

    it("creates a lookup record in the database", async () => {
      // Mock successful SignalHire response
      // CORREÇÃO: requestId vem no BODY da resposta, não no header
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: () => Promise.resolve({ requestId: 12345 }),
      });

      const result = await serviceWithTenant.lookupPhone(
        "https://linkedin.com/in/john-doe"
      );

      expect(result.lookupId).toBe("lookup-uuid-123");
      expect(result.requestId).toBe("12345"); // Convertido para string
    });

    it("sends request with callbackUrl", async () => {
      // CORREÇÃO: requestId vem no BODY da resposta
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: () => Promise.resolve({ requestId: 12345 }),
      });
      global.fetch = fetchMock;

      await serviceWithTenant.lookupPhone("https://linkedin.com/in/john-doe");

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("signalhire.com"),
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("callbackUrl"),
        })
      );

      // Verify the body contains correct callbackUrl
      const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(callBody.callbackUrl).toBe(
        "https://test.supabase.co/functions/v1/signalhire-callback"
      );
    });

    it("includes leadId in the lookup record when provided", async () => {
      // CORREÇÃO: requestId vem no BODY da resposta
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: () => Promise.resolve({ requestId: 12345 }),
      });

      const result = await serviceWithTenant.lookupPhone(
        "https://linkedin.com/in/john-doe",
        "lead-uuid-456"
      );

      expect(result.lookupId).toBeDefined();
    });

    it("throws error when API key not configured", async () => {
      const serviceNoTenant = new SignalHireService();

      await expect(
        serviceNoTenant.lookupPhone("test@example.com")
      ).rejects.toThrow("API key do SignalHire não configurada");
    });

    it("throws error when callback URL not configured", async () => {
      vi.unstubAllEnvs(); // Remove the callback URL

      await expect(
        serviceWithTenant.lookupPhone("test@example.com")
      ).rejects.toThrow("callback");
    });

    it("updates lookup record with error on SignalHire failure", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: "Unauthorized" }),
      });

      await expect(
        serviceWithTenant.lookupPhone("test@example.com")
      ).rejects.toThrow();
    });
  });

  // ==============================================
  // GET LOOKUP STATUS (Story 4.4.2)
  // ==============================================

  describe("getLookupStatus (Story 4.4.2)", () => {
    let serviceWithTenant: SignalHireService;

    beforeEach(() => {
      serviceWithTenant = new SignalHireService("tenant-123");
    });

    it("returns lookup status from database", async () => {
      setupSupabaseMock({
        selectData: {
          ...mockLookupRow,
          status: "success",
          phone: "+5511999887766",
        },
      });

      const result = await serviceWithTenant.getLookupStatus("lookup-uuid-123");

      expect(result.id).toBe("lookup-uuid-123");
      expect(result.status).toBe("success");
      expect(result.phone).toBe("+5511999887766");
    });

    it("returns error message when lookup failed", async () => {
      setupSupabaseMock({
        selectData: {
          ...mockLookupRow,
          status: "failed",
          error_message: "Créditos esgotados",
        },
      });

      const result = await serviceWithTenant.getLookupStatus("lookup-uuid-123");

      expect(result.status).toBe("failed");
      expect(result.errorMessage).toBe("Créditos esgotados");
    });

    it("throws error when lookup not found", async () => {
      setupSupabaseMock({ selectData: null });

      await expect(
        serviceWithTenant.getLookupStatus("non-existent-id")
      ).rejects.toThrow("Lookup não encontrado");
    });

    it("throws error when not authenticated", async () => {
      const serviceNoTenant = new SignalHireService();

      await expect(
        serviceNoTenant.getLookupStatus("lookup-uuid-123")
      ).rejects.toThrow("API key do SignalHire não configurada");
    });
  });

  // ==============================================
  // ERROR HANDLING (Story 4.4)
  // ==============================================

  describe("handleError (Story 4.4)", () => {
    it("translates 401 to Portuguese", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
      });

      const result = await service.testConnection("invalid-key");

      expect(result.success).toBe(false);
      expect(result.message).toContain("inválida");
    });

    it("translates 402 (payment required / credits exhausted) to Portuguese", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 402,
      });

      const result = await service.testConnection("test-key");

      expect(result.success).toBe(false);
      expect(result.message).toContain("Créditos");
    });

    it("translates 403 to Portuguese", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
      });

      const result = await service.testConnection("test-key");

      expect(result.success).toBe(false);
      expect(result.message).toContain("Acesso negado");
    });

    it("translates 404 to Portuguese", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      });

      const result = await service.testConnection("test-key");

      expect(result.success).toBe(false);
      expect(result.message).toContain("não encontrado");
    });

    it("translates 406 (limit exceeded) to Portuguese", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 406,
      });

      const result = await service.testConnection("test-key");

      expect(result.success).toBe(false);
      expect(result.message).toContain("100 items");
    });

    it("translates 429 (rate limit) to Portuguese", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
      });

      const result = await service.testConnection("test-key");

      expect(result.success).toBe(false);
      expect(result.message).toContain("Limite");
    });

    it("translates timeout to Portuguese", async () => {
      const abortError = new Error("Aborted");
      abortError.name = "AbortError";
      global.fetch = vi.fn().mockRejectedValue(abortError);

      const result = await service.testConnection("test-key");

      expect(result.success).toBe(false);
      expect(result.message).toContain("Tempo limite");
    });

    it("handles network errors gracefully", async () => {
      global.fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));

      const result = await service.testConnection("test-key");

      expect(result.success).toBe(false);
      expect(result.message).toBeDefined();
    });
  });

  // ==============================================
  // SERVICE PROPERTIES
  // ==============================================

  describe("service properties", () => {
    it("has correct service name", () => {
      expect(service.name).toBe("signalhire");
    });

    it("accepts tenantId in constructor", () => {
      const serviceWithTenant = new SignalHireService("tenant-123");
      expect(serviceWithTenant.name).toBe("signalhire");
      expect(serviceWithTenant.getTenantId()).toBe("tenant-123");
    });
  });
});
