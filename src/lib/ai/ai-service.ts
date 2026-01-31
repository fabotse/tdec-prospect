/**
 * AI Service
 * Story: 3.4 - AI Conversational Search
 *
 * OpenAI integration for filter extraction and audio transcription.
 * AC: #1 - AI converts natural language to Apollo API parameters
 * AC: #4 - Error handling with Portuguese messages
 * AC: #7, #8 - Whisper transcription for voice input
 */

import OpenAI from "openai";
import type { ApolloSearchFilters } from "@/types/apollo";
import type { AISearchResult, AIExtractionResponse } from "@/types/ai-search";
import { aiExtractionResponseSchema } from "@/types/ai-search";
import {
  FILTER_EXTRACTION_PROMPT,
  FILTER_EXTRACTION_MODEL,
  FILTER_EXTRACTION_MAX_TOKENS,
  FILTER_EXTRACTION_TEMPERATURE,
} from "./prompts/filter-extraction";

// ==============================================
// CONSTANTS
// ==============================================

const AI_TIMEOUT_MS = 10000; // 10 seconds
const AI_RETRY_COUNT = 1;

// ==============================================
// ERROR MESSAGES (Portuguese)
// ==============================================

export const AI_ERROR_MESSAGES = {
  PARSE_FAILURE:
    "Não consegui entender sua busca. Tente ser mais específico ou use os filtros manuais.",
  TIMEOUT: "A busca demorou muito. Tente novamente.",
  API_ERROR: "Erro no serviço de IA. Tente usar os filtros manuais.",
  EMPTY_QUERY: "Digite o que você está procurando.",
  LOW_CONFIDENCE:
    "Não tenho certeza se entendi corretamente. Verifique os filtros extraídos.",
  // Transcription errors
  TRANSCRIPTION_ERROR: "Erro ao transcrever áudio. Tente novamente.",
  AUDIO_TOO_LARGE: "Arquivo de áudio muito grande (máx 25MB).",
  INVALID_AUDIO: "Formato de áudio inválido.",
};

// ==============================================
// AI SERVICE
// ==============================================

/**
 * AI Service for filter extraction and transcription
 * Uses OpenAI GPT for NLP and Whisper for speech-to-text
 */
export class AIService {
  private client: OpenAI;

  constructor() {
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  /**
   * Translate natural language search query to Apollo API filters
   * AC: #1 - Converts natural language to structured filters
   * AC: #4 - Handles errors with Portuguese messages
   *
   * @param query - Natural language search query
   * @returns AISearchResult with extracted filters and confidence
   */
  async translateSearchToFilters(query: string): Promise<AISearchResult> {
    if (!query.trim()) {
      throw new Error(AI_ERROR_MESSAGES.EMPTY_QUERY);
    }

    let lastError: Error | null = null;

    // Retry logic
    for (let attempt = 0; attempt <= AI_RETRY_COUNT; attempt++) {
      try {
        const result = await this.callOpenAI(query);
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry on parse failures
        if (lastError.message === AI_ERROR_MESSAGES.PARSE_FAILURE) {
          throw lastError;
        }

        // Only retry on timeout/network errors
        if (attempt < AI_RETRY_COUNT) {
          continue;
        }
      }
    }

    throw lastError ?? new Error(AI_ERROR_MESSAGES.API_ERROR);
  }

  /**
   * Call OpenAI API for filter extraction
   * @private
   */
  private async callOpenAI(query: string): Promise<AISearchResult> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

    try {
      const completion = await this.client.chat.completions.create(
        {
          model: FILTER_EXTRACTION_MODEL,
          messages: [
            { role: "system", content: FILTER_EXTRACTION_PROMPT },
            { role: "user", content: query },
          ],
          max_tokens: FILTER_EXTRACTION_MAX_TOKENS,
          temperature: FILTER_EXTRACTION_TEMPERATURE,
          response_format: { type: "json_object" },
        },
        { signal: controller.signal }
      );

      clearTimeout(timeoutId);

      const content = completion.choices[0]?.message?.content;
      if (!content) {
        throw new Error(AI_ERROR_MESSAGES.PARSE_FAILURE);
      }

      // Parse and validate response
      const parsed = this.parseAIResponse(content);

      // Transform to AISearchResult
      const filters: ApolloSearchFilters = {
        industries:
          parsed.filters.industries.length > 0
            ? parsed.filters.industries
            : undefined,
        companySizes:
          parsed.filters.companySizes.length > 0
            ? parsed.filters.companySizes
            : undefined,
        locations:
          parsed.filters.locations.length > 0
            ? parsed.filters.locations
            : undefined,
        titles:
          parsed.filters.titles.length > 0 ? parsed.filters.titles : undefined,
        keywords: parsed.filters.keywords || undefined,
        perPage: parsed.filters.perPage,
      };

      return {
        filters,
        confidence: parsed.confidence,
        originalQuery: query,
        explanation: parsed.explanation,
      };
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(AI_ERROR_MESSAGES.TIMEOUT);
      }

      if (error instanceof Error) {
        throw error;
      }

      throw new Error(AI_ERROR_MESSAGES.API_ERROR);
    }
  }

  /**
   * Parse and validate AI response JSON
   * @private
   */
  private parseAIResponse(content: string): AIExtractionResponse {
    try {
      const json = JSON.parse(content);
      const result = aiExtractionResponseSchema.safeParse(json);

      if (!result.success) {
        throw new Error(AI_ERROR_MESSAGES.PARSE_FAILURE);
      }

      return result.data;
    } catch {
      throw new Error(AI_ERROR_MESSAGES.PARSE_FAILURE);
    }
  }

  /**
   * Transcribe audio file using Whisper API
   * AC: #7, #8 - Speech-to-text transcription
   *
   * @param audioFile - Audio file (webm, mp3, wav, etc.)
   * @returns Transcribed text
   */
  async transcribeAudio(audioFile: File): Promise<string> {
    // Validate file size (max 25MB for Whisper)
    if (audioFile.size > 25 * 1024 * 1024) {
      throw new Error(AI_ERROR_MESSAGES.AUDIO_TOO_LARGE);
    }

    try {
      const transcription = await this.client.audio.transcriptions.create({
        file: audioFile,
        model: "whisper-1",
        language: "pt", // Portuguese
        response_format: "text",
      });

      return transcription;
    } catch (error) {
      console.error("Whisper transcription error:", error);
      throw new Error(AI_ERROR_MESSAGES.TRANSCRIPTION_ERROR);
    }
  }
}
