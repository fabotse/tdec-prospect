/**
 * AI Search Types
 * Story: 3.4 - AI Conversational Search
 *
 * Types for AI-powered conversational search functionality.
 * AC: #1, #3 - AI extraction result types with confidence
 */

import { z } from "zod";
import type { ApolloSearchFilters } from "./apollo";

/**
 * AI Search Result from filter extraction
 * AC: #3 - Includes extracted filters and confidence score
 */
export interface AISearchResult {
  filters: ApolloSearchFilters;
  confidence: number; // 0-1 how confident AI is in extraction
  originalQuery: string;
  explanation?: string; // Optional explanation of what was understood
}

/**
 * AI extraction response from OpenAI
 * Internal type for parsing LLM response
 */
export interface AIExtractionResponse {
  filters: {
    industries: string[];
    companySizes: string[];
    locations: string[];
    titles: string[];
    contactEmailStatuses: string[];
    keywords: string;
    perPage: number;
  };
  confidence: number;
  explanation: string;
}

/**
 * Zod schema for validating AI extraction response
 * AC: #1 - Validates AI response structure
 */
export const aiExtractionResponseSchema = z.object({
  filters: z.object({
    industries: z.array(z.string()).default([]),
    companySizes: z.array(z.string()).default([]),
    locations: z.array(z.string()).default([]),
    titles: z.array(z.string()).default([]),
    contactEmailStatuses: z.array(z.string()).default([]),
    keywords: z.string().default(""),
    perPage: z.number().min(1).max(100).default(25),
  }),
  confidence: z.number().min(0).max(1),
  explanation: z.string(),
});

/**
 * Search phase for UI feedback
 * AC: #2 - Track search phase for loading messages
 */
export type SearchPhase =
  | "idle"
  | "translating"
  | "searching"
  | "done"
  | "error";

/**
 * Input phase including voice states
 * AC: #6, #7 - Voice recording states
 */
export type InputPhase = SearchPhase | "recording" | "transcribing";

/**
 * Phase-specific messages in Portuguese
 * AC: #2 - Loading state messages
 */
export const PHASE_MESSAGES: Record<InputPhase, string> = {
  idle: "",
  recording: "Gravando...",
  transcribing: "Transcrevendo...",
  translating: "Entendendo sua busca...",
  searching: "Buscando leads...",
  done: "",
  error: "",
};

/**
 * AI Search API request body
 */
export interface AISearchRequest {
  query: string;
}

/**
 * Zod schema for AI search request validation
 */
export const aiSearchRequestSchema = z.object({
  query: z.string().min(1, "Digite o que você está procurando.").max(500),
});

/**
 * Transcription request - audio file in FormData
 * AC: #7, #8 - Whisper transcription request
 */
export interface TranscriptionRequest {
  audio: File;
}

/**
 * Transcription response
 * AC: #8 - Whisper transcription response
 */
export interface TranscriptionResponse {
  text: string;
}
