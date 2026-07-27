/**
 * BriefingParserService Tests
 * Story 16.3 - AC: #1, #2
 *
 * Tests: parsing completo, parcial, sem dados, timeout, erro OpenAI
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { BriefingParserService, briefingResponseSchema } from "@/lib/agent/briefing-parser-service";
import { AGENT_ERROR_CODES } from "@/types/agent";
import type { ChatTurn } from "@/types/agent";

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
        // Story 22.5: campos de campanha default null quando o LLM nao os emite
        objective: null,
        urgency: null,
        campaignDescription: null,
        emailCount: null,
        // Story 22.15: idem para o segmento de destino em "Meus Leads"
        segmentName: null,
      });
      expect(result.rawResponse.productMentioned).toBeNull();
    });

    // Story 22.11 (Frente B, AC6/AC7): modelo gpt-5.4-mini via parser-config SSOT e request
    // compat-safe — a familia gpt-5 rejeita temperature custom, entao NAO enviamos temperature.
    it("deve usar gpt-5.4-mini com response_format json_object e SEM temperature (AC: #2 / 22.11 AC6)", async () => {
      mockOpenAIResponse(FULL_BRIEFING_RESPONSE);

      await BriefingParserService.parse("qualquer briefing", "sk-test");

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "gpt-5.4-mini",
          response_format: { type: "json_object" },
        }),
        expect.objectContaining({
          signal: expect.any(AbortSignal),
        })
      );
      // Compat gpt-5: temperature custom NAO deve ser enviada (so o default do modelo).
      const requestArg = mockCreate.mock.calls[0][0] as Record<string, unknown>;
      expect(requestArg).not.toHaveProperty("temperature");
    });

    it("deve instruir o parser a respeitar recusas e a correcao mais recente (Story 22.1 AC4)", async () => {
      mockOpenAIResponse({
        ...FULL_BRIEFING_RESPONSE,
        technology: null,
        skipSteps: ["search_companies"],
      });
      const history = "Quero CTOs que usam Netskope\nNao quero mais Netskope";

      await BriefingParserService.parse(history, "sk-test");

      const request = mockCreate.mock.calls[0][0] as {
        messages: Array<{ role: string; content: string }>;
      };
      const systemPrompt = request.messages.find((message) => message.role === "system")?.content;
      const userPrompt = request.messages.find((message) => message.role === "user")?.content;

      expect(systemPrompt).toContain("Mencoes negadas ou recusadas");
      expect(systemPrompt).toContain("a correcao mais recente prevalece");
      expect(systemPrompt).toContain("technology=null");
      expect(userPrompt).toBe(history);
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

    // ==============================================
    // Story 22.3: memoria real (historico estruturado) + intencao via LLM
    // ==============================================

    it("deve montar messages OpenAI a partir de historico estruturado: system + user/assistant/user (22.3)", async () => {
      mockOpenAIResponse(FULL_BRIEFING_RESPONSE);

      const history: ChatTurn[] = [
        { role: "user", content: "Quero prospectar CTOs" },
        { role: "agent", content: "Em qual localizacao voce quer focar?" },
        { role: "user", content: "Sao Paulo" },
      ];

      await BriefingParserService.parse(history, "sk-test");

      const request = mockCreate.mock.calls[0][0] as {
        messages: Array<{ role: string; content: string }>;
      };

      // system e sempre o primeiro item e e separado do historico (D4)
      expect(request.messages[0].role).toBe("system");
      // historico mapeado: user->user, agent->assistant, na ordem
      expect(request.messages.slice(1)).toEqual([
        { role: "user", content: "Quero prospectar CTOs" },
        { role: "assistant", content: "Em qual localizacao voce quer focar?" },
        { role: "user", content: "Sao Paulo" },
      ]);
    });

    it("deve aceitar string (back-compat) montando 1 user message apos o system (22.3)", async () => {
      mockOpenAIResponse(FULL_BRIEFING_RESPONSE);

      await BriefingParserService.parse("briefing simples", "sk-test");

      const request = mockCreate.mock.calls[0][0] as {
        messages: Array<{ role: string; content: string }>;
      };

      expect(request.messages[0].role).toBe("system");
      const userMessages = request.messages.filter((m) => m.role === "user");
      expect(userMessages).toHaveLength(1);
      expect(userMessages[0].content).toBe("briefing simples");
      // string nunca vira turno de assistant
      expect(request.messages.some((m) => m.role === "assistant")).toBe(false);
    });

    it("deve devolver nextAction e questionText do parse (22.3)", async () => {
      mockOpenAIResponse({
        ...FULL_BRIEFING_RESPONSE,
        nextAction: "confirm",
        questionText: "Confirma: CTO em Sao Paulo?",
      });

      const result = await BriefingParserService.parse("briefing", "sk-test");

      expect(result.nextAction).toBe("confirm");
      expect(result.questionText).toBe("Confirma: CTO em Sao Paulo?");
      // campos de conversa NAO vazam para o briefing (pipeline)
      expect(result.briefing).not.toHaveProperty("nextAction");
      expect(result.briefing).not.toHaveProperty("questionText");
    });

    it("deve aplicar defaults (ask/null) quando LLM omite nextAction/questionText (22.3)", async () => {
      mockOpenAIResponse(FULL_BRIEFING_RESPONSE); // sem nextAction/questionText

      const result = await BriefingParserService.parse("briefing", "sk-test");

      expect(result.nextAction).toBe("ask");
      expect(result.questionText).toBeNull();
    });

    it("deve lancar erro quando nextAction e invalido (22.3)", async () => {
      mockOpenAIResponse({
        ...FULL_BRIEFING_RESPONSE,
        nextAction: "banana",
      });

      await expect(
        BriefingParserService.parse("briefing", "sk-test")
      ).rejects.toThrow(AGENT_ERROR_CODES.BRIEFING_PARSE_ERROR);
    });

    // ==============================================
    // Story 22.5: metadados de campanha (objetivo/urgencia/descricao/emailCount)
    // ==============================================

    it("deve extrair os 4 campos de campanha quando o LLM os emite (22.5 AC2)", async () => {
      mockOpenAIResponse({
        ...FULL_BRIEFING_RESPONSE,
        objective: "REENGAGEMENT",
        urgency: "HIGH",
        campaignDescription: "Black Friday",
        emailCount: 3,
      });

      const result = await BriefingParserService.parse(
        "reengajar clientes, urgente, campanha Black Friday, 3 e-mails",
        "sk-test"
      );

      expect(result.briefing.objective).toBe("REENGAGEMENT");
      expect(result.briefing.urgency).toBe("HIGH");
      expect(result.briefing.campaignDescription).toBe("Black Friday");
      expect(result.briefing.emailCount).toBe(3);
    });

    it("deve default null nos 4 campos de campanha quando ausentes (22.5 AC3)", async () => {
      mockOpenAIResponse(FULL_BRIEFING_RESPONSE); // sem os campos de campanha

      const result = await BriefingParserService.parse("briefing simples", "sk-test");

      expect(result.briefing.objective).toBeNull();
      expect(result.briefing.urgency).toBeNull();
      expect(result.briefing.campaignDescription).toBeNull();
      expect(result.briefing.emailCount).toBeNull();
    });

    it("deve cair para null (fail-open) quando emailCount esta fora do range 1-10 (22.5)", async () => {
      // 0 e 11 sao invalidos (min 1, max 10) -> .catch(null) evita quebrar o parse inteiro
      mockOpenAIResponse({ ...FULL_BRIEFING_RESPONSE, emailCount: 0 });
      const zero = await BriefingParserService.parse("quero 0 e-mails", "sk-test");
      expect(zero.briefing.emailCount).toBeNull();

      mockOpenAIResponse({ ...FULL_BRIEFING_RESPONSE, emailCount: 11 });
      const eleven = await BriefingParserService.parse("quero 11 e-mails", "sk-test");
      expect(eleven.briefing.emailCount).toBeNull();
    });

    it("deve cair para null (fail-open) quando objective/urgency sao valores fora do enum (22.5)", async () => {
      mockOpenAIResponse({
        ...FULL_BRIEFING_RESPONSE,
        objective: "SOMETHING_ELSE",
        urgency: "SUPER_HIGH",
      });

      const result = await BriefingParserService.parse("briefing", "sk-test");

      // valor invalido nao quebra o parse — cai para null e o resto do briefing sobrevive
      expect(result.briefing.objective).toBeNull();
      expect(result.briefing.urgency).toBeNull();
      expect(result.briefing.jobTitles).toEqual(["CTO"]);
    });

    it("deve COAGIR emailCount emitido como string pelo LLM (22.5 - z.coerce)", async () => {
      // json_object as vezes devolve numeros como string; sem coercao a intencao do
      // usuario ("3 e-mails") seria descartada silenciosamente pelo .catch(null).
      mockOpenAIResponse({ ...FULL_BRIEFING_RESPONSE, emailCount: "3" });

      const result = await BriefingParserService.parse("quero 3 e-mails", "sk-test");

      expect(result.briefing.emailCount).toBe(3);
    });

    it("deve normalizar campaignDescription: whitespace-only -> null e string gigante -> null (22.5)", async () => {
      // whitespace-only nao deve virar nome "Campanha -   " nem linha em branco no resumo
      mockOpenAIResponse({ ...FULL_BRIEFING_RESPONSE, campaignDescription: "   " });
      const blank = await BriefingParserService.parse("briefing", "sk-test");
      expect(blank.briefing.campaignDescription).toBeNull();

      // acima de 200 chars (guarda de custo/injecao) cai para null via fail-open
      mockOpenAIResponse({ ...FULL_BRIEFING_RESPONSE, campaignDescription: "x".repeat(250) });
      const huge = await BriefingParserService.parse("briefing", "sk-test");
      expect(huge.briefing.campaignDescription).toBeNull();

      // valor normal e trimado
      mockOpenAIResponse({ ...FULL_BRIEFING_RESPONSE, campaignDescription: "  Black Friday  " });
      const ok = await BriefingParserService.parse("briefing", "sk-test");
      expect(ok.briefing.campaignDescription).toBe("Black Friday");
    });

    it("deve descrever os campos de campanha como OPCIONAIS no SYSTEM_PROMPT (22.5 NFR1)", async () => {
      mockOpenAIResponse(FULL_BRIEFING_RESPONSE);

      await BriefingParserService.parse("briefing", "sk-test");

      const request = mockCreate.mock.calls[0][0] as {
        messages: Array<{ role: string; content: string }>;
      };
      const systemPrompt = request.messages.find((m) => m.role === "system")?.content ?? "";

      expect(systemPrompt).toContain("CAMPOS OPCIONAIS DE CAMPANHA");
      // guardrail NFR1: nao alteram nextAction/skipSteps/busca
      expect(systemPrompt).toContain("NAO alteram nextAction, skipSteps");
    });

    // ==============================================
    // Story 22.15: segmentName (destino em "Meus Leads")
    // ==============================================

    it("deve extrair segmentName quando o usuario pede um segmento (22.15 AC2)", async () => {
      mockOpenAIResponse({ ...FULL_BRIEFING_RESPONSE, segmentName: "Teste Atibaia" });

      const result = await BriefingParserService.parse(
        "CTOs em SP, e coloca no segmento Teste Atibaia",
        "sk-test"
      );

      // Sem a linha na montagem campo-a-campo do ParsedBriefing, o campo sumiria aqui.
      expect(result.briefing.segmentName).toBe("Teste Atibaia");
    });

    it("deve default null em segmentName quando o usuario nao pede segmento (22.15)", async () => {
      mockOpenAIResponse(FULL_BRIEFING_RESPONSE);

      const result = await BriefingParserService.parse("briefing simples", "sk-test");

      expect(result.briefing.segmentName).toBeNull();
    });

    it("deve normalizar segmentName: trim, vazio -> null e > 100 chars -> null (22.15)", async () => {
      mockOpenAIResponse({ ...FULL_BRIEFING_RESPONSE, segmentName: "  Teste Atibaia  " });
      const trimmed = await BriefingParserService.parse("briefing", "sk-test");
      expect(trimmed.briefing.segmentName).toBe("Teste Atibaia");

      mockOpenAIResponse({ ...FULL_BRIEFING_RESPONSE, segmentName: "   " });
      const blank = await BriefingParserService.parse("briefing", "sk-test");
      expect(blank.briefing.segmentName).toBeNull();

      // segments.name e VARCHAR(100): acima disso cai para null (fail-open) em vez de
      // derrubar o parse inteiro.
      mockOpenAIResponse({ ...FULL_BRIEFING_RESPONSE, segmentName: "s".repeat(120) });
      const huge = await BriefingParserService.parse("briefing", "sk-test");
      expect(huge.briefing.segmentName).toBeNull();

      // valor nao-string tambem cai para null sem quebrar o resto do briefing
      mockOpenAIResponse({ ...FULL_BRIEFING_RESPONSE, segmentName: 42 });
      const wrongType = await BriefingParserService.parse("briefing", "sk-test");
      expect(wrongType.briefing.segmentName).toBeNull();
      expect(wrongType.briefing.jobTitles).toEqual(["CTO"]);
    });

    it("mede o teto do segmentName por CODE POINT, nao por unidade UTF-16 (22.15)", async () => {
      // 100 emojis = 100 caracteres para o VARCHAR(100), mas 200 unidades UTF-16. Com
      // `.max(100)` cru o nome seria reprovado e o `.catch(null)` descartaria o pedido do
      // usuario EM SILENCIO — a mesma falha "engolido" que a story existe para matar.
      const cabe = "🚀".repeat(100);
      expect(cabe.length).toBe(200);

      mockOpenAIResponse({ ...FULL_BRIEFING_RESPONSE, segmentName: cabe });
      const ok = await BriefingParserService.parse("briefing", "sk-test");
      expect(ok.briefing.segmentName).toBe(cabe);

      // 101 code points continua sendo reprovado (fail-open -> null)
      mockOpenAIResponse({ ...FULL_BRIEFING_RESPONSE, segmentName: "🚀".repeat(101) });
      const naoCabe = await BriefingParserService.parse("briefing", "sk-test");
      expect(naoCabe.briefing.segmentName).toBeNull();
    });

    it("SYSTEM_PROMPT ensina a distinguir segmentName de campaignDescription e a responder a pergunta (22.15)", async () => {
      mockOpenAIResponse(FULL_BRIEFING_RESPONSE);

      await BriefingParserService.parse("briefing", "sk-test");

      const request = mockCreate.mock.calls[0][0] as {
        messages: Array<{ role: string; content: string }>;
      };
      const systemPrompt = request.messages.find((m) => m.role === "system")?.content ?? "";

      expect(systemPrompt).toContain("segmentName");
      // extrair SO quando pedido
      expect(systemPrompt).toMatch(/Extraia SOMENTE quando o usuario pedir explicitamente um nome de segmento/);
      // nao confundir com a descricao da campanha
      expect(systemPrompt).toContain("NAO confunda com campaignDescription");
      // e responder afirmativamente citando o nome quando perguntado
      expect(systemPrompt).toMatch(/AFIRMATIVAMENTE/);
    });
  });

  describe("briefingResponseSchema", () => {
    it("deve validar schema completo", () => {
      const result = briefingResponseSchema.safeParse(FULL_BRIEFING_RESPONSE);
      expect(result.success).toBe(true);
    });

    it("deve normalizar location vazia ou composta so por espacos para null", () => {
      const result = briefingResponseSchema.parse({
        ...FULL_BRIEFING_RESPONSE,
        location: "   ",
      });

      expect(result.location).toBeNull();
    });

    it("deve remover espacos externos de location valida", () => {
      const result = briefingResponseSchema.parse({
        ...FULL_BRIEFING_RESPONSE,
        location: "  Sao Paulo  ",
      });

      expect(result.location).toBe("Sao Paulo");
    });

    it("deve rejeitar schema com campos invalidos", () => {
      const result = briefingResponseSchema.safeParse({
        technology: 123,
        jobTitles: "invalid",
      });
      expect(result.success).toBe(false);
    });

    it("deve aplicar defaults nextAction='ask' e questionText=null quando ausentes (22.3)", () => {
      const result = briefingResponseSchema.parse(FULL_BRIEFING_RESPONSE);

      expect(result.nextAction).toBe("ask");
      expect(result.questionText).toBeNull();
    });

    it("deve validar nextAction e questionText explicitos (22.3)", () => {
      const result = briefingResponseSchema.parse({
        ...FULL_BRIEFING_RESPONSE,
        nextAction: "proceed",
        questionText: "Pode mandar?",
      });

      expect(result.nextAction).toBe("proceed");
      expect(result.questionText).toBe("Pode mandar?");
    });

    it("deve rejeitar nextAction fora do enum (22.3)", () => {
      const result = briefingResponseSchema.safeParse({
        ...FULL_BRIEFING_RESPONSE,
        nextAction: "invalido",
      });

      expect(result.success).toBe(false);
    });
  });
});
