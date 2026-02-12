/**
 * Unit tests for Lead Enrichment API Routes
 * Story 4.4.1: Lead Data Enrichment
 * Story 12.3: Enrichment for leads without apollo_id
 *
 * Tests:
 * - AC #2 - Individual enrichment updates lead in database
 * - AC #3 - Handle not found case
 * - AC #4 - Bulk enrichment with batching
 * - AC #6 - Error handling with Portuguese messages
 * - Story 12.3 AC #2 - Bulk enrichment supports leads without apollo_id
 * - Story 12.3 AC #3 - Save apollo_id from match
 * - Story 12.3 AC #7 - Individual enrichment without apollo_id
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createChainBuilder, type ChainBuilder } from "../../helpers/mock-supabase";

// Mock dependencies
const mockGetCurrentUserProfile = vi.fn();
const mockFrom = vi.fn();

vi.mock("@/lib/supabase/tenant", () => ({
  getCurrentUserProfile: () => mockGetCurrentUserProfile(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({
    from: mockFrom,
  })),
}));

// Mock ApolloService
const mockEnrichPerson = vi.fn();
const mockEnrichPersonByDetails = vi.fn();
const mockEnrichPeople = vi.fn();
const mockEnrichPeopleByDetails = vi.fn();

vi.mock("@/lib/services/apollo", () => ({
  ApolloService: class MockApolloService {
    enrichPerson = mockEnrichPerson;
    enrichPersonByDetails = mockEnrichPersonByDetails;
    enrichPeople = mockEnrichPeople;
    enrichPeopleByDetails = mockEnrichPeopleByDetails;
  },
}));

vi.mock("@/lib/services/base-service", () => ({
  ExternalServiceError: class ExternalServiceError extends Error {
    statusCode: number;
    constructor(service: string, statusCode: number, message: string) {
      super(message);
      this.statusCode = statusCode;
    }
  },
}));

import { POST as enrichSingle } from "@/app/api/leads/[leadId]/enrich/route";
import { POST as enrichBulk } from "@/app/api/leads/enrich/bulk/route";

const PROFILE = { tenant_id: "tenant-1", id: "user-1" };
const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";
const VALID_UUID_2 = "550e8400-e29b-41d4-a716-446655440001";
const VALID_UUID_3 = "550e8400-e29b-41d4-a716-446655440002";

// ============================================
// INDIVIDUAL ENRICHMENT TESTS
// ============================================

describe("POST /api/leads/[leadId]/enrich", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentUserProfile.mockResolvedValue(PROFILE);
  });

  function createRequest(): NextRequest {
    return new NextRequest("http://localhost/api/leads/test-id/enrich", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
  }

  describe("authentication", () => {
    it("returns 401 when user is not authenticated", async () => {
      mockGetCurrentUserProfile.mockResolvedValue(null);

      const response = await enrichSingle(createRequest(), {
        params: Promise.resolve({ leadId: VALID_UUID }),
      });
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error.code).toBe("UNAUTHORIZED");
    });
  });

  describe("validation", () => {
    it("returns 400 for invalid UUID", async () => {
      const response = await enrichSingle(createRequest(), {
        params: Promise.resolve({ leadId: "invalid-uuid" }),
      });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.code).toBe("VALIDATION_ERROR");
      expect(data.error.message).toBe("ID de lead inválido");
    });
  });

  describe("lead fetch", () => {
    it("returns 404 when lead not found", async () => {
      const chain = createChainBuilder({ data: null, error: { code: "PGRST116" } });
      mockFrom.mockReturnValue(chain);

      const response = await enrichSingle(createRequest(), {
        params: Promise.resolve({ leadId: VALID_UUID }),
      });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error.code).toBe("NOT_FOUND");
    });
  });

  describe("enrichment with apollo_id", () => {
    it("enriches lead using enrichPerson when apollo_id exists", async () => {
      const lead = { id: VALID_UUID, apollo_id: "apollo-1", first_name: "João", last_name: "Silva", company_name: null, email: null, linkedin_url: null };
      const fetchChain = createChainBuilder({ data: lead, error: null });
      const updateChain = createChainBuilder({ data: { id: VALID_UUID, apollo_id: "apollo-1" }, error: null });

      mockFrom
        .mockReturnValueOnce(fetchChain)
        .mockReturnValueOnce(updateChain);

      mockEnrichPerson.mockResolvedValue({
        person: {
          id: "apollo-1", first_name: "João", last_name: "Silva Completo",
          email: "joao@test.com", email_status: "verified", title: "CEO",
          city: null, state: null, country: null,
          linkedin_url: null, photo_url: null, employment_history: [],
        },
        organization: null,
      });

      const response = await enrichSingle(createRequest(), {
        params: Promise.resolve({ leadId: VALID_UUID }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.id).toBe(VALID_UUID);
      expect(mockEnrichPerson).toHaveBeenCalledWith("apollo-1", {
        revealPersonalEmails: false,
        revealPhoneNumber: false,
      });
    });
  });

  // Story 12.3 AC #7: Individual enrichment without apollo_id
  describe("Story 12.3 - enrichment without apollo_id (AC #7)", () => {
    it("calls enrichPersonByDetails when lead has no apollo_id", async () => {
      const lead = { id: VALID_UUID, apollo_id: null, first_name: "Maria", last_name: "Santos", company_name: "Corp", email: "maria@corp.com", linkedin_url: null };
      const fetchChain = createChainBuilder({ data: lead, error: null });
      const updateChain = createChainBuilder({ data: { id: VALID_UUID, apollo_id: "apollo-matched" }, error: null });

      mockFrom
        .mockReturnValueOnce(fetchChain)
        .mockReturnValueOnce(updateChain);

      mockEnrichPersonByDetails.mockResolvedValue({
        person: {
          id: "apollo-matched", first_name: "Maria", last_name: "Santos",
          email: "maria@corp.com", email_status: "verified", title: "CTO",
          city: null, state: null, country: null,
          linkedin_url: null, photo_url: null, employment_history: [],
        },
        organization: null,
      });

      const response = await enrichSingle(createRequest(), {
        params: Promise.resolve({ leadId: VALID_UUID }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(mockEnrichPersonByDetails).toHaveBeenCalledWith(
        expect.objectContaining({
          first_name: "Maria",
          last_name: "Santos",
          organization_name: "Corp",
          email: "maria@corp.com",
        })
      );
      // Should NOT call enrichPerson (no apollo_id)
      expect(mockEnrichPerson).not.toHaveBeenCalled();
      expect(data.data.apollo_id).toBe("apollo-matched");
    });

    it("saves apollo_id from match (AC #3)", async () => {
      const lead = { id: VALID_UUID, apollo_id: null, first_name: "João", last_name: null, company_name: "Empresa", email: null, linkedin_url: null };
      const fetchChain = createChainBuilder({ data: lead, error: null });
      const updateChain = createChainBuilder({ data: { id: VALID_UUID, apollo_id: "new-apollo-id" }, error: null });

      mockFrom
        .mockReturnValueOnce(fetchChain)
        .mockReturnValueOnce(updateChain);

      mockEnrichPersonByDetails.mockResolvedValue({
        person: {
          id: "new-apollo-id", first_name: "João", last_name: "Silva",
          email: "joao@empresa.com", email_status: "verified", title: null,
          city: null, state: null, country: null,
          linkedin_url: null, photo_url: null, employment_history: [],
        },
        organization: null,
      });

      await enrichSingle(createRequest(), {
        params: Promise.resolve({ leadId: VALID_UUID }),
      });

      expect(updateChain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          apollo_id: "new-apollo-id",
        })
      );
    });

    it("returns 404 when Apollo match not found", async () => {
      const lead = { id: VALID_UUID, apollo_id: null, first_name: "Unknown", last_name: null, company_name: null, email: null, linkedin_url: null };
      const fetchChain = createChainBuilder({ data: lead, error: null });
      mockFrom.mockReturnValueOnce(fetchChain);

      const { ExternalServiceError: MockExternalServiceError } = await import("@/lib/services/base-service");
      mockEnrichPersonByDetails.mockRejectedValue(
        new MockExternalServiceError("apollo", 404, "não encontrada")
      );

      const response = await enrichSingle(createRequest(), {
        params: Promise.resolve({ leadId: VALID_UUID }),
      });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error.code).toBe("NOT_FOUND");
    });
  });
});

// ============================================
// BULK ENRICHMENT TESTS
// ============================================

describe("POST /api/leads/enrich/bulk", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentUserProfile.mockResolvedValue(PROFILE);
  });

  function createRequest(body: unknown): NextRequest {
    return new NextRequest("http://localhost/api/leads/enrich/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  describe("authentication", () => {
    it("returns 401 when not authenticated", async () => {
      mockGetCurrentUserProfile.mockResolvedValue(null);

      const response = await enrichBulk(
        createRequest({ leadIds: [VALID_UUID] })
      );
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error.code).toBe("UNAUTHORIZED");
    });
  });

  describe("validation", () => {
    it("returns 400 for empty leadIds", async () => {
      const response = await enrichBulk(createRequest({ leadIds: [] }));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.code).toBe("VALIDATION_ERROR");
    });

    it("returns 400 for more than 100 leads", async () => {
      const leadIds = Array.from({ length: 101 }, (_, i) =>
        `550e8400-e29b-41d4-a716-44665544${String(i).padStart(4, "0")}`
      );

      const response = await enrichBulk(createRequest({ leadIds }));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("leads with apollo_id (existing flow)", () => {
    it("enriches leads with apollo_id using enrichPeople", async () => {
      const leads = [
        { id: VALID_UUID, apollo_id: "apollo-1", first_name: "João", last_name: "Silva", company_name: null, email: null, linkedin_url: null },
      ];

      // Leads fetch chain
      const fetchChain = createChainBuilder({ data: leads, error: null });
      // Update chain
      const updateChain = createChainBuilder({ data: { id: VALID_UUID, apollo_id: "apollo-1" }, error: null });

      mockFrom
        .mockReturnValueOnce(fetchChain)  // from("leads") for SELECT
        .mockReturnValueOnce(updateChain); // from("leads") for UPDATE

      mockEnrichPeople.mockResolvedValue([
        {
          id: "apollo-1", first_name: "João", last_name: "Silva Completo",
          email: "joao@test.com", email_status: "verified", title: "CEO",
          city: null, state: null, country: null,
          linkedin_url: null, photo_url: null, employment_history: [],
        },
      ]);

      const response = await enrichBulk(createRequest({ leadIds: [VALID_UUID] }));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.enriched).toBe(1);
      expect(mockEnrichPeople).toHaveBeenCalled();
    });
  });

  // ============================================
  // STORY 12.3 TESTS
  // ============================================

  describe("Story 12.3 - leads without apollo_id", () => {
    it("calls enrichPeopleByDetails for leads without apollo_id (AC #2)", async () => {
      const leads = [
        { id: VALID_UUID, apollo_id: null, first_name: "João", last_name: "Silva", company_name: "Empresa SA", email: "joao@test.com", linkedin_url: null },
      ];

      const fetchChain = createChainBuilder({ data: leads, error: null });
      const updateChain = createChainBuilder({
        data: { id: VALID_UUID, apollo_id: "apollo-matched-1" },
        error: null,
      });

      mockFrom
        .mockReturnValueOnce(fetchChain)
        .mockReturnValueOnce(updateChain);

      mockEnrichPeopleByDetails.mockResolvedValue([
        {
          person: {
            id: "apollo-matched-1", first_name: "João", last_name: "Silva Completo",
            email: "joao@empresa.com", email_status: "verified", title: "CEO",
            city: "São Paulo", state: "SP", country: "Brazil",
            linkedin_url: "https://linkedin.com/in/joao", photo_url: null, employment_history: [],
          },
          organization: { id: "org-1", name: "Empresa SA", domain: "empresa.com", industry: "Technology", estimated_num_employees: 100 },
        },
      ]);

      const response = await enrichBulk(createRequest({ leadIds: [VALID_UUID] }));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.enriched).toBe(1);
      expect(data.data.notFound).toBe(0);
      expect(mockEnrichPeopleByDetails).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            first_name: "João",
            last_name: "Silva",
            organization_name: "Empresa SA",
            email: "joao@test.com",
          }),
        ])
      );
      // Should NOT call enrichPeople (no leads with apollo_id)
      expect(mockEnrichPeople).not.toHaveBeenCalled();
    });

    it("saves apollo_id from match result (AC #3)", async () => {
      const leads = [
        { id: VALID_UUID, apollo_id: null, first_name: "Maria", last_name: "Santos", company_name: "Corp", email: "maria@corp.com", linkedin_url: null },
      ];

      const fetchChain = createChainBuilder({ data: leads, error: null });
      const updateChain = createChainBuilder({
        data: { id: VALID_UUID, apollo_id: "apollo-new-id" },
        error: null,
      });

      mockFrom
        .mockReturnValueOnce(fetchChain)
        .mockReturnValueOnce(updateChain);

      mockEnrichPeopleByDetails.mockResolvedValue([
        {
          person: {
            id: "apollo-new-id", first_name: "Maria", last_name: "Santos",
            email: "maria@corp.com", email_status: "verified", title: "CTO",
            city: null, state: null, country: null,
            linkedin_url: null, photo_url: null, employment_history: [],
          },
          organization: null,
        },
      ]);

      await enrichBulk(createRequest({ leadIds: [VALID_UUID] }));

      // Verify update was called with apollo_id from match
      expect(updateChain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          apollo_id: "apollo-new-id",
        })
      );
    });

    it("handles mix of leads with and without apollo_id", async () => {
      const leads = [
        { id: VALID_UUID, apollo_id: "existing-apollo-id", first_name: "João", last_name: "Silva", company_name: null, email: null, linkedin_url: null },
        { id: VALID_UUID_2, apollo_id: null, first_name: "Maria", last_name: "Santos", company_name: "Corp", email: null, linkedin_url: null },
      ];

      const fetchChain = createChainBuilder({ data: leads, error: null });
      const updateChain1 = createChainBuilder({ data: { id: VALID_UUID }, error: null });
      const updateChain2 = createChainBuilder({ data: { id: VALID_UUID_2 }, error: null });

      mockFrom
        .mockReturnValueOnce(fetchChain)
        .mockReturnValueOnce(updateChain1)
        .mockReturnValueOnce(updateChain2);

      // Group 1: enrichPeople for leads WITH apollo_id
      mockEnrichPeople.mockResolvedValue([
        {
          id: "existing-apollo-id", first_name: "João", last_name: "Silva Completo",
          email: "joao@test.com", email_status: "verified", title: null,
          city: null, state: null, country: null,
          linkedin_url: null, photo_url: null, employment_history: [],
        },
      ]);

      // Group 2: enrichPeopleByDetails for leads WITHOUT apollo_id
      mockEnrichPeopleByDetails.mockResolvedValue([
        {
          person: {
            id: "apollo-matched-2", first_name: "Maria", last_name: "Santos",
            email: "maria@corp.com", email_status: "verified", title: "CTO",
            city: null, state: null, country: null,
            linkedin_url: null, photo_url: null, employment_history: [],
          },
          organization: null,
        },
      ]);

      const response = await enrichBulk(createRequest({ leadIds: [VALID_UUID, VALID_UUID_2] }));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.enriched).toBe(2);
      expect(mockEnrichPeople).toHaveBeenCalled();
      expect(mockEnrichPeopleByDetails).toHaveBeenCalled();
    });

    it("counts not-found when match returns null person", async () => {
      const leads = [
        { id: VALID_UUID, apollo_id: null, first_name: "Unknown", last_name: "Person", company_name: null, email: null, linkedin_url: null },
      ];

      const fetchChain = createChainBuilder({ data: leads, error: null });
      mockFrom.mockReturnValueOnce(fetchChain);

      mockEnrichPeopleByDetails.mockResolvedValue([
        { person: null, organization: null },
      ]);

      const response = await enrichBulk(createRequest({ leadIds: [VALID_UUID] }));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.enriched).toBe(0);
      expect(data.data.notFound).toBe(1);
    });

    it("processes all leads without apollo_id (no early return) (AC #7)", async () => {
      const leads = [
        { id: VALID_UUID, apollo_id: null, first_name: "João", last_name: "Silva", company_name: "Empresa", email: null, linkedin_url: null },
        { id: VALID_UUID_2, apollo_id: null, first_name: "Maria", last_name: "Santos", company_name: "Corp", email: null, linkedin_url: null },
      ];

      const fetchChain = createChainBuilder({ data: leads, error: null });
      const updateChain1 = createChainBuilder({ data: { id: VALID_UUID }, error: null });
      const updateChain2 = createChainBuilder({ data: { id: VALID_UUID_2 }, error: null });

      mockFrom
        .mockReturnValueOnce(fetchChain)
        .mockReturnValueOnce(updateChain1)
        .mockReturnValueOnce(updateChain2);

      mockEnrichPeopleByDetails.mockResolvedValue([
        {
          person: { id: "match-1", first_name: "João", last_name: "Silva", email: "joao@empresa.com", email_status: "verified", title: null, city: null, state: null, country: null, linkedin_url: null, photo_url: null, employment_history: [] },
          organization: null,
        },
        {
          person: { id: "match-2", first_name: "Maria", last_name: "Santos", email: "maria@corp.com", email_status: "verified", title: null, city: null, state: null, country: null, linkedin_url: null, photo_url: null, employment_history: [] },
          organization: null,
        },
      ]);

      const response = await enrichBulk(createRequest({ leadIds: [VALID_UUID, VALID_UUID_2] }));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.enriched).toBe(2);
      expect(data.data.notFound).toBe(0);
      expect(mockEnrichPeopleByDetails).toHaveBeenCalled();
      // Should NOT call enrichPeople (no leads with apollo_id)
      expect(mockEnrichPeople).not.toHaveBeenCalled();
    });

    it("does not send economy-overriding flags per detail (AC #8)", async () => {
      const leads = [
        { id: VALID_UUID, apollo_id: null, first_name: "João", last_name: null, company_name: null, email: null, linkedin_url: null },
      ];

      const fetchChain = createChainBuilder({ data: leads, error: null });
      mockFrom.mockReturnValueOnce(fetchChain);

      mockEnrichPeopleByDetails.mockResolvedValue([
        { person: null, organization: null },
      ]);

      await enrichBulk(createRequest({ leadIds: [VALID_UUID] }));

      // Economy mode flags are enforced by enrichPeopleByDetails service method (tested in apollo.test.ts)
      // Route should NOT send per-detail flags — only match fields
      const callArgs = mockEnrichPeopleByDetails.mock.calls[0][0];
      expect(callArgs[0]).not.toHaveProperty("reveal_personal_emails");
      expect(callArgs[0]).not.toHaveProperty("reveal_phone_number");
    });
  });
});
