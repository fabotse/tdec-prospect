/**
 * AI Service Unit Tests
 * Story: 3.4 - AI Conversational Search
 * AC: #1 - AI converts natural language to Apollo API parameters
 * AC: #4 - Error handling with Portuguese messages
 * AC: #7, #8 - Whisper transcription
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AIService, AI_ERROR_MESSAGES } from "@/lib/ai";

// Mock functions - must use vi.hoisted for mocks that are hoisted
const { mockCreate, mockTranscriptionsCreate } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockTranscriptionsCreate: vi.fn(),
}));

vi.mock("openai", () => {
  // Define the mock class inside the factory
  return {
    default: class MockOpenAI {
      chat = {
        completions: {
          create: mockCreate,
        },
      };
      audio = {
        transcriptions: {
          create: mockTranscriptionsCreate,
        },
      };
    },
  };
});

describe("AIService", () => {
  let aiService: AIService;

  beforeEach(() => {
    vi.clearAllMocks();
    aiService = new AIService();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("translateSearchToFilters", () => {
    it("extracts industries from query", async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({
                filters: {
                  industries: ["technology"],
                  companySizes: [],
                  locations: [],
                  titles: [],
                  keywords: "",
                  perPage: 25,
                },
                confidence: 0.9,
                explanation: "Busca por tecnologia",
              }),
            },
          },
        ],
      });

      const result = await aiService.translateSearchToFilters(
        "leads de tecnologia"
      );

      expect(result.filters.industries).toEqual(["technology"]);
      expect(result.confidence).toBe(0.9);
    });

    it("extracts locations from query", async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({
                filters: {
                  industries: [],
                  companySizes: [],
                  locations: ["São Paulo, Brazil"],
                  titles: [],
                  keywords: "",
                  perPage: 25,
                },
                confidence: 0.85,
                explanation: "Busca em São Paulo",
              }),
            },
          },
        ],
      });

      const result = await aiService.translateSearchToFilters("leads em SP");

      expect(result.filters.locations).toEqual(["São Paulo, Brazil"]);
    });

    it("extracts company sizes from query", async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({
                filters: {
                  industries: [],
                  companySizes: ["1-10", "11-50"],
                  locations: [],
                  titles: [],
                  keywords: "startup",
                  perPage: 25,
                },
                confidence: 0.88,
                explanation: "Busca por startups",
              }),
            },
          },
        ],
      });

      const result = await aiService.translateSearchToFilters("leads de startups");

      expect(result.filters.companySizes).toEqual(["1-10", "11-50"]);
    });

    it("extracts titles from query", async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({
                filters: {
                  industries: [],
                  companySizes: [],
                  locations: [],
                  titles: ["CTO", "Chief Technology Officer"],
                  keywords: "",
                  perPage: 25,
                },
                confidence: 0.92,
                explanation: "Busca por CTOs",
              }),
            },
          },
        ],
      });

      const result = await aiService.translateSearchToFilters("CTOs de empresas");

      expect(result.filters.titles).toEqual(["CTO", "Chief Technology Officer"]);
    });

    it("returns confidence score", async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({
                filters: {
                  industries: ["technology"],
                  companySizes: [],
                  locations: ["Rio de Janeiro, Brazil"],
                  titles: ["CEO"],
                  keywords: "",
                  perPage: 50,
                },
                confidence: 0.95,
                explanation: "Busca por CEOs de tech no RJ",
              }),
            },
          },
        ],
      });

      const result = await aiService.translateSearchToFilters(
        "50 CEOs de empresas de tecnologia no Rio de Janeiro"
      );

      expect(result.confidence).toBe(0.95);
      expect(result.filters.perPage).toBe(50);
    });

    it("handles ambiguous queries gracefully", async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({
                filters: {
                  industries: [],
                  companySizes: [],
                  locations: [],
                  titles: [],
                  keywords: "xyz",
                  perPage: 25,
                },
                confidence: 0.3,
                explanation: "Busca genérica por xyz",
              }),
            },
          },
        ],
      });

      const result = await aiService.translateSearchToFilters("xyz");

      expect(result.confidence).toBe(0.3);
      expect(result.filters.keywords).toBe("xyz");
    });

    it("throws error on empty query", async () => {
      await expect(aiService.translateSearchToFilters("")).rejects.toThrow(
        AI_ERROR_MESSAGES.EMPTY_QUERY
      );

      await expect(aiService.translateSearchToFilters("   ")).rejects.toThrow(
        AI_ERROR_MESSAGES.EMPTY_QUERY
      );
    });

    it("handles OpenAI API errors", async () => {
      // Reject twice because AIService has 1 retry (total 2 attempts)
      mockCreate
        .mockRejectedValueOnce(new Error("OpenAI API Error"))
        .mockRejectedValueOnce(new Error("OpenAI API Error"));

      // The service propagates the original error after retries are exhausted
      await expect(
        aiService.translateSearchToFilters("leads de tecnologia")
      ).rejects.toThrow("OpenAI API Error");
    });

    it("uses API_ERROR message for non-Error rejections", async () => {
      // Reject with non-Error value twice (for retry)
      mockCreate
        .mockRejectedValueOnce("string error")
        .mockRejectedValueOnce("string error");

      await expect(
        aiService.translateSearchToFilters("leads de tecnologia")
      ).rejects.toThrow(AI_ERROR_MESSAGES.API_ERROR);
    });

    it("handles invalid JSON response", async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: "not valid json",
            },
          },
        ],
      });

      await expect(
        aiService.translateSearchToFilters("leads de tecnologia")
      ).rejects.toThrow(AI_ERROR_MESSAGES.PARSE_FAILURE);
    });

    it("handles empty response content", async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: null,
            },
          },
        ],
      });

      await expect(
        aiService.translateSearchToFilters("leads de tecnologia")
      ).rejects.toThrow(AI_ERROR_MESSAGES.PARSE_FAILURE);
    });

    it("handles response missing required fields", async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({
                filters: {},
                // missing confidence and explanation
              }),
            },
          },
        ],
      });

      await expect(
        aiService.translateSearchToFilters("leads de tecnologia")
      ).rejects.toThrow(AI_ERROR_MESSAGES.PARSE_FAILURE);
    });

    it("preserves original query in result", async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({
                filters: {
                  industries: ["finance"],
                  companySizes: [],
                  locations: [],
                  titles: [],
                  keywords: "",
                  perPage: 25,
                },
                confidence: 0.88,
                explanation: "Busca por finanças",
              }),
            },
          },
        ],
      });

      const query = "leads de empresas financeiras";
      const result = await aiService.translateSearchToFilters(query);

      expect(result.originalQuery).toBe(query);
    });

    it("includes explanation in result", async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({
                filters: {
                  industries: ["healthcare"],
                  companySizes: [],
                  locations: [],
                  titles: [],
                  keywords: "",
                  perPage: 25,
                },
                confidence: 0.9,
                explanation: "Busca por empresas de saúde",
              }),
            },
          },
        ],
      });

      const result = await aiService.translateSearchToFilters("leads de saúde");

      expect(result.explanation).toBe("Busca por empresas de saúde");
    });
  });

  describe("transcribeAudio", () => {
    it("transcribes audio file successfully", async () => {
      mockTranscriptionsCreate.mockResolvedValueOnce(
        "Me busca 50 leads de tecnologia em SP"
      );

      const audioFile = new File(["audio data"], "recording.webm", {
        type: "audio/webm",
      });

      const result = await aiService.transcribeAudio(audioFile);

      expect(result).toBe("Me busca 50 leads de tecnologia em SP");
      expect(mockTranscriptionsCreate).toHaveBeenCalledWith({
        file: audioFile,
        model: "whisper-1",
        language: "pt",
        response_format: "text",
      });
    });

    it("handles Whisper API errors", async () => {
      mockTranscriptionsCreate.mockRejectedValueOnce(
        new Error("Whisper API Error")
      );

      const audioFile = new File(["audio data"], "recording.webm", {
        type: "audio/webm",
      });

      await expect(aiService.transcribeAudio(audioFile)).rejects.toThrow(
        AI_ERROR_MESSAGES.TRANSCRIPTION_ERROR
      );
    });

    it("validates audio file size", async () => {
      // Create a file larger than 25MB
      const largeData = new Uint8Array(26 * 1024 * 1024);
      const largeFile = new File([largeData], "large.webm", {
        type: "audio/webm",
      });

      await expect(aiService.transcribeAudio(largeFile)).rejects.toThrow(
        AI_ERROR_MESSAGES.AUDIO_TOO_LARGE
      );
    });
  });
});
