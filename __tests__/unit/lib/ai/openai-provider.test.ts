/**
 * OpenAI Provider Unit Tests
 * Story: 6.1 - AI Provider Service Layer & Prompt Management System
 * AC: #1 - generateText with timeout
 * AC: #5 - AIProvider interface implementation
 * AC: #6 - OpenAI SDK integration
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { OpenAIProvider } from "@/lib/ai/providers/openai";
import { AIProviderError } from "@/lib/ai/providers/base-provider";

// Mock OpenAI SDK
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

describe("OpenAIProvider", () => {
  let provider: OpenAIProvider;

  beforeEach(() => {
    mockCreate.mockReset();
    provider = new OpenAIProvider("test-api-key");
  });

  describe("generateText - success cases", () => {
    it("generates text successfully", async () => {
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: { content: "Generated text content" },
            finish_reason: "stop",
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 20,
          total_tokens: 30,
        },
      });

      const result = await provider.generateText("Test prompt");

      expect(result.text).toBe("Generated text content");
      expect(result.model).toBe("gpt-4o-mini");
      expect(result.usage).toEqual({
        promptTokens: 10,
        completionTokens: 20,
        totalTokens: 30,
      });
      expect(result.metadata?.finishReason).toBe("stop");
    });

    it("uses specified model", async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: "Text" }, finish_reason: "stop" }],
      });

      await provider.generateText("Test", { model: "gpt-4o" });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ model: "gpt-4o" }),
        expect.any(Object)
      );
    });

    it("uses specified temperature", async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: "Text" }, finish_reason: "stop" }],
      });

      await provider.generateText("Test", { temperature: 0.5 });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ temperature: 0.5 }),
        expect.any(Object)
      );
    });

    it("uses specified maxTokens", async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: "Text" }, finish_reason: "stop" }],
      });

      await provider.generateText("Test", { maxTokens: 1000 });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ max_tokens: 1000 }),
        expect.any(Object)
      );
    });

    it("includes latency in metadata", async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: "Text" }, finish_reason: "stop" }],
      });

      const result = await provider.generateText("Test");

      expect(result.metadata?.latencyMs).toBeDefined();
      expect(typeof result.metadata?.latencyMs).toBe("number");
    });

    it("handles missing usage gracefully", async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: "Text" }, finish_reason: "stop" }],
        // usage is undefined
      });

      const result = await provider.generateText("Test");

      expect(result.text).toBe("Text");
      expect(result.usage).toBeUndefined();
    });
  });

  describe("getModelConfig", () => {
    it("returns correct configuration", () => {
      const config = provider.getModelConfig();

      expect(config.provider).toBe("openai");
      expect(config.defaultModel).toBe("gpt-4o-mini");
      expect(config.availableModels).toContain("gpt-4o-mini");
      expect(config.availableModels).toContain("gpt-4o");
      expect(config.availableModels).toContain("gpt-4-turbo");
      expect(config.availableModels).toContain("gpt-5-mini");
      expect(config.supportsStreaming).toBe(true);
      expect(config.defaultMaxTokens).toBe(500);
      expect(config.defaultTemperature).toBe(0.7);
    });

    it("returns 4 available models", () => {
      const config = provider.getModelConfig();

      expect(config.availableModels).toHaveLength(4);
    });
  });

  describe("generateStream", () => {
    it("yields text chunks from stream", async () => {
      // Mock async iterator
      const mockStream = {
        [Symbol.asyncIterator]: async function* () {
          yield { choices: [{ delta: { content: "Hello" } }] };
          yield { choices: [{ delta: { content: " " } }] };
          yield { choices: [{ delta: { content: "World" } }] };
          yield { choices: [{ delta: { content: null } }] };
        },
      };

      mockCreate.mockResolvedValue(mockStream);

      const chunks: string[] = [];
      for await (const chunk of provider.generateStream("Test")) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual(["Hello", " ", "World"]);
    });

    it("passes stream option and abort signal to OpenAI", async () => {
      const mockStream = {
        [Symbol.asyncIterator]: async function* () {
          yield { choices: [{ delta: { content: "Test" } }] };
        },
      };

      mockCreate.mockResolvedValue(mockStream);

      const chunks: string[] = [];
      for await (const chunk of provider.generateStream("Test")) {
        chunks.push(chunk);
      }

      // Verify stream: true and signal are passed
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ stream: true }),
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      );
    });

    it("handles empty content in stream chunks", async () => {
      const mockStream = {
        [Symbol.asyncIterator]: async function* () {
          yield { choices: [{ delta: { content: "" } }] };
          yield { choices: [{ delta: { content: "Hello" } }] };
          yield { choices: [{ delta: {} }] };
        },
      };

      mockCreate.mockResolvedValue(mockStream);

      const chunks: string[] = [];
      for await (const chunk of provider.generateStream("Test")) {
        chunks.push(chunk);
      }

      // Empty strings are falsy so shouldn't be yielded
      expect(chunks).toEqual(["Hello"]);
    });

    it("handles stream error and throws AIProviderError", async () => {
      mockCreate.mockRejectedValue(new Error("Stream connection failed"));

      await expect(async () => {
        const chunks: string[] = [];
        for await (const chunk of provider.generateStream("Test")) {
          chunks.push(chunk);
        }
      }).rejects.toThrow(AIProviderError);
    });

    it("passes abort signal for timeout support", async () => {
      const mockStream = {
        [Symbol.asyncIterator]: async function* () {
          yield { choices: [{ delta: { content: "Test" } }] };
        },
      };

      mockCreate.mockResolvedValue(mockStream);

      const chunks: string[] = [];
      for await (const chunk of provider.generateStream("Test", { timeoutMs: 10000 })) {
        chunks.push(chunk);
      }

      // Verify signal was passed to OpenAI client
      expect(mockCreate).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      );
    });
  });

  describe("AIProviderError", () => {
    it("uses custom message when provided", () => {
      const error = new AIProviderError("OpenAI", "TIMEOUT", "Custom message");

      expect(error.name).toBe("AIProviderError");
      expect(error.code).toBe("TIMEOUT");
      expect(error.provider).toBe("OpenAI");
      expect(error.userMessage).toBe("Custom message");
      expect(error.message).toBe("Custom message");
    });

    it("uses default Portuguese message when no custom message provided", () => {
      const error = new AIProviderError("OpenAI", "TIMEOUT");

      expect(error.name).toBe("AIProviderError");
      expect(error.code).toBe("TIMEOUT");
      expect(error.provider).toBe("OpenAI");
      expect(error.userMessage).toBe("A geração demorou muito. Tente novamente.");
      expect(error.message).toBe("A geração demorou muito. Tente novamente.");
    });

    it("uses default message for RATE_LIMITED error code", () => {
      const error = new AIProviderError("OpenAI", "RATE_LIMITED");

      expect(error.code).toBe("RATE_LIMITED");
      expect(error.userMessage).toBe("Limite de requisições atingido. Aguarde e tente novamente.");
    });
  });
});
