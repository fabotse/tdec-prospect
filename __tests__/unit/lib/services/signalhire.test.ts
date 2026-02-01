/**
 * Unit tests for SignalHire Service
 * Story: 2.3 - Integration Connection Testing
 * Story: 4.4 - SignalHire Integration Service
 *
 * Tests:
 * - testConnection returns success on 200
 * - testConnection returns error on various status codes
 * - lookupPhone returns phone and credits info (Story 4.4)
 * - handleError translates errors to Portuguese (Story 4.4)
 * - Async polling mechanism (Story 4.4)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SignalHireService } from "@/lib/services/signalhire";
import { ERROR_MESSAGES } from "@/lib/services/base-service";

// Mock Supabase
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() =>
    Promise.resolve({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() =>
                Promise.resolve({
                  data: { encrypted_key: "encrypted-api-key" },
                  error: null,
                })
              ),
            })),
          })),
        })),
      })),
    })
  ),
}));

// Mock encryption
vi.mock("@/lib/crypto/encryption", () => ({
  decryptApiKey: vi.fn(() => "decrypted-api-key"),
}));

describe("SignalHireService", () => {
  let service: SignalHireService;

  beforeEach(() => {
    service = new SignalHireService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
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
      // SignalHireService uses its own Portuguese messages
      expect(result.message).toContain("inválida");
    });

    it("returns error on 429 (rate limit)", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
      });

      const result = await service.testConnection("test-key");

      expect(result.success).toBe(false);
      // SignalHireService uses its own Portuguese messages with SignalHire-specific info
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
  // PHONE LOOKUP (Story 4.4)
  // ==============================================

  describe("lookupPhone (Story 4.4)", () => {
    let serviceWithTenant: SignalHireService;

    beforeEach(() => {
      serviceWithTenant = new SignalHireService("tenant-123");
    });

    it("returns phone from successful lookup", async () => {
      const mockResponse = [
        {
          item: "https://linkedin.com/in/john-doe",
          status: "success",
          person: {
            id: "sh-1",
            firstName: "John",
            lastName: "Doe",
            phones: [{ phone: "+5511999887766", type: "mobile" }],
          },
        },
      ];

      // Mock initial POST returning 200 with immediate result
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: {
          get: (key: string) => {
            if (key === "Request-Id") return "req-123";
            if (key === "X-Credits-Left") return "99";
            return null;
          },
        },
        json: () => Promise.resolve(mockResponse),
      });

      const result = await serviceWithTenant.lookupPhone(
        "https://linkedin.com/in/john-doe"
      );

      expect(result.phone).toBe("+5511999887766");
      expect(result.creditsUsed).toBe(1);
    });

    it("handles async processing with polling", async () => {
      const fetchMock = vi
        .fn()
        // First call: 201 accepted
        .mockResolvedValueOnce({
          ok: true,
          status: 201,
          headers: {
            get: (key: string) => {
              if (key === "Request-Id") return "req-123";
              if (key === "X-Credits-Left") return "100";
              return null;
            },
          },
          json: () => Promise.resolve({}),
        })
        // Second call: 204 still processing
        .mockResolvedValueOnce({
          ok: true,
          status: 204,
          headers: {
            get: () => null,
          },
          json: () => Promise.resolve({}),
        })
        // Third call: 200 complete
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: {
            get: (key: string) => {
              if (key === "X-Credits-Left") return "99";
              return null;
            },
          },
          json: () =>
            Promise.resolve([
              {
                item: "test@example.com",
                status: "success",
                person: {
                  phones: [{ phone: "+5511999887766", type: "work" }],
                },
              },
            ]),
        });

      global.fetch = fetchMock;

      // Mock sleep to not actually wait
      vi.spyOn(global, "setTimeout").mockImplementation((fn: () => void) => {
        fn();
        return 0 as unknown as NodeJS.Timeout;
      });

      const result = await serviceWithTenant.lookupPhone("test@example.com");

      expect(result.phone).toBe("+5511999887766");
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it("prefers mobile over work phone", async () => {
      const mockResponse = [
        {
          item: "test@example.com",
          status: "success",
          person: {
            phones: [
              { phone: "+5511111111111", type: "work" },
              { phone: "+5522222222222", type: "mobile" },
            ],
          },
        },
      ];

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: () => Promise.resolve(mockResponse),
      });

      const result = await serviceWithTenant.lookupPhone("test@example.com");

      expect(result.phone).toBe("+5522222222222");
    });

    it("throws error when no phone found", async () => {
      const mockResponse = [
        {
          item: "test@example.com",
          status: "success",
          person: {
            phones: [], // No phones
          },
        },
      ];

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: () => Promise.resolve(mockResponse),
      });

      await expect(
        serviceWithTenant.lookupPhone("test@example.com")
      ).rejects.toThrow("Telefone não encontrado");
    });

    it("throws error when person not found", async () => {
      const mockResponse = [
        {
          item: "test@example.com",
          status: "failed",
          error: "Person not found",
        },
      ];

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: () => Promise.resolve(mockResponse),
      });

      await expect(
        serviceWithTenant.lookupPhone("test@example.com")
      ).rejects.toThrow("Person not found");
    });

    it("throws error on credits exhausted", async () => {
      const mockResponse = [
        {
          item: "test@example.com",
          status: "credits_are_over",
        },
      ];

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: () => Promise.resolve(mockResponse),
      });

      await expect(
        serviceWithTenant.lookupPhone("test@example.com")
      ).rejects.toThrow("Créditos");
    });

    it("throws error when API key not configured", async () => {
      const serviceNoTenant = new SignalHireService(); // No tenant ID

      await expect(
        serviceNoTenant.lookupPhone("test@example.com")
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
    });
  });
});
