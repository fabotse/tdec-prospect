/**
 * Unit tests for Apollo Service
 * Story: 2.3 - Integration Connection Testing
 * Story: 3.2 - Apollo API Integration Service
 * Story: 3.2.1 - People Enrichment Integration
 *
 * Tests:
 * - testConnection returns success on 200
 * - testConnection returns error on 401 (invalid key)
 * - testConnection returns error on 429 (rate limit)
 * - Includes latency in result
 * - searchPeople transforms filters and returns LeadRow array (Story 3.2)
 * - handleError translates errors to Portuguese (Story 3.2)
 * - enrichPerson returns enriched person data (Story 3.2.1)
 * - enrichPeople returns bulk enriched data (Story 3.2.1)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ApolloService } from "@/lib/services/apollo";
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

describe("ApolloService", () => {
  let service: ApolloService;

  beforeEach(() => {
    service = new ApolloService();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("testConnection", () => {
    it("returns success on 200 response", async () => {
      vi.useRealTimers();

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            is_logged_in: true,
          }),
      });

      const result = await service.testConnection("test-api-key");

      expect(result.success).toBe(true);
      expect(result.message).toBe(ERROR_MESSAGES.SUCCESS);
      expect(result.testedAt).toBeDefined();
      expect(typeof result.latencyMs).toBe("number");
    });

    it("returns error on 401 (invalid key)", async () => {
      vi.useRealTimers();

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
      });

      const result = await service.testConnection("invalid-api-key");

      expect(result.success).toBe(false);
      expect(result.message).toContain("inválida");
      expect(result.testedAt).toBeDefined();
    });

    it("returns error on 403 (forbidden)", async () => {
      vi.useRealTimers();

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
      });

      const result = await service.testConnection("test-api-key");

      expect(result.success).toBe(false);
    });

    it("returns error on 429 (rate limit)", async () => {
      vi.useRealTimers();

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
      });

      const result = await service.testConnection("test-api-key");

      expect(result.success).toBe(false);
      expect(result.message).toContain("Limite");
    });

    it("includes latency in successful result", async () => {
      vi.useRealTimers();

      global.fetch = vi.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(
              () =>
                resolve({
                  ok: true,
                  json: () => Promise.resolve({ is_logged_in: true }),
                }),
              10
            );
          })
      );

      const result = await service.testConnection("test-api-key");

      expect(result.success).toBe(true);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it("uses correct API endpoint", async () => {
      vi.useRealTimers();

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ is_logged_in: true }),
      });
      global.fetch = fetchMock;

      await service.testConnection("test-api-key");

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("api.apollo.io"),
        expect.objectContaining({
          headers: expect.objectContaining({
            "x-api-key": "test-api-key",
          }),
        })
      );
    });

    it("handles network errors", async () => {
      vi.useRealTimers();

      global.fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));

      const result = await service.testConnection("test-api-key");

      expect(result.success).toBe(false);
      // ApolloService uses its own handleError which returns Apollo-specific messages
      expect(result.message).toContain("Apollo");
    });
  });

  describe("searchPeople (Story 3.2)", () => {
    let serviceWithTenant: ApolloService;

    beforeEach(() => {
      serviceWithTenant = new ApolloService("tenant-123");
    });

    it("transforms filters and calls Apollo API", async () => {
      vi.useRealTimers();

      // Mock response matches api_search endpoint format
      const mockResponse = {
        total_entries: 1,
        people: [
          {
            id: "apollo-1",
            first_name: "João",
            last_name_obfuscated: "Si***a",
            title: "CEO",
            last_refreshed_at: "2025-11-04T23:20:32.690+00:00",
            has_email: true,
            has_city: true,
            has_state: true,
            has_country: true,
            has_direct_phone: "Yes",
            organization: {
              name: "Test Corp",
              has_industry: true,
              has_phone: true,
              has_city: true,
              has_state: true,
              has_country: true,
              has_zip_code: true,
              has_revenue: true,
              has_employee_count: true,
            },
          },
        ],
      };

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });
      global.fetch = fetchMock;

      const filters = {
        titles: ["CEO"],
        locations: ["Brazil"],
        page: 1,
        perPage: 25,
      };

      const result = await serviceWithTenant.searchPeople(filters);

      // Verify api_search endpoint is called with query params
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("api_search"),
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
            "x-api-key": "decrypted-api-key",
          }),
        })
      );

      expect(result).toHaveLength(1);
      expect(result[0].first_name).toBe("João");
      expect(result[0].tenant_id).toBe("tenant-123");
      expect(result[0].status).toBe("novo");
    });

    it("returns LeadRow array", async () => {
      vi.useRealTimers();

      const mockResponse = {
        total_entries: 1,
        people: [
          {
            id: "apollo-1",
            first_name: "Test",
            last_name_obfuscated: "Us***r",
            title: null,
            last_refreshed_at: "2025-01-01T00:00:00.000+00:00",
            has_email: true,
            has_city: false,
            has_state: false,
            has_country: false,
            has_direct_phone: "Yes",
          },
        ],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await serviceWithTenant.searchPeople({});

      expect(result[0]).toHaveProperty("id");
      expect(result[0]).toHaveProperty("tenant_id");
      expect(result[0]).toHaveProperty("apollo_id");
      expect(result[0]).toHaveProperty("first_name");
      expect(result[0]).toHaveProperty("status");
      expect(result[0]).toHaveProperty("created_at");
    });

    it("handles empty response", async () => {
      vi.useRealTimers();

      const mockResponse = {
        total_entries: 0,
        people: [],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await serviceWithTenant.searchPeople({});

      expect(result).toEqual([]);
    });

    it("sets default status to novo", async () => {
      vi.useRealTimers();

      const mockResponse = {
        total_entries: 1,
        people: [
          {
            id: "apollo-1",
            first_name: "Test",
            last_name_obfuscated: "Us***r",
            title: null,
            last_refreshed_at: "2025-01-01T00:00:00.000+00:00",
            has_email: false,
            has_city: false,
            has_state: false,
            has_country: false,
            has_direct_phone: "No",
          },
        ],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await serviceWithTenant.searchPeople({});

      expect(result[0].status).toBe("novo");
    });
  });

  describe("handleError (Story 3.2)", () => {
    it("translates 401 to Portuguese", async () => {
      vi.useRealTimers();

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
      });

      const result = await service.testConnection("invalid-key");

      expect(result.success).toBe(false);
      expect(result.message).toContain("inválida");
    });

    it("translates 429 to Portuguese", async () => {
      vi.useRealTimers();

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
      });

      const result = await service.testConnection("test-key");

      expect(result.success).toBe(false);
      expect(result.message).toContain("Limite");
    });

    it("translates 403 to Portuguese", async () => {
      vi.useRealTimers();

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
      });

      const result = await service.testConnection("test-key");

      expect(result.success).toBe(false);
      expect(result.message).toContain("Acesso negado");
    });

    it("translates timeout to Portuguese", async () => {
      vi.useRealTimers();

      const abortError = new Error("Aborted");
      abortError.name = "AbortError";
      global.fetch = vi.fn().mockRejectedValue(abortError);

      const result = await service.testConnection("test-key");

      expect(result.success).toBe(false);
      expect(result.message).toContain("Tempo limite");
    });

    it("handles unknown errors gracefully", async () => {
      vi.useRealTimers();

      global.fetch = vi.fn().mockRejectedValue(new Error("Unknown error"));

      const result = await service.testConnection("test-key");

      expect(result.success).toBe(false);
      expect(result.message).toBeDefined();
    });
  });

  describe("service properties", () => {
    it("has correct service name", () => {
      expect(service.name).toBe("apollo");
    });

    it("accepts tenantId in constructor", () => {
      const serviceWithTenant = new ApolloService("tenant-123");
      expect(serviceWithTenant.name).toBe("apollo");
    });
  });

  // ==============================================
  // ENRICHMENT TESTS (Story 3.2.1)
  // ==============================================

  describe("enrichPerson (Story 3.2.1)", () => {
    let serviceWithTenant: ApolloService;

    beforeEach(() => {
      serviceWithTenant = new ApolloService("tenant-123");
    });

    it("enriches person by apollo_id", async () => {
      vi.useRealTimers();

      const mockResponse = {
        person: {
          id: "apollo-1",
          first_name: "João",
          last_name: "Silva",
          email: "joao@empresa.com",
          email_status: "verified",
          title: "CEO",
          city: "São Paulo",
          state: "SP",
          country: "Brazil",
          linkedin_url: "https://linkedin.com/in/joao",
          photo_url: null,
          employment_history: [],
        },
        organization: {
          id: "org-1",
          name: "Empresa SA",
          domain: "empresa.com",
          industry: "Technology",
          estimated_num_employees: 150,
        },
      };

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });
      global.fetch = fetchMock;

      const result = await serviceWithTenant.enrichPerson("apollo-1");

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("people/match"),
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("apollo-1"),
        })
      );

      expect(result.person?.last_name).toBe("Silva");
      expect(result.person?.email).toBe("joao@empresa.com");
    });

    it("returns full last_name (not obfuscated)", async () => {
      vi.useRealTimers();

      const mockResponse = {
        person: {
          id: "apollo-1",
          first_name: "João",
          last_name: "Silva Costa", // Full name, not obfuscated
          email: null,
          email_status: null,
          title: null,
          city: null,
          state: null,
          country: null,
          linkedin_url: null,
          photo_url: null,
          employment_history: [],
        },
        organization: null,
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await serviceWithTenant.enrichPerson("apollo-1");

      expect(result.person?.last_name).toBe("Silva Costa");
      expect(result.person?.last_name).not.toContain("***");
    });

    it("returns email when reveal_personal_emails=true", async () => {
      vi.useRealTimers();

      const mockResponse = {
        person: {
          id: "apollo-1",
          first_name: "João",
          last_name: "Silva",
          email: "joao.pessoal@gmail.com",
          email_status: "verified",
          title: null,
          city: null,
          state: null,
          country: null,
          linkedin_url: null,
          photo_url: null,
          employment_history: [],
        },
        organization: null,
      };

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });
      global.fetch = fetchMock;

      const result = await serviceWithTenant.enrichPerson("apollo-1", {
        revealPersonalEmails: true,
      });

      expect(fetchMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"reveal_personal_emails":true'),
        })
      );
      expect(result.person?.email).toBe("joao.pessoal@gmail.com");
    });

    it("returns null email for GDPR region", async () => {
      vi.useRealTimers();

      const mockResponse = {
        person: {
          id: "apollo-1",
          first_name: "Hans",
          last_name: "Müller",
          email: null, // GDPR region - no personal email
          email_status: null,
          title: "Manager",
          city: "Berlin",
          state: null,
          country: "Germany",
          linkedin_url: null,
          photo_url: null,
          employment_history: [],
        },
        organization: null,
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await serviceWithTenant.enrichPerson("apollo-1", {
        revealPersonalEmails: true,
      });

      expect(result.person?.email).toBeNull();
      expect(result.person?.country).toBe("Germany");
    });

    it("handles person not found", async () => {
      vi.useRealTimers();

      const mockResponse = {
        person: null,
        organization: null,
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      await expect(
        serviceWithTenant.enrichPerson("nonexistent-id")
      ).rejects.toThrow("não encontrada");
    });

    it("throws when webhook_url missing for phone", async () => {
      vi.useRealTimers();

      await expect(
        serviceWithTenant.enrichPerson("apollo-1", {
          revealPhoneNumber: true,
          // missing webhookUrl
        })
      ).rejects.toThrow("Webhook URL obrigatória");
    });

    it("includes waterfall status for async phone delivery", async () => {
      vi.useRealTimers();

      const mockResponse = {
        person: {
          id: "apollo-1",
          first_name: "João",
          last_name: "Silva",
          email: null,
          email_status: null,
          title: null,
          city: null,
          state: null,
          country: null,
          linkedin_url: null,
          photo_url: null,
          employment_history: [],
        },
        organization: null,
        waterfall: {
          status: "accepted",
          message: "Phone number will be delivered via webhook",
        },
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await serviceWithTenant.enrichPerson("apollo-1", {
        revealPhoneNumber: true,
        webhookUrl: "https://example.com/webhook",
      });

      expect(result.waterfall?.status).toBe("accepted");
    });
  });

  describe("enrichPeople (Story 3.2.1)", () => {
    let serviceWithTenant: ApolloService;

    beforeEach(() => {
      serviceWithTenant = new ApolloService("tenant-123");
    });

    it("enriches up to 10 people", async () => {
      vi.useRealTimers();

      const mockResponse = {
        matches: [
          {
            person: {
              id: "apollo-1",
              first_name: "João",
              last_name: "Silva",
              email: "joao@empresa.com",
              email_status: "verified",
              title: "CEO",
              city: "São Paulo",
              state: "SP",
              country: "Brazil",
              linkedin_url: null,
              photo_url: null,
              employment_history: [],
            },
            organization: null,
          },
          {
            person: {
              id: "apollo-2",
              first_name: "Maria",
              last_name: "Santos",
              email: "maria@empresa.com",
              email_status: "verified",
              title: "CTO",
              city: "Rio de Janeiro",
              state: "RJ",
              country: "Brazil",
              linkedin_url: null,
              photo_url: null,
              employment_history: [],
            },
            organization: null,
          },
        ],
        missing: 0,
      };

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });
      global.fetch = fetchMock;

      const result = await serviceWithTenant.enrichPeople([
        "apollo-1",
        "apollo-2",
      ]);

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("bulk_match"),
        expect.any(Object)
      );

      expect(result).toHaveLength(2);
      expect(result[0].last_name).toBe("Silva");
      expect(result[1].last_name).toBe("Santos");
    });

    it("throws error for more than 10 people", async () => {
      vi.useRealTimers();

      const apolloIds = Array.from({ length: 11 }, (_, i) => `apollo-${i}`);

      await expect(
        serviceWithTenant.enrichPeople(apolloIds)
      ).rejects.toThrow("Máximo de 10");
    });

    it("filters out null results", async () => {
      vi.useRealTimers();

      const mockResponse = {
        matches: [
          {
            person: {
              id: "apollo-1",
              first_name: "João",
              last_name: "Silva",
              email: null,
              email_status: null,
              title: null,
              city: null,
              state: null,
              country: null,
              linkedin_url: null,
              photo_url: null,
              employment_history: [],
            },
            organization: null,
          },
          {
            person: null, // Not found
            organization: null,
          },
        ],
        missing: 1,
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await serviceWithTenant.enrichPeople([
        "apollo-1",
        "apollo-2",
      ]);

      expect(result).toHaveLength(1);
      expect(result[0].first_name).toBe("João");
    });

    it("returns empty array for empty input", async () => {
      vi.useRealTimers();

      const result = await serviceWithTenant.enrichPeople([]);

      expect(result).toEqual([]);
    });

    it("validates webhook_url for phone enrichment", async () => {
      vi.useRealTimers();

      await expect(
        serviceWithTenant.enrichPeople(["apollo-1"], {
          revealPhoneNumber: true,
          // missing webhookUrl
        })
      ).rejects.toThrow("Webhook URL obrigatória");
    });
  });
});
