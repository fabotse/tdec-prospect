/**
 * parser-config Tests
 * Story 22.11 (Frente B) - AC6 (compat de API) + AC7 (SSOT do modelo)
 */

import { describe, it, expect } from "vitest";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import {
  PARSER_MODEL,
  PARSER_TIMEOUT_MS,
  isGpt5Family,
  buildParserRequest,
} from "@/lib/agent/parser-config";

const MESSAGES: ChatCompletionMessageParam[] = [
  { role: "system", content: "prompt" },
  { role: "user", content: "oi" },
];

describe("parser-config (Story 22.11 Frente B)", () => {
  it("PARSER_MODEL e o modelo-alvo decidido (gpt-5.4-mini)", () => {
    expect(PARSER_MODEL).toBe("gpt-5.4-mini");
  });

  it("PARSER_TIMEOUT_MS e um numero positivo", () => {
    expect(PARSER_TIMEOUT_MS).toBeGreaterThan(0);
  });

  describe("isGpt5Family", () => {
    it("reconhece a familia gpt-5", () => {
      expect(isGpt5Family("gpt-5.4-mini")).toBe(true);
      expect(isGpt5Family("gpt-5.4-nano")).toBe(true);
      expect(isGpt5Family("gpt-5")).toBe(true);
    });

    it("NAO marca modelos fora da familia gpt-5", () => {
      expect(isGpt5Family("gpt-4o-mini")).toBe(false);
      expect(isGpt5Family("gpt-4o")).toBe(false);
    });
  });

  describe("buildParserRequest (AC6: compat de API)", () => {
    it("monta model + messages + response_format json_object", () => {
      const req = buildParserRequest(MESSAGES);
      expect(req.model).toBe(PARSER_MODEL);
      expect(req.messages).toBe(MESSAGES);
      expect(req.response_format).toEqual({ type: "json_object" });
    });

    it("NAO envia temperature para a familia gpt-5 (rejeitam override)", () => {
      // PARSER_MODEL e gpt-5.4-mini -> temperature omitida.
      const req = buildParserRequest(MESSAGES);
      expect(req).not.toHaveProperty("temperature");
    });
  });
});
