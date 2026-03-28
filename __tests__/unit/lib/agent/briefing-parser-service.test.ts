/**
 * BriefingParserService Tests
 * Story 16.3 - AC: #1, #2
 *
 * Tests: parsing completo, parcial, sem dados, timeout, erro OpenAI
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { BriefingParserService, briefingResponseSchema } from "@/lib/agent/briefing-parser-service";
import { AGENT_ERROR_CODES } from "@/types/agent";

// ==============================================
// MOCK OPENAI
// ==============================================

const mockCreate = vi.fn();

vi.mock("openai", () => ({
  default: class MockOpenAI {
    chat = {
      completions: {
        create: mockCreate,
      },
    };
  },
}));

// ==============================================
// HELPERS
// ==============================================

function mockOpenAIResponse(content: Record<string, unknown>) {
  mockCreate.mockResolvedValueOnce({
    choices: [{ message: { content: JSON.stringify(content) } }],
  });
}

const FULL_BRIEFING_RESPONSE = {
  technology: "Netskope",
  jobTitles: ["CTO"],
  location: "Sao Paulo",
  companySize: null,
  industry: "fintech",
  productMentioned: null,
  mode: "guided",
  skipSteps: [],
};

// ==============================================
// TESTS
// ==============================================

describe("BriefingParserService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("parse()", () => {
    it("deve extrair todos os campos de um briefing completo (AC: #1)", async () => {
      mockOpenAIResponse(FULL_BRIEFING_RESPONSE);

      const result = await BriefingParserService.parse(
        "Quero prospectar CTOs de fintechs em SP que usam Netskope",
        "sk-test-key"
      );

      expect(result.briefing).toEqual({
        technology: "Netskope",
        jobTitles: ["CTO"],
        location: "Sao Paulo",
        companySize: null,
        industry: "fintech",
        productSlug: null,
        mode: "guided",
        skipSteps: [],
      });
      expect(result.rawResponse.productMentioned).toBeNull();
    });

    it("deve usar gpt-4o-mini com response_format json_object (AC: #2)", async () => {
      mockOpenAIResponse(FULL_BRIEFING_RESPONSE);

      await BriefingParserService.parse("qualquer briefing", "sk-test");

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "gpt-4o-mini",
          response_format: { type: "json_object" },
          temperature: 0.1,
        }),
        expect.objectContaining({
          signal: expect.any(AbortSignal),
        })
      );
    });

    it("deve retornar campos null quando briefing parcial", async () => {
      mockOpenAIResponse({
        technology: null,
        jobTitles: [],
        location: null,
        companySize: null,
        industry: "tecnologia",
        productMentioned: null,
        mode: "guided",
        skipSteps: [],
      });

      const result = await BriefingParserService.parse(
        "Quero prospectar empresas de tecnologia",
        "sk-test"
      );

      expect(result.briefing.technology).toBeNull();
      expect(result.briefing.jobTitles).toEqual([]);
      expect(result.briefing.industry).toBe("tecnologia");
    });

    it("deve retornar todos campos null/vazio sem dados", async () => {
      mockOpenAIResponse({
        technology: null,
        jobTitles: [],
        location: null,
        companySize: null,
        industry: null,
        productMentioned: null,
        mode: "guided",
        skipSteps: [],
      });

      const result = await BriefingParserService.parse("oi", "sk-test");

      expect(result.briefing.technology).toBeNull();
      expect(result.briefing.jobTitles).toEqual([]);
      expect(result.briefing.location).toBeNull();
      expect(result.briefing.industry).toBeNull();
      expect(result.briefing.productSlug).toBeNull();
    });

    it("deve lancar erro quando OpenAI retorna conteudo vazio", async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [{ message: { content: null } }],
      });

      await expect(
        BriefingParserService.parse("briefing", "sk-test")
      ).rejects.toThrow(AGENT_ERROR_CODES.BRIEFING_PARSE_ERROR);
    });

    it("deve lancar erro quando response JSON invalido", async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [{ message: { content: "not json" } }],
      });

      await expect(
        BriefingParserService.parse("briefing", "sk-test")
      ).rejects.toThrow(AGENT_ERROR_CODES.BRIEFING_PARSE_ERROR);
    });

    it("deve lancar erro quando OpenAI falha", async () => {
      mockCreate.mockRejectedValueOnce(new Error("API Error"));

      await expect(
        BriefingParserService.parse("briefing", "sk-test")
      ).rejects.toThrow("API Error");
    });

    it("deve lancar erro no timeout (AbortError)", async () => {
      const abortError = new Error("aborted");
      abortError.name = "AbortError";
      mockCreate.mockRejectedValueOnce(abortError);

      await expect(
        BriefingParserService.parse("briefing", "sk-test")
      ).rejects.toThrow(AGENT_ERROR_CODES.BRIEFING_PARSE_ERROR);
    });

    it("deve aplicar defaults do schema Zod para campos ausentes", async () => {
      mockOpenAIResponse({
        technology: "AWS",
        location: null,
        companySize: null,
        industry: null,
        productMentioned: null,
      });

      const result = await BriefingParserService.parse("empresas com AWS", "sk-test");

      expect(result.briefing.jobTitles).toEqual([]);
      expect(result.briefing.mode).toBe("guided");
      expect(result.briefing.skipSteps).toEqual([]);
    });

    it("deve retornar skipSteps com search_companies quando OpenAI indica skip (AC: 17.10#1)", async () => {
      mockOpenAIResponse({
        technology: null,
        jobTitles: ["CTO", "Head de TI"],
        location: "Sao Paulo",
        companySize: null,
        industry: "fintech",
        productMentioned: null,
        mode: "guided",
        skipSteps: ["search_companies"],
      });

      const result = await BriefingParserService.parse(
        "Quero prospectar CTOs e Heads de TI de fintechs em SP",
        "sk-test"
      );

      expect(result.briefing.skipSteps).toEqual(["search_companies"]);
      expect(result.briefing.technology).toBeNull();
      expect(result.briefing.jobTitles).toEqual(["CTO", "Head de TI"]);
    });

    it("deve retornar skipSteps vazio quando tecnologia esta presente (AC: 17.10#1)", async () => {
      mockOpenAIResponse({
        technology: "Netskope",
        jobTitles: ["CISO"],
        location: null,
        companySize: null,
        industry: null,
        productMentioned: null,
        mode: "guided",
        skipSteps: [],
      });

      const result = await BriefingParserService.parse(
        "Quero prospectar CISOs de empresas que usam Netskope",
        "sk-test"
      );

      expect(result.briefing.skipSteps).toEqual([]);
      expect(result.briefing.technology).toBe("Netskope");
    });

    it("deve retornar skipSteps com search_companies para busca por industria e localizacao sem tech (AC: 17.10#1)", async () => {
      mockOpenAIResponse({
        technology: null,
        jobTitles: ["Diretor de Tecnologia"],
        location: "Brasil",
        companySize: "50-200",
        industry: "saude",
        productMentioned: null,
        mode: "guided",
        skipSteps: ["search_companies"],
      });

      const result = await BriefingParserService.parse(
        "Buscar diretores de tecnologia na area de saude no Brasil, empresas de 50 a 200 funcionarios",
        "sk-test"
      );

      expect(result.briefing.skipSteps).toEqual(["search_companies"]);
      expect(result.briefing.technology).toBeNull();
      expect(result.briefing.industry).toBe("saude");
      expect(result.briefing.location).toBe("Brasil");
      expect(result.briefing.companySize).toBe("50-200");
    });

    it("deve retornar skipSteps com search_companies e search_leads quando usuario tem leads proprios (AC: 17.11#1)", async () => {
      mockOpenAIResponse({
        technology: null,
        jobTitles: [],
        location: null,
        companySize: null,
        industry: null,
        productMentioned: null,
        mode: "guided",
        skipSteps: ["search_companies", "search_leads"],
      });

      const result = await BriefingParserService.parse(
        "Ja tenho meus leads, quero criar uma campanha para eles",
        "sk-test"
      );

      expect(result.briefing.skipSteps).toEqual(["search_companies", "search_leads"]);
      expect(result.briefing.jobTitles).toEqual([]);
    });

    it("deve retornar skipSteps com ambos steps quando usuario quer importar CSV de contatos (AC: 17.11#1)", async () => {
      mockOpenAIResponse({
        technology: null,
        jobTitles: [],
        location: null,
        companySize: null,
        industry: null,
        productMentioned: null,
        mode: "guided",
        skipSteps: ["search_companies", "search_leads"],
      });

      const result = await BriefingParserService.parse(
        "Quero importar meu CSV de contatos e enviar uma campanha",
        "sk-test"
      );

      expect(result.briefing.skipSteps).toEqual(["search_companies", "search_leads"]);
      expect(result.briefing.jobTitles).toEqual([]);
    });

    it("deve NAO incluir search_leads no skipSteps para busca normal (AC: 17.11#1)", async () => {
      mockOpenAIResponse({
        technology: null,
        jobTitles: ["CTO"],
        location: "Sao Paulo",
        companySize: null,
        industry: null,
        productMentioned: null,
        mode: "guided",
        skipSteps: ["search_companies"],
      });

      const result = await BriefingParserService.parse(
        "Buscar CTOs em SP",
        "sk-test"
      );

      expect(result.briefing.skipSteps).toEqual(["search_companies"]);
      expect(result.briefing.skipSteps).not.toContain("search_leads");
    });

    it("deve preservar productMentioned no rawResponse", async () => {
      mockOpenAIResponse({
        ...FULL_BRIEFING_RESPONSE,
        productMentioned: "CloudGuard",
      });

      const result = await BriefingParserService.parse(
        "prospectar quem usa nosso CloudGuard",
        "sk-test"
      );

      expect(result.rawResponse.productMentioned).toBe("CloudGuard");
      expect(result.briefing.productSlug).toBeNull();
    });
  });

  describe("briefingResponseSchema", () => {
    it("deve validar schema completo", () => {
      const result = briefingResponseSchema.safeParse(FULL_BRIEFING_RESPONSE);
      expect(result.success).toBe(true);
    });

    it("deve rejeitar schema com campos invalidos", () => {
      const result = briefingResponseSchema.safeParse({
        technology: 123,
        jobTitles: "invalid",
      });
      expect(result.success).toBe(false);
    });
  });
});
