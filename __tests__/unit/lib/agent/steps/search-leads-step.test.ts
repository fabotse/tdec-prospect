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
import { QUALITY_MIN_COMPANY_SIZES } from "@/lib/agent/search-defaults";
import { mergeRequestedTitles, scoreLeadByRules } from "@/lib/agent/fit-score-rules";
import { EMPTY_TENANT_ICP } from "@/lib/agent/icp-briefing";
import {
  REFERENCE_ACCOUNTS,
  confidentReferenceProfile,
} from "../../../../helpers/reference-fixtures";
import {
  EMPTY_LEAD_SEARCH_MESSAGE,
  SIMILAR_TITLES_FALLBACK_MESSAGE,
} from "@/lib/agent/steps/search-leads-step";

// ==============================================
// MOCKS
// ==============================================

const mockSearchPeople = vi.fn();

const mockEnrichPerson = vi.fn();

/**
 * Story 22.9: os argumentos do construtor sao CAPTURADOS de proposito. O mock
 * anterior era `constructor() {}` e descartava os dois — ou seja, a injecao da
 * chave do Apollo (a correcao que desbloqueia o `sdr`) nao tinha cobertura nenhuma.
 */
const apolloConstructorArgs: Array<[string | undefined, string | undefined]> = [];

vi.mock("@/lib/services/apollo", () => {
  return {
    ApolloService: class MockApolloService {
      searchPeople = mockSearchPeople;
      enrichPerson = mockEnrichPerson;
      constructor(tenantId?: string, apiKey?: string) {
        apolloConstructorArgs.push([tenantId, apiKey]);
      }
    },
  };
});

/**
 * Story 22.9: sem este mock o helper REAL rodava durante os testes — batia em
 * `createAdminClient()`, falhava por falta de `SUPABASE_SERVICE_ROLE_KEY` no
 * ambiente de teste e passava por acidente (devolvendo `undefined`), poluindo a
 * saida com `console.error`.
 */
const mockGetInjectableServiceApiKey = vi.fn();

vi.mock("@/lib/agent/service-keys", () => ({
  getInjectableServiceApiKey: (...args: unknown[]) =>
    mockGetInjectableServiceApiKey(...args),
}));

// Story 24.10: log de uso do agente (agent-usage -> usage-logger).
const mockLogApiUsage = vi.fn();
vi.mock("@/lib/services/usage-logger", () => ({
  logApiUsage: (...args: unknown[]) => mockLogApiUsage(...args),
}));

// Story 24.16: Fit Score. Por padrao o scorer devolve so as regras REAIS (sem LLM, sem
// tentativa), e o ICP vem vazio.
const mockScoreLeads = vi.fn();
vi.mock("@/lib/agent/fit-scorer", () => ({
  scoreLeads: (...args: unknown[]) => mockScoreLeads(...args),
}));

const mockReadTenantICP = vi.fn();
vi.mock("@/lib/agent/contextual-suggestions", () => ({
  readTenantICP: (...args: unknown[]) => mockReadTenantICP(...args),
}));

// Story 24.17: supressao de contas do modo lista (suite propria em account-suppression.test.ts).
const mockFindSuppressedAccounts = vi.fn();
vi.mock("@/lib/agent/account-suppression", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/agent/account-suppression")>();
  return {
    ...actual,
    findSuppressedAccounts: (...args: unknown[]) => mockFindSuppressedAccounts(...args),
  };
});

// Story 24.18: dominios da Lista de Supressao (fail-open; suite propria do modulo puro).
const mockReadSuppressedDomains = vi.fn();
vi.mock("@/lib/agent/reference-suppression", () => ({
  readSuppressedDomains: (...args: unknown[]) => mockReadSuppressedDomains(...args),
  readSuppressionListClients: vi.fn(),
}));

// Story 24.15: leitura de "ja contatado"/suprimido (suite propria em lead-screening.test.ts).
const mockFindContactedLeads = vi.fn();
vi.mock("@/lib/agent/lead-screening", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/agent/lead-screening")>();
  return {
    ...actual,
    findContactedLeads: (...args: unknown[]) => mockFindContactedLeads(...args),
  };
});

type ScorerParams = {
  leads: Array<{ title: string | null; has_email: boolean }>;
  briefing: { jobTitles: string[] };
  icp: { jobTitles: string[] };
  apiKey?: string;
};

