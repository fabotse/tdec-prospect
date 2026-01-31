/**
 * Apollo Types Tests
 * Story: 3.2 - Apollo API Integration Service
 * Story: 3.2.1 - People Enrichment Integration
 * AC: #6 - Filter and response type definitions
 *
 * Updated for api_search endpoint which returns limited data for prospecting.
 * Story 3.2.1: Added tests for enrichment transform function.
 */

import { describe, it, expect } from "vitest";
import {
  transformApolloToLeadRow,
  transformEnrichmentToLead,
  transformFiltersToApollo,
  type ApolloSearchFilters,
  type ApolloAPIFilters,
  type ApolloPerson,
  type ApolloOrganization,
  type ApolloEnrichedPerson,
  type ApolloEnrichedOrganization,
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

    // Story 3.5.1: Test contactEmailStatuses filter option
    it("should accept contactEmailStatuses filter", () => {
      const filters: ApolloSearchFilters = {
        contactEmailStatuses: ["verified", "likely to engage"],
      };

      expect(filters.contactEmailStatuses).toEqual(["verified", "likely to engage"]);
    });
  });

  // ==============================================
  // TRANSFORM FILTERS TO APOLLO (Story 3.5.1)
  // ==============================================

  describe("transformFiltersToApollo", () => {
    it("transforms basic filters to Apollo API format", () => {
      const filters: ApolloSearchFilters = {
        titles: ["CEO", "CTO"],
        keywords: "software",
        page: 1,
        perPage: 25,
      };

      const result = transformFiltersToApollo(filters);

      expect(result.person_titles).toEqual(["CEO", "CTO"]);
      expect(result.q_keywords).toBe("software");
      expect(result.page).toBe(1);
      expect(result.per_page).toBe(25);
    });

    it("transforms companySizes from dash to comma format", () => {
      const filters: ApolloSearchFilters = {
        companySizes: ["11-50", "51-200"],
      };

      const result = transformFiltersToApollo(filters);

      expect(result.organization_num_employees_ranges).toEqual(["11,50", "51,200"]);
    });

    it("maps locations to both person and organization locations", () => {
      const filters: ApolloSearchFilters = {
        locations: ["Sao Paulo, Brazil"],
      };

      const result = transformFiltersToApollo(filters);

      expect(result.person_locations).toEqual(["Sao Paulo, Brazil"]);
      expect(result.organization_locations).toEqual(["Sao Paulo, Brazil"]);
    });

    // Story 3.5.1: contactEmailStatuses transformation
    it("transforms contactEmailStatuses to contact_email_status", () => {
      const filters: ApolloSearchFilters = {
        contactEmailStatuses: ["verified", "likely to engage"],
      };

      const result = transformFiltersToApollo(filters);

      expect(result.contact_email_status).toEqual(["verified", "likely to engage"]);
    });

    it("includes all valid email status values", () => {
      const filters: ApolloSearchFilters = {
        contactEmailStatuses: ["verified", "unverified", "likely to engage", "unavailable"],
      };

      const result = transformFiltersToApollo(filters);

      expect(result.contact_email_status).toEqual([
        "verified",
        "unverified",
        "likely to engage",
        "unavailable",
      ]);
    });

    it("omits contact_email_status when contactEmailStatuses is empty", () => {
      const filters: ApolloSearchFilters = {
        contactEmailStatuses: [],
      };

      const result = transformFiltersToApollo(filters);

      expect(result.contact_email_status).toBeUndefined();
    });

    it("omits contact_email_status when contactEmailStatuses is undefined", () => {
      const filters: ApolloSearchFilters = {
        titles: ["CEO"],
      };

      const result = transformFiltersToApollo(filters);

      expect(result.contact_email_status).toBeUndefined();
    });

    it("combines contactEmailStatuses with other filters", () => {
      const filters: ApolloSearchFilters = {
        titles: ["CEO"],
        locations: ["Sao Paulo, Brazil"],
        contactEmailStatuses: ["verified"],
        page: 1,
        perPage: 25,
      };

      const result = transformFiltersToApollo(filters);

      expect(result.person_titles).toEqual(["CEO"]);
      expect(result.person_locations).toEqual(["Sao Paulo, Brazil"]);
      expect(result.contact_email_status).toEqual(["verified"]);
      expect(result.page).toBe(1);
      expect(result.per_page).toBe(25);
    });

    it("sets default page and per_page values", () => {
      const filters: ApolloSearchFilters = {};

      const result = transformFiltersToApollo(filters);

      expect(result.page).toBe(1);
      expect(result.per_page).toBe(25);
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

    // Story 3.5.1: Tests for contact availability flags
    it("should map has_email and has_direct_phone from ApolloPerson", () => {
      const result = transformApolloToLeadRow(mockPerson, tenantId);

      expect(result.has_email).toBe(true);
      expect(result.has_direct_phone).toBe("Yes");
    });

    it("should map has_email false correctly", () => {
      const personNoEmail: ApolloPerson = {
        ...mockPerson,
        has_email: false,
      };

      const result = transformApolloToLeadRow(personNoEmail, tenantId);

      expect(result.has_email).toBe(false);
    });

    it("should map has_direct_phone 'Maybe' correctly", () => {
      const personMaybePhone: ApolloPerson = {
        ...mockPerson,
        has_direct_phone: "Maybe: please request direct dial via people/bulk_match",
      };

      const result = transformApolloToLeadRow(personMaybePhone, tenantId);

      expect(result.has_direct_phone).toBe("Maybe: please request direct dial via people/bulk_match");
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

  // ==============================================
  // ENRICHMENT TRANSFORM (Story 3.2.1)
  // ==============================================

  describe("transformEnrichmentToLead (Story 3.2.1)", () => {
    const mockEnrichedPerson: ApolloEnrichedPerson = {
      id: "apollo-123",
      first_name: "João",
      last_name: "Silva Costa", // Full name, not obfuscated
      email: "joao@empresa.com",
      email_status: "verified",
      title: "CEO",
      city: "São Paulo",
      state: "SP",
      country: "Brazil",
      linkedin_url: "https://linkedin.com/in/joaosilva",
      photo_url: "https://example.com/photo.jpg",
      employment_history: [],
      phone_numbers: [
        {
          raw_number: "+55 11 99999-9999",
          sanitized_number: "+5511999999999",
          type: "mobile",
        },
      ],
    };

    const mockEnrichedOrganization: ApolloEnrichedOrganization = {
      id: "org-456",
      name: "Empresa SA",
      domain: "empresa.com",
      industry: "Technology",
      estimated_num_employees: 150,
    };

    it("maps all enriched fields to LeadRow", () => {
      const result = transformEnrichmentToLead(
        mockEnrichedPerson,
        mockEnrichedOrganization
      );

      expect(result.last_name).toBe("Silva Costa");
      expect(result.email).toBe("joao@empresa.com");
      expect(result.phone).toBe("+5511999999999");
      expect(result.linkedin_url).toBe("https://linkedin.com/in/joaosilva");
      expect(result.title).toBe("CEO");
      expect(result.company_name).toBe("Empresa SA");
      expect(result.industry).toBe("Technology");
    });

    it("handles null optional fields", () => {
      const personMinimal: ApolloEnrichedPerson = {
        id: "apollo-min",
        first_name: "Test",
        last_name: "User",
        email: null,
        email_status: null,
        title: null,
        city: null,
        state: null,
        country: null,
        linkedin_url: null,
        photo_url: null,
        employment_history: [],
      };

      const result = transformEnrichmentToLead(personMinimal, null);

      expect(result.last_name).toBe("User");
      expect(result.email).toBeNull();
      expect(result.phone).toBeNull();
      expect(result.linkedin_url).toBeNull();
      expect(result.title).toBeNull();
      expect(result.company_name).toBeNull();
    });

    it("builds location from city, state, country", () => {
      const result = transformEnrichmentToLead(
        mockEnrichedPerson,
        mockEnrichedOrganization
      );

      expect(result.location).toBe("São Paulo, SP, Brazil");
    });

    it("handles partial location data", () => {
      const personPartialLocation: ApolloEnrichedPerson = {
        ...mockEnrichedPerson,
        city: "Rio de Janeiro",
        state: null,
        country: "Brazil",
      };

      const result = transformEnrichmentToLead(personPartialLocation, null);

      expect(result.location).toBe("Rio de Janeiro, Brazil");
    });

    it("handles missing location data", () => {
      const personNoLocation: ApolloEnrichedPerson = {
        ...mockEnrichedPerson,
        city: null,
        state: null,
        country: null,
      };

      const result = transformEnrichmentToLead(personNoLocation, null);

      expect(result.location).toBeNull();
    });

    it("maps company_size from estimated_num_employees", () => {
      // Test various employee count ranges
      const testCases = [
        { count: 5, expected: "1-10" },
        { count: 25, expected: "11-50" },
        { count: 100, expected: "51-200" },
        { count: 300, expected: "201-500" },
        { count: 750, expected: "501-1000" },
        { count: 5000, expected: "1000+" },
      ];

      for (const { count, expected } of testCases) {
        const org: ApolloEnrichedOrganization = {
          ...mockEnrichedOrganization,
          estimated_num_employees: count,
        };
        const result = transformEnrichmentToLead(mockEnrichedPerson, org);
        expect(result.company_size).toBe(expected);
      }
    });

    it("sets updated_at timestamp", () => {
      const before = new Date().toISOString();
      const result = transformEnrichmentToLead(
        mockEnrichedPerson,
        mockEnrichedOrganization
      );
      const after = new Date().toISOString();

      expect(result.updated_at).toBeDefined();
      expect(result.updated_at! >= before).toBe(true);
      expect(result.updated_at! <= after).toBe(true);
    });

    it("gets first phone from phone_numbers array", () => {
      const personMultiplePhones: ApolloEnrichedPerson = {
        ...mockEnrichedPerson,
        phone_numbers: [
          {
            raw_number: "+55 11 99999-9999",
            sanitized_number: "+5511999999999",
            type: "mobile",
          },
          {
            raw_number: "+55 11 88888-8888",
            sanitized_number: "+5511888888888",
            type: "work",
          },
        ],
      };

      const result = transformEnrichmentToLead(personMultiplePhones, null);

      expect(result.phone).toBe("+5511999999999");
    });

    it("handles empty phone_numbers array", () => {
      const personNoPhone: ApolloEnrichedPerson = {
        ...mockEnrichedPerson,
        phone_numbers: [],
      };

      const result = transformEnrichmentToLead(personNoPhone, null);

      expect(result.phone).toBeNull();
    });

    it("handles undefined phone_numbers", () => {
      const personUndefinedPhone: ApolloEnrichedPerson = {
        ...mockEnrichedPerson,
        phone_numbers: undefined,
      };

      const result = transformEnrichmentToLead(personUndefinedPhone, null);

      expect(result.phone).toBeNull();
    });

    it("returns partial LeadRow for updates", () => {
      const result = transformEnrichmentToLead(
        mockEnrichedPerson,
        mockEnrichedOrganization
      );

      // Should not include id, tenant_id, apollo_id, first_name, status, created_at
      // These are not part of enrichment updates
      expect(result).not.toHaveProperty("id");
      expect(result).not.toHaveProperty("tenant_id");
      expect(result).not.toHaveProperty("apollo_id");
      expect(result).not.toHaveProperty("first_name");
      expect(result).not.toHaveProperty("status");
      expect(result).not.toHaveProperty("created_at");
    });
  });
});
