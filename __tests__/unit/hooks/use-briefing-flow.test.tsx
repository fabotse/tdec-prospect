/**
 * useBriefingFlow Hook Tests
 * Story 16.3 - AC: #3, #4
 *
 * Tests: estados, transicoes, confirmacao, correcao, perguntas guiadas
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useBriefingFlow } from "@/hooks/use-briefing-flow";
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
  missingFields: [],
  isComplete: true,
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
        url: /\/api\/agent\/briefing\/parse/,
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
    expect(result.current.state.isComplete).toBe(true);
    expect(mockSendAgentMessage).toHaveBeenCalledWith(
      EXEC_ID,
      expect.stringContaining("Netskope")
    );
  });

  it("deve transicionar para awaiting_fields quando briefing incompleto (AC: #3)", async () => {
    createMockFetch([
      {
        url: /\/api\/agent\/briefing\/parse/,
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
    expect(mockSendAgentMessage).toHaveBeenCalledWith(
      EXEC_ID,
      expect.stringContaining("Qual tecnologia")
    );
  });

  it("deve gerar perguntas guiadas para campos faltantes (AC: #3)", async () => {
    createMockFetch([
      {
        url: /\/api\/agent\/briefing\/parse/,
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
    expect(agentMsg).toContain("Qual tecnologia");
    expect(agentMsg).toContain("Quais cargos");
  });

  it("deve re-parsear com contexto acumulado quando usuario responde (AC: #3)", async () => {
    const mockFetch = createMockFetch([
      {
        url: /\/api\/agent\/briefing\/parse/,
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
        url: /\/api\/agent\/briefing\/parse/,
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
        url: /\/api\/agent\/briefing\/parse/,
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
          url: /\/api\/agent\/briefing\/parse/,
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
        url: /\/api\/agent\/briefing\/parse/,
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
        url: /\/api\/agent\/briefing\/parse/,
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
        url: /\/api\/agent\/briefing\/parse/,
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
        url: /\/api\/agent\/briefing\/parse/,
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
        url: /\/api\/agent\/briefing\/parse/,
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
});
