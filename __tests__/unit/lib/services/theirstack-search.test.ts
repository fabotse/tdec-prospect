/**
 * Unit tests for TheirStackService search methods
 * Story: 15.2 - Busca Technografica: Autocomplete e Filtros
 *
 * Tests:
 * - searchTechnologies: success, empty, 401, 429, timeout, network error, typeof guards
 * - searchCompanies: success with filters, empty, 401, 429, timeout, credits exhausted, typeof guards
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TheirStackService } from "@/lib/services/theirstack";
import { ExternalServiceError } from "@/lib/services/base-service";
import {
  createMockFetch,
  mockJsonResponse,
  mockErrorResponse,
  mockNetworkError,
  restoreFetch,
} from "../../../helpers/mock-fetch";

describe("TheirStackService - Search Methods", () => {
  let service: TheirStackService;

  beforeEach(() => {
    service = new TheirStackService();
  });

  afterEach(() => {
    restoreFetch();
    vi.restoreAllMocks();
  });

  // ==============================================
  // searchTechnologies
  // ==============================================

  describe("searchTechnologies", () => {
    const mockCatalogResponse = {
      data: [
        { name: "React", slug: "react", category: "Frontend", company_count: 150000 },
        { name: "React Native", slug: "react-native", category: "Mobile", company_count: 30000 },
      ],
      metadata: { total_results: 2, page: 0, limit: 15 },
    };

    it("returns keywords on success", async () => {
      const { calls } = createMockFetch([
        {
          url: /theirstack\.com.*catalog\/keywords/,
          response: mockJsonResponse(mockCatalogResponse),
        },
      ]);

      const result = await service.searchTechnologies("test-key", "react");

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe("React");
      expect(result[0].slug).toBe("react");
      expect(result[0].category).toBe("Frontend");
      expect(result[0].company_count).toBe(150000);

      // Verify query params
      expect(calls()[0].url).toContain("name_pattern=react");
      expect(calls()[0].url).toContain("limit=15");
      expect(calls()[0].url).toContain("include_metadata=true");
    });

    it("sends Bearer token in Authorization header", async () => {
      const { calls } = createMockFetch([
        {
          url: /theirstack\.com.*catalog\/keywords/,
          response: mockJsonResponse(mockCatalogResponse),
        },
      ]);

      await service.searchTechnologies("my-api-key", "react");

      expect(calls()[0].headers?.Authorization).toBe("Bearer my-api-key");
    });

    it("respects custom limit parameter", async () => {
      const { calls } = createMockFetch([
        {
          url: /theirstack\.com.*catalog\/keywords/,
          response: mockJsonResponse({ data: [], metadata: { total_results: 0, page: 0, limit: 5 } }),
        },
      ]);

      await service.searchTechnologies("test-key", "react", 5);

      expect(calls()[0].url).toContain("limit=5");
    });

    it("returns empty array for no results", async () => {
      createMockFetch([
        {
          url: /theirstack\.com.*catalog\/keywords/,
          response: mockJsonResponse({ data: [], metadata: { total_results: 0, page: 0, limit: 15 } }),
        },
      ]);

      const result = await service.searchTechnologies("test-key", "zzzzz");

      expect(result).toEqual([]);
    });

    it("throws ExternalServiceError on 401", async () => {
      createMockFetch([
        {
          url: /theirstack\.com/,
          response: mockErrorResponse(401, "Unauthorized"),
        },
      ]);

      await expect(service.searchTechnologies("bad-key", "react")).rejects.toThrow(
        ExternalServiceError
      );
    });

    it("throws ExternalServiceError on 429 (rate limit)", async () => {
      createMockFetch([
        {
          url: /theirstack\.com/,
          response: mockErrorResponse(429, "Rate limited"),
        },
      ]);

      await expect(
        service.searchTechnologies("test-key", "react")
      ).rejects.toThrow(ExternalServiceError);
    });

    it("handles timeout", async () => {
      const mockFetch = vi.fn().mockImplementation(() => {
        const error = new Error("The operation was aborted");
        error.name = "AbortError";
        return Promise.reject(error);
      });
      global.fetch = mockFetch;

      await expect(
        service.searchTechnologies("test-key", "react")
      ).rejects.toThrow();
    });

    it("handles network error", async () => {
      createMockFetch([
        {
          url: /theirstack\.com/,
          response: mockNetworkError("Failed to fetch"),
        },
      ]);

      await expect(
        service.searchTechnologies("test-key", "react")
      ).rejects.toThrow();
    });

    it("throws ExternalServiceError with CREDITS_EXHAUSTED message on 402", async () => {
      createMockFetch([
        {
          url: /theirstack\.com/,
          response: mockErrorResponse(402, "Payment Required"),
        },
      ]);

      await expect(
        service.searchTechnologies("test-key", "react")
      ).rejects.toThrow(ExternalServiceError);

      try {
        await service.searchTechnologies("test-key", "react");
      } catch (error) {
        expect((error as ExternalServiceError).userMessage).toContain(
          "Credits API"
        );
      }
    });

    it("applies typeof guards for unexpected field types", async () => {
      createMockFetch([
        {
          url: /theirstack\.com.*catalog\/keywords/,
          response: mockJsonResponse({
            data: [
              { name: 123, slug: null, category: 456, company_count: "not-number" },
            ],
            metadata: { total_results: 1, page: 0, limit: 15 },
          }),
        },
      ]);

      const result = await service.searchTechnologies("test-key", "test");

      expect(result[0].name).toBe("");
      expect(result[0].slug).toBe("");
      expect(result[0].category).toBe(null);
      expect(result[0].company_count).toBe(0);
    });

    it("handles non-array data gracefully", async () => {
      createMockFetch([
        {
          url: /theirstack\.com.*catalog\/keywords/,
          response: mockJsonResponse({
            data: null,
            metadata: { total_results: 0, page: 0, limit: 15 },
          }),
        },
      ]);

      const result = await service.searchTechnologies("test-key", "test");

      expect(result).toEqual([]);
    });
  });

  // ==============================================
  // searchCompanies
  // ==============================================

  describe("searchCompanies", () => {
    const mockCompanyResponse = {
      metadata: { total_results: 2, total_companies: 2 },
      data: [
        {
          name: "Acme Corp",
          domain: "acme.com",
          url: "https://acme.com",
          country: "Brazil",
          country_code: "BR",
          city: "São Paulo",
          industry: "Software",
          employee_count_range: "100-500",
          apollo_id: "apollo-123",
          annual_revenue_usd: 5000000,
          founded_year: 2015,
          linkedin_url: "https://linkedin.com/company/acme",
          technologies_found: [
            {
              technology: { name: "React", slug: "react" },
              confidence: "high",
              theirstack_score: 0.95,
            },
          ],
          has_blurred_data: false,
        },
      ],
    };

    it("returns companies on success with filters", async () => {
      const { calls } = createMockFetch([
        {
          url: /theirstack\.com.*companies\/search/,
          method: "POST",
          response: mockJsonResponse(mockCompanyResponse),
        },
      ]);

      const result = await service.searchCompanies("test-key", {
        technologySlugs: ["react"],
        countryCodes: ["BR"],
        minEmployeeCount: 50,
        maxEmployeeCount: 500,
        industryIds: [1],
        page: 0,
        limit: 10,
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].name).toBe("Acme Corp");
      expect(result.data[0].technologies_found[0].confidence).toBe("high");
      expect(result.metadata.total_results).toBe(2);

      // Verify request body mapping (camelCase -> snake_case)
      const body = calls()[0].body as Record<string, unknown>;
      expect(body.company_technology_slug_or).toEqual(["react"]);
      expect(body.company_country_code_or).toEqual(["BR"]);
      expect(body.min_employee_count).toBe(50);
      expect(body.max_employee_count).toBe(500);
      expect(body.industry_id_or).toEqual([1]);
      expect(body.include_total_results).toBe(true);
    });

    it("sends correct headers", async () => {
      const { calls } = createMockFetch([
        {
          url: /theirstack\.com.*companies\/search/,
          method: "POST",
          response: mockJsonResponse(mockCompanyResponse),
        },
      ]);

      await service.searchCompanies("my-key", {
        technologySlugs: ["react"],
      });

      expect(calls()[0].headers?.Authorization).toBe("Bearer my-key");
      expect(calls()[0].headers?.["Content-Type"]).toBe("application/json");
      expect(calls()[0].method).toBe("POST");
    });

    it("omits optional filters when not provided", async () => {
      const { calls } = createMockFetch([
        {
          url: /theirstack\.com.*companies\/search/,
          method: "POST",
          response: mockJsonResponse({ metadata: { total_results: 0, total_companies: 0 }, data: [] }),
        },
      ]);

      await service.searchCompanies("test-key", {
        technologySlugs: ["react"],
      });

      const body = calls()[0].body as Record<string, unknown>;
      expect(body.company_technology_slug_or).toEqual(["react"]);
      expect(body.company_country_code_or).toBeUndefined();
      expect(body.min_employee_count).toBeUndefined();
      expect(body.max_employee_count).toBeUndefined();
      expect(body.industry_id_or).toBeUndefined();
      expect(body.limit).toBe(10); // default
      expect(body.page).toBe(0); // default
    });

    it("returns empty results", async () => {
      createMockFetch([
        {
          url: /theirstack\.com.*companies\/search/,
          method: "POST",
          response: mockJsonResponse({ metadata: { total_results: 0, total_companies: 0 }, data: [] }),
        },
      ]);

      const result = await service.searchCompanies("test-key", {
        technologySlugs: ["nonexistent-tech"],
      });

      expect(result.data).toEqual([]);
      expect(result.metadata.total_results).toBe(0);
    });

    it("throws ExternalServiceError on 401", async () => {
      createMockFetch([
        {
          url: /theirstack\.com/,
          response: mockErrorResponse(401, "Unauthorized"),
        },
      ]);

      await expect(
        service.searchCompanies("bad-key", { technologySlugs: ["react"] })
      ).rejects.toThrow(ExternalServiceError);
    });

    it("throws ExternalServiceError on 429 (rate limit)", async () => {
      createMockFetch([
        {
          url: /theirstack\.com/,
          response: mockErrorResponse(429, "Rate limited"),
        },
      ]);

      await expect(
        service.searchCompanies("test-key", { technologySlugs: ["react"] })
      ).rejects.toThrow(ExternalServiceError);
    });

    it("handles timeout", async () => {
      const mockFetch = vi.fn().mockImplementation(() => {
        const error = new Error("The operation was aborted");
        error.name = "AbortError";
        return Promise.reject(error);
      });
      global.fetch = mockFetch;

      await expect(
        service.searchCompanies("test-key", { technologySlugs: ["react"] })
      ).rejects.toThrow();
    });

    it("handles network error", async () => {
      createMockFetch([
        {
          url: /theirstack\.com/,
          response: mockNetworkError("Failed to fetch"),
        },
      ]);

      await expect(
        service.searchCompanies("test-key", { technologySlugs: ["react"] })
      ).rejects.toThrow();
    });

    it("throws ExternalServiceError with CREDITS_EXHAUSTED message on 402", async () => {
      createMockFetch([
        {
          url: /theirstack\.com/,
          response: mockErrorResponse(402, "Payment Required"),
        },
      ]);

      await expect(
        service.searchCompanies("test-key", { technologySlugs: ["react"] })
      ).rejects.toThrow(ExternalServiceError);

      try {
        await service.searchCompanies("test-key", { technologySlugs: ["react"] });
      } catch (error) {
        expect((error as ExternalServiceError).userMessage).toContain(
          "Credits API"
        );
      }
    });

    it("applies typeof guards for null company fields", async () => {
      createMockFetch([
        {
          url: /theirstack\.com.*companies\/search/,
          method: "POST",
          response: mockJsonResponse({
            metadata: { total_results: 1, total_companies: 1 },
            data: [
              {
                name: "Test Corp",
                domain: "test.com",
                url: null,
                country: null,
                country_code: null,
                city: null,
                industry: null,
                employee_count_range: null,
                apollo_id: null,
                annual_revenue_usd: null,
                founded_year: null,
                linkedin_url: null,
                technologies_found: [],
                has_blurred_data: false,
              },
            ],
          }),
        },
      ]);

      const result = await service.searchCompanies("test-key", {
        technologySlugs: ["react"],
      });

      const company = result.data[0];
      expect(company.name).toBe("Test Corp");
      expect(company.country).toBeNull();
      expect(company.country_code).toBeNull();
      expect(company.city).toBeNull();
      expect(company.apollo_id).toBeNull();
      expect(company.annual_revenue_usd).toBeNull();
      expect(company.founded_year).toBeNull();
      expect(company.linkedin_url).toBeNull();
    });

    it("applies typeof guards for unexpected field types (string instead of number)", async () => {
      createMockFetch([
        {
          url: /theirstack\.com.*companies\/search/,
          method: "POST",
          response: mockJsonResponse({
            metadata: { total_results: "not-number", total_companies: null },
            data: [
              {
                name: 123,
                domain: 456,
                url: 789,
                country: 0,
                country_code: false,
                city: [],
                industry: {},
                employee_count_range: true,
                apollo_id: 42,
                annual_revenue_usd: "not-number",
                founded_year: "2020",
                linkedin_url: 100,
                technologies_found: [
                  {
                    technology: { name: 1, slug: 2 },
                    confidence: "invalid",
                    theirstack_score: "bad",
                  },
                ],
                has_blurred_data: "true",
              },
            ],
          }),
        },
      ]);

      const result = await service.searchCompanies("test-key", {
        technologySlugs: ["react"],
      });

      expect(result.metadata.total_results).toBe(0);
      expect(result.metadata.total_companies).toBe(0);

      const company = result.data[0];
      expect(company.name).toBe("");
      expect(company.domain).toBe("");
      expect(company.url).toBeNull();
      expect(company.country).toBeNull();
      expect(company.country_code).toBeNull();
      expect(company.city).toBeNull();
      expect(company.industry).toBeNull();
      expect(company.employee_count_range).toBeNull();
      expect(company.apollo_id).toBeNull();
      expect(company.annual_revenue_usd).toBeNull();
      expect(company.founded_year).toBeNull();
      expect(company.linkedin_url).toBeNull();
      expect(company.has_blurred_data).toBe(false);

      const tf = company.technologies_found[0];
      expect(tf.technology.name).toBe("");
      expect(tf.technology.slug).toBe("");
      expect(tf.confidence).toBe("low"); // invalid → fallback
      expect(tf.theirstack_score).toBe(0);
    });

    it("handles non-array data gracefully", async () => {
      createMockFetch([
        {
          url: /theirstack\.com.*companies\/search/,
          method: "POST",
          response: mockJsonResponse({
            metadata: { total_results: 0, total_companies: 0 },
            data: null,
          }),
        },
      ]);

      const result = await service.searchCompanies("test-key", {
        technologySlugs: ["react"],
      });

      expect(result.data).toEqual([]);
    });

    it("handles non-array technologies_found gracefully", async () => {
      createMockFetch([
        {
          url: /theirstack\.com.*companies\/search/,
          method: "POST",
          response: mockJsonResponse({
            metadata: { total_results: 1, total_companies: 1 },
            data: [
              {
                name: "Test",
                domain: "test.com",
                url: null,
                country: null,
                country_code: null,
                city: null,
                industry: null,
                employee_count_range: null,
                apollo_id: null,
                annual_revenue_usd: null,
                founded_year: null,
                linkedin_url: null,
                technologies_found: null,
                has_blurred_data: false,
              },
            ],
          }),
        },
      ]);

      const result = await service.searchCompanies("test-key", {
        technologySlugs: ["react"],
      });

      expect(result.data[0].technologies_found).toEqual([]);
    });
  });
});
