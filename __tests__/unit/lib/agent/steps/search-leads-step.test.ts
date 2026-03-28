/**
 * Unit Tests for SearchLeadsStep
 * Story 17.2 - AC: #1, #2, #3
 *
 * Tests: happy path, input validation, error handling (retryable/terminal),
 * cost calculation, LeadRow -> SearchLeadResult transformation
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { SearchLeadsStep } from "@/lib/agent/steps/search-leads-step";
import { createChainBuilder } from "../../../../helpers/mock-supabase";
import type { StepInput } from "@/types/agent";
import { ExternalServiceError } from "@/lib/services/base-service";

// ==============================================
// MOCKS
// ==============================================

const mockSearchPeople = vi.fn();

const mockEnrichPerson = vi.fn();

vi.mock("@/lib/services/apollo", () => {
  return {
    ApolloService: class MockApolloService {
      searchPeople = mockSearchPeople;
      enrichPerson = mockEnrichPerson;
      constructor() {}
    },
  };
});

// ==============================================
// HELPERS
// ==============================================

function createMockSupabase() {
  // Steps chain returns array (needed for activeSteps count query in Story 17.10)
  const stepsChain = createChainBuilder({
    data: [
      { id: "step-1", status: "pending" },
      { id: "step-2", status: "pending" },
      { id: "step-3", status: "pending" },
      { id: "step-4", status: "pending" },
      { id: "step-5", status: "pending" },
    ],
    error: null,
  });
  const messagesChain = createChainBuilder({ data: { id: "msg-1" }, error: null });

  const mockFrom = vi.fn().mockImplementation((table: string) => {
    if (table === "agent_steps") return stepsChain;
    if (table === "agent_messages") return messagesChain;
    return createChainBuilder();
  });

  return { from: mockFrom, stepsChain, messagesChain };
}

const TENANT_ID = "tenant-001";

function createInput(
  overrides: Partial<StepInput["briefing"]> = {},
  previousStepOutput?: Record<string, unknown>
): StepInput {
  return {
    executionId: "exec-001",
    briefing: {
      technology: "React",
      jobTitles: ["CTO", "VP Engineering"],
      location: "Brasil",
      companySize: "50-200",
      industry: "saas",
      productSlug: null,
      mode: "guided",
      skipSteps: [],
      ...overrides,
    },
    previousStepOutput: previousStepOutput ?? {
      companies: [
        { name: "Acme Corp", domain: "acme.com" },
        { name: "Beta Inc", domain: "beta.io" },
        { name: "No Domain Corp", domain: null },
      ],
      totalFound: 3,
      technologySlug: "react",
      filtersApplied: {},
    },
  };
}

const mockLeadsResponse = {
  leads: [
    {
      id: "lead-1",
      tenant_id: TENANT_ID,
      apollo_id: "apollo-1",
      first_name: "John",
      last_name: "Do***e",
      email: null,
      phone: null,
      company_name: "Acme Corp",
      company_size: null,
      industry: null,
      location: null,
      title: "CTO",
      linkedin_url: null,
      photo_url: null,
      status: "novo",
      has_email: true,
      has_direct_phone: "No",
      created_at: "2026-03-26T10:00:00Z",
      updated_at: "2026-03-26T10:00:00Z",
      icebreaker: null,
      icebreaker_generated_at: null,
      linkedin_posts_cache: null,
      is_monitored: false,
    },
    {
      id: "lead-2",
      tenant_id: TENANT_ID,
      apollo_id: "apollo-2",
      first_name: "Jane",
      last_name: null,
      email: null,
      phone: null,
      company_name: "Beta Inc",
      company_size: null,
      industry: null,
      location: null,
      title: "VP Engineering",
      linkedin_url: "https://linkedin.com/in/jane",
      photo_url: null,
      status: "novo",
      has_email: false,
      has_direct_phone: "No",
      created_at: "2026-03-26T10:00:00Z",
      updated_at: "2026-03-26T10:00:00Z",
      icebreaker: null,
      icebreaker_generated_at: null,
      linkedin_posts_cache: null,
      is_monitored: false,
    },
  ],
  pagination: {
    totalEntries: 2,
    page: 1,
    perPage: 25,
    totalPages: 1,
  },
};

// ==============================================
// TESTS
// ==============================================

describe("SearchLeadsStep (AC #1, #2, #3)", () => {
  let step: SearchLeadsStep;
  let mockSupabase: ReturnType<typeof createMockSupabase>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase = createMockSupabase();
    step = new SearchLeadsStep(2, mockSupabase as never, TENANT_ID);

    mockSearchPeople.mockResolvedValue(mockLeadsResponse);
    // Default: enrichment returns email for leads
    mockEnrichPerson.mockResolvedValue({
      person: { email: "enriched@example.com" },
      organization: null,
    });
  });

  // 4.1
  describe("happy path (2.1 - 2.10)", () => {
    it("extracts domains + jobTitles, calls Apollo, returns formatted output", async () => {
      const input = createInput();
      const result = await step.run(input);

      expect(result.success).toBe(true);
      expect(result.data.leads).toHaveLength(2);
      expect(result.data.totalFound).toBe(2);
      expect(result.data.jobTitles).toEqual(["CTO", "VP Engineering"]);
      expect(result.data.domainsSearched).toEqual(["acme.com", "beta.io"]);

      // Verify Apollo was called with correct filters
      expect(mockSearchPeople).toHaveBeenCalledWith({
        domains: ["acme.com", "beta.io"],
        titles: ["CTO", "VP Engineering"],
        perPage: 25,
        page: 1,
      });
    });
  });

  // AC #1 - progress message
  describe("progress message (AC #1)", () => {
    it("sends progress message with job titles and company count before execution", async () => {
      const input = createInput();
      await step.run(input);

      expect(mockSupabase.messagesChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          execution_id: "exec-001",
          role: "system",
          content: "Etapa 2/5: Buscando leads (CTO, VP Engineering) nas 3 empresas...",
          metadata: expect.objectContaining({
            stepNumber: 2,
            messageType: "progress",
          }),
        })
      );
    });
  });

  // 4.2
  describe("input validation - jobTitles", () => {
    it("throws when jobTitles is empty", async () => {
      const input = createInput({ jobTitles: [] });

      await expect(step.run(input)).rejects.toMatchObject({
        code: expect.any(String),
        stepNumber: 2,
      });
    });
  });

  // 4.3 — Story 17.10: previousStepOutput undefined now triggers direct entry (no longer throws)
  describe("input validation - previousStepOutput", () => {
    it("succeeds with direct entry when previousStepOutput is undefined (Story 17.10)", async () => {
      const input = createInput({}, undefined);
      input.previousStepOutput = undefined;

      const result = await step.run(input);

      expect(result.success).toBe(true);
      expect(result.data.domainsSearched).toEqual([]);
      expect(mockSearchPeople).toHaveBeenCalledWith(
        expect.objectContaining({
          titles: ["CTO", "VP Engineering"],
        })
      );
      // Should NOT have domains in the call
      expect(mockSearchPeople).toHaveBeenCalledWith(
        expect.not.objectContaining({ domains: expect.anything() })
      );
    });
  });

  // 4.4
  describe("input validation - companies missing", () => {
    it("throws when companies array is missing", async () => {
      const input = createInput({}, { totalFound: 0 });

      await expect(step.run(input)).rejects.toMatchObject({
        code: expect.any(String),
        stepNumber: 2,
      });
    });

    it("throws when companies array is empty", async () => {
      const input = createInput({}, { companies: [] });

      await expect(step.run(input)).rejects.toMatchObject({
        code: expect.any(String),
        stepNumber: 2,
      });
    });
  });

  // 4.4 (domains)
  describe("input validation - no valid domains", () => {
    it("throws when no company has a valid domain", async () => {
      const input = createInput({}, {
        companies: [
          { name: "NoDomain1", domain: null },
          { name: "NoDomain2", domain: "" },
        ],
      });

      await expect(step.run(input)).rejects.toMatchObject({
        code: expect.any(String),
        stepNumber: 2,
      });
    });
  });

  // 4.5
  describe("error handling - retryable (429)", () => {
    it("converts ExternalServiceError 429 to retryable PipelineError", async () => {
      mockSearchPeople.mockRejectedValue(
        new ExternalServiceError("apollo", 429, "Rate limited")
      );

      const input = createInput();
      await expect(step.run(input)).rejects.toMatchObject({
        isRetryable: true,
        externalService: "apollo",
        code: "STEP_SEARCH_LEADS_ERROR",
      });
    });
  });

  // 4.6
  describe("error handling - terminal (401)", () => {
    it("converts ExternalServiceError 401 to non-retryable PipelineError", async () => {
      mockSearchPeople.mockRejectedValue(
        new ExternalServiceError("apollo", 401, "Invalid key")
      );

      const input = createInput();
      await expect(step.run(input)).rejects.toMatchObject({
        isRetryable: false,
        externalService: "apollo",
        code: "STEP_SEARCH_LEADS_ERROR",
      });
    });
  });

  // 4.7
  describe("cost calculation (2.10)", () => {
    it("calculates cost based on lead count", async () => {
      const input = createInput();
      const result = await step.run(input);

      expect(result.cost).toBeDefined();
      expect(result.cost?.apollo_search).toBe(2); // 2 leads * 1 credit
    });
  });

  // ==============================================
  // Story 17.10: Direct Entry (skip empresas)
  // ==============================================

  describe("direct entry - open market search (Story 17.10)", () => {
    it("searches Apollo without domains when previousStepOutput is undefined", async () => {
      const input = createInput({ location: "Sao Paulo", industry: "fintech" }, undefined);
      input.previousStepOutput = undefined;

      const result = await step.run(input);

      expect(result.success).toBe(true);
      expect(result.data.domainsSearched).toEqual([]);
      expect(mockSearchPeople).toHaveBeenCalledWith({
        titles: ["CTO", "VP Engineering"],
        locations: ["Sao Paulo"],
        industries: ["fintech"],
        companySizes: ["50-200"],
        perPage: 25,
        page: 1,
      });
    });

    it("sends progress message for open market (no company count)", async () => {
      const input = createInput({}, undefined);
      input.previousStepOutput = undefined;

      await step.run(input);

      expect(mockSupabase.messagesChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining("no mercado aberto"),
        })
      );
    });

    it("throws when jobTitles missing in direct entry", async () => {
      const input = createInput({ jobTitles: [] }, undefined);
      input.previousStepOutput = undefined;

      await expect(step.run(input)).rejects.toMatchObject({
        code: expect.any(String),
        stepNumber: 2,
      });
    });

    it("returns correct output format with empty domainsSearched", async () => {
      const input = createInput({}, undefined);
      input.previousStepOutput = undefined;

      const result = await step.run(input);

      expect(result.data.leads).toHaveLength(2);
      expect(result.data.totalFound).toBe(2);
      expect(result.data.jobTitles).toEqual(["CTO", "VP Engineering"]);
      expect(result.data.domainsSearched).toEqual([]);
    });

    it("includes optional filters from briefing in direct entry", async () => {
      const input = createInput(
        { location: "Brasil", industry: "saude", companySize: "200-500" },
        undefined
      );
      input.previousStepOutput = undefined;

      await step.run(input);

      expect(mockSearchPeople).toHaveBeenCalledWith(
        expect.objectContaining({
          locations: ["Brasil"],
          industries: ["saude"],
          companySizes: ["200-500"],
        })
      );
    });

    it("omits undefined optional filters in direct entry", async () => {
      const input = createInput(
        { location: null, industry: null, companySize: null },
        undefined
      );
      input.previousStepOutput = undefined;

      await step.run(input);

      const callArg = mockSearchPeople.mock.calls[0][0];
      expect(callArg.locations).toBeUndefined();
      expect(callArg.industries).toBeUndefined();
      expect(callArg.companySizes).toBeUndefined();
    });

    it("normal flow still works with previousStepOutput (regression)", async () => {
      const input = createInput();

      const result = await step.run(input);

      expect(result.success).toBe(true);
      expect(result.data.domainsSearched).toEqual(["acme.com", "beta.io"]);
      expect(mockSearchPeople).toHaveBeenCalledWith(
        expect.objectContaining({
          domains: ["acme.com", "beta.io"],
        })
      );
    });
  });

  // 4.8
  describe("transformation LeadRow -> SearchLeadResult (2.8)", () => {
    it("maps fields correctly, handles nulls", async () => {
      const input = createInput();
      const result = await step.run(input);

      const leads = result.data.leads as Array<Record<string, unknown>>;

      // First lead: has last_name (obfuscated) — enrichment happens in CreateCampaignStep
      expect(leads[0]).toEqual({
        name: "John Do***e",
        title: "CTO",
        companyName: "Acme Corp",
        email: null,
        linkedinUrl: null,
        apolloId: "apollo-1",
      });

      // Second lead: no last_name, has linkedinUrl
      expect(leads[1]).toEqual({
        name: "Jane",
        title: "VP Engineering",
        companyName: "Beta Inc",
        email: null,
        linkedinUrl: "https://linkedin.com/in/jane",
        apolloId: "apollo-2",
      });
    });
  });
});
