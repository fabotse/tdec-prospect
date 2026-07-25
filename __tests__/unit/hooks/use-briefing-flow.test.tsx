/**
 * useBriefingFlow Hook Tests
 * Story 16.3 - AC: #3, #4
 * Story 16.6 - AC: #1-#5 (Produto inline)
 *
 * Tests: estados, transicoes, confirmacao, correcao, perguntas guiadas, produto inline
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  useBriefingFlow,
  generateSmartQuestion,
  messageSignalsOwnLeads,
  isConfirmation,
} from "@/hooks/use-briefing-flow";
import {
  createMockFetch,
  mockJsonResponse,
  mockErrorResponse,
  restoreFetch,
} from "../../helpers/mock-fetch";

// ==============================================
// HELPERS
// ==============================================

const COMPLETE_PARSE_RESPONSE = {
  briefing: {
    technology: "Netskope",
    jobTitles: ["CTO"],
    location: "Sao Paulo",
    companySize: null,
    industry: "fintech",
    productSlug: null,
    mode: "guided",
    skipSteps: [],
  },
  missingFields: ["companySize"],
  isComplete: false,
  canProceed: true,
  suggestions: {},
  productMentioned: null,
};

const INCOMPLETE_PARSE_RESPONSE = {
  briefing: {
    technology: null,
    jobTitles: [],
    location: null,
    companySize: null,
    industry: "tecnologia",
    productSlug: null,
    mode: "guided",
    skipSteps: [],
  },
  // Story 22.1: location e agora campo obrigatorio -> entra em missingFields quando null
  missingFields: ["technology", "jobTitles", "location"],
  isComplete: false,
  canProceed: false,
  suggestions: {
    jobTitles: ["CTO", "VP Engineering", "Head de Produto", "CPO"],
    technology: ["AWS", "Azure", "GCP", "Datadog"],
  },
  productMentioned: null,
};

const COMPLETE_WITH_PRODUCT_NOT_FOUND = {
  briefing: {
    technology: "Netskope",
    jobTitles: ["CTO"],
    location: "Sao Paulo",
    companySize: null,
    industry: "fintech",
    productSlug: null,
    mode: "guided",
    skipSteps: [],
  },
  missingFields: ["companySize"],
  isComplete: false,
  canProceed: true,
  suggestions: {},
  productMentioned: "TDEC Analytics",
};

const COMPLETE_WITH_PRODUCT_FOUND = {
  briefing: {
    technology: "Netskope",
    jobTitles: ["CTO"],
    location: "Sao Paulo",
    companySize: null,
    industry: "fintech",
    productSlug: "prod-123",
    mode: "guided",
    skipSteps: [],
  },
  missingFields: ["companySize"],
  isComplete: false,
  canProceed: true,
  suggestions: {},
  productMentioned: "TDEC Analytics",
};

// Story 22.4: a DECISAO em awaiting_product_decision agora consulta o LLM (/parse) em vez
// de casar keywords locais. Estas respostas simulam a classificacao da intencao no 2o /parse:
// register_product = usuario aceitou cadastrar; confirm = seguiu sem produto.
const PRODUCT_DECISION_REGISTER = {
  ...COMPLETE_WITH_PRODUCT_NOT_FOUND,
  nextAction: "register_product",
};

// Story 22.4: troca o mock de /parse para a proxima chamada devolver register_product
// (usuario aceitou o cadastro em awaiting_product_decision).
function swapParseToRegisterProduct() {
  restoreFetch();
  createMockFetch([
    {
      url: /\/api\/agent\/briefing\/parse$/,
      method: "POST",
      response: mockJsonResponse(PRODUCT_DECISION_REGISTER),
    },
  ]);
}

// Story 22.4: forca o proximo /parse a FALHAR (fail-open, AC5) — o handler cai no
// desempate por keyword no catch.
function swapParseToFailure() {
  restoreFetch();
  createMockFetch([
    {
      url: /\/api\/agent\/briefing\/parse$/,
      method: "POST",
      response: mockErrorResponse(500, "parse indisponivel"),
    },
  ]);
}

const EXTRACTED_PRODUCT = {
  name: "TDEC Analytics",
  description: "Plataforma de analytics",
  features: "Dashboard",
  differentials: null,
  targetAudience: "Vendas B2B",
};

const EXEC_ID = "550e8400-e29b-41d4-a716-446655440000";
const mockSendAgentMessage = vi.fn().mockResolvedValue(undefined);

// ==============================================
// TESTS
// ==============================================

describe("useBriefingFlow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    restoreFetch();
  });

  it("deve iniciar com status idle", () => {
    const { result } = renderHook(() => useBriefingFlow());

    expect(result.current.state.status).toBe("idle");
    expect(result.current.state.briefing).toBeNull();
    expect(result.current.state.isComplete).toBe(false);
  });

  it("deve transicionar para confirming quando briefing completo (AC: #4)", async () => {
    createMockFetch([
      {
        url: /\/api\/agent\/briefing\/parse$/,
        method: "POST",
        response: mockJsonResponse(COMPLETE_PARSE_RESPONSE),
      },
    ]);

    const { result } = renderHook(() => useBriefingFlow());

    await act(async () => {
      await result.current.processMessage(
        "Quero prospectar CTOs de fintechs em SP que usam Netskope",
        EXEC_ID,
        mockSendAgentMessage
      );
    });

    expect(result.current.state.status).toBe("confirming");
    expect(result.current.state.briefing?.technology).toBe("Netskope");
    expect(result.current.state.isComplete).toBe(false);
    expect(mockSendAgentMessage).toHaveBeenCalledWith(
      EXEC_ID,
      expect.stringContaining("Netskope")
    );
  });

  it("deve transicionar para awaiting_fields quando briefing incompleto (AC: #3)", async () => {
    createMockFetch([
      {
        url: /\/api\/agent\/briefing\/parse$/,
        method: "POST",
        response: mockJsonResponse(INCOMPLETE_PARSE_RESPONSE),
      },
    ]);

    const { result } = renderHook(() => useBriefingFlow());

    await act(async () => {
      await result.current.processMessage(
        "Quero prospectar empresas de tecnologia",
        EXEC_ID,
        mockSendAgentMessage
      );
    });

    expect(result.current.state.status).toBe("awaiting_fields");
    expect(result.current.state.missingFields).toContain("location");
    // Story 22.1: agente pergunta cargo + localizacao, NUNCA tecnologia como exigencia
    expect(mockSendAgentMessage).toHaveBeenCalledWith(
      EXEC_ID,
      expect.stringContaining("localizacao")
    );
    const askMsg = mockSendAgentMessage.mock.calls[0][1] as string;
    expect(askMsg).not.toContain("tecnologias comuns");
  });

  it("deve gerar perguntas inteligentes com sugestoes para campos faltantes (AC: #3, 17.8)", async () => {
    createMockFetch([
      {
        url: /\/api\/agent\/briefing\/parse$/,
        method: "POST",
        response: mockJsonResponse(INCOMPLETE_PARSE_RESPONSE),
      },
    ]);

    const { result } = renderHook(() => useBriefingFlow());

    await act(async () => {
      await result.current.processMessage(
        "Quero prospectar empresas de tecnologia",
        EXEC_ID,
        mockSendAgentMessage
      );
    });

    const agentMsg = mockSendAgentMessage.mock.calls[0][1] as string;
    // Story 22.1: perguntas cobrem cargo + localizacao (com sugestoes de cargo inline)
    expect(agentMsg).toContain("cargos comuns");
    expect(agentMsg).toContain("localizacao");
    expect(agentMsg).not.toContain("tecnologias comuns no setor");
  });

  it("deve re-parsear com contexto acumulado quando usuario responde (AC: #3)", async () => {
    createMockFetch([
      {
        url: /\/api\/agent\/briefing\/parse$/,
        method: "POST",
        response: mockJsonResponse(INCOMPLETE_PARSE_RESPONSE),
      },
    ]);

    const { result } = renderHook(() => useBriefingFlow());

    // First message — incomplete
    await act(async () => {
      await result.current.processMessage(
        "Quero prospectar empresas de tecnologia",
        EXEC_ID,
        mockSendAgentMessage
      );
    });

    // Setup response for second call
    restoreFetch();
    createMockFetch([
      {
        url: /\/api\/agent\/briefing\/parse$/,
        method: "POST",
        response: mockJsonResponse(COMPLETE_PARSE_RESPONSE),
      },
    ]);

    // User responds with missing info
    await act(async () => {
      await result.current.processMessage(
        "Netskope, CTOs",
        EXEC_ID,
        mockSendAgentMessage
      );
    });

    expect(result.current.state.status).toBe("confirming");
    expect(result.current.state.briefing?.technology).toBe("Netskope");
  });

  it("deve confirmar briefing quando usuario diz 'sim' (AC: #4)", async () => {
    // Story 22.3: confirmacao passa pelo LLM -> nextAction "proceed" confirma.
    createMockFetch([
      {
        url: /\/api\/agent\/briefing\/parse$/,
        method: "POST",
        response: mockJsonResponse({ ...COMPLETE_PARSE_RESPONSE, nextAction: "proceed" }),
      },
    ]);

    const { result } = renderHook(() => useBriefingFlow());

    await act(async () => {
      await result.current.processMessage(
        "Quero prospectar CTOs de fintechs em SP que usam Netskope",
        EXEC_ID,
        mockSendAgentMessage
      );
    });

    let outcome: { handled: boolean; confirmed?: boolean } | undefined;
    await act(async () => {
      outcome = await result.current.processMessage(
        "sim",
        EXEC_ID,
        mockSendAgentMessage
      );
    });

    expect(result.current.state.status).toBe("confirmed");
    expect(outcome?.confirmed).toBe(true);
  });

  it("deve aceitar variantes de confirmacao (AC: #4)", async () => {
    const confirmations = ["ok", "pode ir", "confirmo", "perfeito", "bora"];

    for (const keyword of confirmations) {
      // Story 22.3: o LLM devolve "proceed" diante do resumo -> confirma.
      createMockFetch([
        {
          url: /\/api\/agent\/briefing\/parse$/,
          method: "POST",
          response: mockJsonResponse({ ...COMPLETE_PARSE_RESPONSE, nextAction: "proceed" }),
        },
      ]);

      const { result } = renderHook(() => useBriefingFlow());

      await act(async () => {
        await result.current.processMessage("briefing", EXEC_ID, mockSendAgentMessage);
      });

      await act(async () => {
        const r = await result.current.processMessage(keyword, EXEC_ID, mockSendAgentMessage);
        expect(r.confirmed).toBe(true);
      });

      restoreFetch();
    }
  });

  it("deve re-parsear quando usuario corrige no estado confirming (AC: #4)", async () => {
    createMockFetch([
      {
        url: /\/api\/agent\/briefing\/parse$/,
        method: "POST",
        response: mockJsonResponse(COMPLETE_PARSE_RESPONSE),
      },
    ]);

    const { result } = renderHook(() => useBriefingFlow());

    await act(async () => {
      await result.current.processMessage("briefing", EXEC_ID, mockSendAgentMessage);
    });

    expect(result.current.state.status).toBe("confirming");

    // User corrects
    restoreFetch();
    const correctedResponse = {
      ...COMPLETE_PARSE_RESPONSE,
      briefing: { ...COMPLETE_PARSE_RESPONSE.briefing, technology: "AWS" },
    };
    createMockFetch([
      {
        url: /\/api\/agent\/briefing\/parse$/,
        method: "POST",
        response: mockJsonResponse(correctedResponse),
      },
    ]);

    await act(async () => {
      await result.current.processMessage(
        "Na verdade, quero AWS, nao Netskope",
        EXEC_ID,
        mockSendAgentMessage
      );
    });

    expect(result.current.state.status).toBe("confirming");
    expect(result.current.state.briefing?.technology).toBe("AWS");
  });

  it("deve retornar handled false quando API falha no idle", async () => {
    createMockFetch([
      {
        url: /\/api\/agent\/briefing\/parse$/,
        method: "POST",
        response: mockErrorResponse(500, "Server Error"),
      },
    ]);

    const { result } = renderHook(() => useBriefingFlow());

    let outcome: { handled: boolean } | undefined;
    await act(async () => {
      outcome = await result.current.processMessage(
        "briefing",
        EXEC_ID,
        mockSendAgentMessage
      );
    });

    expect(outcome?.handled).toBe(false);
    expect(result.current.state.status).toBe("idle");
  });

  it("deve resetar o estado", async () => {
    createMockFetch([
      {
        url: /\/api\/agent\/briefing\/parse$/,
        method: "POST",
        response: mockJsonResponse(COMPLETE_PARSE_RESPONSE),
      },
    ]);

    const { result } = renderHook(() => useBriefingFlow());

    await act(async () => {
      await result.current.processMessage("briefing", EXEC_ID, mockSendAgentMessage);
    });

    expect(result.current.state.status).toBe("confirming");

    act(() => {
      result.current.reset();
    });

    expect(result.current.state.status).toBe("idle");
    expect(result.current.state.briefing).toBeNull();
  });

  it("nao deve tratar mensagem quando status e confirmed", async () => {
    createMockFetch([
      {
        url: /\/api\/agent\/briefing\/parse$/,
        method: "POST",
        response: mockJsonResponse({ ...COMPLETE_PARSE_RESPONSE, nextAction: "proceed" }),
      },
    ]);

    const { result } = renderHook(() => useBriefingFlow());

    await act(async () => {
      await result.current.processMessage("briefing", EXEC_ID, mockSendAgentMessage);
    });
    await act(async () => {
      await result.current.processMessage("sim", EXEC_ID, mockSendAgentMessage);
    });

    expect(result.current.state.status).toBe("confirmed");

    let outcome: { handled: boolean } | undefined;
    await act(async () => {
      outcome = await result.current.processMessage(
        "outra mensagem",
        EXEC_ID,
        mockSendAgentMessage
      );
    });

    expect(outcome?.handled).toBe(false);
  });

  // ==============================================
  // PRODUCT INLINE FLOW (Story 16.6)
  // ==============================================

  describe("Produto inline (Story 16.6)", () => {
    it("deve ir para awaiting_product_decision quando produto mencionado mas nao encontrado (AC: #1)", async () => {
      createMockFetch([
        {
          url: /\/api\/agent\/briefing\/parse$/,
          method: "POST",
          response: mockJsonResponse(COMPLETE_WITH_PRODUCT_NOT_FOUND),
        },
      ]);

      const { result } = renderHook(() => useBriefingFlow());

      await act(async () => {
        await result.current.processMessage(
          "Quero prospectar pro TDEC Analytics",
          EXEC_ID,
          mockSendAgentMessage
        );
      });

      expect(result.current.state.status).toBe("awaiting_product_decision");
      expect(result.current.state.productMentioned).toBe("TDEC Analytics");
      expect(mockSendAgentMessage).toHaveBeenCalledWith(
        EXEC_ID,
        expect.stringContaining("Nao encontrei o produto 'TDEC Analytics'")
      );
    });

    it("deve ir para confirming normalmente quando produto encontrado", async () => {
      createMockFetch([
        {
          url: /\/api\/agent\/briefing\/parse$/,
          method: "POST",
          response: mockJsonResponse(COMPLETE_WITH_PRODUCT_FOUND),
        },
      ]);

      const { result } = renderHook(() => useBriefingFlow());

      await act(async () => {
        await result.current.processMessage(
          "Quero prospectar pro TDEC Analytics",
          EXEC_ID,
          mockSendAgentMessage
        );
      });

      expect(result.current.state.status).toBe("confirming");
      expect(result.current.state.briefing?.productSlug).toBe("prod-123");
    });

    it("deve ir para awaiting_product_details quando usuario aceita cadastrar (AC: #2)", async () => {
      createMockFetch([
        {
          url: /\/api\/agent\/briefing\/parse$/,
          method: "POST",
          response: mockJsonResponse(COMPLETE_WITH_PRODUCT_NOT_FOUND),
        },
      ]);

      const { result } = renderHook(() => useBriefingFlow());

      await act(async () => {
        await result.current.processMessage(
          "Quero prospectar pro TDEC Analytics",
          EXEC_ID,
          mockSendAgentMessage
        );
      });

      // Story 22.4: a decisao "sim" agora e classificada pelo LLM (nextAction).
      swapParseToRegisterProduct();
      mockSendAgentMessage.mockClear();

      await act(async () => {
        await result.current.processMessage("sim", EXEC_ID, mockSendAgentMessage);
      });

      expect(result.current.state.status).toBe("awaiting_product_details");
      expect(mockSendAgentMessage).toHaveBeenCalledWith(
        EXEC_ID,
        expect.stringContaining("Me descreva o produto em linguagem natural")
      );
    });

    it("deve ir para confirming sem produto quando usuario rejeita cadastrar (AC: #5)", async () => {
      createMockFetch([
        {
          url: /\/api\/agent\/briefing\/parse$/,
          method: "POST",
          response: mockJsonResponse(COMPLETE_WITH_PRODUCT_NOT_FOUND),
        },
      ]);

      const { result } = renderHook(() => useBriefingFlow());

      await act(async () => {
        await result.current.processMessage(
          "Quero prospectar pro TDEC Analytics",
          EXEC_ID,
          mockSendAgentMessage
        );
      });

      mockSendAgentMessage.mockClear();

      await act(async () => {
        await result.current.processMessage("nao", EXEC_ID, mockSendAgentMessage);
      });

      expect(result.current.state.status).toBe("confirming");
      expect(result.current.state.productMentioned).toBeNull();
      expect(mockSendAgentMessage).toHaveBeenCalledWith(
        EXEC_ID,
        expect.stringContaining("Confirma esses parametros?")
      );
    });

    it("deve pedir clarificacao quando resposta ambigua em awaiting_product_decision", async () => {
      createMockFetch([
        {
          url: /\/api\/agent\/briefing\/parse$/,
          method: "POST",
          response: mockJsonResponse(COMPLETE_WITH_PRODUCT_NOT_FOUND),
        },
      ]);

      const { result } = renderHook(() => useBriefingFlow());

      await act(async () => {
        await result.current.processMessage(
          "Quero prospectar pro TDEC Analytics",
          EXEC_ID,
          mockSendAgentMessage
        );
      });

      // Story 22.4: com o /parse indisponivel (fail-open, AC5), "talvez" nao casa keyword
      // de confirmacao nem de rejeicao -> ambiguo -> reapresenta a oferta.
      swapParseToFailure();
      mockSendAgentMessage.mockClear();

      await act(async () => {
        await result.current.processMessage(
          "talvez",
          EXEC_ID,
          mockSendAgentMessage
        );
      });

      expect(result.current.state.status).toBe("awaiting_product_decision");
      expect(mockSendAgentMessage).toHaveBeenCalledWith(
        EXEC_ID,
        expect.stringContaining("Responda 'sim' para cadastrar ou 'nao'")
      );
    });

    it("deve ir para confirming_product quando usuario fornece detalhes (AC: #2)", async () => {
      createMockFetch([
        {
          url: /\/api\/agent\/briefing\/parse$/,
          method: "POST",
          response: mockJsonResponse(COMPLETE_WITH_PRODUCT_NOT_FOUND),
        },
      ]);

      const { result } = renderHook(() => useBriefingFlow());

      // Step 1: Initial message with product not found
      await act(async () => {
        await result.current.processMessage(
          "Quero prospectar pro TDEC Analytics",
          EXEC_ID,
          mockSendAgentMessage
        );
      });

      // Step 2: Accept registration (Story 22.4: decisao via LLM/nextAction)
      swapParseToRegisterProduct();
      await act(async () => {
        await result.current.processMessage("sim", EXEC_ID, mockSendAgentMessage);
      });

      // Step 3: Setup parse-product response and provide details
      restoreFetch();
      createMockFetch([
        {
          url: /\/api\/agent\/briefing\/parse-product/,
          method: "POST",
          response: mockJsonResponse({ product: EXTRACTED_PRODUCT }),
        },
      ]);

      mockSendAgentMessage.mockClear();

      await act(async () => {
        await result.current.processMessage(
          "E uma plataforma de analytics para vendas B2B",
          EXEC_ID,
          mockSendAgentMessage
        );
      });

      expect(result.current.state.status).toBe("confirming_product");
      expect(result.current.state.pendingProduct).toEqual(EXTRACTED_PRODUCT);
      expect(mockSendAgentMessage).toHaveBeenCalledWith(
        EXEC_ID,
        expect.stringContaining("Cadastrei o TDEC Analytics")
      );
    });

    it("deve permanecer em awaiting_product_details quando parse-product falha", async () => {
      createMockFetch([
        {
          url: /\/api\/agent\/briefing\/parse$/,
          method: "POST",
          response: mockJsonResponse(COMPLETE_WITH_PRODUCT_NOT_FOUND),
        },
      ]);

      const { result } = renderHook(() => useBriefingFlow());

      await act(async () => {
        await result.current.processMessage(
          "Quero prospectar pro TDEC Analytics",
          EXEC_ID,
          mockSendAgentMessage
        );
      });

      // Story 22.4: "sim" em awaiting_product_decision agora e classificado pelo LLM.
      swapParseToRegisterProduct();
      await act(async () => {
        await result.current.processMessage("sim", EXEC_ID, mockSendAgentMessage);
      });

      restoreFetch();
      createMockFetch([
        {
          url: /\/api\/agent\/briefing\/parse-product/,
          method: "POST",
          response: mockErrorResponse(500, "Parse failed"),
        },
      ]);

      mockSendAgentMessage.mockClear();

      await act(async () => {
        await result.current.processMessage(
          "descricao do produto",
          EXEC_ID,
          mockSendAgentMessage
        );
      });

      expect(result.current.state.status).toBe("awaiting_product_details");
      expect(mockSendAgentMessage).toHaveBeenCalledWith(
        EXEC_ID,
        expect.stringContaining("Nao consegui extrair os dados")
      );
    });

    it("deve criar produto e atualizar briefing quando usuario confirma produto (AC: #3)", async () => {
      createMockFetch([
        {
          url: /\/api\/agent\/briefing\/parse$/,
          method: "POST",
          response: mockJsonResponse(COMPLETE_WITH_PRODUCT_NOT_FOUND),
        },
      ]);

      const mockCreateProduct = vi.fn().mockResolvedValue("new-prod-id");
      const { result } = renderHook(() => useBriefingFlow());

      // Step 1: Product not found
      await act(async () => {
        await result.current.processMessage(
          "Quero prospectar pro TDEC Analytics",
          EXEC_ID,
          mockSendAgentMessage
        );
      });

      // Step 2: Accept registration (Story 22.4: decisao via LLM/nextAction)
      swapParseToRegisterProduct();
      await act(async () => {
        await result.current.processMessage("sim", EXEC_ID, mockSendAgentMessage);
      });

      // Step 3: Provide details
      restoreFetch();
      createMockFetch([
        {
          url: /\/api\/agent\/briefing\/parse-product/,
          method: "POST",
          response: mockJsonResponse({ product: EXTRACTED_PRODUCT }),
        },
      ]);

      await act(async () => {
        await result.current.processMessage(
          "Plataforma de analytics",
          EXEC_ID,
          mockSendAgentMessage
        );
      });

      // Step 4: Confirm product
      mockSendAgentMessage.mockClear();

      await act(async () => {
        await result.current.processMessage(
          "sim",
          EXEC_ID,
          mockSendAgentMessage,
          mockCreateProduct
        );
      });

      expect(mockCreateProduct).toHaveBeenCalledWith(EXTRACTED_PRODUCT);
      expect(result.current.state.status).toBe("confirming");
      expect(result.current.state.briefing?.productSlug).toBe("new-prod-id");
      expect(result.current.state.pendingProduct).toBeNull();
      expect(mockSendAgentMessage).toHaveBeenCalledWith(
        EXEC_ID,
        expect.stringContaining("Produto cadastrado!")
      );
    });

    it("deve ir para awaiting_product_decision quando criacao de produto falha (AC: #3)", async () => {
      createMockFetch([
        {
          url: /\/api\/agent\/briefing\/parse$/,
          method: "POST",
          response: mockJsonResponse(COMPLETE_WITH_PRODUCT_NOT_FOUND),
        },
      ]);

      const mockCreateProduct = vi.fn().mockResolvedValue(null);
      const { result } = renderHook(() => useBriefingFlow());

      await act(async () => {
        await result.current.processMessage(
          "Quero prospectar pro TDEC Analytics",
          EXEC_ID,
          mockSendAgentMessage
        );
      });

      // Story 22.4: "sim" em awaiting_product_decision agora e classificado pelo LLM.
      swapParseToRegisterProduct();
      await act(async () => {
        await result.current.processMessage("sim", EXEC_ID, mockSendAgentMessage);
      });

      restoreFetch();
      createMockFetch([
        {
          url: /\/api\/agent\/briefing\/parse-product/,
          method: "POST",
          response: mockJsonResponse({ product: EXTRACTED_PRODUCT }),
        },
      ]);

      await act(async () => {
        await result.current.processMessage(
          "Plataforma de analytics",
          EXEC_ID,
          mockSendAgentMessage
        );
      });

      mockSendAgentMessage.mockClear();

      await act(async () => {
        await result.current.processMessage(
          "sim",
          EXEC_ID,
          mockSendAgentMessage,
          mockCreateProduct
        );
      });

      expect(result.current.state.status).toBe("awaiting_product_decision");
      expect(mockSendAgentMessage).toHaveBeenCalledWith(
        EXEC_ID,
        expect.stringContaining("Erro ao cadastrar produto")
      );
    });

    it("deve voltar para awaiting_product_details quando usuario rejeita produto extraido", async () => {
      createMockFetch([
        {
          url: /\/api\/agent\/briefing\/parse$/,
          method: "POST",
          response: mockJsonResponse(COMPLETE_WITH_PRODUCT_NOT_FOUND),
        },
      ]);

      const { result } = renderHook(() => useBriefingFlow());

      await act(async () => {
        await result.current.processMessage(
          "Quero prospectar pro TDEC Analytics",
          EXEC_ID,
          mockSendAgentMessage
        );
      });

      // Story 22.4: "sim" em awaiting_product_decision agora e classificado pelo LLM.
      swapParseToRegisterProduct();
      await act(async () => {
        await result.current.processMessage("sim", EXEC_ID, mockSendAgentMessage);
      });

      restoreFetch();
      createMockFetch([
        {
          url: /\/api\/agent\/briefing\/parse-product/,
          method: "POST",
          response: mockJsonResponse({ product: EXTRACTED_PRODUCT }),
        },
      ]);

      await act(async () => {
        await result.current.processMessage(
          "Plataforma de analytics",
          EXEC_ID,
          mockSendAgentMessage
        );
      });

      mockSendAgentMessage.mockClear();

      await act(async () => {
        await result.current.processMessage("nao", EXEC_ID, mockSendAgentMessage);
      });

      expect(result.current.state.status).toBe("awaiting_product_details");
      expect(result.current.state.pendingProduct).toBeNull();
      expect(mockSendAgentMessage).toHaveBeenCalledWith(
        EXEC_ID,
        expect.stringContaining("me descreva o produto novamente")
      );
    });

    it("deve resolver campos faltantes antes de checar produto (briefing incompleto + produto mencionado)", async () => {
      const incompleteWithProduct = {
        briefing: {
          technology: null,
          jobTitles: [],
          location: "Sao Paulo",
          companySize: null,
          industry: "fintech",
          productSlug: null,
          mode: "guided",
          skipSteps: [],
        },
        missingFields: ["technology", "jobTitles"],
        isComplete: false,
        canProceed: false,
        suggestions: {
          jobTitles: ["CTO", "CPO"],
          technology: ["Stripe", "Plaid"],
        },
        productMentioned: "TDEC Analytics",
      };

      createMockFetch([
        {
          url: /\/api\/agent\/briefing\/parse$/,
          method: "POST",
          response: mockJsonResponse(incompleteWithProduct),
        },
      ]);

      const { result } = renderHook(() => useBriefingFlow());

      await act(async () => {
        await result.current.processMessage(
          "Quero prospectar pro TDEC Analytics em SP",
          EXEC_ID,
          mockSendAgentMessage
        );
      });

      // Should ask for missing fields first, NOT jump to product decision
      expect(result.current.state.status).toBe("awaiting_fields");
      expect(result.current.state.missingFields).toContain("jobTitles");
      // Story 22.1: location ja presente -> agente pergunta cargo (nao tecnologia)
      expect(mockSendAgentMessage).toHaveBeenCalledWith(
        EXEC_ID,
        expect.stringContaining("cargos comuns")
      );

      // Now provide missing fields — briefing completes with product not found
      restoreFetch();
      createMockFetch([
        {
          url: /\/api\/agent\/briefing\/parse$/,
          method: "POST",
          response: mockJsonResponse(COMPLETE_WITH_PRODUCT_NOT_FOUND),
        },
      ]);

      mockSendAgentMessage.mockClear();

      await act(async () => {
        await result.current.processMessage(
          "Netskope, CTOs",
          EXEC_ID,
          mockSendAgentMessage
        );
      });

      // NOW should go to product decision
      expect(result.current.state.status).toBe("awaiting_product_decision");
      expect(mockSendAgentMessage).toHaveBeenCalledWith(
        EXEC_ID,
        expect.stringContaining("Nao encontrei o produto 'TDEC Analytics'")
      );
    });

    it("deve tratar conflito de keywords: 'nao pode' como ambiguo, nao como confirmacao", async () => {
      createMockFetch([
        {
          url: /\/api\/agent\/briefing\/parse$/,
          method: "POST",
          response: mockJsonResponse(COMPLETE_WITH_PRODUCT_NOT_FOUND),
        },
      ]);

      const { result } = renderHook(() => useBriefingFlow());

      await act(async () => {
        await result.current.processMessage(
          "Quero prospectar pro TDEC Analytics",
          EXEC_ID,
          mockSendAgentMessage
        );
      });

      // Story 22.4: com /parse indisponivel (fail-open, AC5), o desempate por keyword roda
      // no catch — "nao pode" tem "nao" (rejeicao) e "pode" (confirmacao) -> ambiguo.
      swapParseToFailure();
      mockSendAgentMessage.mockClear();

      // "nao pode" contains both "nao" (rejection) and "pode" (confirmation) — should be ambiguous
      await act(async () => {
        await result.current.processMessage("nao pode", EXEC_ID, mockSendAgentMessage);
      });

      expect(result.current.state.status).toBe("awaiting_product_decision");
      expect(mockSendAgentMessage).toHaveBeenCalledWith(
        EXEC_ID,
        expect.stringContaining("Responda 'sim' para cadastrar ou 'nao'")
      );
    });

    it("deve tratar ambiguidade em confirming_product", async () => {
      createMockFetch([
        {
          url: /\/api\/agent\/briefing\/parse$/,
          method: "POST",
          response: mockJsonResponse(COMPLETE_WITH_PRODUCT_NOT_FOUND),
        },
      ]);

      const { result } = renderHook(() => useBriefingFlow());

      await act(async () => {
        await result.current.processMessage(
          "Quero prospectar pro TDEC Analytics",
          EXEC_ID,
          mockSendAgentMessage
        );
      });

      // Story 22.4: "sim" em awaiting_product_decision agora e classificado pelo LLM.
      swapParseToRegisterProduct();
      await act(async () => {
        await result.current.processMessage("sim", EXEC_ID, mockSendAgentMessage);
      });

      restoreFetch();
      createMockFetch([
        {
          url: /\/api\/agent\/briefing\/parse-product/,
          method: "POST",
          response: mockJsonResponse({ product: EXTRACTED_PRODUCT }),
        },
      ]);

      await act(async () => {
        await result.current.processMessage(
          "Plataforma de analytics",
          EXEC_ID,
          mockSendAgentMessage
        );
      });

      expect(result.current.state.status).toBe("confirming_product");
      mockSendAgentMessage.mockClear();

      // Ambiguous input — neither clearly confirm nor reject
      await act(async () => {
        await result.current.processMessage("hmm talvez", EXEC_ID, mockSendAgentMessage);
      });

      expect(result.current.state.status).toBe("confirming_product");
      expect(mockSendAgentMessage).toHaveBeenCalledWith(
        EXEC_ID,
        expect.stringContaining("Responda 'sim' para confirmar ou 'nao'")
      );
    });

    it("deve resetar campos de produto no reset", async () => {
      createMockFetch([
        {
          url: /\/api\/agent\/briefing\/parse$/,
          method: "POST",
          response: mockJsonResponse(COMPLETE_WITH_PRODUCT_NOT_FOUND),
        },
      ]);

      const { result } = renderHook(() => useBriefingFlow());

      await act(async () => {
        await result.current.processMessage(
          "Quero prospectar pro TDEC Analytics",
          EXEC_ID,
          mockSendAgentMessage
        );
      });

      expect(result.current.state.productMentioned).toBe("TDEC Analytics");

      act(() => {
        result.current.reset();
      });

      expect(result.current.state.productMentioned).toBeNull();
      expect(result.current.state.pendingProduct).toBeNull();
      expect(result.current.state.status).toBe("idle");
    });

    it("fluxo completo: briefing → produto → confirmacao (AC: #4)", async () => {
      const mockCreateProduct = vi.fn().mockResolvedValue("new-prod-id");

      createMockFetch([
        {
          url: /\/api\/agent\/briefing\/parse$/,
          method: "POST",
          response: mockJsonResponse(COMPLETE_WITH_PRODUCT_NOT_FOUND),
        },
      ]);

      const { result } = renderHook(() => useBriefingFlow());

      // 1. Initial briefing — product not found
      await act(async () => {
        await result.current.processMessage(
          "Quero prospectar pro TDEC Analytics",
          EXEC_ID,
          mockSendAgentMessage
        );
      });
      expect(result.current.state.status).toBe("awaiting_product_decision");

      // 2. Accept product registration (Story 22.4: decisao via LLM/nextAction)
      swapParseToRegisterProduct();
      await act(async () => {
        await result.current.processMessage("sim", EXEC_ID, mockSendAgentMessage);
      });
      expect(result.current.state.status).toBe("awaiting_product_details");

      // 3. Provide product details
      restoreFetch();
      createMockFetch([
        {
          url: /\/api\/agent\/briefing\/parse-product/,
          method: "POST",
          response: mockJsonResponse({ product: EXTRACTED_PRODUCT }),
        },
      ]);

      await act(async () => {
        await result.current.processMessage(
          "Plataforma de analytics para vendas B2B",
          EXEC_ID,
          mockSendAgentMessage
        );
      });
      expect(result.current.state.status).toBe("confirming_product");

      // 4. Confirm product
      await act(async () => {
        await result.current.processMessage(
          "sim",
          EXEC_ID,
          mockSendAgentMessage,
          mockCreateProduct
        );
      });
      expect(result.current.state.status).toBe("confirming");
      expect(result.current.state.briefing?.productSlug).toBe("new-prod-id");

      // 5. Confirm briefing
      let outcome: { handled: boolean; confirmed?: boolean } | undefined;
      await act(async () => {
        outcome = await result.current.processMessage(
          "sim",
          EXEC_ID,
          mockSendAgentMessage
        );
      });
      expect(result.current.state.status).toBe("confirmed");
      expect(outcome?.confirmed).toBe(true);
    });
  });

  // ==============================================
  // Story 17.8: Briefing Conversacional Inteligente
  // ==============================================

  describe("Briefing Conversacional (Story 17.8)", () => {
    // 6.12: canProceed=true com missingFields → vai para 'confirming'
    it("deve ir para confirming quando canProceed=true mesmo com missingFields (6.12)", async () => {
      const canProceedWithMissing = {
        briefing: {
          technology: null,
          jobTitles: ["CTO"],
          location: "Sao Paulo",
          companySize: null,
          industry: "fintech",
          productSlug: null,
          mode: "guided",
          skipSteps: [],
        },
        missingFields: ["technology"],
        isComplete: false,
        canProceed: true,
        suggestions: { technology: ["Stripe", "Plaid"] },
        productMentioned: null,
      };

      createMockFetch([
        {
          url: /\/api\/agent\/briefing\/parse$/,
          method: "POST",
          response: mockJsonResponse(canProceedWithMissing),
        },
      ]);

      const { result } = renderHook(() => useBriefingFlow());

      await act(async () => {
        await result.current.processMessage(
          "Quero prospectar CTOs de fintechs em SP",
          EXEC_ID,
          mockSendAgentMessage
        );
      });

      expect(result.current.state.status).toBe("confirming");
      expect(result.current.state.isComplete).toBe(false);
    });

    // 6.13: canProceed=false com suggestions → gera perguntas com sugestoes inline
    it("deve gerar perguntas com sugestoes inline quando canProceed=false (6.13)", async () => {
      createMockFetch([
        {
          url: /\/api\/agent\/briefing\/parse$/,
          method: "POST",
          response: mockJsonResponse(INCOMPLETE_PARSE_RESPONSE),
        },
      ]);

      const { result } = renderHook(() => useBriefingFlow());

      await act(async () => {
        await result.current.processMessage(
          "Quero prospectar empresas de tecnologia",
          EXEC_ID,
          mockSendAgentMessage
        );
      });

      expect(result.current.state.status).toBe("awaiting_fields");
      const agentMsg = mockSendAgentMessage.mock.calls[0][1] as string;
      // Suggestions should be inline in the question
      expect(agentMsg).toContain("cargos comuns");
      expect(agentMsg).toContain("CTO");
    });

    // 6.14: usuario envia HELP_KEYWORD → agente responde com sugestoes
    it("deve responder com sugestoes quando usuario envia HELP_KEYWORD (6.14)", async () => {
      createMockFetch([
        {
          url: /\/api\/agent\/briefing\/parse$/,
          method: "POST",
          response: mockJsonResponse(INCOMPLETE_PARSE_RESPONSE),
        },
      ]);

      const { result } = renderHook(() => useBriefingFlow());

      // First: get into awaiting_fields
      await act(async () => {
        await result.current.processMessage(
          "Quero prospectar empresas de tecnologia",
          EXEC_ID,
          mockSendAgentMessage
        );
      });

      expect(result.current.state.status).toBe("awaiting_fields");
      mockSendAgentMessage.mockClear();

      // User asks for help
      await act(async () => {
        const outcome = await result.current.processMessage(
          "me sugere os cargos",
          EXEC_ID,
          mockSendAgentMessage
        );
        expect(outcome.handled).toBe(true);
      });

      // Should respond with suggestions, NOT re-parse
      expect(mockSendAgentMessage).toHaveBeenCalledTimes(1);
      const helpMsg = mockSendAgentMessage.mock.calls[0][1] as string;
      expect(helpMsg).toContain("cargos comuns");
    });

    it("deve sugerir tecnologia somente quando o usuario pedir ajuda explicitamente (22.1)", async () => {
      createMockFetch([
        {
          url: /\/api\/agent\/briefing\/parse$/,
          method: "POST",
          response: mockJsonResponse(INCOMPLETE_PARSE_RESPONSE),
        },
      ]);

      const { result } = renderHook(() => useBriefingFlow());

      await act(async () => {
        await result.current.processMessage(
          "Quero prospectar empresas de tecnologia",
          EXEC_ID,
          mockSendAgentMessage
        );
      });

      expect(result.current.state.status).toBe("awaiting_fields");
      mockSendAgentMessage.mockClear();

      await act(async () => {
        const outcome = await result.current.processMessage(
          "quais tecnologias voce recomenda?",
          EXEC_ID,
          mockSendAgentMessage
        );
        expect(outcome.handled).toBe(true);
      });

      const helpMsg = mockSendAgentMessage.mock.calls[0][1] as string;
      expect(helpMsg).toContain("tecnologias comuns");
      expect(helpMsg).toContain("AWS");
      expect(helpMsg).toContain("sem filtro de tecnologia");
    });

    // 6.15: usuario aceita sugestao → re-parse com contexto acumulado extrai os cargos
    it("deve re-parsear quando usuario aceita sugestao (6.15)", async () => {
      createMockFetch([
        {
          url: /\/api\/agent\/briefing\/parse$/,
          method: "POST",
          response: mockJsonResponse(INCOMPLETE_PARSE_RESPONSE),
        },
      ]);

      const { result } = renderHook(() => useBriefingFlow());

      await act(async () => {
        await result.current.processMessage(
          "Quero prospectar empresas de tecnologia",
          EXEC_ID,
          mockSendAgentMessage
        );
      });

      // User provides actual answer (not a help keyword)
      restoreFetch();
      createMockFetch([
        {
          url: /\/api\/agent\/briefing\/parse$/,
          method: "POST",
          response: mockJsonResponse(COMPLETE_PARSE_RESPONSE),
        },
      ]);

      await act(async () => {
        await result.current.processMessage(
          "usa CTO e Head de TI, com Netskope",
          EXEC_ID,
          mockSendAgentMessage
        );
      });

      expect(result.current.state.status).toBe("confirming");
      expect(result.current.state.briefing?.jobTitles).toContain("CTO");
    });

    // 6.16: briefing summary inclui nota sobre campos nao informados
    it("deve incluir nota sobre campos opcionais nao informados no summary (6.16)", async () => {
      const canProceedWithMissing = {
        briefing: {
          technology: null,
          jobTitles: ["CTO"],
          location: "Sao Paulo",
          companySize: null,
          industry: "fintech",
          productSlug: null,
          mode: "guided",
          skipSteps: [],
        },
        missingFields: ["technology"],
        isComplete: false,
        canProceed: true,
        suggestions: { technology: ["Stripe"] },
        productMentioned: null,
      };

      createMockFetch([
        {
          url: /\/api\/agent\/briefing\/parse$/,
          method: "POST",
          response: mockJsonResponse(canProceedWithMissing),
        },
      ]);

      const { result } = renderHook(() => useBriefingFlow());

      await act(async () => {
        await result.current.processMessage(
          "Quero prospectar CTOs de fintechs em SP",
          EXEC_ID,
          mockSendAgentMessage
        );
      });

      expect(result.current.state.status).toBe("confirming");
      const summaryMsg = mockSendAgentMessage.mock.calls[0][1] as string;
      // Story 22.1: nota de tech reflete a nova regra (cargo + localizacao)
      expect(summaryMsg).toContain("Sem tecnologia especifica");
      expect(summaryMsg).toContain("busca por cargo + localizacao");
    });

    it("deve omitir nota de industria quando setor nao foi informado (22.1 AC6)", async () => {
      const responseWithoutIndustry = {
        briefing: {
          technology: null,
          jobTitles: ["CTO"],
          location: "Sao Paulo",
          companySize: null,
          industry: null,
          productSlug: null,
          mode: "guided" as const,
          skipSteps: ["search_companies"],
        },
        missingFields: ["technology", "industry", "companySize"],
        isComplete: false,
        canProceed: true,
        suggestions: {},
        productMentioned: null,
      };

      createMockFetch([
        {
          url: /\/api\/agent\/briefing\/parse$/,
          method: "POST",
          response: mockJsonResponse(responseWithoutIndustry),
        },
      ]);

      const { result } = renderHook(() => useBriefingFlow());

      await act(async () => {
        await result.current.processMessage(
          "Quero prospectar CTOs em Sao Paulo",
          EXEC_ID,
          mockSendAgentMessage
        );
      });

      const summaryMsg = mockSendAgentMessage.mock.calls[0][1] as string;
      expect(summaryMsg).toContain("Sem tecnologia especifica");
      expect(summaryMsg).not.toContain("Sem industria especifica");
      expect(summaryMsg).not.toContain("busca em todos os setores");
    });

    // Story 17.10: briefing summary com skipSteps search_companies
    it("deve incluir nota de skip de empresas quando skipSteps inclui search_companies (AC: 17.10#1)", async () => {
      const skipCompaniesResponse = {
        briefing: {
          technology: null,
          jobTitles: ["CTO", "Head de TI"],
          location: "Sao Paulo",
          companySize: null,
          industry: "fintech",
          productSlug: null,
          mode: "guided",
          skipSteps: ["search_companies"],
        },
        missingFields: ["technology"],
        isComplete: false,
        canProceed: true,
        suggestions: {},
        productMentioned: null,
      };

      createMockFetch([
        {
          url: /\/api\/agent\/briefing\/parse$/,
          method: "POST",
          response: mockJsonResponse(skipCompaniesResponse),
        },
      ]);

      const { result } = renderHook(() => useBriefingFlow());

      await act(async () => {
        await result.current.processMessage(
          "Quero prospectar CTOs e Heads de TI de fintechs em SP sem buscar empresas",
          EXEC_ID,
          mockSendAgentMessage
        );
      });

      expect(result.current.state.status).toBe("confirming");
      const summaryMsg = mockSendAgentMessage.mock.calls[0][1] as string;
      expect(summaryMsg).toContain("Etapa de busca de empresas sera pulada");
      expect(summaryMsg).toContain("CTO, Head de TI");
      expect(summaryMsg).toContain("fintech");
      expect(summaryMsg).toContain("Sao Paulo");
      // Tambem deve conter a nota de tecnologia ausente (coexistencia)
      expect(summaryMsg).toContain("Sem tecnologia especifica");
    });

    it("deve usar fallback 'cargos' no skip summary quando todos os params sao vazios/null (AC: 17.10#1)", async () => {
      const skipEmptyParams = {
        briefing: {
          technology: null,
          jobTitles: [] as string[],
          location: null,
          companySize: null,
          industry: null,
          productSlug: null,
          mode: "guided" as const,
          skipSteps: ["search_companies"],
        },
        missingFields: ["technology", "jobTitles"],
        isComplete: false,
        canProceed: true,
        suggestions: {},
        productMentioned: null,
      };

      createMockFetch([
        {
          url: /\/api\/agent\/briefing\/parse$/,
          method: "POST",
          response: mockJsonResponse(skipEmptyParams),
        },
      ]);

      const { result } = renderHook(() => useBriefingFlow());

      await act(async () => {
        await result.current.processMessage(
          "Buscar leads direto sem empresas",
          EXEC_ID,
          mockSendAgentMessage
        );
      });

      expect(result.current.state.status).toBe("confirming");
      const summaryMsg = mockSendAgentMessage.mock.calls[0][1] as string;
      expect(summaryMsg).toContain("leads serao buscados diretamente por cargos");
    });

    // ==============================================
    // Story 22.6 (FR12): nota do piso de qualidade no resumo da busca direta
    // ==============================================

    it("deve incluir a nota '11+ padrao de qualidade' na busca direta sem companySize (Story 22.6 AC4)", async () => {
      const directNoSizeResponse = {
        briefing: {
          technology: null,
          jobTitles: ["Diretor de Marketing"],
          location: "Sao Paulo",
          companySize: null,
          industry: null,
          productSlug: null,
          mode: "guided",
          skipSteps: ["search_companies"],
        },
        // Realista: o route empurra companySize para missingFields quando null (route.ts:87-89)
        missingFields: ["technology", "industry", "companySize"],
        isComplete: false,
        canProceed: true,
        suggestions: {},
        productMentioned: null,
      };

      createMockFetch([
        {
          url: /\/api\/agent\/briefing\/parse$/,
          method: "POST",
          response: mockJsonResponse(directNoSizeResponse),
        },
      ]);

      const { result } = renderHook(() => useBriefingFlow());

      await act(async () => {
        await result.current.processMessage(
          "Diretores de Marketing em Sao Paulo",
          EXEC_ID,
          mockSendAgentMessage
        );
      });

      expect(result.current.state.status).toBe("confirming");
      const summaryMsg = mockSendAgentMessage.mock.calls[0][1] as string;
      // Nota dedicada e amigavel do piso de qualidade
      expect(summaryMsg).toContain("Tamanho de empresa: 11+");
      expect(summaryMsg).toContain("padrao de qualidade");
      // E NAO pode aparecer a nota generica contraditoria "Sem filtro de tamanho de empresa."
      expect(summaryMsg).not.toContain("Sem filtro de tamanho de empresa");
    });

    it("deve mostrar o tamanho do usuario (sem nota de default) quando companySize informado na busca direta (Story 22.6 AC2)", async () => {
      const directWithSizeResponse = {
        briefing: {
          technology: null,
          jobTitles: ["Diretor de Marketing"],
          location: "Sao Paulo",
          companySize: "11-50",
          industry: null,
          productSlug: null,
          mode: "guided",
          skipSteps: ["search_companies"],
        },
        missingFields: ["technology", "industry"],
        isComplete: false,
        canProceed: true,
        suggestions: {},
        productMentioned: null,
      };

      createMockFetch([
        {
          url: /\/api\/agent\/briefing\/parse$/,
          method: "POST",
          response: mockJsonResponse(directWithSizeResponse),
        },
      ]);

      const { result } = renderHook(() => useBriefingFlow());

      await act(async () => {
        await result.current.processMessage(
          "Diretores de Marketing em Sao Paulo, empresas de 11 a 50 pessoas",
          EXEC_ID,
          mockSendAgentMessage
        );
      });

      expect(result.current.state.status).toBe("confirming");
      const summaryMsg = mockSendAgentMessage.mock.calls[0][1] as string;
      // Linha padrao "- Tamanho: <valor>" cobre a exibicao (AC2)
      expect(summaryMsg).toContain("- Tamanho: 11-50");
      // Sem a nota de default (o usuario informou)
      expect(summaryMsg).not.toContain("padrao de qualidade");
    });

    it("NAO deve mostrar nota de piso de qualidade no fluxo normal com tecnologia (Story 22.6 D4/NFR4)", async () => {
      const normalResponse = {
        briefing: {
          technology: "Salesforce",
          jobTitles: ["CTO"],
          location: "Sao Paulo",
          companySize: null,
          industry: null,
          productSlug: null,
          mode: "guided",
          skipSteps: [],
        },
        missingFields: ["industry", "companySize"],
        isComplete: false,
        canProceed: true,
        suggestions: {},
        productMentioned: null,
      };

      createMockFetch([
        {
          url: /\/api\/agent\/briefing\/parse$/,
          method: "POST",
          response: mockJsonResponse(normalResponse),
        },
      ]);

      const { result } = renderHook(() => useBriefingFlow());

      await act(async () => {
        await result.current.processMessage(
          "CTOs que usam Salesforce em Sao Paulo",
          EXEC_ID,
          mockSendAgentMessage
        );
      });

      expect(result.current.state.status).toBe("confirming");
      const summaryMsg = mockSendAgentMessage.mock.calls[0][1] as string;
      // Fluxo normal (tech->TheirStack) NAO ganha piso de qualidade de tamanho (D4).
      expect(summaryMsg).not.toContain("padrao de qualidade");
      // A nota generica pre-existente de tamanho ausente permanece intacta.
      expect(summaryMsg).toContain("Sem filtro de tamanho de empresa");
    });

    // 6.17: generateSmartQuestion com sugestoes → pergunta inclui opcoes inline
    it("deve gerar pergunta com opcoes inline quando sugestoes disponiveis (6.17)", () => {
      const briefing = {
        technology: "Netskope",
        jobTitles: [],
        location: null,
        companySize: null,
        industry: null,
        productSlug: null,
        mode: "guided" as const,
        skipSteps: [],
      };

      const question = generateSmartQuestion("jobTitles", ["CISO", "Head de Seguranca"], briefing);

      expect(question).toContain("Para empresas que usam Netskope");
      expect(question).toContain("CISO");
      expect(question).toContain("Head de Seguranca");
      expect(question).toContain("Quer usar algum desses");
    });

    // 6.18: generateSmartQuestion sem sugestoes → pergunta generica amigavel
    it("deve gerar pergunta generica amigavel sem sugestoes (6.18)", () => {
      const briefing = {
        technology: null,
        jobTitles: [],
        location: null,
        companySize: null,
        industry: null,
        productSlug: null,
        mode: "guided" as const,
        skipSteps: [],
      };

      const question = generateSmartQuestion("technology", [], briefing);

      expect(question).toContain("filtro opcional");
      expect(question).toContain("informar um setor");
      expect(question).toContain("sem filtro de tecnologia");
      // Should NOT contain empty list artifacts
      expect(question).not.toContain("[]");
    });
  });

  // ==============================================
  // Story 22.1: Localizacao obrigatoria, tecnologia opcional
  // ==============================================

  describe("Localizacao obrigatoria (Story 22.1)", () => {
    it("deve gerar pergunta natural e proativa para location", () => {
      const briefing = {
        technology: null,
        jobTitles: ["CTO"],
        location: null,
        companySize: null,
        industry: null,
        productSlug: null,
        mode: "guided" as const,
        skipSteps: ["search_companies"],
      };

      const question = generateSmartQuestion("location", [], briefing);

      expect(question).toContain("localizacao");
      // Pergunta direta e proativa, sem artefatos de lista vazia
      expect(question).not.toContain("[]");
      expect(question).not.toContain("undefined");
    });

    it("deve perguntar localizacao (nao tecnologia) quando cargo presente e location ausente", async () => {
      const noLocationResponse = {
        briefing: {
          technology: null,
          jobTitles: ["CTO"],
          location: null,
          companySize: null,
          industry: null,
          productSlug: null,
          mode: "guided" as const,
          skipSteps: ["search_companies"],
        },
        missingFields: ["technology", "location", "industry", "companySize"],
        isComplete: false,
        canProceed: false,
        suggestions: {},
        productMentioned: null,
      };

      createMockFetch([
        {
          url: /\/api\/agent\/briefing\/parse$/,
          method: "POST",
          response: mockJsonResponse(noLocationResponse),
        },
      ]);

      const { result } = renderHook(() => useBriefingFlow());

      await act(async () => {
        await result.current.processMessage(
          "quero prospectar CTOs",
          EXEC_ID,
          mockSendAgentMessage
        );
      });

      expect(result.current.state.status).toBe("awaiting_fields");
      const askMsg = mockSendAgentMessage.mock.calls[0][1] as string;
      expect(askMsg).toContain("localizacao");
      // tecnologia nunca e apresentada como exigencia no caminho principal
      expect(askMsg).not.toContain("tecnologia");
    });

    it("NAO deve re-perguntar tecnologia quando usuario a recusa — pivota para location (AC4 loop morto)", async () => {
      const noLocationResponse = {
        briefing: {
          technology: null,
          jobTitles: ["CTO"],
          location: null,
          companySize: null,
          industry: null,
          productSlug: null,
          mode: "guided" as const,
          skipSteps: ["search_companies"],
        },
        missingFields: ["technology", "location", "industry", "companySize"],
        isComplete: false,
        canProceed: false,
        suggestions: {},
        productMentioned: null,
      };

      createMockFetch([
        {
          url: /\/api\/agent\/briefing\/parse$/,
          method: "POST",
          response: mockJsonResponse(noLocationResponse),
        },
      ]);

      const { result } = renderHook(() => useBriefingFlow());

      // Turno 1: agente pergunta localizacao (cargo ja presente)
      await act(async () => {
        await result.current.processMessage(
          "quero prospectar CTOs",
          EXEC_ID,
          mockSendAgentMessage
        );
      });

      expect(result.current.state.status).toBe("awaiting_fields");
      const firstAsk = mockSendAgentMessage.mock.calls[0][1] as string;
      expect(firstAsk).toContain("localizacao");
      expect(firstAsk).not.toContain("tecnologia");

      // Turno 2: usuario RECUSA tecnologia — o agente NAO pode entrar em loop
      // re-perguntando tecnologia; deve continuar pedindo localizacao.
      restoreFetch();
      createMockFetch([
        {
          url: /\/api\/agent\/briefing\/parse$/,
          method: "POST",
          response: mockJsonResponse(noLocationResponse),
        },
      ]);
      mockSendAgentMessage.mockClear();

      await act(async () => {
        await result.current.processMessage(
          "nao tenho tecnologia",
          EXEC_ID,
          mockSendAgentMessage
        );
      });

      expect(result.current.state.status).toBe("awaiting_fields");
      const secondAsk = mockSendAgentMessage.mock.calls[0][1] as string;
      expect(secondAsk).toContain("localizacao");
      expect(secondAsk).not.toContain("tecnologia");
    });
  });

  // ==============================================
  // Story 17.11: IMPORTED LEADS FLOW
  // ==============================================

  describe("imported leads flow (Story 17.11)", () => {
    const IMPORTED_LEADS_PARSE_RESPONSE = {
      briefing: {
        technology: null,
        jobTitles: [],
        location: null,
        companySize: null,
        industry: null,
        productSlug: null,
        mode: "guided" as const,
        skipSteps: ["search_companies", "search_leads"],
      },
      missingFields: ["technology", "jobTitles"],
      isComplete: false,
      canProceed: false,
      suggestions: {},
      productMentioned: null,
    };

    const PARSE_ROUTE = {
      url: /\/api\/agent\/briefing\/parse$/,
      method: "POST",
      response: mockJsonResponse(IMPORTED_LEADS_PARSE_RESPONSE),
    };

    it("deve transicionar para awaiting_leads_input quando skipSteps inclui ambos (AC: 17.11#1)", async () => {
      createMockFetch([PARSE_ROUTE]);

      const { result } = renderHook(() => useBriefingFlow());

      await act(async () => {
        await result.current.processMessage(
          "Ja tenho meus leads",
          EXEC_ID,
          mockSendAgentMessage
        );
      });

      expect(result.current.state.status).toBe("awaiting_leads_input");
      expect(mockSendAgentMessage).toHaveBeenCalledWith(
        EXEC_ID,
        expect.stringContaining("Cole a lista")
      );
    });

    it("deve parsear leads validos e transicionar para confirming_leads (AC: 17.11#2)", async () => {
      createMockFetch([PARSE_ROUTE]);

      const { result } = renderHook(() => useBriefingFlow());

      // First: parse briefing → awaiting_leads_input
      await act(async () => {
        await result.current.processMessage(
          "Ja tenho meus leads",
          EXEC_ID,
          mockSendAgentMessage
        );
      });

      // Then: paste leads
      await act(async () => {
        await result.current.processMessage(
          "joao@empresa.com\nmaria@acme.com",
          EXEC_ID,
          mockSendAgentMessage
        );
      });

      expect(result.current.state.status).toBe("confirming_leads");
      expect(result.current.state.briefing?.importedLeads).toHaveLength(2);
      expect(mockSendAgentMessage).toHaveBeenLastCalledWith(
        EXEC_ID,
        expect.stringContaining("2 leads aceitos")
      );
    });

    it("deve mostrar erro quando leads invalidos (sem email) (AC: 17.11#2)", async () => {
      createMockFetch([PARSE_ROUTE]);

      const { result } = renderHook(() => useBriefingFlow());

      await act(async () => {
        await result.current.processMessage(
          "Ja tenho meus leads",
          EXEC_ID,
          mockSendAgentMessage
        );
      });

      await act(async () => {
        await result.current.processMessage(
          "apenas texto sem email",
          EXEC_ID,
          mockSendAgentMessage
        );
      });

      expect(result.current.state.status).toBe("awaiting_leads_input");
      expect(mockSendAgentMessage).toHaveBeenLastCalledWith(
        EXEC_ID,
        expect.stringContaining("Nenhum lead valido")
      );
    });

    it("deve transicionar para confirming ao confirmar leads (AC: 17.11#2)", async () => {
      createMockFetch([PARSE_ROUTE]);

      const { result } = renderHook(() => useBriefingFlow());

      // Parse → awaiting_leads_input
      await act(async () => {
        await result.current.processMessage(
          "Ja tenho meus leads",
          EXEC_ID,
          mockSendAgentMessage
        );
      });

      // Paste leads → confirming_leads
      await act(async () => {
        await result.current.processMessage(
          "joao@empresa.com",
          EXEC_ID,
          mockSendAgentMessage
        );
      });

      // Confirm leads → confirming (briefing summary)
      await act(async () => {
        await result.current.processMessage(
          "sim",
          EXEC_ID,
          mockSendAgentMessage
        );
      });

      expect(result.current.state.status).toBe("confirming");
      expect(mockSendAgentMessage).toHaveBeenLastCalledWith(
        EXEC_ID,
        expect.stringContaining("leads importados serao usados diretamente")
      );
      // Story 22.6 (AC5): o piso de qualidade NAO se aplica ao fluxo de leads importados.
      const importedSummary = mockSendAgentMessage.mock.lastCall?.[1] as string;
      expect(importedSummary).not.toContain("padrao de qualidade");
    });

    it("deve voltar para awaiting_leads_input ao rejeitar leads", async () => {
      createMockFetch([PARSE_ROUTE]);

      const { result } = renderHook(() => useBriefingFlow());

      // Parse → awaiting_leads_input
      await act(async () => {
        await result.current.processMessage(
          "Ja tenho meus leads",
          EXEC_ID,
          mockSendAgentMessage
        );
      });

      // Paste leads → confirming_leads
      await act(async () => {
        await result.current.processMessage(
          "joao@empresa.com",
          EXEC_ID,
          mockSendAgentMessage
        );
      });

      // Reject leads → back to awaiting_leads_input
      await act(async () => {
        await result.current.processMessage(
          "errei, deixa eu refazer",
          EXEC_ID,
          mockSendAgentMessage
        );
      });

      expect(result.current.state.status).toBe("awaiting_leads_input");
      expect(mockSendAgentMessage).toHaveBeenLastCalledWith(
        EXEC_ID,
        expect.stringContaining("cole a lista de leads novamente")
      );
    });
  });

  // ==============================================
  // GUARD DETERMINISTICO DO import_leads (Story 22.11 — Frente A)
  // ==============================================

  describe("Guard deterministico do import_leads (Story 22.11)", () => {
    // Helper puro exportado (AC3): SSOT do sinal de "leads proprios" na mensagem crua.
    describe("messageSignalsOwnLeads (helper puro, AC3)", () => {
      it("retorna true quando ha conteudo de e-mail na mensagem", () => {
        expect(messageSignalsOwnLeads("segue: joao@empresa.com")).toBe(true);
        expect(
          messageSignalsOwnLeads("Nome, joao.silva@acme.com.br, CTO")
        ).toBe(true);
      });

      it("retorna true para keywords-ancora de leads proprios (case/acento/hifen-insensitive)", () => {
        expect(messageSignalsOwnLeads("ja tenho minha lista de leads")).toBe(true);
        expect(messageSignalsOwnLeads("na verdade JA TENHO MEUS LEADS")).toBe(true);
        expect(messageSignalsOwnLeads("minha planilha de contatos")).toBe(true);
        expect(messageSignalsOwnLeads("minha base de e-mails ja esta pronta")).toBe(true);
        expect(messageSignalsOwnLeads("tenho leads próprios coletados")).toBe(true);
        expect(messageSignalsOwnLeads("CSV com contatos aqui")).toBe(true);
      });

      it("retorna false para um ajuste de filtro (o bug reportado)", () => {
        expect(
          messageSignalsOwnLeads("O tamanho da empresa pode aumentar para mais de 50.")
        ).toBe(false);
      });

      it("retorna false para mensagens sem e-mail nem keyword (fail-safe, AC5)", () => {
        expect(messageSignalsOwnLeads("quero prospectar CTOs em Atibaia")).toBe(false);
        expect(messageSignalsOwnLeads("pode ser reengajamento com 3 e-mails")).toBe(false);
        expect(messageSignalsOwnLeads("")).toBe(false);
      });
    });

    // NUCLEO RED->GREEN (AC1/AC5): no estado confirming, um AJUSTE DE FILTRO que o modelo
    // MISCLASSIFICA como import_leads NAO pode sequestrar a conversa para "cole seus leads".
    // Sem o guard (`&& messageSignalsOwnLeads`), o ramo de leads dispararia -> RED.
    it("NAO entra em awaiting_leads_input quando o LLM alucina import_leads para um ajuste de filtro (AC1/AC5)", async () => {
      createMockFetch([
        {
          url: /\/api\/agent\/briefing\/parse$/,
          method: "POST",
          response: mockJsonResponse(COMPLETE_PARSE_RESPONSE),
        },
      ]);

      const { result } = renderHook(() => useBriefingFlow());

      // 1) Monta o briefing -> confirming (o resumo foi apresentado).
      await act(async () => {
        await result.current.processMessage(
          "prospectar CTOs de Atibaia",
          EXEC_ID,
          mockSendAgentMessage
        );
      });
      expect(result.current.state.status).toBe("confirming");

      // 2) Ajuste de filtro que o modelo classifica ERRADO como import_leads.
      restoreFetch();
      const MISCLASSIFIED_AS_IMPORT_LEADS = {
        briefing: {
          technology: null,
          jobTitles: ["CTO"],
          location: "Atibaia",
          companySize: "50+",
          industry: null,
          productSlug: null,
          mode: "guided" as const,
          // Patch review 22.11: shape REALISTA da alucinacao — o SYSTEM_PROMPT MANDA acoplar
          // import_leads a ["search_companies","search_leads"] (briefing-parser-service.ts:124).
          // O mock antigo usava [] e mascarava o veneno (resumo diria "0 leads importados").
          skipSteps: ["search_companies", "search_leads"] as string[],
        },
        missingFields: [] as string[],
        isComplete: true,
        canProceed: true,
        suggestions: {},
        productMentioned: null,
        nextAction: "import_leads" as const, // <- alucinacao do modelo
        questionText: null,
      };
      createMockFetch([
        {
          url: /\/api\/agent\/briefing\/parse$/,
          method: "POST",
          response: mockJsonResponse(MISCLASSIFIED_AS_IMPORT_LEADS),
        },
      ]);

      await act(async () => {
        await result.current.processMessage(
          "O tamanho da empresa pode aumentar para mais de 50.",
          EXEC_ID,
          mockSendAgentMessage
        );
      });

      // GREEN: a mensagem crua nao tem e-mail nem keyword -> guard bloqueia o import_leads.
      // Segue a conversa normal: re-apresenta o resumo (confirming), NUNCA pede leads.
      expect(result.current.state.status).not.toBe("awaiting_leads_input");
      expect(result.current.state.status).toBe("confirming");
      // O agente NAO enviou o convite de "cole seus leads".
      const allMessages = mockSendAgentMessage.mock.calls.map((c) => c[1] as string);
      expect(allMessages.some((m) => m.includes("Cole a lista"))).toBe(false);
      // Patch review 22.11 (AC1): o skipSteps ALUCINADO nao pode sobreviver no briefing
      // re-apresentado. Sem a reconciliacao, o resumo diria "0 leads importados serao usados
      // diretamente" e um "sim" quebraria a execucao (create-campaign-step: leads vazios).
      expect(allMessages.some((m) => m.includes("leads importados serao usados"))).toBe(false);
      expect(result.current.state.briefing?.skipSteps).not.toContain("search_leads");
    });

    // Caso POSITIVO no mesmo estado confirming: quando a mensagem crua TRAZ a ancora, o
    // fluxo legitimo de leads entra normalmente (AC1 alinea b / AC4).
    it("ENTRA em awaiting_leads_input quando a mensagem crua traz a ancora de leads proprios (AC1/AC4)", async () => {
      createMockFetch([
        {
          url: /\/api\/agent\/briefing\/parse$/,
          method: "POST",
          response: mockJsonResponse(COMPLETE_PARSE_RESPONSE),
        },
      ]);

      const { result } = renderHook(() => useBriefingFlow());

      await act(async () => {
        await result.current.processMessage(
          "prospectar CTOs de Atibaia",
          EXEC_ID,
          mockSendAgentMessage
        );
      });
      expect(result.current.state.status).toBe("confirming");

      restoreFetch();
      const IMPORT_LEADS_WITH_ANCHOR = {
        briefing: {
          technology: null,
          jobTitles: ["CTO"],
          location: "Atibaia",
          companySize: null,
          industry: null,
          productSlug: null,
          mode: "guided" as const,
          skipSteps: [] as string[],
        },
        missingFields: [] as string[],
        isComplete: false,
        canProceed: false,
        suggestions: {},
        productMentioned: null,
        nextAction: "import_leads" as const,
        questionText: null,
      };
      createMockFetch([
        {
          url: /\/api\/agent\/briefing\/parse$/,
          method: "POST",
          response: mockJsonResponse(IMPORT_LEADS_WITH_ANCHOR),
        },
      ]);

      await act(async () => {
        await result.current.processMessage(
          "na verdade ja tenho meus leads",
          EXEC_ID,
          mockSendAgentMessage
        );
      });

      expect(result.current.state.status).toBe("awaiting_leads_input");
      // Reconciliacao de skipSteps preservada (Review 22.4).
      expect(result.current.state.briefing?.skipSteps).toEqual(
        expect.arrayContaining(["search_companies", "search_leads"])
      );
    });

    // AC4 (zero regressao 17.11): colar e-mails na propria mensagem tambem e ancora
    // deterministica -> o fluxo de leads entra direto desde o idle.
    it("ENTRA em awaiting_leads_input quando a mensagem crua contem e-mails (AC4)", async () => {
      const IMPORT_LEADS_INTENT = {
        briefing: {
          technology: null,
          jobTitles: [],
          location: null,
          companySize: null,
          industry: null,
          productSlug: null,
          mode: "guided" as const,
          skipSteps: [] as string[],
        },
        missingFields: ["jobTitles", "location"],
        isComplete: false,
        canProceed: false,
        suggestions: {},
        productMentioned: null,
        nextAction: "import_leads" as const,
        questionText: null,
      };
      createMockFetch([
        {
          url: /\/api\/agent\/briefing\/parse$/,
          method: "POST",
          response: mockJsonResponse(IMPORT_LEADS_INTENT),
        },
      ]);

      const { result } = renderHook(() => useBriefingFlow());

      await act(async () => {
        await result.current.processMessage(
          "joao@empresa.com, maria@acme.com",
          EXEC_ID,
          mockSendAgentMessage
        );
      });

      expect(result.current.state.status).toBe("awaiting_leads_input");
    });

    // Patch review 22.11 (AC1): com o shape REALISTA de alucinacao (skipSteps de import),
    // o guard nao pode so barrar o ramo — o skipSteps envenenado tem que ser IGNORADO, senao
    // o resumo re-apresentado diz "0 leads importados serao usados diretamente" e o "sim"
    // seguinte quebraria a execucao. RED (sem reconcileNonImportBriefing): o resumo poluido volta.
    it("SANITIZA o skipSteps de import alucinado ao barrar o ramo (AC1, sem veneno no resumo)", async () => {
      createMockFetch([
        {
          url: /\/api\/agent\/briefing\/parse$/,
          method: "POST",
          response: mockJsonResponse(COMPLETE_PARSE_RESPONSE),
        },
      ]);

      const { result } = renderHook(() => useBriefingFlow());

      await act(async () => {
        await result.current.processMessage(
          "prospectar CTOs de Atibaia",
          EXEC_ID,
          mockSendAgentMessage
        );
      });
      expect(result.current.state.status).toBe("confirming");

      // Ajuste de filtro; o parser alucina import_leads JUNTO do skipSteps de import (shape real).
      restoreFetch();
      const MISCLASSIFIED_WITH_SKIPSTEPS = {
        briefing: {
          technology: null,
          jobTitles: ["CTO"],
          location: "Atibaia",
          companySize: "50+",
          industry: null,
          productSlug: null,
          mode: "guided" as const,
          skipSteps: ["search_companies", "search_leads"] as string[],
        },
        missingFields: [] as string[],
        isComplete: true,
        canProceed: true,
        suggestions: {},
        productMentioned: null,
        nextAction: "import_leads" as const,
        questionText: null,
      };
      createMockFetch([
        {
          url: /\/api\/agent\/briefing\/parse$/,
          method: "POST",
          response: mockJsonResponse(MISCLASSIFIED_WITH_SKIPSTEPS),
        },
      ]);

      await act(async () => {
        await result.current.processMessage(
          "O tamanho da empresa pode aumentar para mais de 50.",
          EXEC_ID,
          mockSendAgentMessage
        );
      });

      expect(result.current.state.status).toBe("confirming");
      // search_leads removido -> nao e mais um "import flow"; o resumo nao mente "0 leads".
      expect(result.current.state.briefing?.skipSteps).not.toContain("search_leads");
      const msgs = mockSendAgentMessage.mock.calls.map((c) => c[1] as string);
      expect(msgs.some((m) => m.includes("leads importados serao usados"))).toBe(false);
    });

    // D1 (decisao Fabossi 2026-07-24 na review): uma correcao SEM ancora DEPOIS de ja ter
    // colado leads NAO pode descartar os importedLeads (estado client-only). O guard barra o
    // ramo, mas o import em andamento e preservado + a correcao de campo aplicada.
    // RED (sem o bloco D1): a reconciliacao P1 rodaria e os leads sumiriam do briefing.
    it("PRESERVA importedLeads quando o usuario corrige o briefing apos ter colado leads (D1)", async () => {
      const IMPORT_MOCK = {
        briefing: {
          technology: null,
          jobTitles: ["CTO"],
          location: "Atibaia",
          companySize: null,
          industry: null,
          productSlug: null,
          mode: "guided" as const,
          skipSteps: ["search_companies", "search_leads"] as string[],
        },
        missingFields: [] as string[],
        isComplete: false,
        canProceed: true,
        suggestions: {},
        productMentioned: null,
        nextAction: "import_leads" as const,
        questionText: null,
      };
      createMockFetch([
        {
          url: /\/api\/agent\/briefing\/parse$/,
          method: "POST",
          response: mockJsonResponse(IMPORT_MOCK),
        },
      ]);

      const { result } = renderHook(() => useBriefingFlow());

      // 1) "Ja tenho meus leads" (ancora) -> awaiting_leads_input
      await act(async () => {
        await result.current.processMessage("Ja tenho meus leads", EXEC_ID, mockSendAgentMessage);
      });
      expect(result.current.state.status).toBe("awaiting_leads_input");

      // 2) Cola leads -> confirming_leads (importedLeads populado)
      await act(async () => {
        await result.current.processMessage("joao@empresa.com", EXEC_ID, mockSendAgentMessage);
      });
      expect(result.current.state.status).toBe("confirming_leads");
      expect(result.current.state.briefing?.importedLeads).toHaveLength(1);

      // 3) Confirma os leads -> confirming (resumo)
      await act(async () => {
        await result.current.processMessage("sim", EXEC_ID, mockSendAgentMessage);
      });
      expect(result.current.state.status).toBe("confirming");

      // 4) Correcao SEM ancora ("troca o cargo pra CFO") — o parser mantem o shape de import
      // (o historico tem os leads), mas a mensagem crua nao tem ancora -> guard barra o ramo.
      restoreFetch();
      const CFO_IMPORT_MOCK = {
        ...IMPORT_MOCK,
        briefing: { ...IMPORT_MOCK.briefing, jobTitles: ["CFO"] },
      };
      createMockFetch([
        {
          url: /\/api\/agent\/briefing\/parse$/,
          method: "POST",
          response: mockJsonResponse(CFO_IMPORT_MOCK),
        },
      ]);

      await act(async () => {
        await result.current.processMessage("troca o cargo pra CFO", EXEC_ID, mockSendAgentMessage);
      });

      // GREEN: leads PRESERVADOS, correcao aplicada, ainda em confirming (nao pediu leads de novo).
      expect(result.current.state.status).toBe("confirming");
      expect(result.current.state.briefing?.importedLeads).toHaveLength(1);
      expect(result.current.state.briefing?.jobTitles).toEqual(["CFO"]);
      const lastMsg = mockSendAgentMessage.mock.lastCall?.[1] as string;
      expect(lastMsg).toContain("leads importados serao usados");
    });

    // Patch review 22.11: briefingChanged passa a comparar skipSteps. Um "sim" cujo unico delta
    // do parser e injetar o shape de import (search_companies+search_leads) NAO pode ser engolido
    // como confirmacao por keyword (keywordConfirmed) — isso pularia o guard e confirmaria o
    // estado envenenado. RED (sem skipSteps em briefingChanged): vira "confirmed".
    it("um 'sim' NAO confirma quando o unico delta e um skipSteps de import injetado (patch briefingChanged)", async () => {
      createMockFetch([
        {
          url: /\/api\/agent\/briefing\/parse$/,
          method: "POST",
          response: mockJsonResponse(COMPLETE_PARSE_RESPONSE),
        },
      ]);

      const { result } = renderHook(() => useBriefingFlow());

      await act(async () => {
        await result.current.processMessage(
          "prospectar CTOs em Sao Paulo",
          EXEC_ID,
          mockSendAgentMessage
        );
      });
      expect(result.current.state.status).toBe("confirming");

      restoreFetch();
      const INJECTED_IMPORT_SHAPE = {
        ...COMPLETE_PARSE_RESPONSE,
        briefing: {
          ...COMPLETE_PARSE_RESPONSE.briefing,
          skipSteps: ["search_companies", "search_leads"] as string[],
        },
        nextAction: "import_leads" as const,
        questionText: null,
      };
      createMockFetch([
        {
          url: /\/api\/agent\/briefing\/parse$/,
          method: "POST",
          response: mockJsonResponse(INJECTED_IMPORT_SHAPE),
        },
      ]);

      let outcome: { handled: boolean; confirmed?: boolean } = { handled: false };
      await act(async () => {
        outcome = await result.current.processMessage("sim", EXEC_ID, mockSendAgentMessage);
      });

      // GREEN: nao confirma (o delta de skipSteps quebra o keywordConfirmed) e o guard
      // reconcilia o import sem ancora -> segue em confirming, sem veneno.
      expect(outcome.confirmed).not.toBe(true);
      expect(result.current.state.status).toBe("confirming");
      const msgs = mockSendAgentMessage.mock.calls.map((c) => c[1] as string);
      expect(msgs.some((m) => m.includes("leads importados serao usados"))).toBe(false);
      expect(result.current.state.briefing?.skipSteps).not.toContain("search_leads");
    });
  });

  // ==============================================
  // Story 22.3: Conversa com Memoria Real & Intencao via LLM
  // ==============================================

  describe("Memoria real + intencao via LLM (Story 22.3)", () => {
    it("NUCLEO: 2o /parse envia historico estruturado com turno role:agent (memoria)", async () => {
      const fetchMock = createMockFetch([
        {
          url: /\/api\/agent\/briefing\/parse$/,
          method: "POST",
          response: mockJsonResponse(INCOMPLETE_PARSE_RESPONSE),
        },
      ]);

      const { result } = renderHook(() => useBriefingFlow());

      // Turno 1: usuario -> agente pergunta (registrada no historico)
      await act(async () => {
        await result.current.processMessage(
          "Quero prospectar CTOs",
          EXEC_ID,
          mockSendAgentMessage
        );
      });

      // Turno 2: usuario responde -> 2o /parse deve carregar a pergunta do agente
      await act(async () => {
        await result.current.processMessage(
          "em Sao Paulo",
          EXEC_ID,
          mockSendAgentMessage
        );
      });

      const parseCalls = fetchMock
        .calls()
        .filter((c) => /\/api\/agent\/briefing\/parse$/.test(c.url));
      expect(parseCalls).toHaveLength(2);

      const secondBody = parseCalls[1].body as {
        messages?: Array<{ role: string; content: string }>;
        message?: string;
      };

      // Memoria estruturada: NAO mais string concatenada com \n
      expect(secondBody.message).toBeUndefined();
      expect(secondBody.messages).toBeDefined();
      // Deve haver ao menos um turno do AGENTE (a pergunta) entre os do usuario
      expect(secondBody.messages?.some((m) => m.role === "agent")).toBe(true);
      // E a ultima mensagem e a do usuario atual
      const last = secondBody.messages?.[secondBody.messages.length - 1];
      expect(last).toEqual({ role: "user", content: "em Sao Paulo" });
    });

    it("nextAction:proceed confirma no confirming sem depender de keyword (AC3)", async () => {
      createMockFetch([
        {
          url: /\/api\/agent\/briefing\/parse$/,
          method: "POST",
          response: mockJsonResponse(COMPLETE_PARSE_RESPONSE),
        },
      ]);

      const { result } = renderHook(() => useBriefingFlow());

      await act(async () => {
        await result.current.processMessage("briefing", EXEC_ID, mockSendAgentMessage);
      });
      expect(result.current.state.status).toBe("confirming");

      // "segue o baile" NAO bate com nenhuma CONFIRMATION_KEYWORD — so o LLM confirma
      restoreFetch();
      createMockFetch([
        {
          url: /\/api\/agent\/briefing\/parse$/,
          method: "POST",
          response: mockJsonResponse({ ...COMPLETE_PARSE_RESPONSE, nextAction: "proceed" }),
        },
      ]);

      let outcome: { handled: boolean; confirmed?: boolean } | undefined;
      await act(async () => {
        outcome = await result.current.processMessage(
          "segue o baile",
          EXEC_ID,
          mockSendAgentMessage
        );
      });

      expect(result.current.state.status).toBe("confirmed");
      expect(outcome?.confirmed).toBe(true);
    });

    it("correcao parcial em confirming aplica briefing e reapresenta resumo (AC3)", async () => {
      createMockFetch([
        {
          url: /\/api\/agent\/briefing\/parse$/,
          method: "POST",
          response: mockJsonResponse(COMPLETE_PARSE_RESPONSE),
        },
      ]);

      const { result } = renderHook(() => useBriefingFlow());

      await act(async () => {
        await result.current.processMessage("briefing", EXEC_ID, mockSendAgentMessage);
      });
      expect(result.current.state.status).toBe("confirming");

      restoreFetch();
      const corrected = {
        ...COMPLETE_PARSE_RESPONSE,
        briefing: { ...COMPLETE_PARSE_RESPONSE.briefing, jobTitles: ["CFO"] },
        nextAction: "confirm",
      };
      createMockFetch([
        {
          url: /\/api\/agent\/briefing\/parse$/,
          method: "POST",
          response: mockJsonResponse(corrected),
        },
      ]);
      mockSendAgentMessage.mockClear();

      await act(async () => {
        await result.current.processMessage(
          "na verdade troca o cargo pra CFO",
          EXEC_ID,
          mockSendAgentMessage
        );
      });

      expect(result.current.state.status).toBe("confirming");
      expect(result.current.state.briefing?.jobTitles).toEqual(["CFO"]);
      // resumo deterministico reapresentado (D1: transparencia dos parametros)
      expect(mockSendAgentMessage).toHaveBeenCalledWith(
        EXEC_ID,
        expect.stringContaining("Confirma esses parametros?")
      );
    });

    it("nextAction:ask + canProceed:false usa questionText do LLM (AC6)", async () => {
      const askResponse = {
        ...INCOMPLETE_PARSE_RESPONSE,
        questionText: "Qual a localizacao-alvo da prospeccao?",
        nextAction: "ask",
      };

      createMockFetch([
        {
          url: /\/api\/agent\/briefing\/parse$/,
          method: "POST",
          response: mockJsonResponse(askResponse),
        },
      ]);

      const { result } = renderHook(() => useBriefingFlow());

      await act(async () => {
        await result.current.processMessage(
          "quero prospectar",
          EXEC_ID,
          mockSendAgentMessage
        );
      });

      expect(result.current.state.status).toBe("awaiting_fields");
      // questionText do LLM usado verbatim quando presente
      expect(mockSendAgentMessage).toHaveBeenCalledWith(
        EXEC_ID,
        "Qual a localizacao-alvo da prospeccao?"
      );
    });

    it("fail-open: parse falha no confirming + 'sim' confirma via keyword (AC4)", async () => {
      createMockFetch([
        {
          url: /\/api\/agent\/briefing\/parse$/,
          method: "POST",
          response: mockJsonResponse(COMPLETE_PARSE_RESPONSE),
        },
      ]);

      const { result } = renderHook(() => useBriefingFlow());

      await act(async () => {
        await result.current.processMessage("briefing", EXEC_ID, mockSendAgentMessage);
      });
      expect(result.current.state.status).toBe("confirming");

      // LLM cai (500) -> keyword deterministica salva
      restoreFetch();
      createMockFetch([
        {
          url: /\/api\/agent\/briefing\/parse$/,
          method: "POST",
          response: mockErrorResponse(500, "Server Error"),
        },
      ]);

      let outcome: { handled: boolean; confirmed?: boolean } | undefined;
      await act(async () => {
        outcome = await result.current.processMessage("sim", EXEC_ID, mockSendAgentMessage);
      });

      expect(result.current.state.status).toBe("confirmed");
      expect(outcome?.confirmed).toBe(true);
    });

    it("fail-open: parse falha no confirming + msg nao-confirmadora mantem confirming (AC4)", async () => {
      createMockFetch([
        {
          url: /\/api\/agent\/briefing\/parse$/,
          method: "POST",
          response: mockJsonResponse(COMPLETE_PARSE_RESPONSE),
        },
      ]);

      const { result } = renderHook(() => useBriefingFlow());

      await act(async () => {
        await result.current.processMessage("briefing", EXEC_ID, mockSendAgentMessage);
      });
      expect(result.current.state.status).toBe("confirming");

      restoreFetch();
      createMockFetch([
        {
          url: /\/api\/agent\/briefing\/parse$/,
          method: "POST",
          response: mockErrorResponse(500, "Server Error"),
        },
      ]);

      let outcome: { handled: boolean; confirmed?: boolean } | undefined;
      await act(async () => {
        outcome = await result.current.processMessage(
          "ainda estou pensando",
          EXEC_ID,
          mockSendAgentMessage
        );
      });

      expect(result.current.state.status).toBe("confirming");
      expect(outcome?.handled).toBe(false);
    });

    // ==============================================
    // REVIEW PATCHES (code review 22.3, 2026-07-20)
    // ==============================================

    it("guard hibrido: 'sim' confirma no caminho de sucesso mesmo com LLM devolvendo confirm (review 22.3)", async () => {
      createMockFetch([
        {
          url: /\/api\/agent\/briefing\/parse$/,
          method: "POST",
          response: mockJsonResponse(COMPLETE_PARSE_RESPONSE),
        },
      ]);

      const { result } = renderHook(() => useBriefingFlow());

      await act(async () => {
        await result.current.processMessage("briefing", EXEC_ID, mockSendAgentMessage);
      });
      expect(result.current.state.status).toBe("confirming");

      // Parse SUCEDE (200) mas o LLM classifica "sim" como "confirm" (nao "proceed")
      // e NAO aplica correcao (briefing identico) -> keyword de seguranca confirma.
      restoreFetch();
      createMockFetch([
        {
          url: /\/api\/agent\/briefing\/parse$/,
          method: "POST",
          response: mockJsonResponse({ ...COMPLETE_PARSE_RESPONSE, nextAction: "confirm" }),
        },
      ]);

      let outcome: { handled: boolean; confirmed?: boolean } | undefined;
      await act(async () => {
        outcome = await result.current.processMessage("sim", EXEC_ID, mockSendAgentMessage);
      });

      expect(result.current.state.status).toBe("confirmed");
      expect(outcome?.confirmed).toBe(true);
    });

    it("guard hibrido NAO confirma quando o LLM aplicou correcao ('sim, mas...') (review 22.3)", async () => {
      createMockFetch([
        {
          url: /\/api\/agent\/briefing\/parse$/,
          method: "POST",
          response: mockJsonResponse(COMPLETE_PARSE_RESPONSE),
        },
      ]);

      const { result } = renderHook(() => useBriefingFlow());

      await act(async () => {
        await result.current.processMessage("briefing", EXEC_ID, mockSendAgentMessage);
      });
      expect(result.current.state.status).toBe("confirming");

      // "sim, mas..." contem keyword de confirmacao, MAS o LLM aplicou a correcao
      // (jobTitles mudou) -> briefingChanged -> reapresenta o resumo (AC3).
      restoreFetch();
      createMockFetch([
        {
          url: /\/api\/agent\/briefing\/parse$/,
          method: "POST",
          response: mockJsonResponse({
            ...COMPLETE_PARSE_RESPONSE,
            briefing: { ...COMPLETE_PARSE_RESPONSE.briefing, jobTitles: ["CFO"] },
            nextAction: "confirm",
          }),
        },
      ]);
      mockSendAgentMessage.mockClear();

      let outcome: { handled: boolean; confirmed?: boolean } | undefined;
      await act(async () => {
        outcome = await result.current.processMessage(
          "sim, mas troca o cargo pra CFO",
          EXEC_ID,
          mockSendAgentMessage
        );
      });

      expect(result.current.state.status).toBe("confirming");
      expect(outcome?.confirmed).toBeUndefined();
      expect(result.current.state.briefing?.jobTitles).toEqual(["CFO"]);
      expect(mockSendAgentMessage).toHaveBeenCalledWith(
        EXEC_ID,
        expect.stringContaining("Confirma esses parametros?")
      );
    });

    it("memoria: fast-path de ajuda registra pergunta e sugestoes no historico (review 22.3)", async () => {
      const fetchMock = createMockFetch([
        {
          url: /\/api\/agent\/briefing\/parse$/,
          method: "POST",
          response: mockJsonResponse(INCOMPLETE_PARSE_RESPONSE),
        },
      ]);

      const { result } = renderHook(() => useBriefingFlow());

      await act(async () => {
        await result.current.processMessage("Quero prospectar", EXEC_ID, mockSendAgentMessage);
      });
      expect(result.current.state.status).toBe("awaiting_fields");

      // Fast-path de ajuda (deterministico, sem /parse) — deve entrar na memoria
      await act(async () => {
        await result.current.processMessage(
          "quais tecnologias voce recomenda?",
          EXEC_ID,
          mockSendAgentMessage
        );
      });
      expect(result.current.state.status).toBe("awaiting_fields");

      // Resposta posicional -> re-parse; o body deve carregar o turno de ajuda
      // do usuario E a lista sugerida pelo agente (senao "a primeira" nao resolve).
      await act(async () => {
        await result.current.processMessage("a primeira", EXEC_ID, mockSendAgentMessage);
      });

      const parseCalls = fetchMock
        .calls()
        .filter((c) => /\/api\/agent\/briefing\/parse$/.test(c.url));
      expect(parseCalls).toHaveLength(2);

      const secondBody = parseCalls[1].body as {
        messages?: Array<{ role: string; content: string }>;
      };
      const contents = secondBody.messages?.map((m) => `${m.role}:${m.content}`) ?? [];
      expect(contents).toContain("user:quais tecnologias voce recomenda?");
      expect(
        secondBody.messages?.some(
          (m) => m.role === "agent" && m.content.includes("AWS")
        )
      ).toBe(true);
      const last = secondBody.messages?.[secondBody.messages.length - 1];
      expect(last).toEqual({ role: "user", content: "a primeira" });
    });

    it("questionText vazio cai no smart-question deterministico (review 22.3)", async () => {
      createMockFetch([
        {
          url: /\/api\/agent\/briefing\/parse$/,
          method: "POST",
          response: mockJsonResponse({
            ...INCOMPLETE_PARSE_RESPONSE,
            nextAction: "ask",
            questionText: "   ",
          }),
        },
      ]);

      const { result } = renderHook(() => useBriefingFlow());

      await act(async () => {
        await result.current.processMessage("quero prospectar", EXEC_ID, mockSendAgentMessage);
      });

      expect(result.current.state.status).toBe("awaiting_fields");
      // String vazia/whitespace NUNCA e enviada (poluiria o historico e o proximo
      // /parse levaria 400 por content min(1)) — cai na pergunta deterministica.
      expect(mockSendAgentMessage).toHaveBeenCalledWith(
        EXEC_ID,
        expect.stringContaining("Para montar a prospeccao")
      );
    });

    it("questionText fora do ramo ask e ignorado (tom de confirmacao com gating fechado) (review 22.3)", async () => {
      createMockFetch([
        {
          url: /\/api\/agent\/briefing\/parse$/,
          method: "POST",
          response: mockJsonResponse({
            ...INCOMPLETE_PARSE_RESPONSE,
            nextAction: "confirm",
            questionText: "Perfeito, vou iniciar a prospeccao!",
          }),
        },
      ]);

      const { result } = renderHook(() => useBriefingFlow());

      await act(async () => {
        await result.current.processMessage("quero prospectar", EXEC_ID, mockSendAgentMessage);
      });

      // canProceed=false prevalece (NFR1) e o texto de confirmacao fora de hora
      // NAO e mostrado — pergunta deterministica no lugar.
      expect(result.current.state.status).toBe("awaiting_fields");
      expect(mockSendAgentMessage).not.toHaveBeenCalledWith(
        EXEC_ID,
        "Perfeito, vou iniciar a prospeccao!"
      );
      expect(mockSendAgentMessage).toHaveBeenCalledWith(
        EXEC_ID,
        expect.stringContaining("Para montar a prospeccao")
      );
    });
  });

  // ==============================================
  // SUB-FLUXOS POR DECISAO DO LLM (Story 22.4)
  // ==============================================

  describe("Sub-fluxos por decisao do LLM (Story 22.4)", () => {
    // import_leads disparado pela INTENCAO do LLM, SEM os skipSteps de leads no briefing —
    // prova que o gatilho e o nextAction, nao o sinal deterministico.
    const IMPORT_LEADS_INTENT_NO_SKIP = {
      briefing: {
        technology: null,
        jobTitles: [],
        location: null,
        companySize: null,
        industry: null,
        productSlug: null,
        mode: "guided" as const,
        skipSteps: [] as string[], // <- sem skipSteps de leads
      },
      missingFields: ["technology", "jobTitles", "location"],
      isComplete: false,
      canProceed: false,
      suggestions: {},
      productMentioned: null,
      nextAction: "import_leads" as const,
      questionText: null,
    };

    // Fallback deterministico: SEM nextAction de leads (default "ask") mas COM skipSteps.
    const IMPORT_LEADS_DETERMINISTIC = {
      briefing: {
        technology: null,
        jobTitles: [],
        location: null,
        companySize: null,
        industry: null,
        productSlug: null,
        mode: "guided" as const,
        skipSteps: ["search_companies", "search_leads"],
      },
      missingFields: ["technology", "jobTitles"],
      isComplete: false,
      canProceed: false,
      suggestions: {},
      productMentioned: null,
      nextAction: "ask" as const, // <- NAO e import_leads: so o skipSteps dispara
      questionText: null,
    };

    // D4: register_product mas o produto JA existe na base (productSlug != null).
    const REGISTER_PRODUCT_ALREADY_EXISTS = {
      ...COMPLETE_WITH_PRODUCT_FOUND,
      nextAction: "register_product" as const,
    };

    it("dispara awaiting_leads_input via nextAction=import_leads SEM skipSteps (AC: #2)", async () => {
      createMockFetch([
        {
          url: /\/api\/agent\/briefing\/parse$/,
          method: "POST",
          response: mockJsonResponse(IMPORT_LEADS_INTENT_NO_SKIP),
        },
      ]);

      const { result } = renderHook(() => useBriefingFlow());

      await act(async () => {
        await result.current.processMessage(
          "na verdade eu ja tenho minha lista de contatos",
          EXEC_ID,
          mockSendAgentMessage
        );
      });

      expect(result.current.state.status).toBe("awaiting_leads_input");
      expect(mockSendAgentMessage).toHaveBeenCalledWith(
        EXEC_ID,
        expect.stringContaining("Cole a lista")
      );

      // Review 22.4: mesmo o gatilho sendo o nextAction (o mock trouxe skipSteps []), o
      // hook RECONCILIA skipSteps no briefing -> senao o downstream (create-campaign-step,
      // que decide por skipSteps) descartaria os leads colados e rodaria busca paga.
      expect(result.current.state.briefing?.skipSteps).toEqual(
        expect.arrayContaining(["search_companies", "search_leads"])
      );

      // Depois cola leads -> reusa parseLeadInput -> confirming_leads
      await act(async () => {
        await result.current.processMessage(
          "joao@empresa.com\nmaria@acme.com",
          EXEC_ID,
          mockSendAgentMessage
        );
      });

      expect(result.current.state.status).toBe("confirming_leads");
      expect(result.current.state.briefing?.importedLeads).toHaveLength(2);
      // skipSteps preservado apos o paste (o spread de importedLeads nao apaga)
      expect(result.current.state.briefing?.skipSteps).toEqual(
        expect.arrayContaining(["search_companies", "search_leads"])
      );
    });

    it("fallback deterministico: skipSteps de leads dispara mesmo sem nextAction (AC: #2)", async () => {
      createMockFetch([
        {
          url: /\/api\/agent\/briefing\/parse$/,
          method: "POST",
          response: mockJsonResponse(IMPORT_LEADS_DETERMINISTIC),
        },
      ]);

      const { result } = renderHook(() => useBriefingFlow());

      await act(async () => {
        await result.current.processMessage(
          "ja tenho meus leads",
          EXEC_ID,
          mockSendAgentMessage
        );
      });

      expect(result.current.state.status).toBe("awaiting_leads_input");
    });

    it("register_product explicito vai DIRETO para awaiting_product_details (AC: #1)", async () => {
      createMockFetch([
        {
          url: /\/api\/agent\/briefing\/parse$/,
          method: "POST",
          response: mockJsonResponse(PRODUCT_DECISION_REGISTER),
        },
      ]);

      const { result } = renderHook(() => useBriefingFlow());

      await act(async () => {
        await result.current.processMessage(
          "quero cadastrar meu produto antes de continuar",
          EXEC_ID,
          mockSendAgentMessage
        );
      });

      // Pula a oferta sim/nao (awaiting_product_decision) — vai direto aos detalhes.
      expect(result.current.state.status).toBe("awaiting_product_details");
      expect(result.current.state.productMentioned).toBe("TDEC Analytics");
      expect(mockSendAgentMessage).toHaveBeenCalledWith(
        EXEC_ID,
        expect.stringContaining("Me descreva o produto em linguagem natural")
      );
    });

    it("D4: register_product e IGNORADO quando o produto ja existe na base (productSlug != null)", async () => {
      createMockFetch([
        {
          url: /\/api\/agent\/briefing\/parse$/,
          method: "POST",
          response: mockJsonResponse(REGISTER_PRODUCT_ALREADY_EXISTS),
        },
      ]);

      const { result } = renderHook(() => useBriefingFlow());

      await act(async () => {
        await result.current.processMessage(
          "quero cadastrar o TDEC Analytics",
          EXEC_ID,
          mockSendAgentMessage
        );
      });

      // KB prevalece: NAO entra no fluxo de produto, segue para o resumo.
      expect(result.current.state.status).toBe("confirming");
      expect(result.current.state.briefing?.productSlug).toBe("prod-123");
    });

    it("awaiting_product_decision -> cadastrar via nextAction em linguagem livre (AC: #1)", async () => {
      // 1o /parse: produto mencionado, nao encontrado -> oferta (decision)
      createMockFetch([
        {
          url: /\/api\/agent\/briefing\/parse$/,
          method: "POST",
          response: mockJsonResponse(COMPLETE_WITH_PRODUCT_NOT_FOUND),
        },
      ]);

      const { result } = renderHook(() => useBriefingFlow());

      await act(async () => {
        await result.current.processMessage(
          "Quero prospectar pro TDEC Analytics",
          EXEC_ID,
          mockSendAgentMessage
        );
      });
      expect(result.current.state.status).toBe("awaiting_product_decision");

      // 2o /parse: resposta LIVRE (sem "sim" literal) classificada como register_product
      swapParseToRegisterProduct();
      mockSendAgentMessage.mockClear();

      await act(async () => {
        await result.current.processMessage(
          "pode cadastrar sim, vamos nessa",
          EXEC_ID,
          mockSendAgentMessage
        );
      });

      expect(result.current.state.status).toBe("awaiting_product_details");
      expect(mockSendAgentMessage).toHaveBeenCalledWith(
        EXEC_ID,
        expect.stringContaining("Me descreva o produto em linguagem natural")
      );
    });

    it("awaiting_product_decision -> recusa via nextAction limpa productMentioned e reapresenta resumo (AC: #1)", async () => {
      createMockFetch([
        {
          url: /\/api\/agent\/briefing\/parse$/,
          method: "POST",
          response: mockJsonResponse(COMPLETE_WITH_PRODUCT_NOT_FOUND),
        },
      ]);

      const { result } = renderHook(() => useBriefingFlow());

      await act(async () => {
        await result.current.processMessage(
          "Quero prospectar pro TDEC Analytics",
          EXEC_ID,
          mockSendAgentMessage
        );
      });
      expect(result.current.state.status).toBe("awaiting_product_decision");

      // 2o /parse: usuario recusa em linguagem livre -> nextAction "confirm" (segue sem produto)
      restoreFetch();
      createMockFetch([
        {
          url: /\/api\/agent\/briefing\/parse$/,
          method: "POST",
          response: mockJsonResponse({
            ...COMPLETE_WITH_PRODUCT_NOT_FOUND,
            nextAction: "confirm",
          }),
        },
      ]);
      mockSendAgentMessage.mockClear();

      await act(async () => {
        await result.current.processMessage(
          "nao precisa, pode seguir sem produto",
          EXEC_ID,
          mockSendAgentMessage
        );
      });

      expect(result.current.state.status).toBe("confirming");
      expect(result.current.state.productMentioned).toBeNull();
      expect(mockSendAgentMessage).toHaveBeenCalledWith(
        EXEC_ID,
        expect.stringContaining("Confirma esses parametros?")
      );
    });

    it("recusa COM correcao embutida: aplica result.briefing (nao o state antigo) (Review 22.4)", async () => {
      // 1o /parse: produto mencionado, nao encontrado -> oferta (decision) com cargo CTO
      createMockFetch([
        {
          url: /\/api\/agent\/briefing\/parse$/,
          method: "POST",
          response: mockJsonResponse(COMPLETE_WITH_PRODUCT_NOT_FOUND),
        },
      ]);

      const { result } = renderHook(() => useBriefingFlow());

      await act(async () => {
        await result.current.processMessage(
          "Quero prospectar pro TDEC Analytics",
          EXEC_ID,
          mockSendAgentMessage
        );
      });
      expect(result.current.state.status).toBe("awaiting_product_decision");
      expect(result.current.state.briefing?.jobTitles).toEqual(["CTO"]);

      // 2o /parse: usuario RECUSA o produto E corrige o cargo no mesmo turno ->
      // nextAction "confirm" com o briefing corrigido (CFO).
      restoreFetch();
      createMockFetch([
        {
          url: /\/api\/agent\/briefing\/parse$/,
          method: "POST",
          response: mockJsonResponse({
            ...COMPLETE_WITH_PRODUCT_NOT_FOUND,
            briefing: {
              ...COMPLETE_WITH_PRODUCT_NOT_FOUND.briefing,
              jobTitles: ["CFO"],
            },
            nextAction: "confirm",
          }),
        },
      ]);
      mockSendAgentMessage.mockClear();

      await act(async () => {
        await result.current.processMessage(
          "nao precisa do produto, mas troca o cargo pra CFO",
          EXEC_ID,
          mockSendAgentMessage
        );
      });

      expect(result.current.state.status).toBe("confirming");
      expect(result.current.state.productMentioned).toBeNull();
      // Review 22.4: a correcao embutida na recusa e APLICADA (era perdida antes do patch,
      // que reapresentava o state.briefing antigo com CTO).
      expect(result.current.state.briefing?.jobTitles).toEqual(["CFO"]);
      expect(mockSendAgentMessage).toHaveBeenCalledWith(
        EXEC_ID,
        expect.stringContaining("CFO")
      );
    });

    it("fail-open (AC5): /parse falha em awaiting_product_decision -> 'sim' cadastra por keyword", async () => {
      createMockFetch([
        {
          url: /\/api\/agent\/briefing\/parse$/,
          method: "POST",
          response: mockJsonResponse(COMPLETE_WITH_PRODUCT_NOT_FOUND),
        },
      ]);

      const { result } = renderHook(() => useBriefingFlow());

      await act(async () => {
        await result.current.processMessage(
          "Quero prospectar pro TDEC Analytics",
          EXEC_ID,
          mockSendAgentMessage
        );
      });
      expect(result.current.state.status).toBe("awaiting_product_decision");

      swapParseToFailure();

      await act(async () => {
        await result.current.processMessage("sim", EXEC_ID, mockSendAgentMessage);
      });

      expect(result.current.state.status).toBe("awaiting_product_details");
    });

    it("fail-open (AC5): /parse falha em awaiting_product_decision -> 'nao' segue sem produto por keyword", async () => {
      createMockFetch([
        {
          url: /\/api\/agent\/briefing\/parse$/,
          method: "POST",
          response: mockJsonResponse(COMPLETE_WITH_PRODUCT_NOT_FOUND),
        },
      ]);

      const { result } = renderHook(() => useBriefingFlow());

      await act(async () => {
        await result.current.processMessage(
          "Quero prospectar pro TDEC Analytics",
          EXEC_ID,
          mockSendAgentMessage
        );
      });
      expect(result.current.state.status).toBe("awaiting_product_decision");

      swapParseToFailure();
      mockSendAgentMessage.mockClear();

      await act(async () => {
        await result.current.processMessage("nao", EXEC_ID, mockSendAgentMessage);
      });

      expect(result.current.state.status).toBe("confirming");
      expect(result.current.state.productMentioned).toBeNull();
      // Review 22.4: o resumo reapresentado no fail-open passa missingFields ->
      // a nota de campo opcional (companySize) aparece.
      expect(mockSendAgentMessage).toHaveBeenCalledWith(
        EXEC_ID,
        expect.stringContaining("tamanho")
      );
    });
  });

  describe("Metadados de campanha (Story 22.5)", () => {
    it("resumo mostra os campos de campanha com rotulos PT quando presentes (AC2)", async () => {
      createMockFetch([
        {
          url: /\/api\/agent\/briefing\/parse$/,
          method: "POST",
          response: mockJsonResponse({
            ...COMPLETE_PARSE_RESPONSE,
            briefing: {
              ...COMPLETE_PARSE_RESPONSE.briefing,
              objective: "REENGAGEMENT",
              urgency: "HIGH",
              campaignDescription: "Black Friday",
              emailCount: 3,
            },
          }),
        },
      ]);

      const { result } = renderHook(() => useBriefingFlow());

      await act(async () => {
        await result.current.processMessage("briefing", EXEC_ID, mockSendAgentMessage);
      });

      expect(result.current.state.status).toBe("confirming");
      const summary = mockSendAgentMessage.mock.calls.at(-1)?.[1] as string;
      expect(summary).toContain("Objetivo: Reengajamento");
      expect(summary).toContain("Urgencia: Alta");
      expect(summary).toContain("Descricao: Black Friday");
      expect(summary).toContain("Nº de e-mails: 3");
    });

    it("resumo inclui pergunta leve opcional de objetivo quando objective ausente (AC3/D2)", async () => {
      createMockFetch([
        {
          url: /\/api\/agent\/briefing\/parse$/,
          method: "POST",
          response: mockJsonResponse(COMPLETE_PARSE_RESPONSE), // sem objective
        },
      ]);

      const { result } = renderHook(() => useBriefingFlow());

      await act(async () => {
        await result.current.processMessage("briefing", EXEC_ID, mockSendAgentMessage);
      });

      expect(result.current.state.status).toBe("confirming");
      const summary = mockSendAgentMessage.mock.calls.at(-1)?.[1] as string;
      // convite opcional, nao-bloqueante (nao vira estado awaiting_*)
      expect(summary).toContain("Se quiser, me diga o objetivo");
      // objetivo ausente E emailCount ausente -> convida a informar a quantidade tambem
      expect(summary).toContain("e quantos e-mails");
      expect(summary).toContain("Confirma esses parametros?");
    });

    it("pergunta leve NAO pede 'e quantos e-mails' quando o usuario ja informou emailCount (22.5 patch)", async () => {
      createMockFetch([
        {
          url: /\/api\/agent\/briefing\/parse$/,
          method: "POST",
          response: mockJsonResponse({
            ...COMPLETE_PARSE_RESPONSE,
            briefing: { ...COMPLETE_PARSE_RESPONSE.briefing, emailCount: 3 }, // sem objective, com quantidade
          }),
        },
      ]);

      const { result } = renderHook(() => useBriefingFlow());

      await act(async () => {
        await result.current.processMessage("briefing", EXEC_ID, mockSendAgentMessage);
      });

      expect(result.current.state.status).toBe("confirming");
      const summary = mockSendAgentMessage.mock.calls.at(-1)?.[1] as string;
      // ainda convida a informar o objetivo, mas NAO repete "e quantos e-mails"
      // (a linha "- Nº de e-mails: 3" ja esta no resumo — seria contraditorio)
      expect(summary).toContain("Se quiser, me diga o objetivo");
      expect(summary).not.toContain("e quantos e-mails");
      expect(summary).toContain("Nº de e-mails: 3");
    });

    it("guard hibrido NAO confirma quando a correcao so toca campos de campanha ('sim, mas reengajamento com 3 e-mails') (D5)", async () => {
      createMockFetch([
        {
          url: /\/api\/agent\/briefing\/parse$/,
          method: "POST",
          response: mockJsonResponse(COMPLETE_PARSE_RESPONSE),
        },
      ]);

      const { result } = renderHook(() => useBriefingFlow());

      await act(async () => {
        await result.current.processMessage("briefing", EXEC_ID, mockSendAgentMessage);
      });
      expect(result.current.state.status).toBe("confirming");

      // "sim, mas..." tem keyword de confirmacao, MAS o LLM aplicou correcao nos campos
      // de campanha (objective/emailCount) -> briefingChanged=true -> reapresenta (AC3/D5).
      restoreFetch();
      createMockFetch([
        {
          url: /\/api\/agent\/briefing\/parse$/,
          method: "POST",
          response: mockJsonResponse({
            ...COMPLETE_PARSE_RESPONSE,
            briefing: {
              ...COMPLETE_PARSE_RESPONSE.briefing,
              objective: "REENGAGEMENT",
              emailCount: 3,
            },
            nextAction: "confirm",
          }),
        },
      ]);
      mockSendAgentMessage.mockClear();

      let outcome: { handled: boolean; confirmed?: boolean } | undefined;
      await act(async () => {
        outcome = await result.current.processMessage(
          "sim, mas reengajamento com 3 e-mails",
          EXEC_ID,
          mockSendAgentMessage
        );
      });

      expect(result.current.state.status).toBe("confirming");
      expect(outcome?.confirmed).toBeUndefined();
      expect(result.current.state.briefing?.objective).toBe("REENGAGEMENT");
      expect(result.current.state.briefing?.emailCount).toBe(3);
      expect(mockSendAgentMessage).toHaveBeenCalledWith(
        EXEC_ID,
        expect.stringContaining("Confirma esses parametros?")
      );
    });

    it("'sim' puro ainda confirma quando nada mudou (briefingChanged=false, regressao 22.5)", async () => {
      createMockFetch([
        {
          url: /\/api\/agent\/briefing\/parse$/,
          method: "POST",
          response: mockJsonResponse(COMPLETE_PARSE_RESPONSE),
        },
      ]);

      const { result } = renderHook(() => useBriefingFlow());

      await act(async () => {
        await result.current.processMessage("briefing", EXEC_ID, mockSendAgentMessage);
      });
      expect(result.current.state.status).toBe("confirming");

      // briefing identico (nenhum campo de campanha alterado) -> keyword "sim" confirma.
      restoreFetch();
      createMockFetch([
        {
          url: /\/api\/agent\/briefing\/parse$/,
          method: "POST",
          response: mockJsonResponse({ ...COMPLETE_PARSE_RESPONSE, nextAction: "confirm" }),
        },
      ]);

      let outcome: { handled: boolean; confirmed?: boolean } | undefined;
      await act(async () => {
        outcome = await result.current.processMessage("sim", EXEC_ID, mockSendAgentMessage);
      });

      expect(result.current.state.status).toBe("confirmed");
      expect(outcome?.confirmed).toBe(true);
    });
  });

  // ==============================================
  // Story 22.13: seams do ajuste pos-rejeicao
  // ==============================================

  describe("seams do ajuste pos-rejeicao (Story 22.13)", () => {
    it("isConfirmation e exportado como SSOT deterministico da confirmacao", () => {
      expect(isConfirmation("sim, pode buscar de novo")).toBe(true);
      expect(isConfirmation("OK")).toBe(true);
      expect(isConfirmation("na verdade troca o cargo pra CFO")).toBe(false);
      expect(isConfirmation("remove o filtro de tamanho")).toBe(false);
    });

    it("parseAdjustment reusa a MESMA memoria conversacional da 22.3 (nao abre historico novo)", async () => {
      const fetchMock = createMockFetch([
        {
          url: /\/api\/agent\/briefing\/parse$/,
          method: "POST",
          response: mockJsonResponse(COMPLETE_PARSE_RESPONSE),
        },
      ]);

      const { result } = renderHook(() => useBriefingFlow());

      // Turno normal de briefing: constroi a memoria (usuario + resumo do agente)
      await act(async () => {
        await result.current.processMessage(
          "Quero prospectar CTOs em SP",
          EXEC_ID,
          mockSendAgentMessage
        );
      });

      // Ajuste pos-rejeicao (o briefing ja esta confirmado no fluxo real)
      await act(async () => {
        await result.current.parseAdjustment("remove o filtro de tamanho", EXEC_ID);
      });

      const parseCalls = fetchMock
        .calls()
        .filter((c) => c.url.includes("/api/agent/briefing/parse"));
      const lastBody = parseCalls[parseCalls.length - 1].body as {
        messages: { role: string; content: string }[];
      };

      // O historico chega COMPLETO: turno inicial + resumo do agente + o ajuste.
      // Sem isto o parser derivaria um briefing do zero a partir de uma frase.
      expect(lastBody.messages.length).toBeGreaterThanOrEqual(3);
      expect(lastBody.messages[0]).toEqual({
        role: "user",
        content: "Quero prospectar CTOs em SP",
      });
      expect(lastBody.messages[lastBody.messages.length - 1]).toEqual({
        role: "user",
        content: "remove o filtro de tamanho",
      });
      expect(lastBody.messages.some((m) => m.role === "agent")).toBe(true);
    });

    it("recordAgentTurn fecha o loop de memoria (o resumo do ajuste volta ao parser)", async () => {
      const fetchMock = createMockFetch([
        {
          url: /\/api\/agent\/briefing\/parse$/,
          method: "POST",
          response: mockJsonResponse(COMPLETE_PARSE_RESPONSE),
        },
      ]);

      const { result } = renderHook(() => useBriefingFlow());

      await act(async () => {
        await result.current.parseAdjustment("tira o filtro de tamanho", EXEC_ID);
      });
      act(() => {
        result.current.recordAgentTurn("Ajustei os parametros. Confirma?");
      });
      await act(async () => {
        await result.current.parseAdjustment("na verdade troca o cargo pra CFO", EXEC_ID);
      });

      const parseCalls = fetchMock
        .calls()
        .filter((c) => c.url.includes("/api/agent/briefing/parse"));
      const lastBody = parseCalls[parseCalls.length - 1].body as {
        messages: { role: string; content: string }[];
      };

      expect(lastBody.messages).toEqual([
        { role: "user", content: "tira o filtro de tamanho" },
        { role: "agent", content: "Ajustei os parametros. Confirma?" },
        { role: "user", content: "na verdade troca o cargo pra CFO" },
      ]);
    });

    // Code review 2026-07-24 (P11): o ramo de confirmacao nao parseia (decisao
    // deterministica), mas o transcript nao pode ficar com uma resposta do agente sem
    // o turno do usuario que a provocou.
    it("recordUserTurn mantem o transcript simetrico no ramo de confirmacao (review P11)", async () => {
      const fetchMock = createMockFetch([
        {
          url: /\/api\/agent\/briefing\/parse$/,
          method: "POST",
          response: mockJsonResponse(COMPLETE_PARSE_RESPONSE),
        },
      ]);

      const { result } = renderHook(() => useBriefingFlow());

      await act(async () => {
        await result.current.parseAdjustment("tira o filtro de tamanho", EXEC_ID);
      });
      act(() => {
        result.current.recordAgentTurn("Ajustei os parametros. Confirma?");
        // usuario confirma — nao passa pelo parse
        result.current.recordUserTurn("sim");
        result.current.recordAgentTurn("Perfeito! Vou executar a etapa de novo.");
      });
      await act(async () => {
        await result.current.parseAdjustment("agora troca o cargo pra CFO", EXEC_ID);
      });

      const parseCalls = fetchMock
        .calls()
        .filter((c) => c.url.includes("/api/agent/briefing/parse"));
      const lastBody = parseCalls[parseCalls.length - 1].body as {
        messages: { role: string; content: string }[];
      };

      expect(lastBody.messages.map((m) => m.role)).toEqual([
        "user",
        "agent",
        "user",
        "agent",
        "user",
      ]);
      expect(lastBody.messages[2]).toEqual({ role: "user", content: "sim" });
    });

    it("processMessage continua devolvendo {handled:false} em status confirmed (AC6)", async () => {
      createMockFetch([
        {
          url: /\/api\/agent\/briefing\/parse$/,
          method: "POST",
          response: mockJsonResponse({ ...COMPLETE_PARSE_RESPONSE, nextAction: "proceed" }),
        },
      ]);

      const { result } = renderHook(() => useBriefingFlow());

      await act(async () => {
        await result.current.processMessage("briefing", EXEC_ID, mockSendAgentMessage);
      });
      await act(async () => {
        await result.current.processMessage("sim", EXEC_ID, mockSendAgentMessage);
      });
      expect(result.current.state.status).toBe("confirmed");

      let outcome: { handled: boolean; confirmed?: boolean } | undefined;
      await act(async () => {
        outcome = await result.current.processMessage(
          "remove o filtro de tamanho",
          EXEC_ID,
          mockSendAgentMessage
        );
      });

      expect(outcome).toEqual({ handled: false });
    });
  });
});
