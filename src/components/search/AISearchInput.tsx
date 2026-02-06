/**
 * AI Search Input Component
 * Story: 3.4 - AI Conversational Search
 *
 * AC: #1 - Text input for natural language search
 * AC: #2 - Phase-specific loading messages
 * AC: #3 - Display extracted filters as badges
 * AC: #6 - Microphone button with visual indicator
 * AC: #7 - Recording feedback "Gravando..."
 * AC: #8 - Auto-trigger search after transcription
 * AC: #9 - Handle microphone permission denial gracefully
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import { Sparkles, Loader2, Mic, MicOff, Square } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAISearch } from "@/hooks/use-ai-search";
import { useVoiceRecording } from "@/hooks/use-voice-recording";
import { useWhisperTranscription } from "@/hooks/use-whisper-transcription";
import { ExtractedFiltersDisplay } from "./ExtractedFiltersDisplay";
import { cn } from "@/lib/utils";
import type { ApolloSearchFilters } from "@/types/apollo";
import type { Lead } from "@/types/lead";
import type { InputPhase } from "@/types/ai-search";
import { PHASE_MESSAGES } from "@/types/ai-search";

// ==============================================
// TYPES
// ==============================================

interface AISearchInputProps {
  onFiltersExtracted?: (filters: ApolloSearchFilters) => void;
  onSearchComplete?: (leads: Lead[]) => void;
}

// ==============================================
// COMPONENT
// ==============================================

export function AISearchInput({
  onFiltersExtracted,
  onSearchComplete,
}: AISearchInputProps) {
  const [query, setQuery] = useState("");

  // AI Search
  const {
    search,
    data,
    isLoading,
    searchPhase,
    extractedFilters,
    confidence,
    error: searchError,
    reset: resetSearch,
  } = useAISearch();

  // Voice Recording
  const {
    startRecording,
    stopRecording,
    isRecording,
    audioBlob,
    permissionState,
    error: voiceError,
    clearRecording,
  } = useVoiceRecording();

  // Whisper Transcription
  const {
    transcribeAsync,
    isTranscribing,
    error: transcriptionError,
    reset: resetTranscription,
  } = useWhisperTranscription();

  // Current phase for UI feedback
  const currentPhase: InputPhase = isRecording
    ? "recording"
    : isTranscribing
    ? "transcribing"
    : searchPhase;

  const isProcessing = isRecording || isTranscribing || isLoading;

  // Auto-transcribe when recording stops and we have audio
  useEffect(() => {
    // Guard: only transcribe once - check we have blob, not recording, and not already transcribing
    if (audioBlob && !isRecording && !isTranscribing) {
      // Clear recording immediately to prevent re-triggering
      const blobToTranscribe = audioBlob;
      clearRecording();

      transcribeAsync(blobToTranscribe)
        .then((text) => {
          setQuery(text);
          // Auto-trigger search after transcription (AC: #8)
          if (text.trim()) {
            search(text);
          }
        })
        .catch(() => {
          // Error already handled by hook
        });
    }
  }, [audioBlob, isRecording, isTranscribing, transcribeAsync, clearRecording, search]);

  // Notify parent when search completes with results
  useEffect(() => {
    if (searchPhase === "done" && onSearchComplete) {
      onSearchComplete(data);
    }
  }, [searchPhase, onSearchComplete, data]);

  const handleSearch = useCallback(() => {
    if (query.trim()) {
      search(query);
    }
  }, [query, search]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSearch();
      }
    },
    [handleSearch]
  );

  const handleVoiceClick = useCallback(() => {
    if (isRecording) {
      stopRecording();
    } else {
      resetTranscription();
      resetSearch();
      startRecording();
    }
  }, [isRecording, stopRecording, startRecording, resetTranscription, resetSearch]);

  const handleEditFilters = useCallback(() => {
    if (extractedFilters && onFiltersExtracted) {
      onFiltersExtracted(extractedFilters);
    }
  }, [extractedFilters, onFiltersExtracted]);

  // Combined error from all sources
  const error = searchError || voiceError || transcriptionError;

  // Get current phase message
  const phaseMessage = PHASE_MESSAGES[currentPhase];

  return (
    <div className="space-y-3" data-testid="ai-search-container">
      <div className="flex gap-2">
        {/* Voice Button (AC: #6, #7, #9) */}
        <Button
          variant={isRecording ? "destructive" : "outline"}
          size="icon"
          onClick={handleVoiceClick}
          disabled={isTranscribing || isLoading || permissionState === "denied"}
          data-testid="voice-button"
          title={isRecording ? "Parar gravação" : "Gravar com microfone"}
          className={cn("relative shrink-0", isRecording && "animate-pulse")}
        >
          {isRecording ? (
            <Square className="h-4 w-4" />
          ) : permissionState === "denied" ? (
            <MicOff className="h-4 w-4" />
          ) : (
            <Mic className="h-4 w-4" />
          )}
          {/* Recording indicator dot (AC: #6) */}
          {isRecording && (
            <span
              className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-red-500 animate-ping"
              aria-hidden="true"
            />
          )}
        </Button>

        {/* Text Input */}
        <div className="relative flex-1">
          <Input
            placeholder="Descreva os leads que você procura ou use o microfone..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isProcessing}
            className="pr-10"
            data-testid="ai-search-input"
          />
          <Sparkles
            className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
            aria-hidden="true"
          />
        </div>

        {/* Search Button */}
        <Button
          onClick={handleSearch}
          disabled={isProcessing || !query.trim()}
          data-testid="ai-search-button"
          className="shrink-0"
        >
          {isProcessing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {phaseMessage || "Processando..."}
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-4 w-4" />
              Buscar com IA
            </>
          )}
        </Button>
      </div>

      {/* Extracted Filters Display (AC: #3, #5) */}
      {extractedFilters && (
        <ExtractedFiltersDisplay
          filters={extractedFilters}
          confidence={confidence ?? undefined}
          onEdit={onFiltersExtracted ? handleEditFilters : undefined}
        />
      )}

      {/* Error State (AC: #4, #9) */}
      {error && (
        <p className="text-sm text-destructive" data-testid="ai-search-error">
          {error}
        </p>
      )}
    </div>
  );
}
