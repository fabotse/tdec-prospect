/**
 * Unit Tests for SearchCompaniesStep
 * Story 17.1 - AC: #1, #3
 *
 * Tests: parameter resolution (technology slug, country code, company size, industry),
 * service call, output, cost, input validation
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { SearchCompaniesStep } from "@/lib/agent/steps/search-companies-step";
import { createChainBuilder } from "../../../../helpers/mock-supabase";
import type { StepInput } from "@/types/agent";
import { ExternalServiceError } from "@/lib/services/base-service";

// ==============================================
// MOCKS
// ==============================================

const mockSearchCompanies = vi.fn();
const mockSearchTechnologies = vi.fn();

vi.mock("@/lib/services/theirstack", () => {
  return {
    TheirStackService: class MockTheirStackService {
      searchCompanies = mockSearchCompanies;
      searchTechnologies = mockSearchTechnologies;
    },
  };
});

// ==============================================
// HELPERS
// ==============================================

function createMockSupabase() {
  const stepsChain = createChainBuilder({ data: { id: "step-1" }, error: null });
  const messagesChain = createChainBuilder({ data: { id: "msg-1" }, error: null });

  const mockFrom = vi.fn().mockImplementation((table: string) => {
    if (table === "agent_steps") return stepsChain;
    if (table === "agent_messages") return messagesChain;
    return createChainBuilder();
  });

  return { from: mockFrom, stepsChain, messagesChain };
}

const API_KEY = "test-api-key";

function createInput(overrides: Partial<StepInput["briefing"]> = {}): StepInput {
  return {
    executionId: "exec-001",
    briefing: {
      technology: "React",
      jobTitles: ["CTO"],
      location: "Brasil",
      companySize: "50-200",
      industry: "saas",
      productSlug: null,
      mode: "guided",
      skipSteps: [],
      ...overrides,
    },
  };
}

const mockCompaniesResponse = {
  metadata: { total_results: 2, total_companies: 2 },
  data: [
    { name: "Acme Corp", domain: "acme.com", url: null, country: "Brazil", country_code: "BR", city: "SP", industry: "SaaS", employee_count_range: "51-200", apollo_id: null, annual_revenue_usd: null, founded_year: 2020, linkedin_url: null, technologies_found: [], has_blurred_data: false },
    { name: "Beta Inc", domain: "beta.io", url: null, country: "Brazil", country_code: "BR", city: "RJ", industry: "SaaS", employee_count_range: "51-200", apollo_id: null, annual_revenue_usd: null, founded_year: 2019, linkedin_url: null, technologies_found: [], has_blurred_data: false },
  ],
};

// ==============================================
// TESTS
// ==============================================

describe("SearchCompaniesStep (AC #1, #3)", () => {
  let step: SearchCompaniesStep;
  let mockSupabase: ReturnType<typeof createMockSupabase>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase = createMockSupabase();
    step = new SearchCompaniesStep(1, mockSupabase as never, API_KEY);

    mockSearchTechnologies.mockResolvedValue([{ name: "React", slug: "react", category: null, company_count: 1000 }]);
    mockSearchCompanies.mockResolvedValue(mockCompaniesResponse);
  });

  describe("happy path (3.1, 3.3, 3.4)", () => {
    it("resolves briefing, calls service, returns StepOutput", async () => {
      const input = createInput();
      const result = await step.run(input);

      expect(result.success).toBe(true);
      expect(result.data.companies).toHaveLength(2);
      expect(result.data.totalFound).toBe(2);
      expect(result.data.technologySlug).toBe("react");
      expect(result.data.filtersApplied).toBeDefined();
    });
  });

  describe("technology resolution (3.2)", () => {
    it("resolves technology text to slug via searchTechnologies", async () => {
      const input = createInput({ technology: "Netskope" });
      mockSearchTechnologies.mockResolvedValue([{ name: "Netskope", slug: "netskope", category: null, company_count: 500 }]);

      await step.run(input);

      expect(mockSearchTechnologies).toHaveBeenCalledWith(API_KEY, "Netskope");
      expect(mockSearchCompanies).toHaveBeenCalledWith(
        API_KEY,
        expect.objectContaining({ technologySlugs: ["netskope"] })
      );
    });

    it("uses empty slugs when searchTechnologies returns nothing", async () => {
      mockSearchTechnologies.mockResolvedValue([]);
      const input = createInput({ technology: "UnknownTech" });

      await step.run(input);

      expect(mockSearchCompanies).toHaveBeenCalledWith(
        API_KEY,
        expect.objectContaining({ technologySlugs: [] })
      );
    });
  });

  describe("location resolution (3.2)", () => {
    it("maps 'Brasil' to 'BR'", async () => {
      const input = createInput({ location: "Brasil" });
      await step.run(input);

      expect(mockSearchCompanies).toHaveBeenCalledWith(
        API_KEY,
        expect.objectContaining({ countryCodes: ["BR"] })
      );
    });

    it("maps 'EUA' to 'US'", async () => {
      const input = createInput({ location: "EUA" });
      await step.run(input);

      expect(mockSearchCompanies).toHaveBeenCalledWith(
        API_KEY,
        expect.objectContaining({ countryCodes: ["US"] })
      );
    });

    it("omits countryCodes for unknown location that is not a valid ISO code", async () => {
      const input = createInput({ location: "Singapura" });
      await step.run(input);

      expect(mockSearchCompanies).toHaveBeenCalledWith(
        API_KEY,
        expect.objectContaining({ countryCodes: undefined })
      );
    });

    it("accepts valid 2-letter ISO code directly", async () => {
      const input = createInput({ location: "SG" });
      await step.run(input);

      expect(mockSearchCompanies).toHaveBeenCalledWith(
        API_KEY,
        expect.objectContaining({ countryCodes: ["SG"] })
      );
    });

    it("maps Brazilian city 'São Paulo' to BR", async () => {
      const input = createInput({ location: "São Paulo" });
      await step.run(input);

      expect(mockSearchCompanies).toHaveBeenCalledWith(
        API_KEY,
        expect.objectContaining({ countryCodes: ["BR"] })
      );
    });

    it("omits countryCodes for city name not in map", async () => {
      const input = createInput({ location: "Tóquio" });
      await step.run(input);

      expect(mockSearchCompanies).toHaveBeenCalledWith(
        API_KEY,
        expect.objectContaining({ countryCodes: undefined })
      );
    });

    it("omits countryCodes when location is null", async () => {
      const input = createInput({ location: null });
      await step.run(input);

      expect(mockSearchCompanies).toHaveBeenCalledWith(
        API_KEY,
        expect.objectContaining({ countryCodes: undefined })
      );
    });
  });

  describe("company size resolution (3.2)", () => {
    it("parses '50-200' into min/max", async () => {
      const input = createInput({ companySize: "50-200" });
      await step.run(input);

      expect(mockSearchCompanies).toHaveBeenCalledWith(
        API_KEY,
        expect.objectContaining({ minEmployeeCount: 50, maxEmployeeCount: 200 })
      );
    });

    it("parses '1000 a 5000' with 'a' separator", async () => {
      const input = createInput({ companySize: "1000 a 5000" });
      await step.run(input);

      expect(mockSearchCompanies).toHaveBeenCalledWith(
        API_KEY,
        expect.objectContaining({ minEmployeeCount: 1000, maxEmployeeCount: 5000 })
      );
    });

    it("omits employee count when companySize is null", async () => {
      const input = createInput({ companySize: null });
      await step.run(input);

      expect(mockSearchCompanies).toHaveBeenCalledWith(
        API_KEY,
        expect.objectContaining({
          minEmployeeCount: undefined,
          maxEmployeeCount: undefined,
        })
      );
    });
  });

  describe("industry resolution (3.2)", () => {
    it("maps 'saas' to industry ID", async () => {
      const input = createInput({ industry: "saas" });
      await step.run(input);

      expect(mockSearchCompanies).toHaveBeenCalledWith(
        API_KEY,
        expect.objectContaining({ industryIds: [5] })
      );
    });

    it("omits industryIds for unknown industry", async () => {
      const input = createInput({ industry: "unknown_industry" });
      await step.run(input);

      expect(mockSearchCompanies).toHaveBeenCalledWith(
        API_KEY,
        expect.objectContaining({ industryIds: undefined })
      );
    });

    it("omits industryIds when industry is null", async () => {
      const input = createInput({ industry: null });
      await step.run(input);

      expect(mockSearchCompanies).toHaveBeenCalledWith(
        API_KEY,
        expect.objectContaining({ industryIds: undefined })
      );
    });
  });

  describe("cost calculation (3.5)", () => {
    it("calculates cost based on company count", async () => {
      const input = createInput();
      const result = await step.run(input);

      expect(result.cost).toBeDefined();
      expect(result.cost?.theirstack_search).toBe(6); // 2 companies * 3 credits
    });
  });

  describe("input validation (3.6)", () => {
    it("throws when technology is null", async () => {
      const input = createInput({ technology: null });

      await expect(step.run(input)).rejects.toMatchObject({
        code: expect.any(String),
        stepNumber: 1,
      });
    });
  });

  // ==============================================
  // Story 22.14: 0 empresas nao e sucesso (AC #1, #5, #6)
  // ==============================================

  describe("Story 22.14 - busca de empresas vazia", () => {
    const emptyCompaniesResponse = {
      metadata: { total_results: 0, total_companies: 0 },
      data: [],
    };

    beforeEach(() => {
      mockSearchCompanies.mockResolvedValue(emptyCompaniesResponse);
    });

    it("modo guiado: marca emptyResult + diagnostico minimo no output", async () => {
      const input = createInput();
      input.mode = "guided";

      const result = await step.run(input);

      expect(result.data.emptyResult).toBe(true);
      expect(result.data.companies).toEqual([]);

      const diagnosis = result.data.emptyDiagnosis as Record<string, unknown>;
      expect(diagnosis).toBeDefined();
      expect(Array.isArray(diagnosis.activeFilters)).toBe(true);
      expect(Array.isArray(diagnosis.probableCauses)).toBe(true);
      // AC5: o card de empresas nao ganha chips — a saida e Rejeitar + texto.
      expect(diagnosis).not.toHaveProperty("suggestedChips");
      expect(String(diagnosis.guidance)).toMatch(/Rejeitar/);
    });

    it("aponta a tecnologia nao resolvida como causa provavel", async () => {
      mockSearchTechnologies.mockResolvedValue([]);
      const input = createInput({ technology: "TecnologiaInexistente" });
      input.mode = "guided";

      const result = await step.run(input);

      const diagnosis = result.data.emptyDiagnosis as {
        probableCauses: Array<{ code: string }>;
      };
      expect(diagnosis.probableCauses[0].code).toBe("technology_not_resolved");
    });

    it("modo guiado: a mensagem do gate NAO promete resultados para revisar (AC1)", async () => {
      const input = createInput();
      input.mode = "guided";

      await step.run(input);

      const gateInsert = mockSupabase.messagesChain.insert.mock.calls
        .map((call) => call[0])
        .find((arg) => arg?.metadata?.messageType === "approval_gate");

      expect(gateInsert.content).not.toContain("aprove para continuar");
      expect(gateInsert.content).toMatch(/nao encontrou/i);
    });

    it("modo autopilot: falha controlada em vez de detonar o search_leads adiante (AC6)", async () => {
      const input = createInput();
      input.mode = "autopilot";

      await expect(step.run(input)).rejects.toMatchObject({
        stepNumber: 1,
        stepType: "search_companies",
        isRetryable: false,
        message: expect.stringContaining("nao encontrou nenhuma empresa"),
      });
    });

    /**
     * Code review 22.14: a versao anterior deste teste so afirmava
     * `expect(result.cost?.theirstack_search).toBe(0)` — aritmetica (`0 * CREDITS_PER_COMPANY`),
     * nao comportamento: passaria com o ramo `emptyResult` INTEIRO deletado. O que importa
     * aqui e que o step de busca vazia entrega o gate honesto E nao cobra nada, com o
     * `emptyResult` presente para a `BaseStep` trocar as mensagens.
     */
    it("custo zero — e o output carrega o gate honesto (nao so a aritmetica)", async () => {
      const input = createInput();
      input.mode = "guided";

      const result = await step.run(input);

      expect(result.cost?.theirstack_search).toBe(0);
      // O que de fato distingue este ramo do de sucesso:
      expect(result.data).toMatchObject({ emptyResult: true });
      expect(result.data).toHaveProperty("emptyDiagnosis");
      expect((result.data as { companies: unknown[] }).companies).toEqual([]);
    });

    it("busca COM empresas fica byte-a-byte identica", async () => {
      mockSearchCompanies.mockResolvedValue(mockCompaniesResponse);
      const input = createInput();
      input.mode = "guided";

      const result = await step.run(input);

      expect(result.data).not.toHaveProperty("emptyResult");
      expect(result.data).not.toHaveProperty("emptyDiagnosis");
      expect(result.cost?.theirstack_search).toBe(6);
    });
  });

  describe("error handling", () => {
    it("converts ExternalServiceError to retryable PipelineError", async () => {
      mockSearchCompanies.mockRejectedValue(
        new ExternalServiceError("theirstack", 429, "Rate limited")
      );

      const input = createInput();
      await expect(step.run(input)).rejects.toMatchObject({
        isRetryable: true,
        externalService: "theirstack",
      });
    });

    it("converts network error to PipelineError", async () => {
      mockSearchCompanies.mockRejectedValue(new TypeError("fetch failed"));

      const input = createInput();
      await expect(step.run(input)).rejects.toMatchObject({
        isRetryable: false,
        stepType: "search_companies",
      });
    });
  });
});