function rulesOnlyScoring({ leads, briefing, icp }: ScorerParams, attempted = false) {
  const titles = mergeRequestedTitles(briefing.jobTitles, icp.jobTitles);
  return {
    results: leads.map((lead) =>
      scoreLeadByRules({ title: lead.title, hasEmail: lead.has_email }, titles)
    ),
    source: "rules" as const,
    attempted,
    succeeded: false,
    usage: {
      model: "gpt-5.4-mini",
      promptTokens: 0,
      completionTokens: 0,
      durationMs: 0,
      llmScored: 0,
      ...(attempted ? { errorMessage: "timeout" } : {}),
    },
  };
}

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
    apolloConstructorArgs.length = 0;
    mockGetInjectableServiceApiKey.mockResolvedValue("apollo-key-service-role");
    mockSupabase = createMockSupabase();
    step = new SearchLeadsStep(2, mockSupabase as never, TENANT_ID);

    mockSearchPeople.mockResolvedValue(mockLeadsResponse);
    mockReadTenantICP.mockResolvedValue(EMPTY_TENANT_ICP);
    mockFindSuppressedAccounts.mockResolvedValue([]);
    mockReadSuppressedDomains.mockResolvedValue([]);
    mockFindContactedLeads.mockResolvedValue(new Map());
    mockScoreLeads.mockImplementation(async (params: ScorerParams) => rulesOnlyScoring(params));
    // Default: enrichment returns email for leads
    mockEnrichPerson.mockResolvedValue({
      person: { email: "enriched@example.com" },
      organization: null,
    });
  });

  // Story 22.9 - AC #1, #2: a chave do Apollo vem do helper server-only e e
  // INJETADA no service. Sem isso, a leitura interna do ApolloService usa o client
  // de sessao e a RLS admin-only de `api_configs` devolve zero linhas para um `sdr`.
  describe("Story 22.9 - chave do Apollo lida via service-role e injetada", () => {
    it("le a chave pelo helper com o tenant do step e injeta no construtor", async () => {
      await step.run(createInput());

      expect(mockGetInjectableServiceApiKey).toHaveBeenCalledWith(
        TENANT_ID,
        "apollo",
        "Apollo"
      );
      expect(apolloConstructorArgs).toContainEqual([
        TENANT_ID,
        "apollo-key-service-role",
      ]);
    });

    it("chave ausente no tenant: injeta undefined e deixa o service produzir o erro de hoje", async () => {
      mockGetInjectableServiceApiKey.mockResolvedValue(undefined);

      await step.run(createInput());

      expect(apolloConstructorArgs).toContainEqual([TENANT_ID, undefined]);
    });

    it("chave nao decriptavel: o erro do helper propaga (nao vira 'nao configurada')", async () => {
      mockGetInjectableServiceApiKey.mockRejectedValue(
        new Error("Erro ao decriptar a API key do Apollo")
      );

      await expect(step.run(createInput())).rejects.toThrow(
        "Erro ao decriptar a API key do Apollo"
      );
      // Nao chegou a instanciar o service: falha antes de qualquer chamada paga.
      expect(apolloConstructorArgs).toHaveLength(0);
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
      // Story 24.15: sede da empresa por padrao + cargo exato.
      expect(mockSearchPeople).toHaveBeenCalledWith({
        domains: ["acme.com", "beta.io"],
        titles: ["CTO", "VP Engineering"],
        organizationLocations: ["Brasil"],
        includeSimilarTitles: false,
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
      // Story 24.15: sede da empresa, cargo exato e industria mapeada por categoria.
      expect(mockSearchPeople).toHaveBeenCalledWith({
        titles: ["CTO", "VP Engineering"],
        organizationLocations: ["Sao Paulo"],
        organizationIndustries: ["financial services", "banking"],
        includeSimilarTitles: false,
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
          organizationLocations: ["Brasil"],
          organizationIndustries: ["hospital & health care"],
          companySizes: ["200-500"],
        })
      );
    });

    it("omits undefined optional filters in direct entry (mas aplica piso de qualidade de tamanho — Story 22.6)", async () => {
      const input = createInput(
        { location: null, industry: null, companySize: null },
        undefined
      );
      input.previousStepOutput = undefined;

      await step.run(input);

      const callArg = mockSearchPeople.mock.calls[0][0];
      expect(callArg.locations).toBeUndefined();
      expect(callArg.industries).toBeUndefined();
      // Story 22.6: companySizes NÃO é mais omitido na busca direta — recebe o piso de qualidade.
      expect(callArg.companySizes).toEqual([...QUALITY_MIN_COMPANY_SIZES]);
    });

    // ==============================================
    // Story 22.6 (FR12): piso de qualidade de tamanho de empresa na busca aberta
    // ==============================================

    it("aplica o piso de qualidade quando busca direta SEM companySize (AC1, RED→GREEN)", async () => {
      const input = createInput({ companySize: null }, undefined);
      input.previousStepOutput = undefined;

      await step.run(input);

      expect(mockSearchPeople).toHaveBeenCalledWith(
        expect.objectContaining({
          companySizes: [...QUALITY_MIN_COMPANY_SIZES],
        })
      );
      // AC1: "1-10" nunca vai pro Apollo por padrão.
      const callArg = mockSearchPeople.mock.calls[0][0];
      expect(callArg.companySizes).not.toContain("1-10");
    });

    it("override total pelo usuario na busca direta COM companySize (AC2 sagrado)", async () => {
      const input = createInput({ companySize: "11-50" }, undefined);
      input.previousStepOutput = undefined;

      await step.run(input);

      expect(mockSearchPeople).toHaveBeenCalledWith(
        expect.objectContaining({
          companySizes: ["11-50"],
        })
      );
    });

    it("NÃO aplica piso de qualidade no fluxo normal, mesmo sem companySize (AC5/D4/NFR4)", async () => {
      // Fluxo normal (com empresas do step anterior) e sem companySize informado:
      // o default é exclusivo da busca direta — não pode vazar pro fluxo por domínio.
      const input = createInput({ companySize: null });

      await step.run(input);

      const callArg = mockSearchPeople.mock.calls[0][0];
      expect(callArg.domains).toEqual(["acme.com", "beta.io"]);
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
          organizationLocations: ["Brasil"],
        })
      );
    });

    it("preserva cidade/regiao na busca normal depois do filtro de empresas (Story 22.1)", async () => {
      const input = createInput({ location: "Sao Paulo" });

      await step.run(input);

      expect(mockSearchPeople).toHaveBeenCalledWith(
        expect.objectContaining({
          domains: ["acme.com", "beta.io"],
          organizationLocations: ["Sao Paulo"],
        })
      );
    });
  });

  // ==============================================
  // Story 17.12: searchFilters in output
  // ==============================================

  describe("searchFilters in output (Story 17.12)", () => {
    it("output includes searchFilters with filters used in direct entry flow", async () => {
      const input = createInput(
        { location: "Sao Paulo", industry: "fintech", companySize: "50-200" },
        undefined
      );
      input.previousStepOutput = undefined;

      const result = await step.run(input);

      expect(result.data.searchFilters).toBeDefined();
      expect(result.data.searchFilters).toMatchObject({
        titles: ["CTO", "VP Engineering"],
        perPage: 25,
        page: 1,
        organizationLocations: ["Sao Paulo"],
        organizationIndustries: ["financial services", "banking"],
        includeSimilarTitles: false,
        companySizes: ["50-200"],
      });
    });

    it("output includes searchFilters with filters used in normal flow (with domains)", async () => {
      const input = createInput();

      const result = await step.run(input);

      expect(result.data.searchFilters).toBeDefined();
      expect(result.data.searchFilters).toMatchObject({
        domains: ["acme.com", "beta.io"],
        titles: ["CTO", "VP Engineering"],
        organizationLocations: ["Brasil"],
        includeSimilarTitles: false,
        perPage: 25,
        page: 1,
      });
    });

    it("searchFilters contains page, perPage, titles (mandatory fields)", async () => {
      const input = createInput({}, undefined);
      input.previousStepOutput = undefined;

      const result = await step.run(input);

      const filters = result.data.searchFilters as Record<string, unknown>;
      expect(filters).toHaveProperty("page");
      expect(filters).toHaveProperty("perPage");
      expect(filters).toHaveProperty("titles");
      expect(filters.page).toBe(1);
      expect(filters.perPage).toBe(25);
      expect(filters.titles).toEqual(["CTO", "VP Engineering"]);
    });
  });

  // ==============================================
  // Story 22.14: busca com 0 resultados nao e sucesso
  // ==============================================

  // ==============================================
  // Story 24.13: quantos leads (N)
  // ==============================================

  describe("Story 24.14 - defaults do ICP", () => {
    const ICP = { companySizes: ["201-500", "501-1000"], locations: ["SP"] };

    it("busca direta sem porte/local usa as faixas e o local do ICP (no lugar do piso)", async () => {
      const input = createInput({ location: null, companySize: null, icpDefaults: ICP });
      input.previousStepOutput = undefined;

      await step.run(input);

      const callArg = mockSearchPeople.mock.calls[0][0];
      expect(callArg.companySizes).toEqual(["201-500", "501-1000"]);
      expect(callArg.organizationLocations).toEqual(["SP"]);
    });

    it("o usuario vence o ICP (porte e local)", async () => {
      const input = createInput({ location: "RJ", companySize: "51-200", icpDefaults: ICP });
      input.previousStepOutput = undefined;

      await step.run(input);

      const callArg = mockSearchPeople.mock.calls[0][0];
      expect(callArg.companySizes).toEqual(["51-200"]);
      expect(callArg.organizationLocations).toEqual(["RJ"]);
    });

    it("ramo por dominios usa o local do ICP e nunca o porte", async () => {
      await step.run(createInput({ location: null, companySize: null, icpDefaults: ICP }));

      const callArg = mockSearchPeople.mock.calls[0][0];
      expect(callArg.domains).toEqual(["acme.com", "beta.io"]);
      expect(callArg.organizationLocations).toEqual(["SP"]);
      expect(callArg.companySizes).toBeUndefined();
    });

    it("ramo por dominios sem ICP e sem local fica identico (sem locations)", async () => {
      await step.run(createInput({ location: null }));

      const callArg = mockSearchPeople.mock.calls[0][0];
      expect(callArg.locations).toBeUndefined();
      expect(callArg.organizationLocations).toBeUndefined();
    });
  });

  describe("Story 24.13 - leadCount (N)", () => {
    const makeLeadRows = (count: number) =>
      Array.from({ length: count }, (_, i) => ({
        ...mockLeadsResponse.leads[0],
        id: `lead-${i + 1}`,
        apollo_id: `apollo-${i + 1}`,
        first_name: `Lead${i + 1}`,
      }));

    // Story 24.16: universo de 3-5x N (teto 100).
    it.each([
      [1, 5],
      [5, 25],
      [10, 30],
      [20, 60],
      [60, 100],
      [300, 100],
      [null, 25],
    ])("busca direta com N = %p usa perPage %p", async (n, expected) => {
      const input = createInput({ leadCount: n });
      input.previousStepOutput = undefined;
      await step.run(input);

      expect(mockSearchPeople).toHaveBeenCalledWith(
        expect.objectContaining({ perPage: expected, page: 1 })
      );
    });

    it("busca por dominio tambem usa perPage por N", async () => {
      await step.run(createInput({ leadCount: 20 }));
      expect(mockSearchPeople).toHaveBeenCalledWith(
        expect.objectContaining({ domains: ["acme.com", "beta.io"], perPage: 60 })
      );
    });

    it("output leva leadCount (N ou null)", async () => {
      const comN = await step.run(createInput({ leadCount: 5 }));
      expect(comN.data.leadCount).toBe(5);

      const semN = await step.run(createInput());
      expect(semN.data.leadCount).toBeNull();
    });

    it("autopilot com N = 5 e 25 leads: output com 5 leads e apollo_search 5", async () => {
      mockSearchPeople.mockResolvedValue({
        leads: makeLeadRows(25),
        pagination: { totalEntries: 300, page: 1, perPage: 25, totalPages: 12 },
      });
      const input = createInput({ leadCount: 5 });
      input.mode = "autopilot";

      const result = await step.run(input);

      expect(result.data.leads).toHaveLength(5);
      expect((result.data.leads as Array<{ name: string }>)[0].name).toContain("Lead1");
      expect(result.data.totalFound).toBe(300);
      expect(result.cost?.apollo_search).toBe(5);
    });

    it("modo guiado com N = 5: lista completa vai para a revisao (sem corte)", async () => {
      mockSearchPeople.mockResolvedValue({
        leads: makeLeadRows(25),
        pagination: { totalEntries: 300, page: 1, perPage: 25, totalPages: 12 },
      });
      const input = createInput({ leadCount: 5 });
      input.mode = "guided";

      const result = await step.run(input);

      expect(result.data.leads).toHaveLength(25);
      expect(result.data.leadCount).toBe(5);
    });

    it("autopilot sem N: nada muda (todos os leads)", async () => {
      mockSearchPeople.mockResolvedValue({
        leads: makeLeadRows(25),
        pagination: { totalEntries: 300, page: 1, perPage: 25, totalPages: 12 },
      });
      const input = createInput();
      input.mode = "autopilot";

      const result = await step.run(input);
      expect(result.data.leads).toHaveLength(25);
      expect(result.cost?.apollo_search).toBe(25);
    });
  });

  describe("Story 22.14 - busca vazia (AC #1, #6)", () => {
    /**
     * Trap #8: o mock padrao SEMPRE devolve 2 leads — nenhum teste existente exercitava
     * o caminho de 0. Os casos "0" que ja existiam neste arquivo sao de outro cenario
     * (empresas ausentes no step anterior, que lanca antes de chamar a Apollo).
     */
    const emptyLeadsResponse = {
      leads: [],
      pagination: { totalEntries: 0, page: 1, perPage: 25, totalPages: 0 },
    };

    function directEntryInput(overrides: Partial<StepInput["briefing"]> = {}): StepInput {
      const input = createInput(overrides, undefined);
      input.previousStepOutput = undefined;
      input.mode = "guided";
      return input;
    }

    describe("modo guiado - o gate abre com diagnostico em vez de mentir", () => {
      beforeEach(() => {
        mockSearchPeople.mockResolvedValue(emptyLeadsResponse);
      });

      it("marca emptyResult no output (hoje o output nem tem a chave)", async () => {
        const result = await step.run(directEntryInput());

        expect(result.data.emptyResult).toBe(true);
        expect(result.data.leads).toEqual([]);
        expect(result.data.totalFound).toBe(0);
      });

      it("carrega o diagnostico determinístico no output (JSONB, zero migration)", async () => {
        const result = await step.run(
          directEntryInput({ companySize: "<11", industry: "clinicas de estetica", location: "Atibaia" })
        );

        const diagnosis = result.data.emptyDiagnosis as Record<string, unknown>;
        expect(diagnosis).toBeDefined();
        expect(diagnosis.branch).toBe("direct");
        expect(Array.isArray(diagnosis.activeFilters)).toBe(true);
        expect(Array.isArray(diagnosis.probableCauses)).toBe(true);
        expect(Array.isArray(diagnosis.suggestedChips)).toBe(true);

        const causes = diagnosis.probableCauses as Array<{ code: string }>;
        expect(causes[0].code).toBe("company_size_non_canonical");
      });

      it("a mensagem do gate NAO diz 'Revise os resultados e aprove' — orienta ao ajuste (AC1)", async () => {
        await step.run(directEntryInput());

        const gateInsert = mockSupabase.messagesChain.insert.mock.calls
          .map((call) => call[0])
          .find((arg) => arg?.metadata?.messageType === "approval_gate");

        expect(gateInsert).toBeDefined();
        expect(gateInsert.content).not.toContain("aprove para continuar");
        expect(gateInsert.content).toMatch(/nao encontrou/i);
      });

      it("o logStep NAO diz 'concluido com sucesso' (AC1)", async () => {
        await step.run(directEntryInput());

        // Story 22.17 (AC3): o log de conclusao do step passou de "progress" para
        // "step_complete" (nao gira mais spinner). O que a 22.14 guarda aqui continua
        // igual: o TEXTO nao pode dizer "concluido com sucesso" com zero resultados.
        const completionInserts = mockSupabase.messagesChain.insert.mock.calls
          .map((call) => call[0])
          .filter((arg) => arg?.metadata?.messageType === "step_complete");

        const conclusion = completionInserts.find((arg) =>
          String(arg.content).startsWith("Step 2")
        );
        expect(conclusion).toBeDefined();
        expect(conclusion.content).not.toContain("concluido com sucesso");
        expect(conclusion.content).toMatch(/nao encontrou/i);
      });

      it("custo zero — nenhum lead foi entregue", async () => {
        const result = await step.run(directEntryInput());

        expect(result.cost?.apollo_search).toBe(0);
      });

      it("ramo por dominios: diagnostico aponta as empresas da etapa anterior (Trap #4)", async () => {
        const input = createInput();
        input.mode = "guided";

        const result = await step.run(input);

        const diagnosis = result.data.emptyDiagnosis as Record<string, unknown>;
        expect(diagnosis.branch).toBe("domains");
        expect(diagnosis.companiesSearched).toBe(2);
        const chipIds = (diagnosis.suggestedChips as Array<{ id: string }>).map((c) => c.id);
        expect(chipIds).not.toContain("remove-industry");
      });

      /**
       * Trap #5: `totalFound` vem de `pagination.totalEntries` — uma pagina vazia com
       * total > 0 e possivel. O gatilho e SEMPRE `leads.length === 0`.
       */
      it("dispara pelo array vazio mesmo com totalFound > 0 (Trap #5)", async () => {
        mockSearchPeople.mockResolvedValue({
          leads: [],
          pagination: { totalEntries: 137, page: 6, perPage: 25, totalPages: 6 },
        });

        const result = await step.run(directEntryInput());

        expect(result.data.emptyResult).toBe(true);
        expect(result.data.totalFound).toBe(137);
      });
    });

    describe("modo autopilot - falha controlada em vez de estourar adiante (AC6)", () => {
      beforeEach(() => {
        mockSearchPeople.mockResolvedValue(emptyLeadsResponse);
      });

      it("lanca erro com mensagem clara em PT-BR (hoje devolve success e o create_campaign estoura)", async () => {
        const input = createInput({}, undefined);
        input.previousStepOutput = undefined;
        input.mode = "autopilot";

        // Mesmo codigo das demais validacoes de dominio deste step (cargos ausentes,
        // empresas ausentes): erro terminal, nao-retryable — repetir a mesma busca
        // devolveria o mesmo 0.
        await expect(step.run(input)).rejects.toMatchObject({
          code: "STEP_EXECUTION_ERROR",
          stepNumber: 2,
          stepType: "search_leads",
          isRetryable: false,
          message: expect.stringContaining("nao encontrou nenhum lead"),
        });
      });

      it("mode ausente segue a mesma regra do autopilot (nao ha gate para abrir)", async () => {
        const input = createInput({}, undefined);
        input.previousStepOutput = undefined;
        input.mode = undefined;

        await expect(step.run(input)).rejects.toMatchObject({
          stepNumber: 2,
        });
      });

      it("marca o step como failed (o pipeline pausa, mecanica existente do orchestrator)", async () => {
        const input = createInput({}, undefined);
        input.previousStepOutput = undefined;
        input.mode = "autopilot";

        await expect(step.run(input)).rejects.toBeDefined();

        expect(mockSupabase.stepsChain.update).toHaveBeenCalledWith(
          expect.objectContaining({ status: "failed" })
        );
      });
    });

    describe("busca COM resultados fica byte-a-byte identica (AC1)", () => {
      it("nao introduz emptyResult nem emptyDiagnosis no output", async () => {
        const result = await step.run(createInput());

        expect(result.data).not.toHaveProperty("emptyResult");
        expect(result.data).not.toHaveProperty("emptyDiagnosis");
        expect(result.cost?.apollo_search).toBe(2);
      });

      it("mantem as mensagens de sucesso de hoje", async () => {
        const input = createInput();
        input.mode = "guided";

        await step.run(input);

        const contents = mockSupabase.messagesChain.insert.mock.calls.map((call) =>
          String(call[0]?.content)
        );
        expect(contents.some((c) => c.includes("Revise os resultados e aprove"))).toBe(true);
        expect(contents.some((c) => c.includes("concluido com sucesso"))).toBe(true);
      });
    });
  });

  // 4.8
  describe("transformation LeadRow -> SearchLeadResult (2.8)", () => {
    it("maps fields correctly, handles nulls", async () => {
      const input = createInput();
      const result = await step.run(input);

      const leads = result.data.leads as Array<Record<string, unknown>>;

      // First lead: has last_name (obfuscated) — enrichment happens in CreateCampaignStep
      // Story 24.16: cada lead leva fitScore/fitReason (aqui, das regras).
      expect(leads[0]).toEqual({
        name: "John Do***e",
        title: "CTO",
        companyName: "Acme Corp",
        email: null,
        linkedinUrl: null,
        apolloId: "apollo-1",
        fitScore: "A",
        fitReason: "Cargo bate com o pedido (CTO) e tem e-mail disponivel",
      });

      // Second lead: no last_name, has linkedinUrl
      expect(leads[1]).toEqual({
        name: "Jane",
        title: "VP Engineering",
        companyName: "Beta Inc",
        email: null,
        linkedinUrl: "https://linkedin.com/in/jane",
        apolloId: "apollo-2",
        fitScore: "B",
        fitReason: "Cargo bate com o pedido (VP Engineering), mas sem e-mail disponivel",
      });
    });
  });

  describe("Story 24.10 - log de uso Apollo people_search", () => {
    it("loga 1 linha por searchPeople com tenant e executionId", async () => {
      await step.run(createInput());

      expect(mockLogApiUsage).toHaveBeenCalledTimes(1);
      expect(mockLogApiUsage).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
          serviceName: "apollo",
          requestType: "people_search",
          status: "success",
          metadata: expect.objectContaining({
            executionId: "exec-001",
            stepType: "search_leads",
            calls: 1,
            source: "agent",
          }),
        })
      );
    });

    it("cost.apollo_search continua sendo gravado (o custo real o ignora)", async () => {
      const result = await step.run(createInput());
      expect(result.cost).toHaveProperty("apollo_search");
    });
  });

  describe("Story 24.16 - Fit Score A/B/C", () => {
    const row = (i: number, title: string, hasEmail = true) => ({
      ...mockLeadsResponse.leads[0],
      id: `lead-${i}`,
      apollo_id: `apollo-${i}`,
      first_name: `Lead${i}`,
      title,
      has_email: hasEmail,
    });

    const universe = () =>
      Array.from({ length: 10 }, (_, i) => {
        if (i === 7) return row(i, "CTO LATAM");
        if (i === 3) return row(i, "Diretor Financeiro");
        return row(i, "Analista");
      });

    it("autopilot N = 2: o corte roda depois da ordenacao e leva os 2 melhores (o A primeiro)", async () => {
      mockSearchPeople.mockResolvedValue({
        leads: universe(),
        pagination: { totalEntries: 10, page: 1, perPage: 10, totalPages: 1 },
      });
      const input = createInput({ leadCount: 2 });
      input.mode = "autopilot";

      const result = await step.run(input);
      const leads = result.data.leads as Array<{ apolloId: string; fitScore: string }>;

      expect(leads.map((l) => l.apolloId)).toEqual(["apollo-7", "apollo-3"]);
      expect(leads.map((l) => l.fitScore)).toEqual(["A", "B"]);
      expect(result.cost?.apollo_search).toBe(2);
    });

    it("modo guiado: lista inteira ordenada A -> B -> C (estavel), com fitScoring", async () => {
      mockSearchPeople.mockResolvedValue({
        leads: universe(),
        pagination: { totalEntries: 10, page: 1, perPage: 10, totalPages: 1 },
      });

      const input = createInput({ leadCount: 2 });
      input.mode = "guided";

      const result = await step.run(input);
      const leads = result.data.leads as Array<{ apolloId: string; fitScore: string }>;

      expect(leads).toHaveLength(10);
      expect(leads.slice(0, 3).map((l) => l.apolloId)).toEqual(["apollo-7", "apollo-3", "apollo-0"]);
      expect(leads.slice(2).every((l) => l.fitScore === "C")).toBe(true);
      expect(result.data.fitScoring).toEqual({ source: "rules", counts: { A: 1, B: 1, C: 8 } });
    });

    it("passa o ICP lido e a chave OpenAI do tenant para o scorer", async () => {
      const icp = { ...EMPTY_TENANT_ICP, jobTitles: ["CISO"], painPoints: "Vazamento" };
      mockReadTenantICP.mockResolvedValue(icp);
      mockGetInjectableServiceApiKey.mockImplementation(async (_t: string, service: string) =>
        service === "openai" ? "openai-key" : "apollo-key"
      );

      await step.run(createInput());

      expect(mockReadTenantICP).toHaveBeenCalledWith(TENANT_ID);
      expect(mockGetInjectableServiceApiKey).toHaveBeenCalledWith(TENANT_ID, "openai", "OpenAI");
      expect(mockScoreLeads).toHaveBeenCalledWith(
        expect.objectContaining({ icp, apiKey: "openai-key", tenantId: TENANT_ID, executionId: "exec-001" })
      );
    });

    it("LLM ok: notas do LLM, source llm, 1 chamada no custo e 1 log fit_score success", async () => {
      mockScoreLeads.mockResolvedValue({
        results: [
          { fitScore: "C", fitReason: "Empresa fora do perfil" },
          { fitScore: "A", fitReason: "Decisor de engenharia no ICP" },
        ],
        source: "llm",
        attempted: true,
        succeeded: true,
        usage: { model: "gpt-5.4-mini", promptTokens: 900, completionTokens: 120, durationMs: 800, llmScored: 2 },
      });

      const result = await step.run(createInput());
      const leads = result.data.leads as Array<{ apolloId: string; fitScore: string; fitReason: string }>;

      expect(leads.map((l) => [l.apolloId, l.fitScore])).toEqual([
        ["apollo-2", "A"],
        ["apollo-1", "C"],
      ]);
      expect(leads[0].fitReason).toBe("Decisor de engenharia no ICP");
      expect(result.data.fitScoring).toEqual({ source: "llm", counts: { A: 1, B: 0, C: 1 } });
      expect(result.cost?.openai_fit_score).toBe(1);
      expect(mockLogApiUsage).toHaveBeenCalledWith(
        expect.objectContaining({
          serviceName: "openai",
          requestType: "fit_score",
          status: "success",
          metadata: expect.objectContaining({
            stepType: "search_leads",
            executionId: "exec-001",
            promptTokens: 900,
            completionTokens: 120,
          }),
        })
      );
    });

    it("LLM falha: regras, source rules, step success, log failed e custo de 1 chamada", async () => {
      mockScoreLeads.mockImplementation(async (params: ScorerParams) => rulesOnlyScoring(params, true));

      const result = await step.run(createInput());

      expect(result.success).toBe(true);
      expect(result.data.fitScoring).toEqual({ source: "rules", counts: { A: 1, B: 1, C: 0 } });
      expect(result.cost?.openai_fit_score).toBe(1);
      expect(mockLogApiUsage).toHaveBeenCalledWith(
        expect.objectContaining({ requestType: "fit_score", status: "failed", errorMessage: "timeout" })
      );
    });

    it("sem chave (nao tentado): sem log fit_score e custo 0", async () => {
      const result = await step.run(createInput());

      expect(result.cost?.openai_fit_score).toBe(0);
      const requestTypes = mockLogApiUsage.mock.calls.map((call) => call[0]?.requestType);
      expect(requestTypes).not.toContain("fit_score");
    });

    it("erro de decrypt da chave OpenAI: so regras (apiKey undefined), o step segue", async () => {
      mockGetInjectableServiceApiKey.mockImplementation(async (_t: string, service: string) => {
        if (service === "openai") throw new Error("Erro ao decriptar a API key do OpenAI");
        return "apollo-key";
      });
      vi.spyOn(console, "warn").mockImplementation(() => {});

      const result = await step.run(createInput());

      expect(result.success).toBe(true);
      expect(mockScoreLeads).toHaveBeenCalledWith(expect.objectContaining({ apiKey: undefined }));
    });

    it("busca vazia nao chama o scorer", async () => {
      mockSearchPeople.mockResolvedValue({
        leads: [],
        pagination: { totalEntries: 0, page: 1, perPage: 25, totalPages: 0 },
      });
      const input = createInput();
      input.mode = "guided";

      await step.run(input);
      expect(mockScoreLeads).not.toHaveBeenCalled();
    });
  });

  describe("Story 24.17 — modo lista de contas", () => {
    function listInput(overrides: Partial<StepInput["briefing"]> = {}): StepInput {
      return {
        ...createInput({
          technology: null,
          jobTitles: ["CISO"],
          location: null,
          companySize: "50-200",
          industry: "saas",
          skipSteps: ["search_companies"],
          icpDefaults: { companySizes: ["201-500"], locations: ["SP"] },
          targetAccounts: [
            { name: "Conta A", domain: "a.com", confidence: "high" },
            { name: "Conta B", domain: "b.com", confidence: "low" },
          ],
          ...overrides,
        }),
        previousStepOutput: undefined,
      };
    }

    it("busca por dominio nas contas, sem porte/industria/local do ICP", async () => {
      const result = await step.run(listInput());

      expect(mockSearchPeople).toHaveBeenCalledWith({
        domains: ["a.com", "b.com"],
        titles: ["CISO"],
        includeSimilarTitles: false,
        perPage: 25,
        page: 1,
      });
      expect(result.data.domainsSearched).toEqual(["a.com", "b.com"]);
      expect(result.data.suppressedAccounts).toEqual([]);
      expect(result.data.leads).toHaveLength(2);
      expect(mockScoreLeads).toHaveBeenCalled();
      expect(mockSupabase.messagesChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining("Buscando leads (CISO) nas 2 contas da sua lista..."),
        })
      );
    });

    it("local do usuario entra na busca", async () => {
      await step.run(listInput({ location: "Sao Paulo" }));

      expect(mockSearchPeople).toHaveBeenCalledWith(
        expect.objectContaining({ domains: ["a.com", "b.com"], locations: ["Sao Paulo"] })
      );
    });

    it("conta suprimida no step (via chip): avisa e busca so o resto", async () => {
      mockFindSuppressedAccounts.mockResolvedValue([
        { name: null, domain: "b.com", reason: "negociacao em andamento (oportunidade em contato)" },
      ]);

      const result = await step.run(listInput());

      expect(mockFindSuppressedAccounts).toHaveBeenCalledWith(
        expect.anything(),
        TENANT_ID,
        ["a.com", "b.com"]
      );
      expect(mockSupabase.messagesChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          role: "system",
          content: "Removi da busca: Conta B (negociacao em andamento (oportunidade em contato)).",
        })
      );
      expect(mockSearchPeople).toHaveBeenCalledWith(
        expect.objectContaining({ domains: ["a.com"] })
      );
      // fetch-leads ("Buscar mais") reaproveita searchFilters: so a conta restante, sem
      // porte/industria/local do ICP.
      const searchFilters = result.data.searchFilters as Record<string, unknown>;
      expect(searchFilters.domains).toEqual(["a.com"]);
      expect(searchFilters).not.toHaveProperty("companySizes");
      expect(searchFilters).not.toHaveProperty("industries");
      expect(searchFilters).not.toHaveProperty("locations");
      expect(mockSupabase.messagesChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining("Buscando leads (CISO) na 1 conta da sua lista..."),
        })
      );
      expect(result.data.suppressedAccounts).toEqual([
        {
          name: "Conta B",
          domain: "b.com",
          reason: "negociacao em andamento (oportunidade em contato)",
        },
      ]);
    });

    it("todas suprimidas: nao busca e lanca ALL_ACCOUNTS_SUPPRESSED_MESSAGE", async () => {
      const { ALL_ACCOUNTS_SUPPRESSED_MESSAGE } = await import(
        "@/lib/agent/account-suppression"
      );
      mockFindSuppressedAccounts.mockResolvedValue([
        { name: null, domain: "a.com", reason: "r" },
        { name: null, domain: "b.com", reason: "r" },
      ]);

      await expect(step.run(listInput())).rejects.toThrow(ALL_ACCOUNTS_SUPPRESSED_MESSAGE);
      expect(mockSearchPeople).not.toHaveBeenCalled();
    });

    it("mensagem de todas suprimidas vira frase bem formada como erro nao retryable", async () => {
      const { ALL_ACCOUNTS_SUPPRESSED_MESSAGE } = await import(
        "@/lib/agent/account-suppression"
      );
      const { formatStepErrorMessage } = await import("@/lib/agent/step-error-display");

      expect(ALL_ACCOUNTS_SUPPRESSED_MESSAGE).not.toMatch(/tente novamente/i);
      expect(formatStepErrorMessage(ALL_ACCOUNTS_SUPPRESSED_MESSAGE, false)).toBe(
        "Todas as contas da sua lista estao com negociacao em andamento, entao nao busquei ninguem. Ajuste a lista de contas para seguir"
      );
    });

    it("busca vazia: diagnostico fala da lista de contas", async () => {
      mockSearchPeople.mockResolvedValue({
        leads: [],
        pagination: { totalEntries: 0, page: 1, perPage: 25, totalPages: 0 },
      });

      const result = await step.run({ ...listInput(), mode: "guided" });

      expect(result.data.emptyResult).toBe(true);
      const diagnosis = result.data.emptyDiagnosis as {
        probableCauses: Array<{ text: string }>;
      };
      expect(diagnosis.probableCauses[0].text).toContain("nas 2 contas da sua lista");
      expect(result.data.suppressedAccounts).toEqual([]);
    });

    it("sem contas: fluxo direto inalterado (supressao nao consultada)", async () => {
      await step.run({
        ...createInput({ technology: null, skipSteps: ["search_companies"] }),
        previousStepOutput: undefined,
      });

      expect(mockFindSuppressedAccounts).not.toHaveBeenCalled();
      expect(mockSearchPeople).toHaveBeenCalledWith(
        expect.not.objectContaining({ domains: expect.anything() })
      );
    });
  });
  // ==============================================
  // Story 24.15: busca mais precisa
  // ==============================================

  describe("Story 24.15 - busca mais precisa", () => {
    const makeRows = (specs: Array<{ id: string; company?: string }>) =>
      specs.map(({ id, company }) => ({
        ...mockLeadsResponse.leads[0],
        id: `lead-${id}`,
        apollo_id: id,
        first_name: `Lead-${id}`,
        company_name: company ?? "Acme Corp",
      }));
    const page = (rows: unknown[]) => ({
      leads: rows,
      pagination: { totalEntries: rows.length, page: 1, perPage: 25, totalPages: 1 },
    });
    const direct = (overrides: Partial<StepInput["briefing"]> = {}) => {
      const input = createInput({ industry: null, ...overrides });
      input.previousStepOutput = undefined;
      input.mode = "guided";
      return input;
    };
    const fallbackMessageInserted = () =>
      mockSupabase.messagesChain.insert.mock.calls.some(
        ([arg]) => (arg as { content?: string }).content === SIMILAR_TITLES_FALLBACK_MESSAGE
      );

    it("local da pessoa (locationScope person): locations em vez de organizationLocations", async () => {
      await step.run(direct({ location: "SP", locationScope: "person" }));
      const callArg = mockSearchPeople.mock.calls[0][0];
      expect(callArg.locations).toEqual(["SP"]);
      expect(callArg.organizationLocations).toBeUndefined();
    });

    it("ramo por dominios com locationScope person: locations, sem organizationLocations", async () => {
      await step.run({ ...createInput({ location: "SP", locationScope: "person" }), mode: "guided" });
      const callArg = mockSearchPeople.mock.calls[0][0];
      expect(callArg.domains).toEqual(["acme.com", "beta.io"]);
      expect(callArg.locations).toEqual(["SP"]);
      expect(callArg).not.toHaveProperty("organizationLocations");
    });

    it("N > perPage: pagina exata cheia nao amplia (1 chamada so)", async () => {
      mockSearchPeople.mockResolvedValue(
        page(makeRows(Array.from({ length: 100 }, (_, i) => ({ id: `a${i}` }))))
      );
      const result = await step.run(direct({ leadCount: 300 }));

      expect(mockSearchPeople.mock.calls[0][0].perPage).toBe(100);
      expect(mockSearchPeople).toHaveBeenCalledTimes(1);
      expect(result.data.similarTitlesFallback).toBeUndefined();
    });

    it("industria sem mapa segue como texto", async () => {
      await step.run(direct({ industry: "biotech espacial" }));
      const callArg = mockSearchPeople.mock.calls[0][0];
      expect(callArg.industries).toEqual(["biotech espacial"]);
      expect(callArg.organizationIndustries).toBeUndefined();
    });

    it("sem ampliacao: N=5 e o exato devolve 10 -> 1 chamada so", async () => {
      mockSearchPeople.mockResolvedValue(page(makeRows(Array.from({ length: 10 }, (_, i) => ({ id: `a${i}` })))));
      const result = await step.run(direct({ leadCount: 5 }));

      expect(mockSearchPeople).toHaveBeenCalledTimes(1);
      expect(mockSearchPeople.mock.calls[0][0].includeSimilarTitles).toBe(false);
      expect(result.data.similarTitlesFallback).toBeUndefined();
      expect(fallbackMessageInserted()).toBe(false);
    });

    it("ampliacao: N=5 e o exato devolve 2 -> 2a busca com cargos parecidos", async () => {
      mockSearchPeople
        .mockResolvedValueOnce(page(makeRows([{ id: "a1" }, { id: "a2" }])))
        .mockResolvedValueOnce(page(makeRows([1, 2, 3, 4, 5, 6].map((i) => ({ id: `b${i}` })))));

      const result = await step.run(direct({ leadCount: 5 }));

      expect(mockSearchPeople).toHaveBeenCalledTimes(2);
      expect(mockSearchPeople.mock.calls[0][0].includeSimilarTitles).toBe(false);
      expect(mockSearchPeople.mock.calls[1][0].includeSimilarTitles).toBe(true);
      expect(result.data.similarTitlesFallback).toBe(true);
      expect((result.data.searchFilters as Record<string, unknown>).includeSimilarTitles).toBe(true);
      expect(result.data.leads).toHaveLength(6);
      expect(fallbackMessageInserted()).toBe(true);
      // as duas chamadas sao logadas
      const peopleSearchLogs = mockLogApiUsage.mock.calls.filter(
        ([arg]) => (arg as { requestType?: string }).requestType === "people_search"
      );
      expect(peopleSearchLogs).toHaveLength(2);
    });

    it("sem N: amplia so quando o exato vem vazio", async () => {
      mockSearchPeople
        .mockResolvedValueOnce(page([]))
        .mockResolvedValueOnce(page(makeRows([{ id: "b1" }])));

      const result = await step.run(direct());

      expect(mockSearchPeople).toHaveBeenCalledTimes(2);
      expect(result.data.leads).toHaveLength(1);
    });

    it("ampliacao tambem vazia -> busca vazia de hoje com os filtros efetivos", async () => {
      mockSearchPeople.mockResolvedValue(page([]));

      const result = await step.run(direct({ leadCount: 5 }));

      expect(mockSearchPeople).toHaveBeenCalledTimes(2);
      expect(result.data.emptyResult).toBe(true);
      expect((result.data.searchFilters as Record<string, unknown>).includeSimilarTitles).toBe(true);
      expect(result.data.similarTitlesFallback).toBe(true);
    });

    it("ramo por dominios e modo lista tambem ampliam", async () => {
      mockSearchPeople.mockResolvedValue(page([]));
      await step.run({ ...createInput({ leadCount: 5 }), mode: "guided" });
      expect(mockSearchPeople).toHaveBeenCalledTimes(2);
      expect(mockSearchPeople.mock.calls[1][0]).toMatchObject({
        domains: ["acme.com", "beta.io"],
        includeSimilarTitles: true,
      });

      mockSearchPeople.mockClear();
      await step.run({
        ...createInput({
          technology: null,
          jobTitles: ["CISO"],
          location: "SP",
          skipSteps: ["search_companies"],
          targetAccounts: [{ name: "A", domain: "a.com", confidence: "high" }],
        }),
        previousStepOutput: undefined,
        mode: "guided",
      });
      expect(mockSearchPeople).toHaveBeenCalledTimes(2);
      // modo lista: local continua da pessoa
      expect(mockSearchPeople.mock.calls[0][0]).toMatchObject({
        domains: ["a.com"],
        locations: ["SP"],
        includeSimilarTitles: false,
      });
      expect(mockSearchPeople.mock.calls[0][0]).not.toHaveProperty("organizationLocations");
      expect(mockSearchPeople.mock.calls[1][0].includeSimilarTitles).toBe(true);
    });

    it("triagem: remove suprimidos, marca publicos/ja contatados, ordena e grava screening", async () => {
      mockSearchPeople.mockResolvedValue(
        page(
          makeRows([
            { id: "p1", company: "Prefeitura de Campinas" },
            { id: "c1" },
            { id: "s1" },
            { id: "e1" },
          ])
        )
      );
      mockFindContactedLeads.mockResolvedValue(
        new Map([
          ["s1", "suppressed"],
          ["c1", "already_contacted"],
        ])
      );

      const result = await step.run(direct());
      const leads = result.data.leads as Array<{ apolloId: string; publicSector?: boolean; contactStatus?: string }>;

      expect(mockFindContactedLeads).toHaveBeenCalledWith(mockSupabase, TENANT_ID, ["p1", "c1", "s1", "e1"]);
      expect(leads.map((l) => l.apolloId)).toEqual(["e1", "c1", "p1"]);
      expect(leads[1].contactStatus).toBe("already_contacted");
      expect(leads[2].publicSector).toBe(true);
      expect(result.data.screening).toEqual({ suppressed: 1, publicSector: 1, alreadyContacted: 1 });
      expect(mockSupabase.messagesChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          content: "Removi 1 lead(s) suprimido(s) (pediram para sair ou estao em negociacao).",
        })
      );
      // o Fit Score roda sobre a lista ja triada (casando por indice)
      const scorerLeads = (mockScoreLeads.mock.calls[0][0] as { leads: Array<{ apollo_id: string }> }).leads;
      expect(scorerLeads.map((l) => l.apollo_id)).toEqual(["p1", "c1", "e1"]);
    });

    it("todos suprimidos -> caminho de busca vazia", async () => {
      mockSearchPeople.mockResolvedValue(page(makeRows([{ id: "s1" }])));
      mockFindContactedLeads.mockResolvedValue(new Map([["s1", "suppressed"]]));

      const result = await step.run(direct());

      expect(result.data.emptyResult).toBe(true);
      expect(result.data.screening).toEqual({ suppressed: 1, publicSector: 0, alreadyContacted: 0 });
    });

    it("autopilot: 3 elegiveis + 2 publicos, N=10 -> output com os 3 elegiveis", async () => {
      mockSearchPeople.mockResolvedValue(
        page(
          makeRows([
            { id: "e1" },
            { id: "p1", company: "Prefeitura de Santos" },
            { id: "e2" },
            { id: "p2", company: "Tribunal de Justica" },
            { id: "e3" },
          ])
        )
      );
      const input = direct({ leadCount: 10 });
      input.mode = "autopilot";

      const result = await step.run(input);

      const ids = (result.data.leads as Array<{ apolloId: string }>).map((l) => l.apolloId);
      expect(ids.sort()).toEqual(["e1", "e2", "e3"]);
      expect(result.cost?.apollo_search).toBe(3);
    });

    it("autopilot sem nenhum elegivel -> EMPTY_LEAD_SEARCH_MESSAGE", async () => {
      mockSearchPeople.mockResolvedValue(page(makeRows([{ id: "p1", company: "Prefeitura de Santos" }])));
      const input = direct();
      input.mode = "autopilot";

      await expect(step.run(input)).rejects.toMatchObject({
        message: expect.stringContaining(EMPTY_LEAD_SEARCH_MESSAGE),
      });
    });
  });

  describe("Story 24.18 — contas parecidas", () => {
    function lookalikeInput(overrides: Partial<StepInput["briefing"]> = {}): StepInput {
      return {
        ...createInput({
          technology: null,
          jobTitles: ["CISO"],
          location: null,
          companySize: null,
          industry: null,
          skipSteps: ["search_companies"],
          referenceAccounts: REFERENCE_ACCOUNTS,
          referenceAccountsSource: "user",
          referenceProfile: confidentReferenceProfile(),
          ...overrides,
        }),
        previousStepOutput: undefined,
      };
    }

    function leadAt(company: string, id: string) {
      return { ...mockLeadsResponse.leads[0], id, apollo_id: id, company_name: company };
    }

    it("busca com setores, faixas e regiao do perfil e prefixa o Fit Score", async () => {
      const result = await step.run(lookalikeInput());

      expect(mockSearchPeople).toHaveBeenCalledWith(
        expect.objectContaining({
          titles: ["CISO"],
          companySizes: ["201-500", "501-1000"],
          organizationIndustries: ["banking"],
          organizationLocations: ["Sao Paulo, Brazil"],
        })
      );
      expect(mockSupabase.messagesChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining(
            "Buscando leads (CISO) em empresas parecidas com seus clientes..."
          ),
        })
      );
      const leads = result.data.leads as Array<{ fitScore: string; fitReason: string }>;
      expect(leads.length).toBeGreaterThan(0);
      for (const lead of leads) {
        expect(lead.fitReason.startsWith("mesmo setor e porte de Banco X; ")).toBe(true);
      }
      expect(result.data.lookalike).toEqual({
        references: REFERENCE_ACCOUNTS,
        similarity: "mesmo setor e porte de Banco X",
        excludedCount: 0,
      });
    });

    it("remove clientes e dominios suprimidos do resultado e avisa", async () => {
      mockReadSuppressedDomains.mockResolvedValue(["empresaw.com.br"]);
      mockSearchPeople.mockResolvedValue({
        leads: [leadAt("Banco X", "a1"), leadAt("Empresa W", "a2"), leadAt("Outro Banco", "a3")],
        pagination: { totalEntries: 3, page: 1, perPage: 25, totalPages: 1 },
      });

      const result = await step.run(lookalikeInput());

      const leads = result.data.leads as Array<{ companyName: string }>;
      expect(leads.map((l) => l.companyName)).toEqual(["Outro Banco"]);
      expect(mockSupabase.messagesChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          role: "system",
          content: "Removi da busca 2 leads de clientes ou contas suprimidas.",
        })
      );
      expect((result.data.lookalike as { excludedCount: number }).excludedCount).toBe(2);
    });

    it("leitura da supressao falha (vazia): so as referencias saem", async () => {
      mockReadSuppressedDomains.mockResolvedValue([]);
      mockSearchPeople.mockResolvedValue({
        leads: [leadAt("Banco X", "a1"), leadAt("Empresa W", "a2")],
        pagination: { totalEntries: 2, page: 1, perPage: 25, totalPages: 1 },
      });

      const result = await step.run(lookalikeInput());

      const leads = result.data.leads as Array<{ companyName: string }>;
      expect(leads.map((l) => l.companyName)).toEqual(["Empresa W"]);
    });

    it("chip de porte editado: busca usa 51-200 e a semelhanca so pelo setor", async () => {
      const result = await step.run(lookalikeInput({ companySize: "51-200" }));

      expect(mockSearchPeople).toHaveBeenCalledWith(
        expect.objectContaining({ companySizes: ["51-200"] })
      );
      expect((result.data.lookalike as { similarity: string }).similarity).toBe(
        "mesmo setor de Banco X"
      );
    });

    it("sem referencias: fluxo direto inalterado (supressao nao lida)", async () => {
      const result = await step.run({
        ...createInput({ technology: null, skipSteps: ["search_companies"] }),
        previousStepOutput: undefined,
      });

      expect(mockReadSuppressedDomains).not.toHaveBeenCalled();
      expect(result.data).not.toHaveProperty("lookalike");
    });
  });
});
