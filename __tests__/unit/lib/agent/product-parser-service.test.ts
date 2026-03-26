/**
 * Unit Tests for ProductParserService
 * Story 16.6 - AC: #2
 *
 * Tests: extracao campos, fallback productName, zod validation, erros OpenAI, timeout
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { ProductParserService } from "@/lib/agent/product-parser-service";
import { AGENT_ERROR_CODES } from "@/types/agent";

// ==============================================
// MOCKS
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

function mockCompletionResponse(content: Record<string, unknown>) {
  return {
    choices: [{ message: { content: JSON.stringify(content) } }],
  };
}

const VALID_PRODUCT = {
  name: "TDEC Analytics",
  description: "Plataforma de analytics para prospeccao B2B",
  features: "Dashboard em tempo real, exportacao CSV",
  differentials: "IA integrada, dados atualizados",
  targetAudience: "Times de vendas B2B",
};

// ==============================================
// TESTS
// ==============================================

describe("ProductParserService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deve extrair name e description corretamente", async () => {
    mockCreate.mockResolvedValue(mockCompletionResponse(VALID_PRODUCT));

    const result = await ProductParserService.parse(
      "Plataforma de analytics para prospeccao B2B com dashboard em tempo real",
      "TDEC Analytics",
      "test-api-key"
    );

    expect(result.name).toBe("TDEC Analytics");
    expect(result.description).toBe("Plataforma de analytics para prospeccao B2B");
  });

  it("deve retornar features/differentials/targetAudience null quando nao fornecidos", async () => {
    mockCreate.mockResolvedValue(
      mockCompletionResponse({
        name: "TDEC Analytics",
        description: "Plataforma de analytics",
        features: null,
        differentials: null,
        targetAudience: null,
      })
    );

    const result = await ProductParserService.parse(
      "Plataforma de analytics",
      "TDEC Analytics",
      "test-api-key"
    );

    expect(result.features).toBeNull();
    expect(result.differentials).toBeNull();
    expect(result.targetAudience).toBeNull();
  });

  it("deve incluir productName no contexto do user message", async () => {
    mockCreate.mockResolvedValue(mockCompletionResponse(VALID_PRODUCT));

    await ProductParserService.parse(
      "Descricao do produto aqui",
      "TDEC Analytics",
      "test-api-key"
    );

    const callArgs = mockCreate.mock.calls[0][0];
    const userMessage = callArgs.messages.find(
      (m: { role: string }) => m.role === "user"
    );
    expect(userMessage.content).toContain("Produto: TDEC Analytics");
    expect(userMessage.content).toContain("Descricao do produto aqui");
  });

  it("deve rejeitar dados invalidos via zod schema", async () => {
    mockCreate.mockResolvedValue(
      mockCompletionResponse({
        name: 123, // invalid: should be string
        description: null, // invalid: should be string
      })
    );

    await expect(
      ProductParserService.parse("produto", "TDEC", "key")
    ).rejects.toThrow(AGENT_ERROR_CODES.PRODUCT_PARSE_ERROR);
  });

  it("deve tratar erro do OpenAI", async () => {
    mockCreate.mockRejectedValue(new Error("OpenAI API error"));

    await expect(
      ProductParserService.parse("produto", "TDEC", "key")
    ).rejects.toThrow("OpenAI API error");
  });

  it("deve tratar timeout (AbortError)", async () => {
    const abortError = new Error("The operation was aborted");
    abortError.name = "AbortError";
    mockCreate.mockRejectedValue(abortError);

    await expect(
      ProductParserService.parse("produto", "TDEC", "key")
    ).rejects.toThrow(AGENT_ERROR_CODES.PRODUCT_PARSE_ERROR);
  });

  it("deve tratar content vazio na response", async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: null } }],
    });

    await expect(
      ProductParserService.parse("produto", "TDEC", "key")
    ).rejects.toThrow(AGENT_ERROR_CODES.PRODUCT_PARSE_ERROR);
  });

  it("deve tratar JSON invalido na response", async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: "not json" } }],
    });

    await expect(
      ProductParserService.parse("produto", "TDEC", "key")
    ).rejects.toThrow(AGENT_ERROR_CODES.PRODUCT_PARSE_ERROR);
  });

  it("deve rejeitar name vazio via min(1)", async () => {
    mockCreate.mockResolvedValue(
      mockCompletionResponse({
        name: "",
        description: "Descricao valida",
        features: null,
        differentials: null,
        targetAudience: null,
      })
    );

    await expect(
      ProductParserService.parse("produto", "TDEC", "key")
    ).rejects.toThrow(AGENT_ERROR_CODES.PRODUCT_PARSE_ERROR);
  });

  it("deve rejeitar description vazia via min(1)", async () => {
    mockCreate.mockResolvedValue(
      mockCompletionResponse({
        name: "TDEC",
        description: "",
        features: null,
        differentials: null,
        targetAudience: null,
      })
    );

    await expect(
      ProductParserService.parse("produto", "TDEC", "key")
    ).rejects.toThrow(AGENT_ERROR_CODES.PRODUCT_PARSE_ERROR);
  });

  it("deve usar model gpt-4o-mini e temperature 0.1", async () => {
    mockCreate.mockResolvedValue(mockCompletionResponse(VALID_PRODUCT));

    await ProductParserService.parse("produto", "TDEC", "key");

    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.model).toBe("gpt-4o-mini");
    expect(callArgs.temperature).toBe(0.1);
    expect(callArgs.response_format).toEqual({ type: "json_object" });
  });
});
