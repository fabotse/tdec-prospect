/**
 * useBriefingFlow Hook Tests
 * Story 16.3 - AC: #3, #4
 * Story 16.6 - AC: #1-#5 (Produto inline)
 *
 * Tests: estados, transicoes, confirmacao, correcao, perguntas guiadas, produto inline
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useBriefingFlow, generateSmartQuestion } from "@/hooks/use-briefing-flow";
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
  missingFields: ["technology", "jobTitles"],
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
    expect(result.current.state.missingFields).toContain("technology");
    // Story 17.8: smart questions with suggestions
    expect(mockSendAgentMessage).toHaveBeenCalledWith(
      EXEC_ID,
      expect.stringContaining("tecnologias comuns no setor")
    );
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
    // Story 17.8: smart questions include suggestions inline
    expect(agentMsg).toContain("tecnologias comuns no setor");
    expect(agentMsg).toContain("cargos comuns");
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
        response: mockJsonResponse(COMPLETE_PARSE_RESPONSE),
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

      mockSendAgentMessage.mockClear();

      await act(async () => {
        await result.current.processMessage(
          "talvez",
          EXEC_ID,
          mockSendAgentMessage
        );
      });

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

      // Step 2: Accept registration
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

      // Step 2: Accept registration
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
      expect(result.current.state.missingFields).toContain("technology");
      // Story 17.8: smart questions with suggestions
      expect(mockSendAgentMessage).toHaveBeenCalledWith(
        EXEC_ID,
        expect.stringContaining("tecnologias comuns no setor")
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

      // 2. Accept product registration
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
      expect(summaryMsg).toContain("Sem tecnologia especifica");
      expect(summaryMsg).toContain("busca mais ampla");
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

      expect(question).toContain("tecnologia ou ferramenta");
      expect(question).toContain("posso sugerir opcoes");
      // Should NOT contain empty list artifacts
      expect(question).not.toContain("[]");
    });
  });
});
