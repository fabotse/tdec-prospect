/**
 * Unit tests for Lead Service
 * Story: 3.2.1 - People Enrichment Integration
 *
 * Tests:
 * - updateLeadFromEnrichment updates lead with enriched data
 * - bulkUpdateFromEnrichment processes multiple leads
 * - getLeadByApolloId returns lead by apollo_id
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { LeadService } from "@/lib/services/lead";
import type { ApolloEnrichedPerson, ApolloEnrichedOrganization } from "@/types/apollo";

// ==============================================
// MOCKS
// ==============================================

const mockUpdate = vi.fn();
const mockSelect = vi.fn();
const mockSingle = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() =>
    Promise.resolve({
      from: vi.fn(() => ({
        update: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: mockUpdate,
          })),
        })),
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: mockSingle,
            })),
          })),
        })),
      })),
    })
  ),
}));

// ==============================================
// TEST DATA
// ==============================================

const mockEnrichedPerson: ApolloEnrichedPerson = {
  id: "apollo-123",
  first_name: "João",
  last_name: "Silva Costa",
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

// ==============================================
// TESTS
// ==============================================

describe("LeadService", () => {
  let service: LeadService;

  beforeEach(() => {
    service = new LeadService("tenant-123");
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("updateLeadFromEnrichment", () => {
    it("updates lead with enriched data successfully", async () => {
      mockUpdate.mockResolvedValueOnce({ error: null });

      const result = await service.updateLeadFromEnrichment(
        "lead-123",
        mockEnrichedPerson,
        mockEnrichedOrganization
      );

      expect(result.success).toBe(true);
      expect(result.leadId).toBe("lead-123");
      expect(result.updatedFields).toContain("last_name");
      expect(result.updatedFields).toContain("email");
      expect(result.updatedFields).toContain("phone");
      expect(result.updatedFields).toContain("linkedin_url");
      expect(result.updatedFields).toContain("location");
      expect(result.updatedFields).toContain("company_name");
      expect(result.updatedFields).toContain("industry");
    });

    it("returns error when database update fails", async () => {
      mockUpdate.mockResolvedValueOnce({
        error: { message: "Database error" },
      });

      const result = await service.updateLeadFromEnrichment(
        "lead-123",
        mockEnrichedPerson,
        mockEnrichedOrganization
      );

      expect(result.success).toBe(false);
      expect(result.leadId).toBe("lead-123");
      expect(result.updatedFields).toEqual([]);
      expect(result.error).toBeDefined();
    });

    it("only updates non-null fields", async () => {
      mockUpdate.mockResolvedValueOnce({ error: null });

      const minimalPerson: ApolloEnrichedPerson = {
        ...mockEnrichedPerson,
        email: null,
        phone_numbers: undefined,
        linkedin_url: null,
        city: null,
        state: null,
        country: null,
      };

      const result = await service.updateLeadFromEnrichment(
        "lead-123",
        minimalPerson,
        null
      );

      expect(result.success).toBe(true);
      expect(result.updatedFields).toContain("last_name");
      expect(result.updatedFields).toContain("title");
      expect(result.updatedFields).not.toContain("email");
      expect(result.updatedFields).not.toContain("phone");
      expect(result.updatedFields).not.toContain("linkedin_url");
    });

    it("handles null organization", async () => {
      mockUpdate.mockResolvedValueOnce({ error: null });

      const result = await service.updateLeadFromEnrichment(
        "lead-123",
        mockEnrichedPerson,
        null
      );

      expect(result.success).toBe(true);
      expect(result.updatedFields).not.toContain("industry");
    });
  });

  describe("bulkUpdateFromEnrichment", () => {
    it("processes multiple leads", async () => {
      mockUpdate.mockResolvedValue({ error: null });

      const updates = [
        {
          leadId: "lead-1",
          enrichedPerson: mockEnrichedPerson,
          organization: mockEnrichedOrganization,
        },
        {
          leadId: "lead-2",
          enrichedPerson: { ...mockEnrichedPerson, id: "apollo-456" },
          organization: null,
        },
      ];

      const results = await service.bulkUpdateFromEnrichment(updates);

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[0].leadId).toBe("lead-1");
      expect(results[1].success).toBe(true);
      expect(results[1].leadId).toBe("lead-2");
    });

    it("handles partial failures", async () => {
      mockUpdate
        .mockResolvedValueOnce({ error: null })
        .mockResolvedValueOnce({ error: { message: "DB error" } });

      const updates = [
        {
          leadId: "lead-1",
          enrichedPerson: mockEnrichedPerson,
          organization: mockEnrichedOrganization,
        },
        {
          leadId: "lead-2",
          enrichedPerson: mockEnrichedPerson,
          organization: null,
        },
      ];

      const results = await service.bulkUpdateFromEnrichment(updates);

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
    });

    it("returns empty array for empty input", async () => {
      const results = await service.bulkUpdateFromEnrichment([]);
      expect(results).toEqual([]);
    });
  });

  describe("getLeadByApolloId", () => {
    it("returns lead when found", async () => {
      const mockLead = {
        id: "lead-123",
        tenant_id: "tenant-123",
        apollo_id: "apollo-123",
        first_name: "João",
        last_name: "Silva",
        email: "joao@test.com",
        status: "novo",
      };

      mockSingle.mockResolvedValueOnce({ data: mockLead, error: null });

      const result = await service.getLeadByApolloId("apollo-123");

      expect(result).toEqual(mockLead);
    });

    it("returns null when lead not found", async () => {
      mockSingle.mockResolvedValueOnce({ data: null, error: null });

      const result = await service.getLeadByApolloId("nonexistent-id");

      expect(result).toBeNull();
    });

    it("returns null on database error", async () => {
      mockSingle.mockResolvedValueOnce({
        data: null,
        error: { message: "Not found" },
      });

      const result = await service.getLeadByApolloId("apollo-123");

      expect(result).toBeNull();
    });
  });
});
