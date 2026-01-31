/**
 * Apollo Types Tests
 * Story: 3.2 - Apollo API Integration Service
 * AC: #6 - Filter and response type definitions
 *
 * Updated for api_search endpoint which returns limited data for prospecting.
 */

import { describe, it, expect } from "vitest";
import {
  transformApolloToLeadRow,
  type ApolloSearchFilters,
  type ApolloPerson,
  type ApolloOrganization,
} from "@/types/apollo";
import type { LeadRow } from "@/types/lead";

describe("Apollo Types", () => {
  // ==============================================
  // APOLLO SEARCH FILTERS
  // ==============================================

  describe("ApolloSearchFilters", () => {
    it("should accept all filter options", () => {
      const filters: ApolloSearchFilters = {
        industries: ["Technology", "Finance"],
        companySizes: ["11-50", "51-200"],
        locations: ["Sao Paulo, Brazil"],
        titles: ["CEO", "CTO"],
        keywords: "marketing automation",
        domains: ["example.com"],
        page: 1,
        perPage: 25,
      };

      expect(filters.industries).toEqual(["Technology", "Finance"]);
      expect(filters.companySizes).toEqual(["11-50", "51-200"]);
      expect(filters.titles).toEqual(["CEO", "CTO"]);
    });

    it("should allow empty filters", () => {
      const filters: ApolloSearchFilters = {};
      expect(filters.page).toBeUndefined();
    });
  });

  // ==============================================
  // TRANSFORM APOLLO TO LEAD ROW
  // ==============================================

  describe("transformApolloToLeadRow", () => {
    const mockOrganization: ApolloOrganization = {
      name: "Tech Corp",
      has_industry: true,
      has_phone: true,
      has_city: true,
      has_state: true,
      has_country: true,
      has_zip_code: true,
      has_revenue: true,
      has_employee_count: true,
    };

    const mockPerson: ApolloPerson = {
      id: "apollo-123",
      first_name: "João",
      last_name_obfuscated: "Si***a",
      title: "CEO",
      last_refreshed_at: "2025-11-04T23:20:32.690+00:00",
      has_email: true,
      has_city: true,
      has_state: true,
      has_country: true,
      has_direct_phone: "Yes",
      organization: mockOrganization,
    };

    const tenantId = "tenant-456";

    it("should map all available fields correctly", () => {
      const result = transformApolloToLeadRow(mockPerson, tenantId);

      expect(result.apollo_id).toBe("apollo-123");
      expect(result.tenant_id).toBe(tenantId);
      expect(result.first_name).toBe("João");
      expect(result.last_name).toBe("Si***a"); // obfuscated
      expect(result.company_name).toBe("Tech Corp");
      expect(result.title).toBe("CEO");
    });

    it("should set null for fields not returned by api_search", () => {
      const result = transformApolloToLeadRow(mockPerson, tenantId);

      // api_search doesn't return these - only availability flags
      expect(result.email).toBeNull();
      expect(result.phone).toBeNull();
      expect(result.industry).toBeNull();
      expect(result.location).toBeNull();
      expect(result.company_size).toBeNull();
      expect(result.linkedin_url).toBeNull();
    });

    it("should generate new UUID for id", () => {
      const result = transformApolloToLeadRow(mockPerson, tenantId);

      expect(result.id).toBeDefined();
      expect(result.id).not.toBe(mockPerson.id);
      // UUID format check
      expect(result.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
    });

    it("should set tenant_id", () => {
      const result = transformApolloToLeadRow(mockPerson, tenantId);
      expect(result.tenant_id).toBe(tenantId);
    });

    it("should set default status to novo", () => {
      const result = transformApolloToLeadRow(mockPerson, tenantId);
      expect(result.status).toBe("novo");
    });

    it("should handle missing optional fields", () => {
      const minimalPerson: ApolloPerson = {
        id: "apollo-min",
        first_name: "Test",
        last_name_obfuscated: "Us***r",
        title: null,
        last_refreshed_at: "2025-01-01T00:00:00.000+00:00",
        has_email: false,
        has_city: false,
        has_state: false,
        has_country: false,
        has_direct_phone: "Maybe: please request direct dial via people/bulk_match",
      };

      const result = transformApolloToLeadRow(minimalPerson, tenantId);

      expect(result.apollo_id).toBe("apollo-min");
      expect(result.first_name).toBe("Test");
      expect(result.last_name).toBe("Us***r");
      expect(result.title).toBeNull();
      expect(result.company_name).toBeNull();
    });

    it("should handle missing organization", () => {
      const personNoOrg: ApolloPerson = {
        id: "apollo-no-org",
        first_name: "Test",
        last_name_obfuscated: "Us***r",
        title: "Developer",
        last_refreshed_at: "2025-01-01T00:00:00.000+00:00",
        has_email: true,
        has_city: true,
        has_state: true,
        has_country: true,
        has_direct_phone: "Yes",
        // organization is undefined
      };

      const result = transformApolloToLeadRow(personNoOrg, tenantId);

      expect(result.company_name).toBeNull();
    });

    it("should set created_at and updated_at timestamps", () => {
      const before = new Date().toISOString();
      const result = transformApolloToLeadRow(mockPerson, tenantId);
      const after = new Date().toISOString();

      expect(result.created_at).toBeDefined();
      expect(result.updated_at).toBeDefined();
      expect(result.created_at >= before).toBe(true);
      expect(result.created_at <= after).toBe(true);
      expect(result.updated_at >= before).toBe(true);
      expect(result.updated_at <= after).toBe(true);
    });

    it("should return LeadRow type", () => {
      const result: LeadRow = transformApolloToLeadRow(mockPerson, tenantId);
      expect(result).toBeDefined();
    });

    it("should preserve obfuscated last name format", () => {
      const personObfuscated: ApolloPerson = {
        ...mockPerson,
        last_name_obfuscated: "Hu***n", // Example: "Huberman"
      };

      const result = transformApolloToLeadRow(personObfuscated, tenantId);
      expect(result.last_name).toBe("Hu***n");
    });
  });
});
