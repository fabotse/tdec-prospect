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
      expect(mockSearchPeople).toHaveBeenCalledWith({
        domains: ["acme.com", "beta.io"],
        titles: ["CTO", "VP Engineering"],
        locations: ["Brasil"],
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
          locations: ["Brasil"],
        })
      );
    });

    it("preserva cidade/regiao na busca normal depois do filtro de empresas (Story 22.1)", async () => {
      const input = createInput({ location: "Sao Paulo" });

      await step.run(input);

      expect(mockSearchPeople).toHaveBeenCalledWith(
        expect.objectContaining({
          domains: ["acme.com", "beta.io"],
          locations: ["Sao Paulo"],
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
        locations: ["Sao Paulo"],
        industries: ["fintech"],
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
        locations: ["Brasil"],
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
